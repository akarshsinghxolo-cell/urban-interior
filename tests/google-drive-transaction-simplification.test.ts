import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("Google Drive transaction simplification", () => {
  test("keeps transfer progress local and uses a fixed Drive chunk size", async () => {
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    expect(transfer).toContain("const CHUNK_SIZE = 8 * 1024 * 1024");
    expect(transfer).not.toContain('jsonPost("progress"');
    expect(transfer).not.toContain("chunkSize(");
    expect(transfer).toContain("preferredStorageAccountId: batch.storageAccountId");
  });

  test("keeps durable upload jobs and recreates dead resumable sessions", async () => {
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    const indexedDb = await readFile("src/lib/uploads/upload-indexed-db.ts", "utf8");

    expect(indexedDb).toContain('const DB_NAME = "urban-castle-uploads"');
    expect(store).toContain("await uploadIndexedDb.putBlob({ uploadItemId: itemId, blob: file, createdAt })");
    expect(store).toContain("await persistItem(item)");
    expect(transfer).toContain("sessionKnownExpired(current)");
    expect(transfer).toContain("resetDriveSession");
    expect(transfer).toContain("response.status >= 400 && response.status < 500 && response.status !== 429");
    expect(transfer).toContain("refreshClientSession()");
  });

  test("backs temporary failures off with jitter and honors Retry-After", async () => {
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    expect(transfer).toContain("function retryDelayMs(retryCount: number)");
    expect(transfer).toContain("0.75 + Math.random() * 0.5");
    expect(transfer).toContain("responseRetryAfterMs(response)");
    expect(transfer).toContain("const hintedDelay");
  });

  test("waits for newly reserved target records and retries automatically", async () => {
    const initiate = await readFile("src/lib/rdash/server/direct-upload-initiate.ts", "utf8");
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");

    expect(initiate).toContain("assertUploadTargetReady");
    expect(initiate).toContain("TARGET_NOT_READY:Save the related record before its Drive upload starts.");
    expect(initiate).toContain('purpose === "diagnostic" || purpose === "import_source"');
    expect(transfer).toContain("targetReadyRetryDelayMs");
    expect(transfer).toContain('status: "paused"');
    expect(transfer).toContain('lastErrorCode: "TARGET_NOT_READY"');
    expect(transfer).toContain("scheduleNextRetry()");
  });

  test("does not let a terminal file block later files in the same batch", async () => {
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    expect(store).toContain("snapshot.items.find((entry) => entry.batchId === batch.id && itemIsProcessable(entry))");
    expect(store).not.toContain("firstItemByBatch");
  });

  test("scopes pending-file deduplication to the same record and purpose", async () => {
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    expect(store).toContain("entry.targetEntityType === batch.targetEntityType");
    expect(store).toContain("entry.targetEntityId === batch.targetEntityId");
    expect(store).toContain("entry.purpose === batch.purpose");
  });

  test("does not require a persisted server upload batch or noisy lifecycle events", async () => {
    const initiate = await readFile("src/lib/rdash/server/direct-upload-initiate.ts", "utf8");
    expect(initiate).not.toContain('.from("uc_upload_batches").upsert');
    expect(initiate).not.toContain('event_type: "session_started"');
    expect(initiate).not.toContain('event_type: "bound"');
    expect(initiate).toContain("input.preferredStorageAccountId");
  });

  test("finalizes file registry and attachment changes through one scoped canonical workspace journal", async () => {
    const persistence = await readFile("src/lib/rdash/server/direct-upload-persistence.ts", "utf8");
    const finalizer = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");

    expect(persistence).toContain('import { AsyncLocalStorage } from "node:async_hooks"');
    expect(persistence).toContain("uploadCommitContext.run({ upserts: [] }, work)");
    expect(persistence).toContain("commitWorkspaceOperations");
    expect(persistence).toContain("getWorkspaceSubset");
    expect(persistence).toContain('"master.storageFolderInstances"');
    expect(persistence).toContain('"master.fileAssets"');
    expect(persistence).toContain('"entityFileAttachments"');
    expect(persistence).not.toContain("enterWith");
    expect(persistence).not.toContain('rpc("uc_bump_workspace_revision"');
    expect(persistence).not.toContain("getSupabaseAdminClient");
    expect(finalizer).toContain("withUploadCommitContext(async () =>");
    expect(finalizer).toContain("await bumpWorkspaceRevision()");
  });

  test("recovers when workspace persistence succeeded before the upload job status update", async () => {
    const finalizer = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");
    expect(finalizer).toContain("registeredResult(admin, item, input)");
    expect(finalizer).toContain("await markUploadCompleted(admin, item, existingResult");
    expect(finalizer).toContain("Could not mark batch completed");
    expect(finalizer).toContain("Could not write completion event");
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
    expect(attachments).toContain('asset.storage_provider === "google_drive" && asset.storage_mode === "managed"');
    expect(attachments).toContain("googleFileId: managedDriveFile ? asset.google_file_id : undefined");
    expect(attachments).toContain("url: asset.web_view_link");
  });

  test("does not advertise or implement a Vercel local-file upload fallback", async () => {
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");
    const files = await readFile("src/lib/rdash/store/slices/files.ts", "utf8");
    const thumbnail = await readFile("src/app/api/google-drive/thumbnail/route.ts", "utf8");
    expect(manager).toContain("Direct Google Drive uploads");
    expect(manager).toContain("does not fall back to Vercel local storage");
    expect(manager).not.toContain("Local storage fallback is active");
    expect(manager).not.toContain("download/uploads/");
    expect(files).not.toContain("/api/local-file/");
    expect(files).not.toContain('storageAccountId === "local"');
    expect(thumbnail).not.toContain('fileId.startsWith("local-")');
  });

  test("cleans a managed Drive file only after its last reference is detached", async () => {
    const files = await readFile("src/lib/rdash/store/slices/files.ts", "utf8");
    const cleanup = await readFile("src/lib/rdash/server/file-cleanup.ts", "utf8");
    const cleanupRoute = await readFile("src/app/api/google-drive/cleanup/route.ts", "utf8");

    expect(files).toContain("requestCleanupAfterSync(get, attachment.file_asset_id)");
    expect(cleanup).toContain("fileAssetHasReferences");
    expect(cleanup).toContain("entityFileAttachments");
    expect(cleanup).toContain("drive_asset_id === fileAssetId");
    expect(cleanup).toContain("attachment.file_asset_id === fileAssetId");
    expect(cleanup).toContain('asset.storage_provider !== "google_drive" || asset.storage_mode !== "managed"');
    expect(cleanup).toContain('{ method: "DELETE" }');
    expect(cleanup).toContain('deleteIds: [fileAssetId]');
    expect(cleanupRoute).toContain("cleanupUnreferencedManagedFile");
  });

  test("preserves the canonical folder hierarchy and Drive folder registry", async () => {
    const hierarchy = await readFile("src/lib/rdash/server/drive-folder-hierarchy.ts", "utf8");
    const storage = await readFile("src/lib/rdash/server/direct-upload-storage.ts", "utf8");
    expect(hierarchy).toContain('leaf("Customers", "root:customers")');
    expect(hierarchy).toContain('leaf("Procurement", "root:procurement")');
    expect(hierarchy).toContain('leaf("Vendors", "root:vendors")');
    expect(storage).toContain("ensureCanonicalFolderPath");
    expect(storage).toContain('segment.key.includes(":commercial")');
  });

  test("uses one paused state for temporary and target-readiness upload waits", async () => {
    const types = await readFile("src/lib/uploads/upload-types.ts", "utf8");
    const store = await readFile("src/lib/uploads/upload-store.ts", "utf8");
    const transfer = await readFile("src/lib/uploads/upload-transfer.ts", "utf8");
    const migration = await readFile("supabase/migrations/20260805113000_simplify_upload_retry_states.sql", "utf8");

    for (const removedStatus of ["waiting_for_network", "waiting_for_entity", "failed_retryable"]) {
      expect(types).not.toContain(`| \"${removedStatus}\"`);
      expect(store).not.toContain(`status: \"${removedStatus}\"`);
      expect(transfer).not.toContain(`status: \"${removedStatus}\"`);
    }

    expect(store).toContain('status: online ? "queued" : "paused"');
    expect(store).toContain('lastErrorCode: online ? undefined : NETWORK_ERROR_CODE');
    expect(transfer).toContain('status: "paused"');
    expect(transfer).toContain('lastErrorCode: "TARGET_NOT_READY"');
    expect(transfer).toContain('lastErrorCode: network ? "NETWORK" : "TEMPORARY_ERROR"');
    expect(transfer).not.toContain('lastErrorMessage: message,\n      });\n      return;\n    }\n\n    const offline');

    expect(migration).toContain("where status = 'waiting_for_network'");
    expect(migration).toContain("where status = 'failed_retryable'");
    expect(migration).toContain("where status = 'waiting_for_entity'");
    expect(migration).toContain("where status = 'paused'");
  });
});
