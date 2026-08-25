import type { WorkSubcategory, WorkTypeRate } from "./types";

export const DEFAULT_WORK_TYPE_NAME = "Standard";

function finiteNonNegative(value: unknown): number | undefined {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

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
  return `wt-${subcategoryId}-${slug(name)}-${Date.now().toString(36)}`;
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
      material_rate: finiteNonNegative(row.material_rate),
      labour_rate: finiteNonNegative(row.labour_rate),
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
    material_rate: finiteNonNegative(work.material_rate),
    labour_rate: finiteNonNegative(work.labour_rate),
    notes: String(work.notes || "").trim() || undefined,
    created_at: work.created_at,
    updated_at: work.updated_at,
  }];
}

export function normalizeWorkSubcategoryWorkTypes(work: WorkSubcategory): WorkSubcategory {
  const { material_rate: _materialRate, labour_rate: _labourRate, ...rest } = work;
  const workTypes = workTypesForSubcategory(work);
  return {
    ...rest,
    unit_id: rest.unit_id || workTypes[0]?.unit_id || "pcs",
    work_types: workTypes,
  };
}

export function primaryWorkType(work: WorkSubcategory): WorkTypeRate {
  return workTypesForSubcategory(work)[0];
}
