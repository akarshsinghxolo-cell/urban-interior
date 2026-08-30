import { NextRequest, NextResponse } from "next/server";
import {
  tryWorkspaceReadTargetForModule,
  workspaceReadTargetForModule,
  type WorkspaceReadTarget,
} from "../workspace-read-scope";
import { requireSession } from "./auth";
import {
  getModuleScopedWorkspace,
  getModuleScopedWorkspacePage,
} from "./module-scoped-read";

interface ModuleScopedRouteOptions {
  moduleId: string;
  errorLabel: string;
  timingLabel: string;
}

const PRIVATE_JSON_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
});
const MODULE_RESPONSE_WARN_BYTES = 512 * 1024;
const MAX_PAGE_COLLECTIONS = 24;

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

function requestedPageOffsets(request: NextRequest): Record<string, number> {
  const offsets: Record<string, number> = {};
  for (const raw of request.nextUrl.searchParams.getAll("page").slice(0, MAX_PAGE_COLLECTIONS)) {
    const separator = raw.lastIndexOf(":");
    if (separator <= 0) continue;
    const collection = raw.slice(0, separator).trim();
    const offset = Number(raw.slice(separator + 1));
    if (!collection || collection.length > 120) continue;
    if (!Number.isSafeInteger(offset) || offset <= 0 || offset > 1_000_000) continue;
    offsets[collection] = offset;
  }
  return offsets;
}

function measuredJson(
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  status = 200,
): NextResponse {
  const body = JSON.stringify(payload);
  const responseBytes = Buffer.byteLength(body);
  if (responseBytes > MODULE_RESPONSE_WARN_BYTES) {
    console.warn("[workspace-egress] module response exceeded target budget", {
      responseBytes,
      warnBytes: MODULE_RESPONSE_WARN_BYTES,
      mode: headers["X-UC-Read-Mode"],
      moduleId: headers["X-UC-Read-Module"],
      collections: headers["X-UC-Read-Collections"],
    });
  }
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...PRIVATE_JSON_HEADERS,
      ...headers,
      "X-UC-Response-Bytes": String(responseBytes),
      "X-UC-Response-Budget": String(MODULE_RESPONSE_WARN_BYTES),
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
    const pageOffsets = requestedPageOffsets(request);
    const pageOnly = Object.keys(pageOffsets).length > 0;
    const workspace = pageOnly
      ? await getModuleScopedWorkspacePage(user, target, pageOffsets)
      : await getModuleScopedWorkspace(user, target);
    const hasMore = Object.values(workspace.pagination || {}).some((entry) => entry.hasMore);

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
      "X-UC-Read-Page-Only": pageOnly ? "1" : "0",
      "X-UC-Read-Has-More": hasMore ? "1" : "0",
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
