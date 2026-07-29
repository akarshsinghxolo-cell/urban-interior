import { NextRequest, NextResponse } from "next/server";
import {
  workspaceReadTargetForModule,
  type WorkspaceReadTarget,
} from "../workspace-read-scope";
import { requireSession } from "./auth";
import { getModuleScopedWorkspace } from "./module-scoped-read";

export interface ModuleScopedRouteOptions {
  moduleId: string;
  errorLabel: string;
  timingLabel: string;
}

function requestedTarget(
  request: NextRequest,
  options: ModuleScopedRouteOptions,
): WorkspaceReadTarget | null {
  const endpointTarget = workspaceReadTargetForModule(options.moduleId);
  const requestedModule = request.headers.get("x-uc-workspace-module")?.trim();
  if (!requestedModule) return endpointTarget;

  const target = workspaceReadTargetForModule(requestedModule);
  return target.scope === endpointTarget.scope ? target : null;
}

function measuredJson(
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): NextResponse {
  const body = JSON.stringify(payload);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      ...headers,
      "X-UC-Response-Bytes": String(Buffer.byteLength(body)),
    },
  });
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

  const target = requestedTarget(request, options);
  if (!target) {
    return NextResponse.json(
      { error: "The requested module does not belong to this scoped endpoint." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const workspace = await getModuleScopedWorkspace(user, target);
    return measuredJson({
      revision: workspace.revision,
      data: workspace.data,
      ...(workspace.rowVersions ? { rowVersions: workspace.rowVersions } : {}),
    }, {
      "Cache-Control": "no-store",
      "Vary": "X-UC-Workspace-Module",
      "X-UC-Read-Mode": workspace.scope,
      "X-UC-Read-Module": target.moduleId,
      "X-UC-Read-Strategy": workspace.readStrategy,
      "X-UC-Read-Queries": String(workspace.queryCount),
      "X-UC-Read-Collections": String(workspace.collectionCount),
      "X-UC-Read-Scope-Collections": String(workspace.scopeCollectionCount),
      "X-UC-Read-Limited-Collections": Object.entries(workspace.limitedCollections)
        .map(([collection, limit]) => `${collection}:${limit}`)
        .join(","),
      "Server-Timing": `${options.timingLabel};dur=${workspace.loadMs.toFixed(2)}`,
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
