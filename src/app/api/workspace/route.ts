import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace cannot be loaded." }, { status: 401 });
  }
}

export async function PUT() {
  return NextResponse.json({
    error: "Whole-workspace PUT is disabled. Use /api/operations/commit with table-level operations.",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
