"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { contractorWorkTypeAverages } from "@/lib/rdash/contractor-profile";
import { formatINR } from "@/lib/rdash/format";
import type { Area, LineItem, RDashDatabase } from "@/lib/rdash/types";
import {
  defaultMeasureBasisFor,
  isActiveWorkTaxonomy,
  itemOptionPairs,
  measuredQuantity,
  promoteOptionPair,
  WORK_MEASURE_LABELS,
  workSubcategoryCategoryIds,
  workTypesForSubcategory,
  type WorkMeasureBasis,
} from "@/lib/rdash/work-types";
import { reserveEntityId } from "@/lib/uploads/upload-types";

const MEASURE_OPTIONS: WorkMeasureBasis[] = ["wall", "floor_ceiling", "wall_ceiling", "length"];
const round = (value: number) => Math.round(value * 100) / 100;

type AreaDimensions = Pick<Area, "id" | "name"> & {
  length?: string | number;
  width?: string | number;
  breadth?: string | number;
  height?: string | number;
};

function dimensions(area: AreaDimensions) {
  return {
    length: Number(area.length) || 0,
    breadth: Number(area.breadth ?? area.width) || 0,
    height: Number(area.height) || 0,
  };
}

function measureFor(db: RDashDatabase, subcategoryId?: string): WorkMeasureBasis {
  const subcategory = subcategoryId
    ? db.master.workSubcategories.find((row) => row.id === subcategoryId)
    : undefined;
  return defaultMeasureBasisFor(subcategory?.name);
}

function rateFor(db: RDashDatabase, subcategoryId?: string, workTypeId?: string): number {
  if (!subcategoryId) return 0;
  const subcategory = db.master.workSubcategories.find((row) => row.id === subcategoryId);
  const workType = workTypeId || (subcategory ? workTypesForSubcategory(subcategory)[0]?.id : undefined);
  if (!workType) return 0;
  return contractorWorkTypeAverages(db.master.contractorRates, subcategoryId, workType).total_rate || 0;
}

function pairLabel(db: RDashDatabase, pair: { subcategory_id?: string; work_type_id?: string }) {
  const subcategory = db.master.workSubcategories.find((row) => row.id === pair.subcategory_id);
  const workType = pair.work_type_id && subcategory
    ? workTypesForSubcategory(subcategory).find((row) => row.id === pair.work_type_id)
    : undefined;
  return `${subcategory?.name || "Work"}${workType ? ` · ${workType.name}` : ""}`;
}

export function normalizeCustomerDetailedWorkItem(
  db: RDashDatabase,
  area: AreaDimensions,
  item: LineItem,
  options: { recomputeQuantity?: boolean } = {},
): LineItem {
  const subcategory = db.master.workSubcategories.find((row) => row.id === item.subcategory_id);
  const workType = item.work_type_id && subcategory
    ? workTypesForSubcategory(subcategory).find((row) => row.id === item.work_type_id)
    : undefined;
  const basis = item.measurement_basis || (item.unit_id === "rft" ? "length" : measureFor(db, item.subcategory_id));
  const walls = item.measurement_walls === 2 ? 2 : 1;
  const dims = dimensions(area);
  const measured = measuredQuantity(basis, dims, walls);
  const quantity = options.recomputeQuantity && !item.quantity_is_manual
    ? measured.quantity
    : Number(item.quantity) || 0;
  const rate = rateFor(db, item.subcategory_id, item.work_type_id);
  const pairs = itemOptionPairs(item);
  const scopeTitle = pairs.length > 1
    ? pairs.map((pair) => pairLabel(db, pair)).join(" / ")
    : `${subcategory?.name || "Planned work"}${workType && workType.name !== "Standard" ? ` · ${workType.name}` : ""}`;
  return {
    ...item,
    title: `${area.name} · ${scopeTitle}`,
    area_id: area.id,
    area_name: area.name,
    quantity: round(quantity),
    unit_id: measured.unit,
    unit_name: measured.unit,
    rate,
    amount: round(quantity * rate),
    length_ft: dims.length || undefined,
    breadth_ft: dims.breadth || undefined,
    height_ft: basis === "length" ? undefined : dims.height || undefined,
    floor_ceiling_area: dims.length && dims.breadth ? round(dims.length * dims.breadth) : undefined,
    measurement_basis: basis,
    measurement_walls: walls,
  };
}

