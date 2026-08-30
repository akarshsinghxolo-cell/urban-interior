import type { RDashDatabase } from "./types";
import { mergeRows } from "./server/rows";

export interface WorkspacePageCursor {
  offset: number;
  limit: number;
  returned: number;
  hasMore: boolean;
  nextOffset?: number;
}

export type WorkspacePageState = Record<string, WorkspacePageCursor>;
function paginationFrom(database: RDashDatabase): WorkspacePageState {
  const raw = (database as unknown as Record<string, unknown>)._workspace_pagination;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: WorkspacePageState = {};
  for (const [collection, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const cursor = value as Record<string, unknown>;
    const offset = Number(cursor.offset);
    const limit = Number(cursor.limit);
    const returned = Number(cursor.returned);
    const nextOffset = Number(cursor.nextOffset);
    if (!Number.isSafeInteger(offset) || offset < 0) continue;
    if (!Number.isSafeInteger(limit) || limit <= 0) continue;
    if (!Number.isSafeInteger(returned) || returned < 0) continue;
    result[collection] = {
      offset,
      limit,
      returned,
      hasMore: cursor.hasMore === true,
      ...(Number.isSafeInteger(nextOffset) && nextOffset > offset ? { nextOffset } : {}),
    };
  }
  return result;
}

/**
 * Merges a page-only server response into an already-authoritative module
 * snapshot. Only array collections with actual rows are merged; omitted arrays
 * remain untouched. Page cursor metadata replaces the cursor for collections
 * returned by the page while preserving every unrelated collection cursor.
 */
export function mergeWorkspacePage(
  current: RDashDatabase,
  page: RDashDatabase,
): RDashDatabase {
  const result = structuredClone(current) as RDashDatabase;
  const incoming = page as unknown as Record<string, unknown>;
  const target = result as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(incoming)) {
    if (key === "master" || key.startsWith("_workspace_") || !Array.isArray(value) || value.length === 0) {
      continue;
    }
    const existing = Array.isArray(target[key])
      ? target[key] as Array<Record<string, unknown>>
      : [];
    target[key] = mergeRows(existing, value as Array<Record<string, unknown>>);
  }

  const incomingMaster = page.master as unknown as Record<string, unknown>;
  const targetMaster = result.master as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(incomingMaster || {})) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const existing = Array.isArray(targetMaster[key])
      ? targetMaster[key] as Array<Record<string, unknown>>
      : [];
    targetMaster[key] = mergeRows(existing, value as Array<Record<string, unknown>>);
  }

  const currentPagination = paginationFrom(current);
  const pagePagination = paginationFrom(page);
  target._workspace_pagination = {
    ...currentPagination,
    ...pagePagination,
  };
  delete target._workspace_page_only;
  return result;
}

export function workspacePageState(database: RDashDatabase): WorkspacePageState {
  return paginationFrom(database);
}

export function workspaceHasMorePages(database: RDashDatabase): boolean {
  return Object.values(paginationFrom(database)).some((cursor) => cursor.hasMore && cursor.nextOffset != null);
}
