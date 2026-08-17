import type { RDashDatabase, ThreadKind } from "./types";

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
