import type { ID, WorkSubcategory, WorkTypeRate } from "./types";

const DEFAULT_WORK_TYPE_NAME = "Standard";

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "work-type";
}

export function defaultWorkTypeId(subcategoryId: string): string {
  return `wt-${subcategoryId}-standard`;
}

export function createWorkTypeId(subcategoryId: string, name: string): string {
  return `wt-${subcategoryId}-${slug(name)}`;
}

export function workTypesForSubcategory(work: WorkSubcategory): WorkTypeRate[] {
  const source = Array.isArray(work.work_types) ? work.work_types : [];
  const byId = new Map<string, WorkTypeRate>();

  for (const row of source) {
    const name = String(row?.name || "").trim();
    if (!name) continue;
    const id = String(row.id || `wt-${work.id}-${slug(name)}`).trim();
    byId.set(id, {
      id,
      name,
      unit_id: String(row.unit_id || work.unit_id || "pcs").trim(),
      notes: String(row.notes || "").trim() || undefined,
      created_at: row.created_at || work.created_at,
      updated_at: row.updated_at || work.updated_at,
    });
  }

  if (byId.size) return Array.from(byId.values());

  return [{
    id: defaultWorkTypeId(work.id),
    name: DEFAULT_WORK_TYPE_NAME,
    unit_id: work.unit_id || "pcs",
    notes: String(work.notes || "").trim() || undefined,
    created_at: work.created_at,
    updated_at: work.updated_at,
  }];
}

export function normalizeWorkSubcategoryWorkTypes(work: WorkSubcategory): WorkSubcategory {
  const workTypes = workTypesForSubcategory(work);
  return {
    ...work,
    unit_id: work.unit_id || workTypes[0]?.unit_id || "pcs",
    work_types: workTypes,
  };
}

export function primaryWorkType(work: WorkSubcategory): WorkTypeRate {
  return workTypesForSubcategory(work)[0];
}

/**
 * Resolve the master rows for work-type IDs (IDs embed their subcategory via
 * `wt-<subcategoryId>-<slug>`, so no subcategory context is required).
 */
export function resolveWorkTypes(
  workSubcategories: WorkSubcategory[],
  workTypeIds: ID[] | undefined,
): WorkTypeRate[] {
  const byId = new Map<string, WorkTypeRate>();
  for (const subcategory of workSubcategories) {
    for (const workType of workTypesForSubcategory(subcategory)) byId.set(workType.id, workType);
  }
  return (workTypeIds || []).flatMap((id) => {
    const row = byId.get(String(id));
    return row ? [row] : [];
  });
}

/** Display names for work-type IDs, deduplicated in input order. */
export function workTypeNamesForIds(
  workSubcategories: WorkSubcategory[],
  workTypeIds: ID[] | undefined,
): string[] {
  return [...new Set(resolveWorkTypes(workSubcategories, workTypeIds).map((row) => row.name))];
}

/** Keep only work-type IDs whose subcategory is still selected. */
export function pruneWorkTypeIds(
  workSubcategories: WorkSubcategory[],
  subcategoryIds: ID[],
  workTypeIds: ID[] | undefined,
): ID[] {
  const valid = new Set(
    subcategoryIds.flatMap((subcategoryId) => {
      const subcategory = workSubcategories.find((row) => row.id === subcategoryId);
      return subcategory ? workTypesForSubcategory(subcategory).map((row) => row.id) : [];
    }),
  );
  return (workTypeIds || []).filter((id) => valid.has(String(id)));
}
