import type { RDashDatabase } from "./types";
import { applyWorkspaceOperations, type WorkspaceOperation } from "./workspace-operations";

export type FinancialDocumentKind = "invoice" | "receipt";

const CONFIG = {
  invoice: { field: "invoice_no", prefix: "INV", collection: "invoices" },
  receipt: { field: "receipt_no", prefix: "CR", collection: "customerReceipts" },
} as const;

export function nextFinancialDocumentNumber(
  kind: FinancialDocumentKind,
  rows: ReadonlyArray<Record<string, unknown>>,
  year = new Date().getFullYear(),
): string {
  const { field, prefix } = CONFIG[kind];
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let max = 0;
  for (const row of rows) {
    const match = String(row[field] || "").match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

function replaceStrings(value: unknown, replacements: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    let next = value;
    for (const [before, after] of replacements) next = next.split(before).join(after);
    return next;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceStrings(entry, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceStrings(entry, replacements)]),
    );
  }
  return value;
}

/**
 * The server owns public finance numbers. The existing workspace-revision lock
 * serializes allocation; the client may predict the same value for immediate UI.
 */
export function canonicalizeFinancialDocumentNumbers(
  current: RDashDatabase,
  operations: WorkspaceOperation[],
): WorkspaceOperation[] {
  const replacements = new Map<string, string>();
  const assigned = new Map<string, Map<string, string>>();

  for (const kind of ["invoice", "receipt"] as const) {
    const { collection, field } = CONFIG[kind];
    const existingRows = (current[collection] || []) as unknown as Array<Record<string, unknown>>;
    const existingById = new Map(existingRows.map((row) => [String(row.id), row]));
    const allocated = [...existingRows];
    const byId = new Map<string, string>();

    for (const operation of operations.filter((entry) => entry.collection === collection)) {
      for (const row of operation.upsert || []) {
        const id = String(row.id || "");
        const existing = existingById.get(id);
        const canonical = existing
          ? String(existing[field] || "")
          : nextFinancialDocumentNumber(kind, allocated);
        const proposed = String(row[field] || "");
        if (proposed && canonical && proposed !== canonical) replacements.set(proposed, canonical);
        if (canonical) {
          byId.set(id, canonical);
          allocated.push({ ...row, [field]: canonical });
        }
      }
    }
    assigned.set(collection, byId);
  }

  const rewritten = operations.map((operation) => replaceStrings(operation, replacements) as WorkspaceOperation);
  return rewritten.map((operation) => {
    const byId = assigned.get(operation.collection);
    if (!byId) return operation;
    const field = operation.collection === "invoices" ? "invoice_no" : "receipt_no";
    return {
      ...operation,
      upsert: (operation.upsert || []).map((row) => {
        const canonical = byId.get(String(row.id || ""));
        return canonical ? { ...row, [field]: canonical } : row;
      }),
    };
  });
}

/** Merge only server-owned finance numbers into optimistic browser state. */
export function applyAcceptedFinancialDocumentNumbers(
  current: RDashDatabase,
  accepted: WorkspaceOperation[],
): RDashDatabase {
  const patches = accepted.flatMap((operation): WorkspaceOperation[] => {
    if (operation.collection !== "invoices" && operation.collection !== "customerReceipts") return [];
    const field = operation.collection === "invoices" ? "invoice_no" : "receipt_no";
    const currentRows = current[operation.collection] as unknown as Array<Record<string, unknown>>;
    const byId = new Map(currentRows.map((row) => [String(row.id), row]));
    const upsert = (operation.upsert || []).flatMap((row) => {
      const existing = byId.get(String(row.id || ""));
      return existing && row[field] ? [{ ...existing, [field]: row[field] }] : [];
    });
    return upsert.length ? [{ collection: operation.collection, upsert }] : [];
  });
  return patches.length ? applyWorkspaceOperations(current, patches) : current;
}