export function createCustomerDetailedWorkItem({
  db,
  area,
  siteId,
  workRequiredId,
  categoryId,
  subcategoryId,
  workTypeId,
  optionPairs,
}: {
  db: RDashDatabase;
  area: AreaDimensions;
  siteId?: string;
  workRequiredId?: string;
  categoryId?: string;
  subcategoryId?: string;
  workTypeId?: string;
  optionPairs?: NonNullable<LineItem["option_pairs"]>;
}): LineItem {
  const basis = measureFor(db, subcategoryId);
  return normalizeCustomerDetailedWorkItem(db, area, {
    id: reserveEntityId("req-line"),
    title: `${area.name} · Planned work`,
    site_id: siteId,
    area_id: area.id,
    area_name: area.name,
    work_required_id: workRequiredId,
    category_id: categoryId,
    subcategory_id: subcategoryId,
    work_type_id: workTypeId,
    option_pairs: optionPairs,
    quantity: 0,
    rate: 0,
    amount: 0,
    status: "active",
    measurement_basis: basis,
    measurement_walls: 1,
    quantity_is_manual: false,
    customer_form_draft: true,
  }, { recomputeQuantity: true });
}

export function customerDetailedWorkItemIsComplete(item: LineItem): boolean {
  return Boolean(item.area_id && item.category_id && item.subcategory_id && Number(item.quantity) > 0);
}

