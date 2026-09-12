import type { Area, ContractorRate, ID, LineItem, MeasurementRevision, QuotationCoverage, WorkRequired, WorkSubcategory, WorkTypeRate } from "./types";

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
 *  ticked selection (not yet measured or captured). One seed per (Work
 *  Required × area): option_pairs carries the row's alternative (subcategory
 *  · work type) pairs — the customer takes any ONE of them, measured once. */
export type DetailedSeedLine = {
  work_required_id: string;
  area_id: string;
  category_id?: string;
  subcategory_id: string;
  work_type_id?: string;
  option_pairs?: Array<{ subcategory_id: string; work_type_id?: string }>;
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

/** Every (subcategory, work type) pair an item covers: its option list when it
 *  holds alternatives (any-one-of), else the single primary pair. Pair 0 of a
 *  non-empty option_pairs always mirrors subcategory_id + work_type_id. */
export function itemOptionPairs(item: Pick<LineItem, "subcategory_id" | "work_type_id" | "option_pairs">): Array<{ subcategory_id?: ID; work_type_id?: ID; rate?: number }> {
  if (item.option_pairs?.length) return item.option_pairs;
  return [{ subcategory_id: item.subcategory_id, work_type_id: item.work_type_id }];
}

/** Scope keys of every pair an item covers — the single dedup master shared
 *  by the store, the capture dialog and the reconciliation, so a merged
 *  alternatives item suppresses seeding each of its options exactly like the
 *  old one-item-per-type rows did. */
export function itemScopeKeys(item: Pick<LineItem, "area_id" | "subcategory_id" | "work_type_id" | "option_pairs">): string[] {
  return itemOptionPairs(item).map((pair) => scopeKeyOf(item.area_id, pair.subcategory_id, pair.work_type_id));
}

/** "Subcategory · Work type" labels joined with " / " — the same shape the
 *  Work Required rows display, reused for merged captured items' titles. */
export function capturedPairsTitle(workSubcategories: WorkSubcategory[], pairs: Array<{ subcategory_id?: ID; work_type_id?: ID }>): string {
  const label = (pair: { subcategory_id?: ID; work_type_id?: ID }) => {
    const subcategory = workSubcategories.find((row) => row.id === pair.subcategory_id);
    if (!subcategory) return "";
    const workType = pair.work_type_id ? workTypesForSubcategory(subcategory).find((row) => row.id === pair.work_type_id) : undefined;
    return `${subcategory.name}${workType ? ` · ${workType.name}` : ""}`;
  };
  return pairs.map(label).filter(Boolean).join(" / ");
}

// ── Quotation pair boxes ─────────────────────────────────────────────────────
// A merged alternatives line renders ONE box per (subcategory · work type):
// the box stack in ITEM, one total-rate box in RATE and one amount box in
// AMOUNT. The PRIMARY (first) pair is what the line counts once — removing a
// box promotes the next pair, exactly like the capture dialog's chips.

type RateRow = Pick<ContractorRate, "contractor_id" | "work_subcategory_id" | "work_type_id" | "material_rate" | "labour_rate">;

/** Work type's total rate (material + labour) averaged across contractors —
 *  the same source capture uses (crm.ts → contractorWorkTypeAverages):
 *  material averaged across contractors, labour averaged across contractors,
 *  then summed. Pure twin so work-types stays import-cycle free. */
export function averageWorkTypeTotalRate(rates: RateRow[], subcategoryId: ID | undefined, workTypeId: ID | undefined): number | undefined {
  if (!subcategoryId) return undefined;
  const rows = rates.filter((row) => row.work_subcategory_id === subcategoryId && row.work_type_id === workTypeId);
  const average = (key: "material_rate" | "labour_rate") => {
    const values = rows.map((row) => row[key]).filter((value): value is number => Number.isFinite(value));
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : undefined;
  };
  const materialRate = average("material_rate");
  const labourRate = average("labour_rate");
  return materialRate === undefined && labourRate === undefined ? undefined : (materialRate || 0) + (labourRate || 0);
}

export type QuotationPairBox = {
  pair: { subcategory_id: ID; work_type_id?: ID; rate?: number };
  label: string;
  rate?: number;
  primary: boolean;
  amount?: number;
  rateFromMaster: boolean;
};

/** One box per option pair: label ("Subcategory · Work type"), the box's
 *  total rate (pair override → master average → line rate for the primary)
 *  and amount (line quantity × rate). Undefined rate means nobody ever quoted
 *  that work type — the UI shows "—" instead of a fake ₹0. */
export function linePairBoxes(
  line: Pick<LineItem, "option_pairs" | "subcategory_id" | "work_type_id" | "rate" | "quantity" | "title">,
  workSubcategories: WorkSubcategory[],
  contractorRates: RateRow[],
): QuotationPairBox[] {
  return itemOptionPairs(line).map((pair, index) => {
    const subcategory = workSubcategories.find((row) => row.id === pair.subcategory_id);
    const workType = pair.work_type_id && subcategory ? workTypesForSubcategory(subcategory).find((row) => row.id === pair.work_type_id) : undefined;
    const label = `${subcategory?.name || ""}${workType ? ` · ${workType.name}` : ""}` || (index === 0 ? line.title : "");
    const primary = index === 0;
    const masterRate = averageWorkTypeTotalRate(contractorRates, pair.subcategory_id, pair.work_type_id);
    const rate = pair.rate ?? (primary ? line.rate : undefined) ?? masterRate;
    return {
      pair: pair as QuotationPairBox["pair"],
      label,
      rate,
      primary,
      amount: rate === undefined ? undefined : Math.round((line.quantity || 0) * rate * 100) / 100,
      rateFromMaster: pair.rate === undefined,
    };
  });
}

/** Patch for removing one option box from a merged line: the remaining pairs
 *  stay, pair 0 re-mirrors subcategory_id + work_type_id, the title re-joins,
 *  and the rate re-derives from the promoted primary (its override → master
 *  average → the line's existing rate). `null` = the last box was removed —
 *  the caller deletes the whole line. The store recomputes amount from the
 *  patched rate (quantity unchanged). */
export function removeOptionPair(
  line: Pick<LineItem, "option_pairs" | "subcategory_id" | "work_type_id" | "rate" | "quantity" | "title">,
  index: number,
  workSubcategories: WorkSubcategory[],
  contractorRates: RateRow[],
): { option_pairs: NonNullable<LineItem["option_pairs"]>; title: string; subcategory_id: ID; work_type_id?: ID; rate: number } | null {
  const pairs = itemOptionPairs(line).filter((_, i) => i !== index) as NonNullable<LineItem["option_pairs"]>;
  if (!pairs.length || !pairs[0].subcategory_id) return null;
  // The promoted pair prices the line now: its own override → its work type's
  // total contractor rate (material + labour) → the line's existing rate. The
  // old line.rate belongs to the REMOVED work type, so the master average
  // takes precedence over it.
  const promotedRate = pairs[0].rate
    ?? averageWorkTypeTotalRate(contractorRates, pairs[0].subcategory_id, pairs[0].work_type_id)
    ?? line.rate ?? 0;
  return {
    option_pairs: pairs,
    title: capturedPairsTitle(workSubcategories, pairs) || line.title,
    subcategory_id: pairs[0].subcategory_id,
    work_type_id: pairs[0].work_type_id,
    rate: promotedRate,
  };
}

/** One-time healer for rows captured before alternatives lived on one item:
 *  a capture used to explode an any-one-of decision into one item per
 *  (subcategory · work type), all sharing the same measurement. Such twins
 *  (same area + category + unit + quantity + dimensions inside ONE row)
 *  merge into the first item — its option list grows, the duplicates vanish,
 *  and the quotation stops counting the same running foot once per option. */
export function mergeExplodedOptionItems(input: {
  workSubcategories: WorkSubcategory[];
  items: LineItem[];
}): LineItem[] {
  const keyOf = (item: LineItem) =>
    [item.area_id || "", item.category_id || "", item.unit_id || "", item.quantity ?? "", item.length_ft ?? "", item.breadth_ft ?? "", item.height_ft ?? ""].join("::");
  const merged: LineItem[] = [];
  const hostIndexByKey = new Map<string, number>();
  const pendingPairsByHost = new Map<number, Map<string, { subcategory_id: ID; work_type_id?: ID }>>();
  for (const item of input.items) {
    const key = item.option_pairs?.length ? `self-${merged.length}` : keyOf(item);
    const hostIndex = item.option_pairs?.length ? undefined : hostIndexByKey.get(key);
    if (hostIndex === undefined) {
      hostIndexByKey.set(key, merged.length);
      merged.push({ ...item });
      continue;
    }
    let pending = pendingPairsByHost.get(hostIndex);
    if (!pending) {
      pending = new Map(itemOptionPairs(merged[hostIndex]).map((own) => [`${own.subcategory_id}::${own.work_type_id || ""}`, own as { subcategory_id: ID; work_type_id?: ID }]));
      pendingPairsByHost.set(hostIndex, pending);
    }
    for (const pair of itemOptionPairs(item)) {
      if (!pair.subcategory_id) continue;
      const pairKey = `${pair.subcategory_id}::${pair.work_type_id || ""}`;
      if (!pending.has(pairKey)) pending.set(pairKey, pair as { subcategory_id: ID; work_type_id?: ID });
    }
  }
  for (const [hostIndex, pending] of pendingPairsByHost) {
    const pairs = Array.from(pending.values());
    if (pairs.length <= 1) continue;
    const host = merged[hostIndex];
    host.option_pairs = pairs;
    const areaName = host.area_name || "";
    if (areaName) host.title = `${areaName} · ${capturedPairsTitle(input.workSubcategories, pairs)}`;
  }
  return merged;
}

/** Sum of an item's area chips — the quotation line's quantity master, shared
 *  by the derivation, the editor (chip × removes one chip and re-derives) and
 *  the tests. */
export function areaChipQuantity(chips: LineItem["area_chips"]): number {
  return Math.round((chips || []).reduce((sum, chip) => sum + (chip.quantity || 0), 0) * 100) / 100;
}

// ── Opted-but-missing quotation pairs ────────────────────────────────────────
// The customer's ticked Work Required selection is the master list of work
// types they asked to be quoted. A quotation that drops one (box removed
// while editing, a revision, an unseeded draft) still owes that work type —
// the editor lists the missing ones at the bottom so they can be added back.

export type OptedPair = { subcategory_id: ID; work_type_id?: ID };

/** The (subcategory · work type) pairs the customer opted for — every Work
 *  Required row's ticked selection, deduped across rows, following the same
 *  derivation the capture view seeds from (seedDetailedAreaLines): explicit
 *  work-type ticks resolve to their own subcategory (only under a declared
 *  one); legacy rows without ticks fall back to each declared subcategory's
 *  primary work type. Pairs whose subcategory left the master drop out. */
export function customerOptedPairs(input: {
  workRequired: Array<Pick<WorkRequired, "customer_id" | "work_subcategory_ids" | "work_type_ids">>;
  customerId: ID;
  workSubcategories: WorkSubcategory[];
}): OptedPair[] {
  const opted = new Map<string, OptedPair>();
  const declaredIds = (ids: Array<ID | undefined> | undefined) =>
    (ids || []).filter((id): id is ID => Boolean(id) && input.workSubcategories.some((row) => row.id === id));
  for (const work of input.workRequired) {
    if (work.customer_id !== input.customerId) continue;
    const subcategoryIds = declaredIds(work.work_subcategory_ids);
    if (!subcategoryIds.length) continue;
    const tickedIds = (work.work_type_ids || []).map(String);
    if (tickedIds.length) {
      for (const workTypeId of tickedIds) {
        const subcategory = input.workSubcategories.find((row) => workTypesForSubcategory(row).some((wt) => wt.id === workTypeId));
        // Only pairs under a subcategory the row declares count as opted.
        if (!subcategory || !subcategoryIds.includes(subcategory.id)) continue;
        opted.set(`${subcategory.id}::${workTypeId}`, { subcategory_id: subcategory.id, work_type_id: workTypeId });
      }
    }
    else {
      for (const subcategoryId of subcategoryIds) {
        const subcategory = input.workSubcategories.find((row) => row.id === subcategoryId)!;
        const primary = primaryWorkType(subcategory);
        opted.set(`${subcategoryId}::${primary.id}`, { subcategory_id: subcategoryId, work_type_id: primary.id });
      }
    }
  }
  return Array.from(opted.values());
}

/** The opted pairs this quotation does NOT price yet — the editor's bottom
 *  "add them back" list. A line pair covers its own exact key; a legacy line
 *  pair WITHOUT a work type covers every opted type of its subcategory (the
 *  line quotes that work generically, so its types are not "missing"). */
export function omittedOptedPairs(input: {
  workRequired: Array<Pick<WorkRequired, "customer_id" | "work_subcategory_ids" | "work_type_ids">>;
  customerId: ID;
  workSubcategories: WorkSubcategory[];
  items: Array<Pick<LineItem, "subcategory_id" | "work_type_id" | "option_pairs">>;
}): OptedPair[] {
  const coveredKeys = new Set<string>();
  const coveredAnyType = new Set<string>();
  for (const item of input.items) {
    for (const pair of itemOptionPairs(item)) {
      if (!pair.subcategory_id) continue;
      if (pair.work_type_id) coveredKeys.add(`${pair.subcategory_id}::${pair.work_type_id}`);
      else coveredAnyType.add(String(pair.subcategory_id));
    }
  }
  return customerOptedPairs(input).filter((pair) =>
    !coveredAnyType.has(String(pair.subcategory_id))
    && !coveredKeys.has(`${pair.subcategory_id}::${pair.work_type_id || ""}`));
}

/** One quotation line per covered Work Required decision — the annotation F
 *  shape the user asked for: the joined any-one-of title with NO area names,
 *  an area chip per measured area (removable in the editor), quantity = Σ
 *  chips. Per area the decision's PRIMARY captured item (the merged
 *  alternatives row when one exists, else the first) prices that area ONCE —
 *  exploded alternatives (Carpet 101 / Ceramic 105 / Vitrified 109 measured
 *  separately) never double-count the same floor. Reuses the primary item as
 *  the line base so unit/tax/category/dimensions survive; `newId` lets the
 *  caller keep stable ids (healer) or mint fresh ones (new quotations). */
export function groupedQuotationScopeLines(input: {
  workSubcategories: WorkSubcategory[];
  areas: Array<Pick<Area, "id" | "name">>;
  coveredWork: Array<Pick<WorkRequired, "id" | "title" | "work_subcategory_ids" | "work_type_ids" | "area_ids" | "structured_items">>;
  newId: (work: Pick<WorkRequired, "id">) => ID;
}): LineItem[] {
  const lines: LineItem[] = [];
  for (const work of input.coveredWork) {
    const items = (work.structured_items || []).filter((item) => Number.isFinite(item.quantity));
    if (!items.length) continue;
    const byArea = new Map<string, LineItem[]>();
    for (const item of items) {
      const key = item.area_id || "";
      if (!byArea.has(key)) byArea.set(key, []);
      byArea.get(key)!.push(item);
    }
    // Chips follow the Work Required's own area order, then any stragglers.
    const orderedAreaIds = [...(work.area_ids || []).filter((id) => byArea.has(id)), ...Array.from(byArea.keys()).filter((id) => !(work.area_ids || []).includes(id))];
    const chips: NonNullable<LineItem["area_chips"]> = [];
    let primary: LineItem | undefined;
    for (const areaId of orderedAreaIds) {
      const group = byArea.get(areaId)!;
      const areaPrimary = group.find((item) => item.option_pairs?.length) || group[0];
      primary = primary || areaPrimary;
      const name = input.areas.find((area) => area.id === areaId)?.name || areaPrimary.area_name || "Area";
      chips.push({ area_id: areaId || undefined, area_name: name, quantity: areaPrimary.quantity || 0 });
    }
    if (!primary) continue;
    const amount = Math.round(chips.reduce((sum, chip) => {
      const group = byArea.get(chip.area_id || "")!;
      const areaPrimary = group.find((item) => item.option_pairs?.length) || group[0];
      return sum + (areaPrimary.amount || 0);
    }, 0) * 100) / 100;
    const quantity = areaChipQuantity(chips);
    const title = workRequiredDisplayTitle(input.workSubcategories, work) || primary.title.replace(/^[^·]+ · /, "");
    lines.push({
      ...primary,
      id: input.newId(work),
      work_required_id: work.id,
      source_item_id: primary.id,
      title,
      area_chips: chips,
      quantity,
      rate: quantity ? Math.round((amount / quantity) * 100) / 100 : primary.rate || 0,
      amount,
    });
  }
  return lines;
}

/**
 * Derive the capture view's planned lines from every site Work Required's
 * ticked selection: ONE line per (Work Required × area) whose option_pairs
 * carry all not-yet-captured (subcategory · work type) alternatives, across
 * ALL of the site's Work Required rows. This is what makes an area group open
 * with "Toughened Glass Railing · Standard / SS Railing · Standard / …"
 * ready to measure once instead of an empty state — the capture view is the
 * per-area mirror of the Add/Edit form.
 */
export function seedDetailedAreaLines(input: {
  siteWorks: SeedSourceWork[];
  workSubcategories: WorkSubcategory[];
}): DetailedSeedLine[] {
  const captured = new Set<string>();
  for (const work of input.siteWorks) {
    for (const item of work.structured_items || []) {
      if (!item.area_id) continue;
      for (const key of itemScopeKeys(item)) captured.add(key);
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
      // ONE seed per (Work Required × area): the row's planned pairs become
      // the seed's alternatives — "Toughened Glass · Standard / SS · Standard
      // / WPC · Standard" — measured ONCE, because the customer takes any one
      // of them. Already-captured pairs drop out of the option list.
      const options = planned
        .map(({ subcategory, workTypeId }) => ({ subcategory_id: subcategory.id, work_type_id: workTypeId || primaryWorkType(subcategory).id }))
        .filter((pair) => {
          const key = scopeKeyOf(areaId, pair.subcategory_id, pair.work_type_id);
          if (captured.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if (!options.length) continue;
      const primarySubcategory = input.workSubcategories.find((row) => row.id === options[0].subcategory_id)!;
      seeds.push({
        work_required_id: work.id,
        area_id: areaId,
        category_id: work.work_category_id || primarySubcategory.category_id,
        subcategory_id: options[0].subcategory_id,
        work_type_id: options[0].work_type_id,
        option_pairs: options.length > 1 ? options : undefined,
        measure: defaultMeasureBasisFor(primarySubcategory.name),
        walls: 1,
      });
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
  // Alternatives-aware scope master: a merged item owns a scope per option.
  const itemScopes = new Set<string>();
  const itemSubcategoryIds = new Set<string>();
  const itemWorkTypeIds = new Set<string>();
  const itemAreaIds = new Set<string>();
  for (const item of items) {
    for (const key of itemScopeKeys(item)) itemScopes.add(key);
    for (const pair of itemOptionPairs(item)) {
      if (pair.subcategory_id) itemSubcategoryIds.add(pair.subcategory_id);
      if (pair.work_type_id) itemWorkTypeIds.add(pair.work_type_id);
    }
    if (item.area_id) itemAreaIds.add(item.area_id);
  }
  const droppedScopes = new Set(droppedSelections.map((row) => scopeKeyOf(row.area_id, row.subcategory_id, row.work_type_id)));
  // Surviving seeds: the declared selection re-derived against the KEPT items
  // only (a removed item's scope must not suppress its seed), minus the
  // scopes the fresh captures now own, minus the seeds the user deleted —
  // resolved PER OPTION, so a grouped seed keeps its not-yet-captured
  // alternatives and dies only when its last option is captured or dropped.
  const survivingSeeds = seedDetailedAreaLines({
    siteWorks: [{ ...work, structured_items: keptAsItems }],
    workSubcategories: input.workSubcategories,
  }).flatMap((seed) => {
    const remaining = itemOptionPairs(seed)
      .filter((pair): pair is { subcategory_id: ID; work_type_id?: ID } => Boolean(pair.subcategory_id)
        && !itemScopes.has(scopeKeyOf(seed.area_id, pair.subcategory_id, pair.work_type_id))
        && !droppedScopes.has(scopeKeyOf(seed.area_id, pair.subcategory_id, pair.work_type_id)));
    if (!remaining.length) return [];
    return [{ ...seed, subcategory_id: remaining[0].subcategory_id, work_type_id: remaining[0].work_type_id, option_pairs: remaining.length > 1 ? remaining : undefined }];
  });
  const seedSubcategoryIds = new Set(survivingSeeds.flatMap((seed) => itemOptionPairs(seed).map((pair) => pair.subcategory_id).filter((id): id is string => Boolean(id))));
  const seedWorkTypeIds = new Set(survivingSeeds.flatMap((seed) => itemOptionPairs(seed).map((pair) => pair.work_type_id).filter((id): id is string => Boolean(id))));
  const seedAreaIds = new Set(survivingSeeds.map((seed) => seed.area_id));
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
