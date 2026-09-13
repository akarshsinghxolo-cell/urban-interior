"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, ListChecks, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { Area, AreaType, LineItem, Site, WorkRequired } from "@/lib/rdash/types";
import {
  defaultMeasureBasisFor,
  itemOptionPairs,
  itemScopeKeys,
  measuredQuantity,
  seedDetailedAreaLines,
  WORK_MEASURE_LABELS,
  workTypesForSubcategory,
  type WorkMeasureBasis,
} from "@/lib/rdash/work-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MEASURE_OPTIONS: WorkMeasureBasis[] = ["wall", "floor_ceiling", "wall_ceiling", "length"];
const NEW_AREA_TYPES = ["living room", "bedroom", "kitchen", "bathroom", "balcony", "office", "store area", "utility", "other"];

const round = (value: number) => Math.round(value * 100) / 100;
const numeric = (value: string | number | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const draftKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

type DraftLine = {
  key: string;
  category_id?: string;
  subcategory_id?: string;
  work_type_id?: string;
  option_pairs?: NonNullable<LineItem["option_pairs"]>;
  target_work_required_id?: string;
  measure: WorkMeasureBasis;
  walls: 1 | 2;
  quantity: string;
  notes?: string;
  seeded?: boolean;
  editOfItemId?: string;
  manualQuantity?: boolean;
};

type AreaGroup = {
  key: string;
  area_id?: string;
  create_area?: boolean;
  area_name: string;
  area_type: AreaType;
  open: boolean;
  length: string;
  breadth: string;
  height: string;
  lines: DraftLine[];
};

function dimensions(group: AreaGroup) {
  return {
    length: Number(group.length) || 0,
    breadth: Number(group.breadth) || 0,
    height: Number(group.height) || 0,
  };
}

function seedScopeKeys(seed: ReturnType<typeof seedDetailedAreaLines>[number]) {
  const pairs = seed.option_pairs?.length
    ? seed.option_pairs
    : [{ subcategory_id: seed.subcategory_id, work_type_id: seed.work_type_id }];
  return pairs.map((pair) => [seed.area_id, pair.subcategory_id || "", pair.work_type_id || ""].join("::"));
}

export function CustomerWorkCaptureDialog({
  workRequired,
  site,
  areas,
  onClose,
}: {
  workRequired: WorkRequired;
  site: Site;
  areas: Area[];
  onClose: () => void;
}) {
  const db = useRDashStore((state) => state.db);
  const captureStructuredWorkRequired = useRDashStore((state) => state.captureStructuredWorkRequired);
  type CaptureLine = Parameters<typeof captureStructuredWorkRequired>[1][number] & {
    option_pairs?: NonNullable<LineItem["option_pairs"]>;
  };

  const siteWorks = React.useMemo(
    () => db.workRequired.filter((row) => row.site_id === site.id),
    [db.workRequired, site.id],
  );
  const existingItems = React.useMemo(
    () => siteWorks.flatMap((row) => row.structured_items || []),
    [siteWorks],
  );
  const existingScopeKeys = React.useMemo(
    () => new Set(existingItems.flatMap((item) => itemScopeKeys(item))),
    [existingItems],
  );

  const buildGroups = React.useCallback((): AreaGroup[] => {
    const groups = new Map<string, AreaGroup>();
    for (const area of areas.filter((row) => !row.is_archived)) {
      groups.set(area.id, {
        key: area.id,
        area_id: area.id,
        area_name: area.name,
        area_type: area.area_type || "other",
        open: false,
        length: area.length ? String(area.length) : "",
        breadth: area.width ? String(area.width) : "",
        height: area.height ? String(area.height) : "",
        lines: [],
      });
    }

    const seeds = seedDetailedAreaLines({ siteWorks, workSubcategories: db.master.workSubcategories });
    for (const seed of seeds) {
      if (seedScopeKeys(seed).some((key) => existingScopeKeys.has(key))) continue;
      let group = groups.get(seed.area_id);
      if (!group) {
        const area = areas.find((row) => row.id === seed.area_id);
        if (!area) continue;
        group = {
          key: area.id,
          area_id: area.id,
          area_name: area.name,
          area_type: area.area_type || "other",
          open: false,
          length: area.length ? String(area.length) : "",
          breadth: area.width ? String(area.width) : "",
          height: area.height ? String(area.height) : "",
          lines: [],
        };
        groups.set(area.id, group);
      }
      const { quantity } = measuredQuantity(seed.measure, dimensions(group), seed.walls);
      group.lines.push({
        key: draftKey("seed"),
        category_id: seed.category_id,
        subcategory_id: seed.subcategory_id,
        work_type_id: seed.work_type_id,
        option_pairs: seed.option_pairs,
        target_work_required_id: seed.work_required_id,
        measure: seed.measure,
        walls: seed.walls,
        quantity: quantity > 0 ? String(round(quantity)) : "",
        seeded: true,
        manualQuantity: false,
      });
    }

    const rows = [...groups.values()];
    const firstWithWork = rows.find((group) => group.lines.length || existingItems.some((item) => item.area_id === group.area_id));
    (firstWithWork || rows[0]) && ((firstWithWork || rows[0]).open = true);
    return rows.length ? rows : [{
      key: draftKey("new-area"),
      create_area: true,
      area_name: "",
      area_type: "other",
      open: true,
      length: "",
      breadth: "",
      height: "",
      lines: [],
    }];
  }, [areas, db.master.workSubcategories, existingItems, existingScopeKeys, siteWorks]);

  const [groups, setGroups] = React.useState<AreaGroup[]>(buildGroups);
  const [removedItemIds, setRemovedItemIds] = React.useState<Set<string>>(() => new Set());

  const workTypesFor = React.useCallback((subcategoryId?: string) => {
    const subcategory = subcategoryId
      ? db.master.workSubcategories.find((row) => row.id === subcategoryId)
      : undefined;
    return subcategory ? workTypesForSubcategory(subcategory) : [];
  }, [db.master.workSubcategories]);

  const measureFor = React.useCallback((subcategoryId?: string): WorkMeasureBasis => {
    const subcategory = subcategoryId
      ? db.master.workSubcategories.find((row) => row.id === subcategoryId)
      : undefined;
    return defaultMeasureBasisFor(subcategory?.name);
  }, [db.master.workSubcategories]);

  const freshLine = React.useCallback((group: AreaGroup): DraftLine => {
    const subcategoryId = (workRequired.work_subcategory_ids || [])[0];
    const measure = measureFor(subcategoryId);
    const { quantity } = measuredQuantity(measure, dimensions(group), 1);
    return {
      key: draftKey("work"),
      category_id: workRequired.work_category_id,
      subcategory_id: subcategoryId,
      work_type_id: subcategoryId ? workTypesFor(subcategoryId)[0]?.id : undefined,
      target_work_required_id: workRequired.id,
      measure,
      walls: 1,
      quantity: quantity > 0 ? String(round(quantity)) : "",
      manualQuantity: false,
    };
  }, [measureFor, workRequired, workTypesFor]);

  const updateGroup = (key: string, patch: Partial<AreaGroup>) => setGroups((current) => current.map((group) => {
    if (group.key !== key) return group;
    const next = { ...group, ...patch };
    const dims = dimensions(next);
    next.lines = next.lines.map((line) => {
      if (line.manualQuantity) return line;
      const { quantity } = measuredQuantity(line.measure, dims, line.walls);
      return { ...line, quantity: quantity > 0 ? String(round(quantity)) : "" };
    });
    return next;
  }));

  const updateLine = (groupKey: string, lineKey: string, patch: Partial<DraftLine>) => setGroups((current) => current.map((group) => {
    if (group.key !== groupKey) return group;
    return {
      ...group,
      lines: group.lines.map((line) => {
        if (line.key !== lineKey) return line;
        const next = { ...line, ...patch };
        if (patch.quantity !== undefined) {
          next.manualQuantity = Number(patch.quantity) > 0;
          if (!next.manualQuantity && patch.quantity.trim() === "") {
            const { quantity } = measuredQuantity(next.measure, dimensions(group), next.walls);
            next.quantity = quantity > 0 ? String(round(quantity)) : "";
          }
          return next;
        }
        if ((patch.measure !== undefined || patch.walls !== undefined) && !next.manualQuantity) {
          const { quantity } = measuredQuantity(next.measure, dimensions(group), next.walls);
          next.quantity = quantity > 0 ? String(round(quantity)) : "";
        }
        return next;
      }),
    };
  }));

  const addLine = (groupKey: string) => setGroups((current) => current.map((group) => group.key === groupKey
    ? { ...group, open: true, lines: [...group.lines, freshLine(group)] }
    : group));

  const removeDraftLine = (groupKey: string, lineKey: string) => setGroups((current) => current.map((group) => group.key === groupKey
    ? { ...group, lines: group.lines.filter((line) => line.key !== lineKey) }
    : group));

  const editSavedItem = (groupKey: string, item: LineItem) => setGroups((current) => current.map((group) => {
    if (group.key !== groupKey || group.lines.some((line) => line.editOfItemId === item.id)) return group;
    const measure: WorkMeasureBasis = item.unit_id === "rft" ? "length" : measureFor(item.subcategory_id);
    return {
      ...group,
      open: true,
      lines: [{
        key: draftKey("edit"),
        category_id: item.category_id,
        subcategory_id: item.subcategory_id,
        work_type_id: item.work_type_id,
        option_pairs: item.option_pairs,
        target_work_required_id: item.work_required_id || workRequired.id,
        measure,
        walls: 1,
        quantity: item.quantity > 0 ? String(item.quantity) : "",
        notes: item.description,
        editOfItemId: item.id,
        manualQuantity: true,
      }, ...group.lines],
    };
  }));

  const toggleSavedRemoval = (itemId: string) => setRemovedItemIds((current) => {
    const next = new Set(current);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });

  const addArea = () => setGroups((current) => [
    ...current.map((group) => ({ ...group, open: false })),
    {
      key: draftKey("new-area"),
      create_area: true,
      area_name: "",
      area_type: "other",
      open: true,
      length: "",
      breadth: "",
      height: "",
      lines: [],
    },
  ]);

  const removeNewArea = (groupKey: string) => setGroups((current) => current.filter((group) => group.key !== groupKey));

  const lineIssue = (group: AreaGroup, line: DraftLine) => {
    if (group.create_area && !group.area_name.trim()) return "Name the new area.";
    if (!line.category_id) return "Choose a category.";
    if (!line.subcategory_id) return "Choose a subcategory.";
    if (!(Number(line.quantity) > 0)) return "Enter a quantity or area dimensions.";
    return undefined;
  };

  const validEntries = groups.flatMap((group) => group.lines
    .filter((line) => !lineIssue(group, line))
    .map((line) => ({ group, line })));

  const changedAreaDimensions = groups.flatMap((group) => {
    if (!group.area_id) return [];
    const source = areas.find((area) => area.id === group.area_id);
    if (!source) return [];
    const next = [numeric(group.length), numeric(group.breadth), numeric(group.height)];
    const before = [source.length, source.width, source.height].map((value) => numeric(value));
    if (next.every((value, index) => value === before[index])) return [];
    return [{
      area_id: group.area_id,
      length_ft: next[0],
      breadth_ft: next[1],
      height_ft: next[2],
    }];
  });

  const canSave = validEntries.length > 0 || removedItemIds.size > 0 || changedAreaDimensions.length > 0;

  const save = () => {
    if (!canSave) return;
    const payloadLines: CaptureLine[] = validEntries.map(({ group, line }) => {
      const dims = dimensions(group);
      const measured = measuredQuantity(line.measure, dims, line.walls);
      return {
        site_id: site.id,
        area_id: group.area_id,
        area_name: group.create_area ? group.area_name.trim() : undefined,
        create_area: group.create_area,
        area_type: group.area_type,
        category_id: line.category_id!,
        subcategory_id: line.subcategory_id!,
        work_type_id: line.work_type_id,
        option_pairs: line.option_pairs,
        target_work_required_id: line.target_work_required_id,
        length_ft: numeric(group.length),
        breadth_ft: numeric(group.breadth),
        height_ft: line.measure === "length" ? undefined : numeric(group.height),
        floor_area: numeric(group.length) && numeric(group.breadth)
          ? round(Number(group.length) * Number(group.breadth))
          : undefined,
        quantity: Number(line.quantity) > 0 ? Number(line.quantity) : measured.quantity,
        unit_id: measured.unit,
        notes: line.notes?.trim() || undefined,
      };
    });
    const editedIds = validEntries.flatMap(({ line }) => line.editOfItemId ? [line.editOfItemId] : []);
    try {
      captureStructuredWorkRequired(workRequired.id, payloadLines, {
        removedItemIds: [...new Set([...removedItemIds, ...editedIds])],
        removedSelections: [],
        areaDims: changedAreaDimensions,
      });
      toast.success(payloadLines.length
        ? `Captured ${payloadLines.length} detailed work item${payloadLines.length === 1 ? "" : "s"} for ${site.name}.`
        : `Updated site work capture for ${site.name}.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Detailed work could not be captured.");
    }
  };

  const optionLabel = (line: DraftLine) => {
    const pairs = line.option_pairs?.length ? line.option_pairs : [];
    if (pairs.length <= 1) return undefined;
    return pairs.map((pair) => {
      const subcategory = db.master.workSubcategories.find((row) => row.id === pair.subcategory_id);
      const workType = pair.work_type_id && subcategory
        ? workTypesForSubcategory(subcategory).find((row) => row.id === pair.work_type_id)
        : undefined;
      return `${subcategory?.name || "Work"}${workType ? ` · ${workType.name}` : ""}`;
    }).join(" / ");
  };

  const renderLine = (group: AreaGroup, line: DraftLine) => {
    const subcategories = line.category_id
      ? db.master.workSubcategories.filter((row) => row.category_id === line.category_id)
      : [];
    const workTypes = workTypesFor(line.subcategory_id);
    const issue = lineIssue(group, line);
    const alternatives = optionLabel(line);
    return <div key={line.key} className={cn("rounded-md border p-2.5", issue ? "border-warning/40 bg-warning/[0.04]" : line.editOfItemId ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">{line.editOfItemId ? "Editing captured work" : line.seeded ? "Planned work" : "Work item"}</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeDraftLine(group.key, line.key)} aria-label="Remove draft work item"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Category
          <select value={line.category_id || ""} onChange={(event) => updateLine(group.key, line.key, { category_id: event.target.value || undefined, subcategory_id: undefined, work_type_id: undefined, option_pairs: undefined })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground">
            <option value="">Select category</option>
            {db.master.workCategories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Subcategory
          <select value={line.subcategory_id || ""} disabled={!line.category_id} onChange={(event) => {
            const subcategoryId = event.target.value || undefined;
            updateLine(group.key, line.key, {
              subcategory_id: subcategoryId,
              work_type_id: subcategoryId ? workTypesFor(subcategoryId)[0]?.id : undefined,
              option_pairs: undefined,
              measure: measureFor(subcategoryId),
            });
          }} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground disabled:opacity-60">
            <option value="">Select subcategory</option>
            {subcategories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Work type
          <select value={line.work_type_id || ""} disabled={!line.subcategory_id} onChange={(event) => updateLine(group.key, line.key, { work_type_id: event.target.value || undefined, option_pairs: undefined })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground disabled:opacity-60">
            <option value="">Default</option>
            {workTypes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Measure
          <select value={line.measure} onChange={(event) => updateLine(group.key, line.key, { measure: event.target.value as WorkMeasureBasis })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground">
            {MEASURE_OPTIONS.map((basis) => <option key={basis} value={basis}>{WORK_MEASURE_LABELS[basis]}</option>)}
          </select>
        </label>
        {line.measure === "length" && <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Walls
          <select value={line.walls} onChange={(event) => updateLine(group.key, line.key, { walls: event.target.value === "2" ? 2 : 1 })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground"><option value="1">1 wall (L)</option><option value="2">2 walls (L+B)</option></select>
        </label>}
        <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">{WORK_MEASURE_LABELS[line.measure]}
          <Input type="number" min="0" step="any" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(group.key, line.key, { quantity: event.target.value })} className="h-8 text-xs font-normal" placeholder="Auto from area dimensions" />
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground sm:col-span-3">Notes
          <Input value={line.notes || ""} onChange={(event) => updateLine(group.key, line.key, { notes: event.target.value })} className="h-8 text-xs font-normal" placeholder="Finish, preference, openings, deductions or scope note" />
        </label>
      </div>
      {alternatives && <p className="mt-2 rounded-md bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">Planned alternatives retained: {alternatives}</p>}
      {issue && <p className="mt-1.5 text-[11px] text-warning">{issue}</p>}
    </div>;
  };

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[94vh] overflow-hidden p-0 sm:max-w-4xl">
      <DialogHeader className="border-b border-border px-5 py-4">
        <DialogTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Capture detailed area</DialogTitle>
        <DialogDescription>{site.name} · area dimensions and detailed work save into the same Site / Area / Work Required records used everywhere else.</DialogDescription>
      </DialogHeader>

      <div className="rd-scroll max-h-[68vh] space-y-2 overflow-y-auto px-5 py-4">
        {groups.map((group) => {
          const savedItems = existingItems.filter((item) => item.area_id === group.area_id);
          const activeSaved = savedItems.filter((item) => !removedItemIds.has(item.id));
          return <section key={group.key} className="overflow-hidden rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button type="button" onClick={() => updateGroup(group.key, { open: !group.open })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !group.open && "-rotate-90")} />
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{group.area_name || "New area"}</span><span className="block text-[10px] text-muted-foreground">{activeSaved.length} captured · {group.lines.length} ready/in progress</span></span>
              </button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => addLine(group.key)}><Plus className="mr-1 h-3 w-3" />Add work</Button>
              {group.create_area && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeNewArea(group.key)} aria-label="Remove new area"><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>

            {group.open && <div className="space-y-3 border-t border-border bg-background px-3 py-3">
              {group.create_area && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Area name
                  <Input value={group.area_name} onChange={(event) => updateGroup(group.key, { area_name: event.target.value })} className="h-8 text-xs font-normal" placeholder="e.g. Kitchen 2" />
                </label>
                <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Area type
                  <select value={group.area_type || "other"} onChange={(event) => updateGroup(group.key, { area_type: event.target.value })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground">
                    {NEW_AREA_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>}

              <div className="rounded-md border border-dashed border-border bg-muted/20 p-2.5">
                <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Area dimensions (ft) · shared by all work below</p>
                <div className="grid grid-cols-3 gap-2">
                  <label className="grid gap-1 text-[10px] text-muted-foreground">Length<Input type="number" min="0" step="any" value={group.length} onChange={(event) => updateGroup(group.key, { length: event.target.value })} className="h-8 text-xs text-foreground" /></label>
                  <label className="grid gap-1 text-[10px] text-muted-foreground">Breadth<Input type="number" min="0" step="any" value={group.breadth} onChange={(event) => updateGroup(group.key, { breadth: event.target.value })} className="h-8 text-xs text-foreground" /></label>
                  <label className="grid gap-1 text-[10px] text-muted-foreground">Height<Input type="number" min="0" step="any" value={group.height} onChange={(event) => updateGroup(group.key, { height: event.target.value })} className="h-8 text-xs text-foreground" /></label>
                </div>
              </div>

              {savedItems.length > 0 && <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Captured work</p>
                {savedItems.map((item) => {
                  const editing = group.lines.find((line) => line.editOfItemId === item.id);
                  if (editing) return <React.Fragment key={item.id}>{renderLine(group, editing)}</React.Fragment>;
                  const removed = removedItemIds.has(item.id);
                  return <div key={item.id} className={cn("flex items-center justify-between gap-2 rounded-md border px-2.5 py-2", removed ? "border-destructive/30 bg-destructive/[0.04] opacity-70" : "border-border bg-card")}>
                    <div className="min-w-0"><p className="truncate text-xs font-semibold">{item.title}</p><p className="text-[10px] text-muted-foreground">{item.quantity} {item.unit_name || item.unit_id || ""}</p></div>
                    <div className="flex shrink-0 gap-1">
                      {!removed && <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => editSavedItem(group.key, item)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>}
                      <Button size="sm" variant="outline" className={cn("h-6 px-2 text-[10px]", !removed && "text-destructive hover:text-destructive")} onClick={() => toggleSavedRemoval(item.id)}>{removed ? <><Undo2 className="mr-1 h-3 w-3" />Undo</> : <><Trash2 className="mr-1 h-3 w-3" />Remove</>}</Button>
                    </div>
                  </div>;
                })}
              </div>}

              <div className="space-y-2">{group.lines.filter((line) => !line.editOfItemId).map((line) => renderLine(group, line))}</div>
              {!savedItems.length && !group.lines.length && <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">No detailed work captured here yet. Add work to begin.</p>}
            </div>}
          </section>;
        })}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addArea}><Plus className="mr-1 h-3.5 w-3.5" />Add area</Button>
      </div>

      <DialogFooter className="border-t border-border px-5 py-3">
        <div className="mr-auto text-[11px] text-muted-foreground">{validEntries.length} work item{validEntries.length === 1 ? "" : "s"} ready · {removedItemIds.size} removal{removedItemIds.size === 1 ? "" : "s"} · {changedAreaDimensions.length} area dimension update{changedAreaDimensions.length === 1 ? "" : "s"}</div>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!canSave} onClick={save}>Save capture<CheckCircle2 className="ml-1.5 h-3.5 w-3.5" /></Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
