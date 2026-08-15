import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getEntityScopedWorkspace } from "@/lib/rdash/server/entity-scoped-read";
import { getModuleScopedWorkspace } from "@/lib/rdash/server/module-scoped-read";
import {
  rowScopedEntityForTarget,
  workspaceReadTargetForModule,
  workspaceReadTargetForPath,
  type WorkspaceReadTarget,
} from "@/lib/rdash/workspace-read-scope";

export const runtime = "nodejs";

function requestWorkspaceTarget(request: NextRequest): WorkspaceReadTarget {
  const explicitPath = request.headers.get("x-uc-workspace-path")?.trim();
  if (explicitPath) return workspaceReadTargetForPath(explicitPath);

  const explicitModule = request.headers.get("x-uc-workspace-module")?.trim();
  if (explicitModule) return workspaceReadTargetForModule(explicitModule);

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      return workspaceReadTargetForPath(`${url.pathname}${url.search}`);
    } catch {
      // Fall through to the bounded Workdesk read.
    }
  }
  return workspaceReadTargetForModule("workdesk");
}

function responseHeaders(
  mode: string,
  queryCount: number,
  loadMs: number,
  options?: {
    collectionCount?: number;
    rowCount?: number;
    entityKind?: string;
    entityId?: string;
  },
): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Vary": "X-UC-Workspace-Path, X-UC-Workspace-Module",
    "X-UC-Read-Mode": mode,
    "X-UC-Read-Queries": String(queryCount),
    ...(typeof options?.collectionCount === "number"
      ? { "X-UC-Read-Collections": String(options.collectionCount) }
      : {}),
    ...(typeof options?.rowCount === "number"
      ? { "X-UC-Read-Rows": String(options.rowCount) }
      : {}),
    ...(options?.entityKind ? { "X-UC-Read-Entity-Kind": options.entityKind } : {}),
    ...(options?.entityId ? { "X-UC-Read-Entity-Id": options.entityId } : {}),
    "Server-Timing": `workspace-read;dur=${loadMs.toFixed(2)}`,
  };
}

function userPayload(user: Awaited<ReturnType<typeof requireSession>>) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    staffId: user.staffId,
    expiresAt: user.expiresAt,
  };
}

function workspaceJson(payload: Record<string, unknown>, headers: Record<string, string>) {
  const body = JSON.stringify(payload);
  const responseBytes = Buffer.byteLength(body);
  return {
    response: new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
        "X-UC-Response-Bytes": String(responseBytes),
      },
    }),
    responseBytes,
  };
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

  const target = requestWorkspaceTarget(request);
  const entity = rowScopedEntityForTarget(target);
  let entityFailure: unknown;

  // Entity reads are the smallest supported graph. If one entity graph cannot
  // be resolved, fall back only to that module's scoped graph—not to a second
  // whole-workspace architecture.
  if (entity) {
    try {
      const workspace = await getEntityScopedWorkspace(user, target);
      console.info("[workspace-read]", {
        mode: workspace.mode,
        moduleId: target.moduleId,
        permissionModule: target.permissionModule,
        entityKind: workspace.entityKind,
        entityId: workspace.entityId,
        queryCount: workspace.queryCount,
        collectionCount: workspace.collectionCount,
        rowCount: workspace.rowCount,
        loadMs: workspace.loadMs,
      });
      const measured = workspaceJson({
        revision: workspace.revision,
        data: workspace.data,
        ...(workspace.rowVersions ? { rowVersions: workspace.rowVersions } : {}),
        user: userPayload(user),
      }, responseHeaders(workspace.mode, workspace.queryCount, workspace.loadMs, {
        collectionCount: workspace.collectionCount,
        rowCount: workspace.rowCount,
        entityKind: workspace.entityKind,
        entityId: workspace.entityId,
      }));
      console.info("[workspace-response]", { mode: workspace.mode, responseBytes: measured.responseBytes });
      return measured.response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("FORBIDDEN:")) {
        return NextResponse.json(
          { error: message.slice("FORBIDDEN:".length) },
          {
            status: 403,
            headers: { "Cache-Control": "no-store", "X-UC-Read-Mode": `${entity.kind}-row` },
          },
        );
      }
      entityFailure = error;
      console.error("[workspace-read] entity read failed; trying the module graph:", error);
    }
  }

  try {
    const workspace = await getModuleScopedWorkspace(user, target);
    console.info("[workspace-read]", {
      mode: workspace.scope,
      moduleId: target.moduleId,
      permissionModule: target.permissionModule,
      queryCount: workspace.queryCount,
      collectionCount: workspace.collectionCount,
      loadMs: workspace.loadMs,
      ...(entity ? { fallbackFrom: `${entity.kind}-row` } : {}),
    });
    const measured = workspaceJson({
      revision: workspace.revision,
      data: workspace.data,
      ...(workspace.rowVersions ? { rowVersions: workspace.rowVersions } : {}),
      user: userPayload(user),
    }, responseHeaders(workspace.scope, workspace.queryCount, workspace.loadMs, {
      collectionCount: workspace.collectionCount,
    }));
    console.info("[workspace-response]", { mode: workspace.scope, responseBytes: measured.responseBytes });
    return measured.response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("FORBIDDEN:")) {
      return NextResponse.json(
        { error: message.slice("FORBIDDEN:".length) },
        { status: 403, headers: { "Cache-Control": "no-store", "X-UC-Read-Mode": target.scope } },
      );
    }
    console.error("[workspace-read] scoped read failed", {
      moduleId: target.moduleId,
      scope: target.scope,
      entityFailure: entityFailure instanceof Error ? entityFailure.message : undefined,
      cause: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "The requested workspace data is temporarily unavailable." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-UC-Read-Mode": target.scope,
          "X-UC-Read-Architecture": "scoped-only",
        },
      },
    );
  }
}

export async function PUT() {
  return NextResponse.json({
    error: "Whole-workspace PUT is disabled. Use /api/operations/commit with table-level operations.",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
