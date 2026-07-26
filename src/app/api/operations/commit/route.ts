import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { commitAuthorizedPostgresOperations, type CommitResult } from "@/lib/rdash/server/authorized-commit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { applyWorkspaceOperations, diffWorkspaceOperations, type WorkspaceOperation } from "@/lib/rdash/workspace-operations";
import { isEntityContextType } from "@/lib/rdash/entity-context";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROCESSING_STALE_MS = 120_000;

type OperationReceipt = {
  status?: string;
  result?: Record<string, unknown> | null;
  last_error?: string | null;
  updated_at?: string | null;
  attempt_count?: number | null;
};

function payload(workspace: CommitResult | Awaited<ReturnType<typeof getWorkspace>>) {
  const result: Record<string, unknown> = { revision: workspace.revision, data: workspace.data };
  if ("bumpedRowVersions" in workspace && workspace.bumpedRowVersions) {
    result.rowVersions = workspace.bumpedRowVersions;
  } else if ("rowVersions" in workspace && workspace.rowVersions) {
    result.rowVersions = workspace.rowVersions;
  }
  return result;
}

function operationEffectsAlreadyPresent(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  operations: WorkspaceOperation[],
): boolean {
  const candidate = applyWorkspaceOperations(workspace.data, operations);
  return diffWorkspaceOperations(workspace.data, candidate).length === 0;
}

function hasManagedFileWithoutFolder(operations: WorkspaceOperation[]): boolean {
  return operations.some((operation) =>
    operation.collection === "master.fileAssets"
    && (operation.upsert || []).some((row) =>
      row.storage_mode === "managed"
      && !row.storage_folder_instance_id,
    ),
  );
}

function hasAttachmentWithUnsupportedEntityType(operations: WorkspaceOperation[]): boolean {
  return operations.some((operation) =>
    operation.collection === "entityFileAttachments"
    && (operation.upsert || []).some((row) =>
      typeof row.entity_type === "string"
      && !isEntityContextType(row.entity_type),
    ),
  );
}

function restoreExistingAttachmentEntityIdentity(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  operations: WorkspaceOperation[],
): WorkspaceOperation[] {
  const existingAttachments = new Map(
    (workspace.data.entityFileAttachments || []).map((attachment) => [attachment.id, attachment]),
  );

  return operations.map((operation) => {
    if (operation.collection !== "entityFileAttachments") return operation;

    const upsert = (operation.upsert || []).map((row) => {
      if (isEntityContextType(row.entity_type)) return row;
      const existing = existingAttachments.get(String(row.id || ""));
      const sameAttachment = existing
        && existing.file_asset_id === row.file_asset_id
        && isEntityContextType(existing.entity_type);
      if (!sameAttachment) return row;

      return {
        ...row,
        entity_type: existing.entity_type,
        entity_id: existing.entity_id,
      };
    });

    return { ...operation, upsert };
  });
}

function restoreManagedFileFolderIdentity(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  operations: WorkspaceOperation[],
): WorkspaceOperation[] {
  const existingFiles = new Map(
    (workspace.data.master.fileAssets || []).map((file) => [file.id, file]),
  );

  return operations.map((operation) => {
    if (operation.collection !== "master.fileAssets") return operation;

    const upsert = (operation.upsert || []).map((row) => {
      if (row.storage_mode !== "managed" || row.storage_folder_instance_id) return row;
      const existing = existingFiles.get(String(row.id || ""));
      const sameManagedFile = existing
        && existing.storage_mode === "managed"
        && existing.google_file_id === row.google_file_id
        && existing.storage_account_id === row.storage_account_id
        && existing.storage_folder_instance_id;
      if (!sameManagedFile) return row;

      return {
        ...row,
        storage_folder_instance_id: existing.storage_folder_instance_id,
      };
    });

    return { ...operation, upsert };
  });
}

async function saveAppliedReceipt(operationId: string, result: Record<string, unknown>, revision: number): Promise<void> {
  const timestamp = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient().from("uc_workspace_operations").update({
    status: "applied",
    result,
    applied_revision: revision,
    applied_at: timestamp,
    last_error: null,
    updated_at: timestamp,
  }).eq("id", operationId).select("id").maybeSingle();
  if (error) throw new Error(`Could not persist the workspace operation receipt: ${error.message}`);
  if (!data) throw new Error("Could not persist the workspace operation receipt.");
}

