import type { ID, LineItem, MeasurementRevision, QuotationCoverage, WorkRequired, WorkSubcategory, WorkTypeRate } from "./types";

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

/**
 * Display title for a saved Work Required row: re-derived from the current
 * subcategory / work-type selection (tier-qualified, e.g. "Toughened Glass
 * Railing · Standard / SS Railing · Standard"), falling back to the stored
 * title when the selection cannot be derived (legacy rows with no
 * subcategories). One display master so scorecards, site rows and detail
 * links agree with what the Add/Edit form would save — legacy seed titles
 * render correctly without a data migration.
 */
export function workRequiredDisplayTitle(
  workSubcategories: WorkSubcategory[],
  work: Pick<WorkRequired, "title" | "work_subcategory_ids" | "work_type_ids">,
): string {
  const subcategoryIds = work.work_subcategory_ids || [];
  if (!subcategoryIds.length) return work.title;
  // Apply the same normalization the Add/Edit form applies on load/save:
  // every ticked subcategory keeps at least its primary work type, so legacy
  // rows without explicit work types still render "… · Standard".
  const workTypeIds = withPrimaryWorkTypeIds(workSubcategories, subcategoryIds, work.work_type_ids);
  return workRequiredTitleFromSelection(workSubcategories, subcategoryIds, workTypeIds) || work.title;
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

// ── Capture-view selection sync ──────────────────────────────────────────────

/** One planned work line the capture view derives from a Work Required's
 *  ticked selection (not yet measured or captured). */
export type DetailedSeedLine = {
  work_required_id: string;
  area_id: string;
  category_id?: string;
  subcategory_id: string;
  work_type_id?: string;
  measure: WorkMeasureBasis;
  walls: 1 | 2;
};

/** A seed the user deleted in the capture view — the Add/Edit form must
 *  un-tick the corresponding selection (bidirectional sync). */
export type RemovedSelection = {
  work_required_id: string;
  area_id: string;
  subcategory_id: string;
  work_type_id?: string;
};

type SeedSourceWork = Pick<WorkRequired, "id" | "work_category_id" | "work_subcategory_ids" | "work_type_ids" | "area_ids" | "structured_items">;

const scopeKeyOf = (areaId: string | undefined, subcategoryId: string | undefined, workTypeId: string | undefined) =>
  [areaId || "", subcategoryId || "", workTypeId || ""].join("::");

/**
 * Derive the capture view's planned lines from every site Work Required's
 * ticked selection: one line per (area × work type) that has no captured line
 * item yet, across ALL of the site's Work Required rows. This is what makes an
 * area group open with "Toughened Glass Railing · Standard / SS Railing ·
 * Standard / …" ready to measure instead of an empty state — the capture view
 * is the per-area mirror of the Add/Edit form.
 */
export function seedDetailedAreaLines(input: {
  siteWorks: SeedSourceWork[];
  workSubcategories: WorkSubcategory[];
}): DetailedSeedLine[] {
  const captured = new Set<string>();
  for (const work of input.siteWorks) {
    for (const item of work.structured_items || []) {
      if (!item.area_id) continue;
      captured.add(scopeKeyOf(item.area_id, item.subcategory_id, item.work_type_id));
    }
  }
  const declared = new Set(input.workSubcategories.map((row) => row.id));
  const subcategoryOfWorkType = (workTypeId: string) =>
    input.workSubcategories.find((row) => workTypesForSubcategory(row).some((wt) => wt.id === workTypeId));
  const seeds: DetailedSeedLine[] = [];
  const seen = new Set<string>();
  for (const work of input.siteWorks) {
    const subcategoryIds = (work.work_subcategory_ids || []).filter((id) => declared.has(id));
    const planned: Array<{ subcategory: WorkSubcategory; workTypeId?: string }> = [];
    if ((work.work_type_ids || []).length) {
      for (const workTypeId of work.work_type_ids || []) {
        const subcategory = subcategoryOfWorkType(workTypeId);
        // Only seed work types that belong to a subcategory the row declares.
        if (subcategory && subcategoryIds.includes(subcategory.id)) {
          planned.push({ subcategory, workTypeId });
        }
      }
    } else {
      for (const id of subcategoryIds) {
        planned.push({ subcategory: input.workSubcategories.find((row) => row.id === id)! });
      }
    }
    for (const areaId of work.area_ids || []) {
      for (const { subcategory, workTypeId } of planned) {
        const seedTypeId = workTypeId || primaryWorkType(subcategory).id;
        const key = scopeKeyOf(areaId, subcategory.id, seedTypeId);
        if (captured.has(key) || seen.has(key)) continue;
        seen.add(key);
        seeds.push({
          work_required_id: work.id,
          area_id: areaId,
          category_id: work.work_category_id || subcategory.category_id,
          subcategory_id: subcategory.id,
          work_type_id: seedTypeId,
          measure: defaultMeasureBasisFor(subcategory.name),
          walls: 1,
        });
      }
    }
  }
  return seeds;
}

/**
 * Recompute one Work Required's ticked selection after a capture-view save.
 * The effective per-area work set E = captured items (kept + fresh) ∪ planned
 * seeds that survived (declared selection minus captured scopes minus the
 * seeds the user deleted). Selections follow E; the invariants stop the prune:
 * a Work Required never loses its last subcategory, work type or area, and
 * never drops an area pinned by a downstream record — a linked Measurement
 * Revision or a Quotation coverage row must keep its area ticked, else the
 * server-side relation validators reject the whole commit and the capture
 * silently reverts. Single master for both directions — removed saved items
 * and deleted seeds flow through the same reconciliation, so the capture view
 * and the Add/Edit form can never disagree about the ticks.
 */
export function reconcileWorkRequiredSelection(input: {
  workSubcategories: WorkSubcategory[];
  work: SeedSourceWork;
  keptItems: Array<Pick<LineItem, "area_id" | "subcategory_id" | "work_type_id">>;
  freshItems: Array<Pick<LineItem, "area_id" | "subcategory_id" | "work_type_id">>;
  droppedSelections: RemovedSelection[];
  measurements?: Array<Pick<MeasurementRevision, "area_id" | "work_required_id">>;
  quotationCoverages?: Array<Pick<QuotationCoverage, "work_required_id" | "area_ids">>;
}): { area_ids: ID[]; work_subcategory_ids: ID[]; work_type_ids: ID[] } {
  const { work, keptItems, freshItems, droppedSelections } = input;
  const keptAsItems = keptItems as LineItem[];
  const items = [...keptItems, ...freshItems];
  const itemScopes = new Set(items.map((item) => scopeKeyOf(item.area_id, item.subcategory_id, item.work_type_id)));
  const droppedScopes = new Set(droppedSelections.map((row) => scopeKeyOf(row.area_id, row.subcategory_id, row.work_type_id)));
  // Surviving seeds: the declared selection re-derived against the KEPT items
  // only (a removed item's scope must not suppress its seed), minus the
  // scopes the fresh captures now own, minus the seeds the user deleted.
  const survivingSeeds = seedDetailedAreaLines({
    siteWorks: [{ ...work, structured_items: keptAsItems }],
    workSubcategories: input.workSubcategories,
  }).filter((seed) => !itemScopes.has(scopeKeyOf(seed.area_id, seed.subcategory_id, seed.work_type_id))
    && !droppedScopes.has(scopeKeyOf(seed.area_id, seed.subcategory_id, seed.work_type_id)));
  const seedSubcategoryIds = new Set(survivingSeeds.map((seed) => seed.subcategory_id));
  const seedWorkTypeIds = new Set(survivingSeeds.map((seed) => seed.work_type_id).filter((id): id is string => Boolean(id)));
  const seedAreaIds = new Set(survivingSeeds.map((seed) => seed.area_id));
  const itemSubcategoryIds = new Set(items.map((item) => item.subcategory_id).filter((id): id is string => Boolean(id)));
  const itemWorkTypeIds = new Set(items.map((item) => item.work_type_id).filter((id): id is string => Boolean(id)));
  const itemAreaIds = new Set(items.map((item) => item.area_id).filter((id): id is string => Boolean(id)));
  // Areas pinned by downstream records: removing the last captured item in a
  // measured (or quotation-covered) area must keep the area ticked, otherwise
  // the commit fails validation server-side and the capture reverts.
  const pinnedAreaIds = new Set<string>();
  (input.measurements || []).forEach((m) => {
    if (m.work_required_id === work.id && m.area_id) pinnedAreaIds.add(m.area_id);
  });
  (input.quotationCoverages || []).forEach((coverage) => {
    if (coverage.work_required_id === work.id) (coverage.area_ids || []).forEach((a) => a && pinnedAreaIds.add(a));
  });
  const nextSubcategoryIds = Array.from(new Set([...itemSubcategoryIds, ...seedSubcategoryIds]));
  const nextWorkTypeIds = Array.from(new Set([...itemWorkTypeIds, ...seedWorkTypeIds]));
  const nextAreaIds = Array.from(new Set([...itemAreaIds, ...seedAreaIds, ...pinnedAreaIds]));
  return {
    // Invariant clamps: the declaration outlives a total prune of any axis
    // (and measured/quotation-covered areas always stay ticked).
    work_subcategory_ids: nextSubcategoryIds.length ? nextSubcategoryIds : (work.work_subcategory_ids || []),
    work_type_ids: nextWorkTypeIds.length ? nextWorkTypeIds : (work.work_type_ids || []),
    area_ids: nextAreaIds.length ? nextAreaIds : (work.area_ids || []),
  };
}
