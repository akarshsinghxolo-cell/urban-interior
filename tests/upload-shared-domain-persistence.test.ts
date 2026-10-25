import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthenticatedUser } from "../src/lib/rdash/server/auth";

const fixture = vi.hoisted(() => ({
  read: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("../src/lib/rdash/server/workspace", () => ({
  getWorkspaceSubset: fixture.read,
  commitWorkspaceOperations: fixture.commit,
}));

import {
  bumpWorkspaceRevision,
  updateAttachmentField,
  upsertEntityRow,
  withUploadCommitContext,
} from "../src/lib/rdash/server/direct-upload-persistence";

const user: AuthenticatedUser = { userId: "u1", email: "owner@example.test", name: "Owner", role: "Owner", expiresAt: 9_999_999_999 };

beforeEach(() => {
  vi.clearAllMocks();
  fixture.read.mockResolvedValue({
    revision: 41,
    rowVersions: { "tasks:task-1": 7 },
    data: { master: {}, tasks: [{ id: "task-1", title: "Evidence", attachment_ids: ["existing"] }] },
  });
  fixture.commit.mockResolvedValue({});
});

describe("upload persistence across shared domains", () => {
  test("commits template, folder, file, link and target update in one logical transaction", async () => {
    await withUploadCommitContext(async () => {
      for (const [collection, id] of [
        ["master.storageFolderTemplates", "template-1"],
        ["master.storageFolderInstances", "folder-1"],
        ["master.fileAssets", "asset-1"],
        ["entityFileAttachments", "attachment-1"],
      ]) await upsertEntityRow(collection, id, { id }, user);
      await updateAttachmentField(user, "task", "task-1", "attachment_ids", "append", "attachment-1");
      await bumpWorkspaceRevision();
      await bumpWorkspaceRevision(); // An already-flushed context must not write again.
    });
    expect(fixture.commit).toHaveBeenCalledTimes(1);
    const [revision, operations, versions] = fixture.commit.mock.calls[0];
    expect(revision).toBe(41);
    expect(versions).toEqual({ "tasks:task-1": 7 });
    expect(operations).toEqual([
      { collection: "master.storageFolderTemplates", upsert: [{ id: "template-1" }] },
      { collection: "master.storageFolderInstances", upsert: [{ id: "folder-1" }] },
      { collection: "master.fileAssets", upsert: [{ id: "asset-1" }] },
      { collection: "entityFileAttachments", upsert: [{ id: "attachment-1" }] },
      { collection: "tasks", upsert: [{ id: "task-1", title: "Evidence", attachment_ids: ["existing", "attachment-1"] }] },
    ]);
  });

  test("rejects physical-table and unrelated-collection writes", async () => {
    await withUploadCommitContext(async () => {
      for (const collection of ["entity_resource_links", "entityFileAttachments-untrusted", "staffDocuments"]) {
        await expect(upsertEntityRow(collection, "x", { id: "x" }, user)).rejects.toThrow("not configured");
      }
      await bumpWorkspaceRevision();
    });
    expect(fixture.commit).not.toHaveBeenCalled();
  });

  test("does not partially write file records when the target no longer exists", async () => {
    fixture.read.mockResolvedValue({ revision: 41, rowVersions: {}, data: { master: {}, tasks: [] } });
    await expect(withUploadCommitContext(async () => {
      await upsertEntityRow("entityFileAttachments", "attachment-1", { id: "attachment-1" }, user);
      await updateAttachmentField(user, "task", "missing-task", "attachment_ids", "append", "attachment-1");
      await bumpWorkspaceRevision();
    })).rejects.toThrow("TARGET_NOT_READY");
    expect(fixture.commit).not.toHaveBeenCalled();
  });
});
