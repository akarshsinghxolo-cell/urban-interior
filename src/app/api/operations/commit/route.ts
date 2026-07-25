import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { commitAuthorizedPostgresOperations, type CommitResult } from "@/lib/rdash/server/authorized-commit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { WorkspaceOperation } from "@/lib/rdash/workspace-operations";

export const runtime = "nodejs";
export const maxDuration = 60;

function payload(workspace: CommitResult | Awaited<ReturnType<typeof getWorkspace>>) {
  const result: Record<string, unknown> = { revision: workspace.revision, data: workspace.data };
  if ("bumpedRowVersions" in workspace && workspace.bumpedRowVersions) {
    result.rowVersions = workspace.bumpedRowVersions;
  } else if ("rowVersions" in workspace && workspace.rowVersions) {
    result.rowVersions = workspace.rowVersions;
  }
  return result;
}

export async function POST(request: NextRequest) {
  let operationId: string | undefined;
  try {
    const user = await requireSession(request);
    const body = (await request.json().catch(() => ({}))) as {
      operationId?: string;
      revision?: number;
      operations?: WorkspaceOperation[];
      expectedRevisions?: Record<string, number>;
      expectedRowVersions?: Record<string, number>;
    };
    operationId = body.operationId;
    if (typeof body.revision !== "number" || !Array.isArray(body.operations)) {
      return NextResponse.json({ error: "revision and operations are required." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    if (operationId) {
      const { data: existing } = await admin.from("uc_workspace_operations")
        .select("status,result,last_error,updated_at")
        .eq("id", operationId)
        .maybeSingle();
      if (existing?.status === "applied" && existing.result) {
        return NextResponse.json(existing.result, { headers: { "Cache-Control": "no-store", "X-UC-Idempotent-Replay": "1" } });
      }
      if (existing?.status === "conflict") {
        return NextResponse.json({ error: existing.last_error || "The workspace changed on another device." }, { status: 409 });
      }
      if (existing?.status === "processing" && existing.updated_at && Date.now() - Date.parse(String(existing.updated_at)) < 120_000) {
        return NextResponse.json(
          { error: "This workspace operation is already processing. It will retry automatically." },
          { status: 503, headers: { "Retry-After": "10" } },
        );
      }
      const timestamp = new Date().toISOString();
      await admin.from("uc_workspace_operations").upsert({
        id: operationId,
        workspace_id: "default",
        base_revision: body.revision,
        operations: body.operations,
        status: "processing",
        created_by_user_id: user.userId,
        attempt_count: Number(existing ? 1 : 0) + 1,
        created_at: timestamp,
        updated_at: timestamp,
      }, { onConflict: "id" });
    }

    if (!body.operations.length) {
      const current = await getWorkspace(true);
      const result = payload(current);
      if (operationId) {
        await admin.from("uc_workspace_operations").update({ status: "applied", result, applied_revision: current.revision, applied_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", operationId);
      }
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    const saved = await commitAuthorizedPostgresOperations(
      user,
      body.revision,
      body.operations,
      body.expectedRevisions,
      body.expectedRowVersions,
    );
    const result = payload(saved);
    if (operationId) {
      await admin.from("uc_workspace_operations").update({
        status: "applied",
        result,
        applied_revision: saved.revision,
        applied_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", operationId);
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation commit was rejected.";
    const status = message === "UNAUTHORIZED"
      ? 401
      : message.startsWith("FORBIDDEN:")
        ? 403
        : message.startsWith("INVALID:")
          ? 422
          : message === "CONFLICT"
            ? 409
            : 500;
    const publicMessage = message
      .replace(/^(FORBIDDEN:|INVALID:)/, "")
      .replace(/^CONFLICT$/, "The workspace changed on another device. Refresh before retrying.");
    if (operationId) {
      try {
        await getSupabaseAdminClient().from("uc_workspace_operations").update({
          status: status === 409 ? "conflict" : status >= 500 ? "retryable" : "failed",
          last_error: publicMessage,
          updated_at: new Date().toISOString(),
        }).eq("id", operationId);
      } catch {
        // The original commit error is more important than event persistence.
      }
    }
    return NextResponse.json({ error: publicMessage }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
