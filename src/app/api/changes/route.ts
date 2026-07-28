import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspaceChanges } from "@/lib/rdash/server/workspace-changes";

export const runtime = "nodejs";

function afterRevisionFromRequest(request: NextRequest): number | null {
  const raw = request.nextUrl.searchParams.get("afterRevision");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request);
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

  try {
    const delta = await getWorkspaceChanges(afterRevision);
    return NextResponse.json(delta, {
      headers: {
        "Cache-Control": "no-store",
        "X-UC-Delta-From": String(delta.fromRevision),
        "X-UC-Delta-To": String(delta.revision),
        "X-UC-Delta-Current": String(delta.currentRevision),
        "X-UC-Delta-Has-More": delta.hasMore ? "1" : "0",
        "X-UC-Delta-Full-Reload": delta.requiresFullReload ? "1" : "0",
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
