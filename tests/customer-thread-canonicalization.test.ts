import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { threadParentExists } from "../src/lib/rdash/business-rules";
import { createThreadsSlice } from "../src/lib/rdash/store/slices/threads";
import { createCoreSlice } from "../src/lib/rdash/store/slices/core";
import { customerConversationThreadRecordId } from "../src/lib/rdash/thread-record-id";
import type { RDashDatabase } from "../src/lib/rdash/types";

describe("canonical Customer conversation threads", () => {
  test("accepts only the canonical persisted Customer thread identity", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    const customer = db.customers[0];
    expect(customer).toBeTruthy();
    expect(threadParentExists(db, "generic", customer.id)).toBe(false);
    expect(threadParentExists(db, "generic", customerConversationThreadRecordId(customer.id))).toBe(true);
  });

  test("openThreadFor stores a Customer parent only with the canonical record ID", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    const customer = db.customers[0];
    db.threads = [];

    const state: any = { db };
    const ctx: any = {
      get: () => state,
      isNestedTransaction: () => false,
      commitState: (update: any) => {
        const partial = typeof update === "function" ? update(state) : update;
        Object.assign(state, partial);
      },
    };
    const threads = createThreadsSlice(ctx);
    const threadId = threads.openThreadFor("generic", customer.id, customer.name, ["Owner"]);
    const created = state.db.threads.find((thread: any) => thread.id === threadId);

    expect(created).toBeTruthy();
    expect(created.record_id).toBe(customerConversationThreadRecordId(customer.id));
    expect(created.record_id).not.toBe(customer.id);
    expect(created.kind).toBe("generic");
    expect(created.record_type).toBe("generic");
  });

  test("posts Customer audit lifecycle events into the canonical conversation", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    const customer = db.customers[0];
    db.threads = [];
    db.auditLog = [];

    const state: any = { db };
    const ctx: any = {
      get: () => state,
      isNestedTransaction: () => false,
      commitState: (update: any) => {
        const partial = typeof update === "function" ? update(state) : update;
        Object.assign(state, partial);
      },
      setBase: (update: any) => {
        const partial = typeof update === "function" ? update(state) : update;
        Object.assign(state, partial);
      },
    };
    Object.assign(state, createThreadsSlice(ctx));
    const core = createCoreSlice(ctx);

    core.logAudit({
      actor: "Owner",
      actor_role: "Owner",
      action: `Created customer "${customer.name}"`,
      entity_type: "customer",
      entity_id: customer.id,
      entity_label: customer.name,
      kind: "create",
    });

    expect(state.db.threads).toHaveLength(1);
    const thread = state.db.threads[0];
    expect(thread.record_id).toBe(customerConversationThreadRecordId(customer.id));
    expect(thread.messages.some((message: any) => message.body.includes(`Created customer "${customer.name}"`))).toBe(true);
    expect(state.db.auditLog[0]?.thread_id).toBe(thread.id);
  });

  test("reuses the same canonical Customer conversation thread", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    const customer = db.customers[0];
    db.threads = [];

    const state: any = { db };
    const ctx: any = {
      get: () => state,
      isNestedTransaction: () => false,
      commitState: (update: any) => {
        const partial = typeof update === "function" ? update(state) : update;
        Object.assign(state, partial);
      },
    };
    const threads = createThreadsSlice(ctx);
    const first = threads.openThreadFor("generic", customer.id, customer.name, ["Owner"]);
    const second = threads.openThreadFor("generic", customerConversationThreadRecordId(customer.id), customer.name, ["Owner"]);

    expect(second).toBe(first);
    expect(state.db.threads).toHaveLength(1);
  });
});
