import { NextRequest, NextResponse } from "next/server";
import { workspaceReadTargetForModule } from "../workspace-read-scope";
import { requireSession } from "./auth";
import { getModuleScopedWorkspace } from "./module-scoped-read";

export interface ModuleScopedRouteOptions {
  moduleId: string;
  errorLabel: string;
  timingLabel: string;
}

/** Shared authenticated response shape for dedicated module-scoped read APIs. */
export async function handleModuleScopedRead(
  request: NextRequest,
  options: ModuleScopedRouteOptions,
) {
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
    const workspace = await getModuleScopedWorkspace(
      user,
      workspaceReadTargetForModule(options.moduleId),
    );
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
        "Server-Timing": `${options.timingLabel};dur=${workspace.loadMs.toFixed(2)}`,
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
    console.error(`[${options.timingLabel}] module-scoped read failed:`, error);
    return NextResponse.json(
      { error: `${options.errorLabel} data is temporarily unavailable.` },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
