import type { RDashDatabase, ThreadKind } from "./types";

const CUSTOMER_CONVERSATION_THREAD_PREFIX = "customer-conversation:";

export function customerConversationThreadRecordId(customerId: string): string {
  const id = String(customerId || "").trim();
  if (!id) throw new Error("Customer conversation requires a Customer ID.");
  return `${CUSTOMER_CONVERSATION_THREAD_PREFIX}${id}`;
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
