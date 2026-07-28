import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getModuleScopedWorkspace } from "@/lib/rdash/server/module-scoped-read";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";

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
    const workspace = await getModuleScopedWorkspace(user, workspaceReadTargetForModule("customerDesk"));
    return NextResponse.json({
      revision: workspace.revision,
      data: workspace.data,
      ...(workspace.rowVersions ? { rowVersions: workspace.rowVersions } : {}),
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-UC-Read-Mode": workspace.scope,
        "X-UC-Read-Queries": String(workspace.queryCount),
        "X-UC-Read-Collections": String(workspace.collectionCount),
        "Server-Timing": `workspace-customers;dur=${workspace.loadMs.toFixed(2)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("FORBIDDEN:")) {
      return NextResponse.json(
        { error: message.slice("FORBIDDEN:".length) },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("[api/customers] module-scoped read failed:", error);
    return NextResponse.json(
      { error: "Customer workspace data is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