async function loadReceipt(operationId: string): Promise<OperationReceipt | null> {
  const { data, error } = await getSupabaseAdminClient().from("uc_workspace_operations")
    .select("status,result,last_error,updated_at,attempt_count")
    .eq("id", operationId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the workspace operation receipt: ${error.message}`);
  return data as OperationReceipt | null;
}

async function claimOperation(input: {
  operationId: string;
  revision: number;
  operations: WorkspaceOperation[];
  userId: string;
}): Promise<{ claimed: true } | { claimed: false; receipt: OperationReceipt }> {
  const admin = getSupabaseAdminClient();
  const timestamp = new Date().toISOString();
  const { error: insertError } = await admin.from("uc_workspace_operations").insert({
    id: input.operationId,
    workspace_id: "default",
    base_revision: input.revision,
    operations: input.operations,
    status: "processing",
    created_by_user_id: input.userId,
    attempt_count: 1,
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (!insertError) return { claimed: true };
  if (insertError.code !== "23505") throw new Error(`Could not claim the workspace operation: ${insertError.message}`);

  const receipt = await loadReceipt(input.operationId);
  if (!receipt) throw new Error("The workspace operation receipt disappeared while it was being claimed.");
  if (receipt.status === "applied" || receipt.status === "conflict") return { claimed: false, receipt };

  const isFreshProcessing = receipt.status === "processing" && receipt.updated_at &&
    Date.now() - Date.parse(receipt.updated_at) < PROCESSING_STALE_MS;
  if (isFreshProcessing) return { claimed: false, receipt };

  const previousAttemptCount = Number(receipt.attempt_count || 0);
  const previousUpdatedAt = receipt.updated_at || "";
  let query = admin.from("uc_workspace_operations").update({
    base_revision: input.revision,
    operations: input.operations,
    status: "processing",
    created_by_user_id: input.userId,
    attempt_count: previousAttemptCount + 1,
    last_error: null,
    result: null,
    applied_revision: null,
    applied_at: null,
    updated_at: timestamp,
  }).eq("id", input.operationId).eq("attempt_count", previousAttemptCount);
  if (previousUpdatedAt) query = query.eq("updated_at", previousUpdatedAt);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Could not reclaim the workspace operation: ${error.message}`);
  if (!data) return { claimed: false, receipt: await loadReceipt(input.operationId) || receipt };
  return { claimed: true };
}

async function markFailedReceipt(operationId: string, status: string, errorMessage: string): Promise<void> {
  const { error } = await getSupabaseAdminClient().from("uc_workspace_operations").update({
    status,
    last_error: errorMessage,
    updated_at: new Date().toISOString(),
  }).eq("id", operationId);
  if (error) console.error("[operations/commit] Could not persist operation failure status", error);
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

    let operations = body.operations;
    const repairManagedFiles = hasManagedFileWithoutFolder(operations);
    const repairAttachmentContext = hasAttachmentWithUnsupportedEntityType(operations);
    if (repairManagedFiles || repairAttachmentContext) {
      const current = await getWorkspace(true);
      if (repairManagedFiles) {
        operations = restoreManagedFileFolderIdentity(current, operations);
      }
      if (repairAttachmentContext) {
        operations = restoreExistingAttachmentEntityIdentity(current, operations);
      }
    }

    if (operationId) {
      const claim = await claimOperation({
        operationId,
        revision: body.revision,
        operations,
        userId: user.userId,
      });
      if (!claim.claimed) {
        if (claim.receipt.status === "applied" && claim.receipt.result) {
          return NextResponse.json(claim.receipt.result, {
            headers: { "Cache-Control": "no-store", "X-UC-Idempotent-Replay": "1" },
          });
        }
        if (claim.receipt.status === "conflict") {
          return NextResponse.json({ error: claim.receipt.last_error || "The workspace changed on another device." }, { status: 409 });
        }

        const current = await getWorkspace(true);
        if (operationEffectsAlreadyPresent(current, operations)) {
          const result = payload(current);
          await saveAppliedReceipt(operationId, result, current.revision);
          return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store", "X-UC-Idempotent-Recovered": "1" },
          });
        }
        return NextResponse.json(
          { error: "This workspace operation is already processing. It will retry automatically." },
          { status: 503, headers: { "Retry-After": "10", "Cache-Control": "no-store" } },
        );
      }
    }

    if (!operations.length) {
      const current = await getWorkspace(true);
      const result = payload(current);
      if (operationId) await saveAppliedReceipt(operationId, result, current.revision);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    let saved: CommitResult;
    try {
      saved = await commitAuthorizedPostgresOperations(
        user,
        body.revision,
        operations,
        body.expectedRevisions,
        body.expectedRowVersions,
      );
    } catch (error) {
      if (operationId && error instanceof Error && error.message === "CONFLICT") {
        const current = await getWorkspace(true);
        if (operationEffectsAlreadyPresent(current, operations)) {
          const result = payload(current);
          await saveAppliedReceipt(operationId, result, current.revision);
          return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store", "X-UC-Idempotent-Recovered": "1" },
          });
        }
      }
      throw error;
    }

    const result = payload(saved);
    if (operationId) await saveAppliedReceipt(operationId, result, saved.revision);
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
      await markFailedReceipt(operationId, status === 409 ? "conflict" : status >= 500 ? "retryable" : "failed", publicMessage);
    }
    return NextResponse.json({ error: publicMessage }, { status, headers: { "Cache-Control": "no-store" } });
  }
}