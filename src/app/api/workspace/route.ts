import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";

export const runtime = "nodejs";

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

  try {
    const workspace = await getWorkspace(true);
    return NextResponse.json({
      revision: workspace.revision,
      data: workspace.data,
      ...(workspace.rowVersions ? { rowVersions: workspace.rowVersions } : {}),
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        expiresAt: user.expiresAt,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/workspace] workspace load failed:", error);
    return NextResponse.json(
      { error: "The workspace data service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT() {
  return NextResponse.json({
    error: "Whole-workspace PUT is disabled. Use /api/operations/commit with table-level operations.",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
