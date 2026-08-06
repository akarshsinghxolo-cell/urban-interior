import { NextRequest, NextResponse } from "next/server";
import { canReadFullStaffData } from "@/lib/rdash/staff-directory";
import { requireSession } from "@/lib/rdash/server/auth";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import { getWorkspaceChanges } from "@/lib/rdash/server/workspace-changes";
import { knownWorkspaceCollection } from "@/lib/rdash/workspace-delta";

export const runtime = "nodejs";
const MAX_COLLECTION_FILTERS = 150;
const DIRECTORY_PROJECTION_COLLECTIONS = new Set(["master.staff"]);

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

function staffSafeCollections(
  requested: Set<string> | null,
  canReadFullStaff: boolean,
): Set<string> | null {
  if (canReadFullStaff) return requested;
  // Fail closed for callers that omit a collection filter: non-HR roles may
  // receive every workspace delta collection except canonical full Staff rows.
  const allowed = requested || new Set(Object.keys(COLLECTION_TO_TABLE));
  const safe = new Set(allowed);
  safe.delete("master.staff");
  return safe;
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: message === "UNAUTHORIZED" ? "Your session is missing or expired." : message },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const afterRevision = afterRevisionFromRequest(request);
  if (afterRevision === null) {
    return NextResponse.json(
      { error: "afterRevision must be a non-negative integer." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const requestedCollections = collectionsFromRequest(request);
  if (requestedCollections === "INVALID") {
    return NextResponse.json(
      { error: "collections must contain known workspace collections." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const canReadFullStaff = canReadFullStaffData(user.role);
  const collections = staffSafeCollections(requestedCollections, canReadFullStaff);

  try {
    const delta = await getWorkspaceChanges(
      afterRevision,
      collections || undefined,
      canReadFullStaff ? undefined : DIRECTORY_PROJECTION_COLLECTIONS,
    );
    return NextResponse.json(delta, {
      headers: {
        "Cache-Control": "no-store",
        "X-UC-Delta-From": String(delta.fromRevision),
        "X-UC-Delta-To": String(delta.revision),
        "X-UC-Delta-Current": String(delta.currentRevision),
        "X-UC-Delta-Has-More": delta.hasMore ? "1" : "0",
        "X-UC-Delta-Full-Reload": delta.requiresFullReload ? "1" : "0",
        "X-UC-Delta-Filtered": collections ? "1" : "0",
        "X-UC-Staff-Delta": canReadFullStaff ? "full-allowed" : "directory-only",
        "Server-Timing": `workspace-changes;dur=${(delta.loadMs || 0).toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error("[api/changes] delta read failed:", error);
    return NextResponse.json(
      { error: "Workspace changes are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