export function CustomerDetailedWorkItemFields({
  db,
  area,
  item,
  onChange,
  onRemove,
}: {
  db: RDashDatabase;
  area: AreaDimensions;
  item: LineItem;
  onChange: (item: LineItem) => void;
  onRemove: () => void;
}) {
  const basis = item.measurement_basis || (item.unit_id === "rft" ? "length" : measureFor(db, item.subcategory_id));
  const pairs = itemOptionPairs(item).filter((pair) => pair.subcategory_id);
  const selectedPairSubcategoryIds = new Set(pairs.map((pair) => pair.subcategory_id));
  const selectedPairWorkTypeIds = new Set(pairs.map((pair) => pair.work_type_id).filter(Boolean));
  const categoryId = item.category_id;
  const category = db.master.workCategories.find((row) => row.id === categoryId);
  const canSelect = isActiveWorkTaxonomy(category);
  const subcategories = categoryId
    ? db.master.workSubcategories.filter((row) => workSubcategoryCategoryIds(row).includes(categoryId)
      && (row.id === item.subcategory_id || selectedPairSubcategoryIds.has(row.id) || (canSelect && isActiveWorkTaxonomy(row))))
    : [];
  const subcategory = db.master.workSubcategories.find((row) => row.id === item.subcategory_id);
  const workTypes = subcategory
    ? workTypesForSubcategory(subcategory).filter((row) => row.id === item.work_type_id
      || selectedPairWorkTypeIds.has(row.id)
      || (canSelect && isActiveWorkTaxonomy(subcategory) && isActiveWorkTaxonomy(row)))
    : [];
  const pairKeys = new Set(pairs.map((pair) => `${pair.subcategory_id}::${pair.work_type_id || ""}`));
  const candidateOptions = categoryId && canSelect
    ? db.master.workSubcategories
        .filter((row) => workSubcategoryCategoryIds(row).includes(categoryId) && isActiveWorkTaxonomy(row))
        .flatMap((row) => workTypesForSubcategory(row).filter(isActiveWorkTaxonomy).map((workType) => ({
          value: `${row.id}::${workType.id}`,
          label: `${row.name} · ${workType.name}`,
        })))
        .filter((candidate) => !pairKeys.has(candidate.value))
    : [];

  const update = (patch: Partial<LineItem>, recomputeQuantity = false) => {
    const next = normalizeCustomerDetailedWorkItem(db, area, { ...item, ...patch }, { recomputeQuantity });
    onChange(next);
  };

  const setPairs = (nextPairs: Array<{ subcategory_id?: string; work_type_id?: string }>) => {
    const primary = nextPairs[0];
    if (!primary?.subcategory_id) return;
    update({
      subcategory_id: primary.subcategory_id,
      work_type_id: primary.work_type_id,
      option_pairs: nextPairs.length > 1 ? nextPairs as NonNullable<LineItem["option_pairs"]> : undefined,
      measurement_basis: measureFor(db, primary.subcategory_id),
      quantity_is_manual: false,
    }, true);
  };

  const incomplete = !customerDetailedWorkItemIsComplete(item);

  return <div className={cn("rounded-md border p-2.5", incomplete ? "border-warning/40 bg-warning/[0.04]" : "border-border bg-card")}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase text-muted-foreground">Planned work details</span>
      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove} aria-label="Remove planned work"><X className="h-3.5 w-3.5" /></Button>
    </div>
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
      <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Category
        <select value={item.category_id || ""} onChange={(event) => update({ category_id: event.target.value || undefined, subcategory_id: undefined, work_type_id: undefined, option_pairs: undefined, quantity_is_manual: false }, true)} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground">
          <option value="">Select category</option>
          {db.master.workCategories.filter((row) => isActiveWorkTaxonomy(row) || row.id === item.category_id).map((row) => <option key={row.id} value={row.id}>{row.name}{isActiveWorkTaxonomy(row) ? "" : " · Archived"}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Subcategory
        <select value={item.subcategory_id || ""} disabled={!item.category_id} onChange={(event) => {
          const subcategoryId = event.target.value || undefined;
          const selected = db.master.workSubcategories.find((row) => row.id === subcategoryId);
          update({ subcategory_id: subcategoryId, work_type_id: selected ? workTypesForSubcategory(selected)[0]?.id : undefined, option_pairs: undefined, measurement_basis: measureFor(db, subcategoryId), quantity_is_manual: false }, true);
        }} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground disabled:opacity-60">
          <option value="">Select subcategory</option>
          {subcategories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Work type
        <select value={item.work_type_id || ""} disabled={!item.subcategory_id} onChange={(event) => update({ work_type_id: event.target.value || undefined, option_pairs: undefined })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground disabled:opacity-60">
          <option value="">Default</option>
          {workTypes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Measurement basis
        <select value={basis} onChange={(event) => update({ measurement_basis: event.target.value as WorkMeasureBasis, quantity_is_manual: false }, true)} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground">
          {MEASURE_OPTIONS.map((option) => <option key={option} value={option}>{WORK_MEASURE_LABELS[option]}</option>)}
        </select>
      </label>
      {basis === "length" ? <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Walls
        <select value={item.measurement_walls || 1} onChange={(event) => update({ measurement_walls: event.target.value === "2" ? 2 : 1, quantity_is_manual: false }, true)} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground"><option value="1">1 wall (L)</option><option value="2">2 walls (L+B)</option></select>
      </label> : null}
      <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">{WORK_MEASURE_LABELS[basis]}
        <Input type="number" min="0" step="any" inputMode="decimal" value={item.quantity || ""} onChange={(event) => update({ quantity: Number(event.target.value) || 0, quantity_is_manual: Number(event.target.value) > 0 })} className="h-8 text-xs font-normal" placeholder="Auto from Area dimensions" />
      </label>
      <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground md:col-span-3">Notes
        <Input value={item.description || ""} onChange={(event) => update({ description: event.target.value || undefined })} className="h-8 text-xs font-normal" placeholder="Finish, preference, openings, deductions or scope note" />
      </label>
    </div>

    {pairs.length ? <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Alternatives · customer takes any one · one shared measurement</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {pairs.map((pair, index) => {
          const label = pairLabel(db, pair);
          const rate = rateFor(db, pair.subcategory_id, pair.work_type_id);
          return <span key={`${pair.subcategory_id}::${pair.work_type_id || ""}`} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]", index === 0 ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning")}>
            <button type="button" className="text-left" onClick={() => setPairs(promoteOptionPair(pairs, index))} aria-label={`Make ${label} primary`} aria-pressed={index === 0}>{label}{rate ? ` · ≈ ${formatINR(rate)}/${basis === "length" ? "rft" : "sqft"}` : ""}</button>
            {pairs.length > 1 ? <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={() => setPairs(pairs.filter((_, pairIndex) => pairIndex !== index))} aria-label={`Remove option ${label}`}><X className="h-2.5 w-2.5" /></button> : null}
          </span>;
        })}
      </div>
      {candidateOptions.length ? <div className="mt-2">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Add another option</p>
        <div className="mt-1 grid gap-1.5 md:grid-cols-2">
          {candidateOptions.map((candidate) => <button key={candidate.value} type="button" aria-label={`Add alternative ${candidate.label}`} onClick={() => {
            const [subcategoryId, workTypeId] = candidate.value.split("::");
            setPairs([...pairs, { subcategory_id: subcategoryId, work_type_id: workTypeId || undefined }]);
          }} className="rounded-md border border-warning/30 bg-warning/[0.04] px-2 py-1.5 text-left text-[11px] leading-4 text-foreground hover:bg-warning/10">{candidate.label}</button>)}
        </div>
      </div> : null}
    </div> : null}

    <p className="mt-2 text-[10px] text-muted-foreground">{item.rate ? `Live contractor-rate estimate ≈ ${formatINR(item.rate)}/${basis === "length" ? "rft" : "sqft"} · ${formatINR(item.amount)}` : "No contractor rate is available for this work type."}</p>
    {incomplete ? <p className="mt-1 text-[11px] text-warning">Choose category and subcategory, then enter Area dimensions or a direct quantity.</p> : null}
  </div>;
}
