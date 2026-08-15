import { NextRequest, NextResponse } from "next/server";
import { canReadFullStaffData } from "@/lib/rdash/staff-directory";
import { requireSession } from "@/lib/rdash/server/auth";
import { authorizeWorkspaceDeltaTarget } from "@/lib/rdash/server/workspace-delta-access";
import { getWorkspaceChanges } from "@/lib/rdash/server/workspace-changes";
import { knownWorkspaceCollection } from "@/lib/rdash/workspace-delta";

export const runtime = "nodejs";
const MAX_COLLECTION_FILTERS = 150;
const DIRECTORY_PROJECTION_COLLECTIONS = new Set(["master.staff"]);
const PRIVATE_JSON_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
});

function afterRevisionFromRequest(request: NextRequest): number | null {
  const raw = request.nextUrl.searchParams.get("afterRevision");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function collectionsFromRequest(request: NextRequest): Set<string> | null | "INVALID" {
  const raw = request.nextUrl.searchParams.get("collections");
  if (raw === null) return null;
  const values = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
  if (!values.length || values.length > MAX_COLLECTION_FILTERS) return "INVALID";
  if (values.some((collection) => !knownWorkspaceCollection(collection))) return "INVALID";
  return new Set(values);
}

function moduleFromRequest(request: NextRequest): string | null {
  const moduleId = String(request.headers.get("x-uc-delta-module") || "").trim();
  return moduleId && moduleId.length <= 120 ? moduleId : null;
}

function staffSafeCollections(
  requested: ReadonlySet<string>,
  canReadFullStaff: boolean,
): Set<string> {
  const safe = new Set(requested);
  if (!canReadFullStaff) safe.delete("master.staff");
  return safe;
}

function errorJson(error: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        ...PRIVATE_JSON_HEADERS,
        ...(extraHeaders || {}),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return errorJson("Your session is missing or expired.", 401);
    }
    console.error("[api/changes] session verification failed:", error);
    return errorJson("The authentication service is temporarily unavailable.", 503, {
      "Retry-After": "5",
    });
  }

  const afterRevision = afterRevisionFromRequest(request);
  if (afterRevision === null) {
    return errorJson("afterRevision must be a non-negative integer.", 400);
  }
  const requestedCollections = collectionsFromRequest(request);
  if (requestedCollections === "INVALID") {
    return errorJson("collections must contain known workspace collections.", 400);
  }
  const moduleId = moduleFromRequest(request);
  if (!moduleId) {
    return errorJson("X-UC-Delta-Module must identify the bounded workspace module being synchronized.", 400);
  }

  try {
    const access = await authorizeWorkspaceDeltaTarget(user, moduleId, requestedCollections);
    const foundationProjection = request.headers.get("x-uc-foundation-delta") === "1";
    const canReadFullStaff = canReadFullStaffData(user.role);
    const canReturnFullStaffRows = canReadFullStaff && !foundationProjection;
    const collections = staffSafeCollections(access.collections, canReturnFullStaffRows);
    const delta = await getWorkspaceChanges(
      afterRevision,
      collections,
      canReturnFullStaffRows ? undefined : DIRECTORY_PROJECTION_COLLECTIONS,
    );
    return NextResponse.json(delta, {
      headers: {
        ...PRIVATE_JSON_HEADERS,
        Vary: "Cookie, Authorization, X-UC-Delta-Module, X-UC-Foundation-Delta",
        "X-UC-Delta-Module": access.target.moduleId,
        "X-UC-Delta-From": String(delta.fromRevision),
        "X-UC-Delta-To": String(delta.revision),
        "X-UC-Delta-Current": String(delta.currentRevision),
        "X-UC-Delta-Has-More": delta.hasMore ? "1" : "0",
        "X-UC-Delta-Full-Reload": delta.requiresFullReload ? "1" : "0",
        "X-UC-Delta-Filtered": "1",
        "X-UC-Delta-Dropped-Collections": String(access.droppedCollectionCount),
        "X-UC-Staff-Delta": canReturnFullStaffRows ? "full-allowed" : "directory-only",
        "Server-Timing": `workspace-changes;dur=${(delta.loadMs || 0).toFixed(2)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("INVALID:")) {
      return errorJson(message.slice("INVALID:".length), 400);
    }
    if (message.startsWith("FORBIDDEN:")) {
      return errorJson(message.slice("FORBIDDEN:".length), 403);
    }
    console.error("[api/changes] delta read failed:", error);
    return errorJson("Workspace changes are temporarily unavailable.", 503, {
      "Retry-After": "5",
    });
  }
}
