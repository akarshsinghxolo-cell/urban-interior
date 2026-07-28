import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import {
  getModuleScopedWorkspace,
  MODULE_SCOPED_READS_ENABLED,
} from "@/lib/rdash/server/module-scoped-read";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import {
  workspaceReadTargetForModule,
  workspaceReadTargetForPath,
  type WorkspaceReadTarget,
} from "@/lib/rdash/workspace-read-scope";

export const runtime = "nodejs";

function requestWorkspaceTarget(request: NextRequest): WorkspaceReadTarget {
  const explicitModule = request.headers.get("x-uc-workspace-module")?.trim();
  if (explicitModule) return workspaceReadTargetForModule(explicitModule);

  const explicitPath = request.headers.get("x-uc-workspace-path")?.trim();
  if (explicitPath) return workspaceReadTargetForPath(explicitPath);

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

function responseHeaders(mode: string, queryCount: number, loadMs: number): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Vary": "X-UC-Workspace-Path, X-UC-Workspace-Module",
    "X-UC-Read-Mode": mode,
    "X-UC-Read-Queries": String(queryCount),
    "Server-Timing": `workspace-read;dur=${loadMs.toFixed(2)}`,
  };
}

async function fullWorkspacePayload() {
  const startedAt = performance.now();
  const workspace = await getWorkspace(true);
  (workspace.data as unknown as Record<string, unknown>)._workspace_read_scope = "full";
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
        });
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
        }, {
          headers: responseHeaders(workspace.scope, workspace.queryCount, workspace.loadMs),
        });
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
    return NextResponse.json({
      revision: full.workspace.revision,
      data: full.workspace.data,
      ...(full.workspace.rowVersions ? { rowVersions: full.workspace.rowVersions } : {}),
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        expiresAt: user.expiresAt,
      },
    }, { headers: responseHeaders(mode, full.queryCount, full.loadMs) });
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
