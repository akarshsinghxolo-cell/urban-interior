import { attachCustomerLabels } from "./customer";
import { hydrateStaffReferenceLabels } from "./staff-reference-labels";
import type { RDashDatabase } from "./types";
import {
  WORK_CATALOG_VERSION,
  prepareWorkspaceData,
} from "./work-category-master";
import {
  masterCollections,
  topLevelCollections,
} from "./workspace-operations";
import { mergeRows, rowsFor } from "./server/rows";

export const WORKSPACE_SESSION_FOUNDATION_COLLECTIONS = Object.freeze([
  "master.units",
  "master.workCategories",
  "master.workSubcategories",
  "master.articles",
  "master.articleVariants",
  "master.subcategoryArticleMap",
  "master.workOptionGroups",
  "master.workOptionValues",
] as const);

export const WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS = Object.freeze([
  "staffRolePermissions",
  "master.staff",
  ...WORKSPACE_SESSION_FOUNDATION_COLLECTIONS,
] as const);

const ALL_COLLECTIONS = Object.freeze([
  ...topLevelCollections.map(String),
  ...masterCollections.map((key) => `master.${String(key)}`),
]);

function metadata(database: RDashDatabase): Record<string, unknown> {
  return database as unknown as Record<string, unknown>;
}
function setRows(
  database: RDashDatabase,
  collection: string,
  rows: Array<Record<string, unknown>>,
): void {
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    (database.master as unknown as Record<string, unknown>)[key] = rows;
    return;
  }
  (database as unknown as Record<string, unknown>)[collection] = rows;
}
function representedCollections(database: RDashDatabase): string[] {
  const data = metadata(database);
  const declared = data._workspace_read_collections;
  const includeFoundation = data._workspace_foundation_embedded === true;
  if (Array.isArray(declared)) {
    const represented = declared
      .map((value) => String(value || "").trim())
      .filter((collection) => ALL_COLLECTIONS.includes(collection));
    if (includeFoundation) {
      represented.push(...WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS);
    }
    return [...new Set(represented)];
  }

  // Whole-workspace administrative payloads (reset/integrity) intentionally do
  // not carry normal scoped-read metadata.
  return [...ALL_COLLECTIONS];
}

function collectionMergesPartially(database: RDashDatabase, collection: string): boolean {
  const incomingMeta = metadata(database);
  const strategy = String(incomingMeta._workspace_read_strategy || "");
  const scope = String(incomingMeta._workspace_read_scope || "");
  const mode = String(incomingMeta._workspace_read_mode || "");
  const pageOnly = incomingMeta._workspace_page_only === true;
  const bootstrap = scope === "bootstrap" || mode === "bootstrap";
  const staffProjection = String(incomingMeta._workspace_staff_projection || "");
  return pageOnly
    || strategy === "row"
    || (
      collection === "master.staff"
      && !bootstrap
      && staffProjection !== "full"
    );
}

export function workspaceSnapshotRemovedRowVersionKeys(
  current: RDashDatabase,
  incoming: RDashDatabase,
): string[] {
  const removed = new Set<string>();
  for (const collection of representedCollections(incoming)) {
    if (collectionMergesPartially(incoming, collection)) continue;
    const incomingIds = new Set(
      rowsFor(incoming, collection)
        .map((row) => String(row.id || "").trim())
        .filter(Boolean),
    );
    for (const row of rowsFor(current, collection)) {
      const id = String(row.id || "").trim();
      if (!id || incomingIds.has(id)) continue;
      removed.add(id);
      removed.add(`${collection}:${id}`);
    }
  }
  return [...removed];
}

function copyReadMetadata(target: RDashDatabase, source: RDashDatabase): void {
  const targetMeta = metadata(target);
  const sourceMeta = metadata(source);

  for (const key of Object.keys(targetMeta)) {
    if (
      key.startsWith("_workspace_read_")
      || key === "_workspace_page_only"
      || key === "_workspace_staff_projection"
      || key === "_workspace_read_entity"
    ) {
      delete targetMeta[key];
    }
  }
  for (const [key, value] of Object.entries(sourceMeta)) {
    if (
      key.startsWith("_workspace_read_")
      || key === "_workspace_page_only"
      || key === "_workspace_staff_projection"
      || key === "_workspace_read_entity"
    ) {
      targetMeta[key] = structuredClone(value);
    }
  }
}

