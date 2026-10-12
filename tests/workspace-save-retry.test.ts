import { beforeEach, expect, test, vi } from "vitest";
import type { WorkspaceCommitOutboxRecord } from "../src/lib/uploads/workspace-outbox-types";

const records = vi.hoisted(() => new Map<string, WorkspaceCommitOutboxRecord>());
vi.mock("../src/lib/uploads/upload-indexed-db", () => ({ uploadIndexedDb: {
    readWorkspaceOutbox: async () => [...records.values()],
    getWorkspaceOutbox: async (id: string) => records.get(id),
    putWorkspaceOutbox: async (row: WorkspaceCommitOutboxRecord) => { records.set(row.operationId, row); },
    deleteWorkspaceOutbox: async (id: string) => { records.delete(id); },
} }));
import { captureWorkspaceCommit, configureWorkspaceOutboxScope, markWorkspaceCommitResponse } from "../src/lib/uploads/workspace-outbox";

beforeEach(() => {
    records.clear();
    configureWorkspaceOutboxScope({ workspaceId: "qa", ownerUserId: "owner" });
});
const payload = { revision: 1, operations: [{ collection: "commSends", upsert: [{ id: "message", subject: "Same message" }] }] };

test("an identical retry keeps the operation ID and can confirm a pending save immediately", async () => {
    const first = await captureWorkspaceCommit(JSON.stringify(payload));
    await markWorkspaceCommitResponse(first.operationId!, Response.json({ status: "processing" }, { status: 202 }));
    const retry = await captureWorkspaceCommit(JSON.stringify(payload));
    expect(retry.operationId).toBe(first.operationId);
    expect(retry.defer).not.toBe(true);
    expect(records.size).toBe(1);
    await markWorkspaceCommitResponse(retry.operationId!, Response.json({ status: "applied", revision: 2 }));
    expect(records.size).toBe(0);
});

test("changed content is still deferred behind an in-flight operation", async () => {
    const first = await captureWorkspaceCommit(JSON.stringify(payload));
    await markWorkspaceCommitResponse(first.operationId!, Response.json({ status: "processing" }, { status: 202 }));
    const changed = await captureWorkspaceCommit(JSON.stringify({ ...payload, revision: 2 }));
    expect(changed.operationId).not.toBe(first.operationId);
    expect(changed.defer).toBe(true);
    expect(records.size).toBe(2);
});
