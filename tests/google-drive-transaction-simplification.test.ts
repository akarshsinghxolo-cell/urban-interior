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
});
