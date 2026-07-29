import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspaceSubset } from "@/lib/rdash/server/workspace";

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
    const startedAt = performance.now();
    const workspace = await getWorkspaceSubset({});
    const loadMs = performance.now() - startedAt;
    const body = JSON.stringify({
      revision: workspace.revision,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        expiresAt: user.expiresAt,
      },
      readStrategy: "module-scoped",
    });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-UC-Read-Mode": "bootstrap",
        "X-UC-Read-Queries": String(workspace.queryCount),
        "X-UC-Response-Bytes": String(Buffer.byteLength(body)),
        "Server-Timing": `workspace-bootstrap;dur=${loadMs.toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error("[api/bootstrap] workspace bootstrap failed:", error);
    return NextResponse.json(
      { error: "The workspace bootstrap service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
