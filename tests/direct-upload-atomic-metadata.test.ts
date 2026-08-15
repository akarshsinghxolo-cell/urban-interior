import { describe, expect, test } from "bun:test";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { buildAtomicUploadMetadataOperations } from "../src/lib/rdash/server/direct-upload-persistence";

describe("direct upload metadata transaction", () => {
  test("builds one commit containing asset, attachment, and target binding", () => {
    const workspace = buildSeedDatabase();
    const site = workspace.sites[0];
    const operations = buildAtomicUploadMetadataOperations({
      workspace,
      folderInstance: { id: "folder-1" } as never,
      asset: { id: "asset-1" } as never,
      attachment: { id: "attachment-1" } as never,
      targetEntityType: "site",
      targetEntityId: site.id,
      attachmentField: "photo_attachment_ids",
      attachmentFieldMode: "append",
    });

    expect(operations.map((operation) => operation.collection)).toEqual([
      "master.storageFolderInstances",
      "master.fileAssets",
      "entityFileAttachments",
      "sites",
    ]);
    expect(operations[3].upsert?.[0].photo_attachment_ids).toContain("attachment-1");
  });
});
