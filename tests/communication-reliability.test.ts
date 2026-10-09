import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { createThreadsSlice } from "../src/lib/rdash/store/slices/threads";
import type { ThreadsState } from "../src/lib/rdash/store/types";

function fixture() {
  const db = structuredClone(buildSeedDatabase());
  db.commSends = [];
  const state: any = {
    db,
    currentUser: () => ({ name: "Signed-in operator", role: "Owner", staffId: "staff-owner" }),
    logAudit: vi.fn(),
    addFollowup: vi.fn(),
    attachFileAsset: vi.fn((input) => {
      const id = `copy-${state.db.entityFileAttachments.length}`;
      state.db.entityFileAttachments.push({ ...input, id });
      return id;
    }),
  };
  const commitState = vi.fn((update: any) => Object.assign(state, typeof update === "function" ? update(state) : update));
  Object.assign(state, createThreadsSlice({ get: () => state, commitState, setBase: commitState, isNestedTransaction: () => false }));
  const input: Parameters<ThreadsState["sendComm"]>[0] = {
    id: "comm-retry", customer_id: db.customers[0].id,
    channel: "email", staff_name: "Incorrect caller", subject: "Design options", body: "Please review",
  };
  return { state, input, commitState };
}

describe("canonical communication reliability", () => {
  test("defaults to prepared and records the signed-in actor, not a hardcoded caller", () => {
    const { state, input } = fixture();
    state.sendComm(input);
    expect(state.db.commSends[0]).toMatchObject({ status: "prepared", staff_name: "Signed-in operator" });
    expect(state.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      actor: "Signed-in operator", actor_role: "Owner", action: expect.stringMatching(/^Prepared email/),
    }));
  });

  test("a retry queues persistence again without duplicating records, files, audit or follow-up", () => {
    const { state, input, commitState } = fixture();
    state.db.master.fileAssets.push({ id: "asset-ready", sync_status: "uploaded" });
    state.db.entityFileAttachments.push({ id: "source", file_asset_id: "asset-ready", entity_type: "customer", entity_id: input.customer_id });
    input.source_attachment_ids = ["source"];
    input.schedules_next_followup = { due_date: "2026-12-01", purpose: "Confirm choices" };
    state.sendComm(input);
    const commits = commitState.mock.calls.length;
    state.sendComm(input);
    expect(commitState.mock.calls.length).toBe(commits + 1);
    expect(state.db.commSends).toHaveLength(1);
    expect(state.attachFileAsset).toHaveBeenCalledTimes(1);
    expect(state.logAudit).toHaveBeenCalledTimes(1);
    expect(state.addFollowup).toHaveBeenCalledTimes(1);
  });

  test("a reused ID cannot silently relabel a sent message", () => {
    const { state, input } = fixture();
    state.sendComm({ ...input, channel: "whatsapp", status: "sent" });
    expect(() => state.sendComm({ ...input, channel: "whatsapp", body: "Changed" })).toThrow("different content");
    expect(state.db.commSends[0].body).toBe("Please review");
  });

  test("pending attachments fail before any communication is created", () => {
    const { state, input } = fixture();
    expect(() => state.sendComm({ ...input, source_attachment_ids: ["not-uploaded"] })).toThrow("must be uploaded");
    expect(state.db.commSends).toHaveLength(0);
    expect(state.logAudit).not.toHaveBeenCalled();
  });

  test("invalid follow-up dates are rejected and scheduling failures are not hidden", () => {
    const { state, input } = fixture();
    expect(() => state.sendComm({ ...input, schedules_next_followup: { due_date: "", purpose: "Call" } })).toThrow("valid date");
    expect(state.db.commSends).toHaveLength(0);
    state.addFollowup.mockImplementation(() => { throw new Error("Follow-up unavailable"); });
    expect(() => state.sendComm({ ...input, schedules_next_followup: { due_date: "2026-12-01", purpose: "Call" } })).toThrow("Follow-up unavailable");
  });

  test("an internal follow-up comment never claims a WhatsApp delivery", () => {
    const { state } = fixture();
    const followup = state.db.followups.find((row: any) => row.customer_id);
    expect(followup).toBeTruthy();
    const threadId = state.openThreadFor("followup", followup.id, "Internal discussion");
    state.addThreadReply(threadId, { author: "Staff", body: "Please call tomorrow" });
    expect(state.db.threads.find((row: any) => row.id === threadId).messages.at(-1).body).toBe("Please call tomorrow");
    expect(state.db.commSends).toHaveLength(0);
  });
});
