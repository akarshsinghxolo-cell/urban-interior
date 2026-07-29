import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import {
  ENTITY_SCOPED_READS_ENABLED,
  getEntityScopedWorkspace,
} from "@/lib/rdash/server/entity-scoped-read";
import {
  getModuleScopedWorkspace,
  MODULE_SCOPED_READS_ENABLED,
} from "@/lib/rdash/server/module-scoped-read";
import { getWorkspace } from "@/lib/rdash/server/workspace";
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
      // Fall through to the full compatibility read.
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
      headers: { "Content-Type": "application/json", ...headers, "X-UC-Response-Bytes": String(responseBytes) },
    }),
    responseBytes,
  };
}

async function fullWorkspacePayload() {
  const startedAt = performance.now();
  const workspace = await getWorkspace(true);
  (workspace.data as unknown as Record<string, unknown>)._workspace_read_scope = "full";
  (workspace.data as unknown as Record<string, unknown>)._workspace_read_mode = "full";
  return {
    workspace,
    queryCount: 1 + Object.keys(COLLECTION_TO_TABLE).length,
    loadMs: performance.now() - startedAt,
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
  try {
    const entity = rowScopedEntityForTarget(target);
    if (MODULE_SCOPED_READS_ENABLED && ENTITY_SCOPED_READS_ENABLED && entity) {
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
            { status: 403, headers: { "Cache-Control": "no-store", "X-UC-Read-Mode": `${entity.kind}-row` } },
          );
        }
        console.error("[workspace-read] entity read failed; using collection-scoped compatibility read:", error);
      }
    }

    if (MODULE_SCOPED_READS_ENABLED && target.scope !== "full") {
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
        console.error("[workspace-read] scoped read failed; using full compatibility read:", error);
      }
    }

    const full = await fullWorkspacePayload();
    const mode = target.scope === "full" || !MODULE_SCOPED_READS_ENABLED ? "full" : "full-fallback";
    console.info("[workspace-read]", {
      mode,
      moduleId: target.moduleId,
      queryCount: full.queryCount,
      loadMs: Math.round(full.loadMs * 100) / 100,
    });
    const measured = workspaceJson({
      revision: full.workspace.revision,
      data: full.workspace.data,
      ...(full.workspace.rowVersions ? { rowVersions: full.workspace.rowVersions } : {}),
      user: userPayload(user),
    }, responseHeaders(mode, full.queryCount, full.loadMs));
    console.info("[workspace-response]", { mode, responseBytes: measured.responseBytes });
    return measured.response;
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