export function createEmptyWorkspaceDatabase(): RDashDatabase {
  const data: Record<string, unknown> = {
    master: {
      catalog_version: WORK_CATALOG_VERSION,
    },
  };
  for (const collection of topLevelCollections) {
    data[String(collection)] = [];
  }
  const master = data.master as Record<string, unknown>;
  for (const collection of masterCollections) {
    master[String(collection)] = [];
  }

  data._workspace_read_scope = "bootstrap";
  data._workspace_read_mode = "bootstrap";
  data._workspace_read_strategy = "bootstrap";
  data._workspace_read_collections = [];
  data._workspace_foundation_embedded = false;
  data._data_source = "supabase-rest";
  return data as unknown as RDashDatabase;
}

/** Pure deterministic hydration normalization: never creates business records. */
export function normalizeWorkspaceSession(input: RDashDatabase): RDashDatabase {
  const normalized = attachCustomerLabels(
    prepareWorkspaceData(structuredClone(input) as RDashDatabase),
  );
  hydrateStaffReferenceLabels(normalized);
  return normalized;
}

export function mergeWorkspaceVersionMap(
  current?: Record<string, number> | null,
  incoming?: Record<string, number> | null,
): Record<string, number> | null {
  if (!current && !incoming) return null;
  const merged: Record<string, number> = { ...(current || {}) };
  for (const [key, rawVersion] of Object.entries(incoming || {})) {
    const version = Number(rawVersion);
    if (!Number.isInteger(version) || version < 0) continue;
    const previous = merged[key];
    if (previous === undefined || version > previous) merged[key] = version;
  }
  return merged;
}

/**
 * A normal hydration may merge another partial snapshot at the same revision,
 * or advance to a newer revision. It must never apply rows from an older
 * response after the live session/commit queue has already advanced.
 */
export function workspaceHydrationRevisionIsCurrent(
  incomingRevision: number,
  ...knownRevisions: number[]
): boolean {
  if (!Number.isSafeInteger(incomingRevision) || incomingRevision < 0) return false;
  const floor = knownRevisions.reduce((current, raw) => {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? Math.max(current, value) : current;
  }, 0);
  return incomingRevision >= floor;
}

/**
 * Merge one authoritative server payload into the long-lived browser session.
 * Complete module collections replace their prior rows; entity/page payloads
 * merge by row ID because they are intentionally partial. The bootstrap Master
 * foundation remains resident across every module switch.
 */
export function mergeWorkspaceSnapshot(
  current: RDashDatabase,
  incoming: RDashDatabase,
): RDashDatabase {
  const next = structuredClone(current || createEmptyWorkspaceDatabase()) as RDashDatabase;
  const incomingMeta = metadata(incoming);
  const scope = String(incomingMeta._workspace_read_scope || "");
  const mode = String(incomingMeta._workspace_read_mode || "");
  const bootstrap = scope === "bootstrap" || mode === "bootstrap";
  const represented = representedCollections(incoming);

  for (const collection of represented) {
    const incomingRows = rowsFor(incoming, collection);
    const mergePartial = collectionMergesPartially(incoming, collection);

    setRows(
      next,
      collection,
      mergePartial
        ? mergeRows(rowsFor(next, collection), incomingRows)
        : structuredClone(incomingRows),
    );
  }

  copyReadMetadata(next, incoming);

  const nextMeta = metadata(next);
  const foundationPresent =
    bootstrap
    || incomingMeta._workspace_foundation_embedded === true
    || metadata(current)._workspace_foundation_embedded === true;
  nextMeta._workspace_foundation_embedded = foundationPresent;

  const previousSessionCollections = Array.isArray(metadata(current)._workspace_session_collections)
    ? metadata(current)._workspace_session_collections as unknown[]
    : [];
  nextMeta._workspace_session_collections = [
    ...new Set([
      ...previousSessionCollections.map((value) => String(value || "").trim()),
      ...represented,
    ].filter(Boolean)),
  ];

  return normalizeWorkspaceSession(next);
}
