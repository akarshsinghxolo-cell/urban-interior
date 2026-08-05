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

  test("does not require a persisted server upload batch or noisy lifecycle events", async () => {
    const initiate = await readFile("src/lib/rdash/server/direct-upload-initiate.ts", "utf8");
    expect(initiate).not.toContain('.from("uc_upload_batches").upsert');
    expect(initiate).not.toContain('event_type: "session_started"');
    expect(initiate).not.toContain('event_type: "bound"');
    expect(initiate).toContain("input.preferredStorageAccountId");
  });

  test("keeps Vercel on authorization while Google serves preview bytes", async () => {
    const preview = await readFile("src/app/api/google-drive/preview/route.ts", "utf8");
    expect(preview).toContain("canReadManagedFileAsset");
    expect(preview).toContain("webContentLink");
    expect(preview).toContain("NextResponse.redirect");
    expect(preview).not.toContain("?alt=media");
    expect(preview).not.toContain("response.body");
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

  test("uses one paused state for temporary upload failures", async () => {
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
    expect(transfer).toContain('lastErrorCode: network ? "NETWORK" : "TEMPORARY_ERROR"');
    expect(transfer).toContain('status: "failed_permanent"');
    expect(transfer).toContain('lastErrorCode: "TARGET_NOT_READY"');

    expect(migration).toContain("where status = 'waiting_for_network'");
    expect(migration).toContain("where status = 'failed_retryable'");
    expect(migration).toContain("where status = 'waiting_for_entity'");
    expect(migration).toContain("where status = 'paused'");
  });
});
