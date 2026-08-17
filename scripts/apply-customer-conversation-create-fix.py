from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


helper = '''import type { RDashDatabase, ThreadKind } from "./types";

export const CUSTOMER_CONVERSATION_THREAD_PREFIX = "customer-conversation:";

export function customerConversationThreadRecordId(customerId: string): string {
  const id = String(customerId || "").trim();
  if (!id) throw new Error("Customer conversation requires a Customer ID.");
  return `${CUSTOMER_CONVERSATION_THREAD_PREFIX}${id}`;
}

export function customerIdFromConversationThreadRecordId(recordId: string): string | undefined {
  const id = String(recordId || "").trim();
  if (!id.startsWith(CUSTOMER_CONVERSATION_THREAD_PREFIX)) return undefined;
  const customerId = id.slice(CUSTOMER_CONVERSATION_THREAD_PREFIX.length).trim();
  return customerId || undefined;
}

/**
 * Thread callers identify their domain parent with the normal entity ID. The
 * persistence boundary converts Customer parents to the one canonical generic
 * thread record ID before validation or storage. There is no persisted bare
 * Customer-thread format.
 */
export function canonicalThreadRecordIdForParent(
  database: Pick<RDashDatabase, "customers">,
  kind: ThreadKind,
  recordId: string,
): string {
  const id = String(recordId || "").trim();
  if (!id || kind !== "generic" || id.startsWith(CUSTOMER_CONVERSATION_THREAD_PREFIX)) return id;
  return database.customers.some((customer) => customer.id === id)
    ? customerConversationThreadRecordId(id)
    : id;
}
'''
Path("src/lib/rdash/thread-record-id.ts").write_text(helper)

replace_once(
    "src/lib/rdash/store/slices/threads.ts",
    'import { genId, nowIso } from "../helpers";\n',
    'import { genId, nowIso } from "../helpers";\nimport { canonicalThreadRecordIdForParent } from "../../thread-record-id";\n',
)
replace_once(
    "src/lib/rdash/store/slices/threads.ts",
    '''            const db = get().db;\n            const parentExists = threadParentExists(db, kind, recordId);\n            const nestedCreation = ctx.isNestedTransaction();\n            if (!parentExists && !nestedCreation) {\n                throw new BusinessRuleError(`Thread parent ${kind} record "${recordId}" does not exist. Threads can only be created from a valid parent action.`);\n            }\n            const existing = db.threads.find((t: Thread) => t.record_id === recordId && t.kind === kind);\n''',
    '''            const db = get().db;\n            const canonicalRecordId = canonicalThreadRecordIdForParent(db, kind, recordId);\n            const parentExists = threadParentExists(db, kind, canonicalRecordId);\n            const nestedCreation = ctx.isNestedTransaction();\n            if (!parentExists && !nestedCreation) {\n                throw new BusinessRuleError(`Thread parent ${kind} record "${canonicalRecordId}" does not exist. Threads can only be created from a valid parent action.`);\n            }\n            const existing = db.threads.find((t: Thread) => t.record_id === canonicalRecordId && t.kind === kind);\n''',
)
replace_once(
    "src/lib/rdash/store/slices/threads.ts",
    '                record_id: recordId,\n',
    '                record_id: canonicalRecordId,\n',
)

replace_once(
    "src/lib/rdash/business-rules.ts",
    '''            // "generic" threads are the catch-all for entities without a\n            // dedicated ThreadKind: customers, areas, boqs, variationRequests,\n            // vendors, contractors, staff, vendorRates, attendance, purchase\n            // orders, GRNs, dispatches, vendor bills, invoices, payments, etc.\n            return (db.customers.some((row) => row.id === recordId) ||\n                db.areas.some((row) => row.id === recordId) ||\n''',
    '''            // "generic" threads are the catch-all for entities without a\n            // dedicated ThreadKind. Customer conversations are deliberately\n            // excluded here because they have exactly one persisted identity:\n            // customer-conversation:<customer_id>.\n            return (db.areas.some((row) => row.id === recordId) ||\n''',
)


test = '''import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { threadParentExists } from "../src/lib/rdash/business-rules";
import { createThreadsSlice } from "../src/lib/rdash/store/slices/threads";
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
'''
Path("tests/customer-thread-canonicalization.test.ts").write_text(test)

print("Applied canonical Customer conversation creation fix.")
