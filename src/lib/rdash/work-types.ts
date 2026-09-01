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

/**
 * Ensure every selected subcategory keeps at least its primary (first) work
 * type ticked — quotation rates resolve per work type, so a subcategory with
 * zero selected work types would have nothing to quote. Existing selections
 * are preserved in order; missing primaries are appended.
 */
export function withPrimaryWorkTypeIds(
  workSubcategories: WorkSubcategory[],
  subcategoryIds: ID[],
  workTypeIds: ID[] | undefined,
): ID[] {
  const selected = (workTypeIds || []).map(String);
  for (const subcategoryId of subcategoryIds) {
    const subcategory = workSubcategories.find((row) => row.id === subcategoryId);
    if (!subcategory) continue;
    const rows = workTypesForSubcategory(subcategory);
    if (!rows.some((row) => selected.includes(row.id))) selected.push(rows[0].id);
  }
  return selected;
}

/**
 * Quotation-facing title derived from the selection: one
 * "subcategory · work type" segment per selected work type, joined with
 * " / ". Falls back to the selected subcategory names when no work types are
 * ticked (legacy rows), and to "" when nothing is selected at all.
 */
export function workRequiredTitleFromSelection(
  workSubcategories: WorkSubcategory[],
  subcategoryIds: ID[],
  workTypeIds: ID[] | undefined,
): string {
  const selectedSubcategories = workSubcategories.filter((row) => subcategoryIds.includes(row.id));
  if (!selectedSubcategories.length) return "";
  const rows = resolveWorkTypes(selectedSubcategories, workTypeIds);
  if (!rows.length) {
    return selectedSubcategories.map((row) => row.name).join(" / ");
  }
  const subcategoryNameByWorkTypeId = new Map<string, string>();
  for (const subcategory of selectedSubcategories) {
    for (const workType of workTypesForSubcategory(subcategory)) {
      subcategoryNameByWorkTypeId.set(workType.id, subcategory.name);
    }
  }
  return rows
    .map((row) => `${subcategoryNameByWorkTypeId.get(row.id) || row.name} · ${row.name}`)
    .join(" / ");
}

// ── Detailed-area measurement ────────────────────────────────────────────────
// One room's L×B×H is shared by every work inside it, but the quantity that a
// quotation line is priced on depends on the kind of work: tiles consume the
// floor plan, paint consumes walls plus ceiling, a modular kitchen is a run of
// one or two walls in running feet. The basis is derived from the subcategory
// name (catalogue heuristic) and always stays user-editable, including direct
// sqft / rft entry with no dimensions at all.

export type WorkMeasureBasis = "wall" | "floor_ceiling" | "wall_ceiling" | "length";

const LENGTH_BASIS_PATTERN = /(railing|kitchen|cabinet|wardrobe|counter|skirting|border|moulding|molding|cladding strip)/;
const FLOOR_BASIS_PATTERN = /(floor|tile|paver|carpet|epoxy|marble|granite|ceiling|gypsum|pop\b|grid)/;
const PAINT_BASIS_PATTERN = /(paint|putty|texture|distemper|emulsion|enamel|weather ?shield)/;

/** Sensible measurement basis for a subcategory, from its catalogue name. */
export function defaultMeasureBasisFor(subcategoryName: string | undefined): WorkMeasureBasis {
  const name = String(subcategoryName || "").toLowerCase();
  if (LENGTH_BASIS_PATTERN.test(name)) return "length";
  if (PAINT_BASIS_PATTERN.test(name)) return "wall_ceiling";
  if (FLOOR_BASIS_PATTERN.test(name)) return "floor_ceiling";
  return "wall";
}

export const WORK_MEASURE_LABELS: Record<WorkMeasureBasis, string> = {
  wall: "Wall area (sqft)",
  floor_ceiling: "Floor / ceiling area (sqft)",
  wall_ceiling: "Walls + ceiling (sqft)",
  length: "Running length (rft)",
};

export function measureUnitFor(basis: WorkMeasureBasis, heightFt: number): "sqft" | "rft" {
  if (basis === "length") return "rft";
  if (basis === "wall" && !(heightFt > 0)) return "rft"; // railing-height wall cladding
  return "sqft";
}

/**
 * Quantity for one quotation line, computed from the shared area dimensions.
 * height empty on a wall basis falls back to running feet (perimeter), keeping
 * the legacy railing behaviour. Returns 0 when the needed dimensions are
 * missing — the caller then requires direct entry.
 */
export function measuredQuantity(
  basis: WorkMeasureBasis,
  dims: { length: number; breadth: number; height: number },
  walls: 1 | 2 = 1,
): { quantity: number; unit: "sqft" | "rft" } {
  const l = Number(dims.length) || 0;
  const b = Number(dims.breadth) || 0;
  const h = Number(dims.height) || 0;
  const plan = l > 0 && b > 0 ? l * b : 0;
  const perimeter = l > 0 && b > 0 ? 2 * (l + b) : 0;
  const unit = measureUnitFor(basis, h);
  const quantity = basis === "floor_ceiling"
    ? plan
    : basis === "wall_ceiling"
      ? plan > 0 && h > 0 ? plan + perimeter * h : 0
      : basis === "wall"
        ? h > 0 ? perimeter * h : perimeter
        : walls === 2
          ? l + b
          : l;
  return { quantity, unit };
}
