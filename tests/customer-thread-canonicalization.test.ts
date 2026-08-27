import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { threadParentExists } from "../src/lib/rdash/business-rules";
import { createThreadsSlice } from "../src/lib/rdash/store/slices/threads";
import { createCoreSlice } from "../src/lib/rdash/store/slices/core";
import { createCrmSlice } from "../src/lib/rdash/store/slices/crm";
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

  test("canonicalizes Customer cross-post targets from related entity audits", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    const customer = db.customers[0];
    const site = db.sites.find((row) => row.customer_id === customer.id);
    expect(site).toBeTruthy();
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
      action: `Updated Site "${site!.name}"`,
      entity_type: "site",
      entity_id: site!.id,
      entity_label: site!.name,
      kind: "update",
      cross_post: [{ entity_type: "customer", entity_id: customer.id, entity_label: customer.name }],
    });

    expect(state.db.threads.some((thread: any) => thread.kind === "site" && thread.record_id === site!.id)).toBe(true);
    expect(state.db.threads.some((thread: any) => thread.kind === "generic" && thread.record_id === customerConversationThreadRecordId(customer.id))).toBe(true);
    expect(state.db.threads.some((thread: any) => thread.kind === "generic" && thread.record_id === customer.id)).toBe(false);
  });

  test("Add Customer save creates the Customer and its canonical conversation", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    db.threads = [];
    db.auditLog = [];

    const state: any = {
      db,
      authUser: {
        name: "Owner",
        email: "owner@example.com",
        role: "Owner",
        expiresAt: Date.now() + 60_000,
      },
    };
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
    Object.assign(state, createCoreSlice(ctx));
    Object.assign(state, createCrmSlice(ctx));

    const result = state.saveCustomerWithSites({
      customer: {
        name: "Regression Customer",
        phone: "7000000099",
        whatsapp: "7000000099",
        status: "active",
      },
      sites: [],
    });

    const customer = state.db.customers.find((row: any) => row.id === result.customerId);
    const conversationId = customerConversationThreadRecordId(result.customerId);
    const conversation = state.db.threads.find((thread: any) => thread.kind === "generic" && thread.record_id === conversationId);

    expect(customer?.name).toBe("Regression Customer");
    expect(result.changed).toBe(true);
    expect(conversation).toBeTruthy();
    expect(conversation.messages.some((message: any) => message.body.includes('Created customer "Regression Customer"'))).toBe(true);
    expect(state.db.threads.some((thread: any) => thread.kind === "generic" && thread.record_id === result.customerId)).toBe(false);
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

  test("Work Required-only bundle save does not emit an unrelated customer audit", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    const work = db.workRequired.find((row) => row.area_ids.length > 0)!;
    const customer = db.customers.find((row) => row.id === work.customer_id)!;
    const state: any = {
      db,
      currentUser: () => ({ name: "Rahul Chauhan", role: "Operations Manager" }),
      logAudit: vi.fn(),
    };
    const ctx: any = {
      get: () => state,
      commitState: (update: any) => {
        const partial = typeof update === "function" ? update(state) : update;
        Object.assign(state, partial);
      },
    };
    Object.assign(state, createCrmSlice(ctx));

    state.saveCustomerWithSites({
      customerId: customer.id,
      customer: { name: customer.name },
      workRequired: [{
        id: work.id,
        site_id: work.site_id,
        title: `${work.title} updated`,
        work_category_id: work.work_category_id,
        work_subcategory_ids: work.work_subcategory_ids,
        area_ids: work.area_ids,
      }],
    });

    expect(state.logAudit).toHaveBeenCalledTimes(1);
    expect(state.logAudit.mock.calls[0][0]).toMatchObject({ entity_type: "workRequired", entity_id: work.id });
  });
});
