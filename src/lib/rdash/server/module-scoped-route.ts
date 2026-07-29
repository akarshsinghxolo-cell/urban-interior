import { NextRequest, NextResponse } from "next/server";
import {
  tryWorkspaceReadTargetForModule,
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

const PRIVATE_JSON_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
});

function requestedTarget(
  request: NextRequest,
  options: ModuleScopedRouteOptions,
): WorkspaceReadTarget | null {
  const endpointTarget = workspaceReadTargetForModule(options.moduleId);
  const requestedModule = request.headers.get("x-uc-workspace-module")?.trim();
  if (!requestedModule) return endpointTarget;
  if (requestedModule.length > 120) return null;

  const target = tryWorkspaceReadTargetForModule(requestedModule);
  return target?.scope === endpointTarget.scope ? target : null;
}

function measuredJson(
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  status = 200,
): NextResponse {
  const body = JSON.stringify(payload);
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...PRIVATE_JSON_HEADERS,
      ...headers,
      "X-UC-Response-Bytes": String(Buffer.byteLength(body)),
    },
  });
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

/** Shared authenticated response shape for dedicated module-scoped read APIs. */
export async function handleModuleScopedRead(
  request: NextRequest,
  options: ModuleScopedRouteOptions,
) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return errorJson("Your session is missing or expired.", 401);
    }
    console.error(`[${options.timingLabel}] session verification failed:`, error);
    return errorJson("The authentication service is temporarily unavailable.", 503, {
      "Retry-After": "5",
    });
  }

  const target = requestedTarget(request, options);
  if (!target) {
    return errorJson("The requested module is invalid for this scoped endpoint.", 400);
  }

  try {
    const workspace = await getModuleScopedWorkspace(user, target);
    return measuredJson({
      revision: workspace.revision,
      updatedAt: workspace.updatedAt,
      data: workspace.data,
      ...(workspace.rowVersions ? { rowVersions: workspace.rowVersions } : {}),
    }, {
      Vary: "Cookie, Authorization, X-UC-Workspace-Module",
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
      return errorJson(message.slice("FORBIDDEN:".length), 403);
    }
    if (message.startsWith("INVALID:")) {
      return errorJson(message.slice("INVALID:".length), 400);
    }
    if (message === "READ_CONFLICT") {
      return errorJson("Workspace data changed while it was loading. Please retry.", 409, {
        "Retry-After": "1",
      });
    }
    console.error(`[${options.timingLabel}] module-scoped read failed:`, error);
    return errorJson(`${options.errorLabel} data is temporarily unavailable.`, 503, {
      "Retry-After": "5",
    });
  }
}
