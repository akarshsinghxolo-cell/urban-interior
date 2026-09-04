import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

describe("Google Drive transaction simplification", () => {
  test("keeps transfer progress local and uses a fixed Drive chunk size", async () => {
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    expectTokens(transfer, ["const CHUNK_SIZE = 8 * 1024 * 1024"]);
    expect(transfer).not.toContain('jsonPost("progress"');
    expect(transfer).not.toContain("chunkSize(");
    expectTokens(transfer, ["preferredStorageAccountId: batch.storageAccountId"]);
  });

  test("keeps durable upload jobs and recreates dead resumable sessions", async () => {
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    const indexedDb = await readFile("src/lib/uploads/upload-indexed-db.ts", "utf8");

    expectTokens(indexedDb, ['const DB_NAME = "urban-castle-uploads"']);
    expectTokens(store, ["await uploadIndexedDb.putBlob({ uploadItemId: itemId, blob: file, createdAt })"]);
    expectTokens(store, ["await persistItem(item)"]);
    expect(transfer).toContain("sessionKnownExpired(current)");
    expect(transfer).toContain("resetDriveSession");
    expectTokens(transfer, ["response.status >= 400 && response.status < 500 && response.status !== 429"]);
    expect(transfer).toContain("refreshClientSession()");
  });

  test("backs temporary failures off with jitter and honors Retry-After", async () => {
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    expectTokens(transfer, ["function retryDelayMs(retryCount: number)"]);
    expectTokens(transfer, ["0.75 + Math.random() * 0.5"]);
    expect(transfer).toContain("responseRetryAfterMs(response)");
    expectTokens(transfer, ["const hintedDelay"]);
  });

  test("waits for every persisted attachment target and retries automatically", async () => {
    const initiate = await readFile("src/lib/rdash/server/direct-upload-initiate.ts", "utf8");
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");

    expect(initiate).toContain("assertUploadTargetReady");
    expectTokens(initiate, ["uploadPurposeAllowedForEntity(targetEntityType, purpose)"]);
    expectTokens(initiate, ['targetEntityType === "general"']);
    expectTokens(initiate, ['resolveEntityContext(db, targetEntityType, targetEntityId, "Upload target")']);
    expectNoTokens(initiate, ["function uploadTargetExists"]);
    expectTokens(initiate, ['targetEntityType === "general"']);
    expectTokens(initiate, ["assertUploadTargetReady(workspace.data, input.targetEntityType, input.targetEntityId, input.purpose)"]);
    expect(transfer).toContain("targetReadyRetryDelayMs");
    expectTokens(transfer, ['status: "paused"']);
    expectTokens(transfer, ['lastErrorCode: "TARGET_NOT_READY"']);
    expect(transfer).toContain("scheduleNextRetry()");
  });

  test("does not let a terminal file block later files in the same batch", async () => {
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    expectTokens(store, ["snapshot.items.find((entry) => entry.batchId === batch.id && itemIsProcessable(entry))"]);
    expect(store).not.toContain("firstItemByBatch");
  });

  test("rejects invalid purpose-owner pairs before they enter the durable queue", async () => {
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    const pendingPanel = await readFile("src/components/uploads/PendingUploadsPanel.tsx", "utf8");
    expectTokens(store, ["uploadPurposeAllowedForEntity(input.targetEntityType, input.purpose)"]);
    expectTokens(pendingPanel, ['targetEntityType: "general"']);
    expectTokens(pendingPanel, ['purpose: "diagnostic"']);
    expectNoTokens(pendingPanel, ['targetEntityType: "communication", targetEntityId: reserveEntityId("diagnostic")']);
  });

  test("scopes pending-file deduplication to the same record and purpose", async () => {
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    expectTokens(store, ["entry.targetEntityType === batch.targetEntityType"]);
    expectTokens(store, ["entry.targetEntityId === batch.targetEntityId"]);
    expectTokens(store, ["entry.purpose === batch.purpose"]);
  });

  test("does not require a persisted server upload batch or noisy lifecycle events", async () => {
    const initiate = await readFile("src/lib/rdash/server/direct-upload-initiate.ts", "utf8");
    expect(initiate).not.toContain('.from("uc_upload_batches").upsert');
    expectNoTokens(initiate, ['event_type: "session_started"']);
    expectNoTokens(initiate, ['event_type: "bound"']);
    expect(initiate).toContain("input.preferredStorageAccountId");
  });

  test("finalizes file registry and attachment changes through one scoped canonical workspace journal", async () => {
    const persistence = await readFile("src/lib/rdash/server/direct-upload-persistence.ts", "utf8");
    const finalizer = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");

    expectTokens(persistence, ['import { AsyncLocalStorage } from "node:async_hooks"']);
    expectTokens(persistence, ["uploadCommitContext.run({ upserts: [] }, work)"]);
    expect(persistence).toContain("commitWorkspaceOperations");
    expect(persistence).toContain("getWorkspaceSubset");
    expect(persistence).toContain('"master.storageFolderInstances"');
    expect(persistence).toContain('"master.fileAssets"');
    expect(persistence).toContain('"entityFileAttachments"');
    for (const collection of [
      'measurement_revision: "measurementRevisions"', 'accepted_scope: "acceptedScopes"', 'variation_request: "variationRequests"',
      'vendor_rfq: "vendorRfqs"', 'vendor_bid: "vendorBids"', 'stock_movement: "stockMovements"', 'vendor_payment: "vendorPayments"',
      'contractor_bill: "contractorBills"', 'contractor_payment: "contractorPayments"', 'customer_receipt: "customerReceipts"',
    ]) expect(persistence).toContain(collection);
    expect(persistence).not.toContain("enterWith");
    expect(persistence).not.toContain('rpc("uc_bump_workspace_revision"');
    expect(persistence).not.toContain("getSupabaseAdminClient");
    expectTokens(finalizer, ["uploadPurposeAllowedForEntity(serverTargetType, serverPurpose)"]);
    expectTokens(finalizer, ["existingFolderInstance?.template_id || `canonical-${serverPurpose}`"]);
    expect(finalizer).toContain('upsertEntityRow("entity_master_storageFolderTemplates"');
    expectTokens(finalizer, ["withUploadCommitContext(async () =>"]);
    expectTokens(finalizer, ["await bumpWorkspaceRevision()"]);
  });

  test("preserves contextual attachment labels and Work Required thread routing", async () => {
    const finalizer = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");
    const entityContext = await readFile("src/lib/rdash/entity-context.ts", "utf8");
    const files = await readFile("src/lib/rdash/store/slices/files.ts", "utf8");
    const threadPanel = await readFile("src/components/rdash/ThreadPanel.tsx", "utf8");

    expectTokens(entityContext, ["export function resolveAttachmentEntityLabel"]);
    expectTokens(files, ['import { resolveAttachmentEntityLabel, resolveEntityContext } from "../../entity-context"']);
    expectTokens(finalizer, ["entity_label: resolveAttachmentEntityLabel(workspace.data, serverTargetType, serverTargetId)"]);
    expectTokens(finalizer, ['resolveEntityContext(workspace.data, serverTargetType, serverTargetId, "Upload finalization")']);
    expectNoTokens(finalizer, ["context = undefined"]);
    expect(threadPanel).toContain("resolveThreadRecordEntityType");
    expectTokens(entityContext, ['recordType === "workRequired"']);
  });

  test("recovers when workspace persistence succeeded before the upload job status update", async () => {
    const finalizer = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");
    expectTokens(finalizer, ["registeredResult(admin, item, input)"]);
    expectTokens(finalizer, ["await markUploadCompleted(admin, item, existingResult"]);
    expectTokens(finalizer, ["Could not mark batch completed"]);
    expectTokens(finalizer, ["Could not write completion event"]);
  });

  test("uses public Google Drive URLs without Vercel on the normal preview path", async () => {
    const preview = await readFile("src/app/api/google-drive/preview/route.ts", "utf8");
    const download = await readFile("src/app/api/google-drive/download/route.ts", "utf8");
    const open = await readFile("src/app/api/google-drive/open/route.ts", "utf8");
    const thumbnail = await readFile("src/app/api/google-drive/thumbnail/route.ts", "utf8");
    const previewComponent = await readFile("src/components/rdash/FilePreview.tsx", "utf8");

    for (const route of [preview, download, open, thumbnail]) {
      expect(route).toContain("NextResponse.redirect");
      expect(route).not.toContain("canReadManagedFileAsset");
      expect(route).not.toContain("getGoogleDriveAccessToken");
      expect(route).not.toContain("response.body");
    }
    expect(preview).toContain("https://drive.google.com/file/d/");
    expect(download).toContain("https://drive.google.com/uc?export=download&id=");
    expect(thumbnail).toContain("https://drive.google.com/thumbnail?id=");
    expect(previewComponent).toContain("publicDrivePreviewUrl");
    expect(previewComponent).toContain("publicDriveDownloadUrl");
    expect(previewComponent).not.toContain("/api/google-drive/download?fileId=");
    expect(previewComponent).not.toContain("/api/google-drive/open?fileId=");
  });

  test("keeps external Drive references on their original URL", async () => {
    const attachments = await readFile("src/lib/rdash/file-attachments.ts", "utf8");
    expectTokens(attachments, ['asset.storage_provider === "google_drive" && asset.storage_mode === "managed"']);
    expectTokens(attachments, ["googleFileId: managedDriveFile ? asset.google_file_id : undefined"]);
    expectTokens(attachments, ["url: asset.web_view_link"]);
  });

  test("removes the local-file provider from the active routes, validation, and shared contract", async () => {
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");
    const files = await readFile("src/lib/rdash/store/slices/files.ts", "utf8");
    const thumbnail = await readFile("src/app/api/google-drive/thumbnail/route.ts", "utf8");
    const types = await readFile("src/lib/rdash/types.ts", "utf8");
    const businessRules = await readFile("src/lib/rdash/business-rules.ts", "utf8");

    expectTokens(manager, ["Direct Google Drive uploads"]);
    expectTokens(manager, ["does not fall back to Vercel local storage"]);
    expectNoTokens(manager, ["Local storage fallback is active"]);
    expect(manager).not.toContain("download/uploads/");
    expect(files).not.toContain("/api/local-file/");
    expectNoTokens(files, ['storageAccountId === "local"']);
    expect(thumbnail).not.toContain('fileId.startsWith("local-")');
    expectTokens(types, ['storage_provider: "google_drive";']);
    expectNoTokens(types, ['storage_provider: "google_drive" | "local";']);
    expectNoTokens(businessRules, ['storage_provider === "local"']);
    expectNoTokens(businessRules, ['storage_account_id === "local"']);
    expectNoTokens(businessRules, ['storage_account_id !== "local"']);
  });

  test("claims the last unreferenced FileAsset before deleting its managed Drive object", async () => {
    const files = await readFile("src/lib/rdash/store/slices/files.ts", "utf8");
    const cleanup = await readFile("src/lib/rdash/server/file-cleanup.ts", "utf8");
    const cleanupRoute = await readFile("src/app/api/google-drive/cleanup/route.ts", "utf8");

    expectTokens(files, ["requestFileAssetCleanupAfterSync(get, attachment.file_asset_id)"]);
    expect(cleanup).toContain("fileAssetHasReferences");
    expect(cleanup).toContain("entityFileAttachments");
    expectTokens(cleanup, ["drive_asset_id === fileAssetId"]);
    expectTokens(cleanup, ["attachment.file_asset_id === fileAssetId"]);
    expect(cleanup).toContain("claimUnreferencedFileAsset");
    expect(cleanup).toContain("restoreFileAsset");
    expectTokens(cleanup, ["deleteIds: [fileAssetId]"]);
    expectTokens(cleanup, ['{ method: "DELETE" }']);
    expect(cleanup.indexOf('deleteIds: [fileAssetId]')).toBeLessThan(cleanup.indexOf("const deleted = await driveFetch"));
    expectTokens(cleanup, ['reason: "external_reference"']);
    expectTokens(cleanup, ["driveDeleted: false"]);
    expect(cleanupRoute).toContain("cleanupUnreferencedManagedFile");
  });

  test("preserves the canonical folder hierarchy and Drive folder registry", async () => {
    const hierarchy = await readFile("src/lib/rdash/server/drive-folder-hierarchy.ts", "utf8");
    const storage = await readFile("src/lib/rdash/server/direct-upload-storage.ts", "utf8");
    expectTokens(hierarchy, ['leaf("Customers", "root:customers")']);
    expectTokens(hierarchy, ['leaf("Procurement", "root:procurement")']);
    expectTokens(hierarchy, ['leaf("Vendors", "root:vendors")']);
    expect(storage).toContain("ensureCanonicalFolderPath");
    expect(storage).toContain('segment.key.includes(":commercial")');
  });

  test("uses one paused state for temporary and target-readiness upload waits", async () => {
    const types = await readFile("src/lib/uploads/upload-types.ts", "utf8");
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    const migration = await readFile("supabase/migrations/20260805113000_simplify_upload_retry_states.sql", "utf8");

    for (const removedStatus of ["waiting_for_network", "waiting_for_entity", "failed_retryable"]) {
      expect(types).not.toContain(`| "${removedStatus}"`);
      expect(store).not.toContain(`status: "${removedStatus}"`);
      expect(transfer).not.toContain(`status: "${removedStatus}"`);
    }

    expectTokens(store, ['status: online ? "queued" : "paused"']);
    expectTokens(store, ["lastErrorCode: online ? undefined : NETWORK_ERROR_CODE"]);
    expectTokens(transfer, ['status: "paused"']);
    expectTokens(transfer, ['lastErrorCode: "TARGET_NOT_READY"']);
    expectTokens(transfer, ['lastErrorCode: network ? "NETWORK" : "TEMPORARY_ERROR"']);
    expectNoTokens(transfer, ["lastErrorMessage: message, }); return; } const offline"]);

    expectTokens(migration, ["where status = 'waiting_for_network'"]);
    expectTokens(migration, ["where status = 'failed_retryable'"]);
    expectTokens(migration, ["where status = 'waiting_for_entity'"]);
    expectTokens(migration, ["where status = 'paused'"]);
  });
});
