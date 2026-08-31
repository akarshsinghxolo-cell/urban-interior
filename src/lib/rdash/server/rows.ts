import type { RDashDatabase } from "../types";

/**
 * Canonical collection-row helpers for server workspace code.
 * One implementation replaces the per-file private copies that had drifted
 * into three subtly different mergeRows variants.
 */

export function rowId(row: Record<string, unknown>): string {
  return String(row.id || "").trim();
}

export function rowsFor(
  database: RDashDatabase | undefined,
  collection: string,
): Array<Record<string, unknown>> {
  if (!database) return [];
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    const value = (database.master as unknown as Record<string, unknown>)?.[key];
    return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  }
  const value = (database as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

export function mergeRows(
  current: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of current) {
    const id = rowId(row);
    if (id) merged.set(id, row);
  }
  for (const row of incoming) {
    const id = rowId(row);
    if (id) merged.set(id, row);
  }
  return [...merged.values()];
}
