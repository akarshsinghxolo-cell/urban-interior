"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, ListChecks, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityFilesCard } from "@/components/rdash/EntityFilesCard";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { useRDashStore } from "@/lib/rdash/store";
import type { Area, AreaType, LineItem, Site, WorkRequired } from "@/lib/rdash/types";
import { formatINR } from "@/lib/rdash/format";
import { contractorWorkTypeAverages } from "@/lib/rdash/contractor-profile";
import {
  defaultMeasureBasisFor,
  itemOptionPairs,
  itemScopeKeys,
  measuredQuantity,
  seedDetailedAreaLines,
  WORK_MEASURE_LABELS,
  workTypesForSubcategory,
  type RemovedSelection,
  type WorkMeasureBasis,
} from "@/lib/rdash/work-types";
import {
  CustomerAreaDimensionsFields,
  normalizeAreaDimensions,
  positiveDimension,
  type CustomerAreaDimensionsDraft,
} from "./CustomerAreaDimensionsFields";

const MEASURE_OPTIONS: WorkMeasureBasis[] = ["wall", "floor_ceiling", "wall_ceiling", "length"];
const AREA_TYPES: Array<{ value: AreaType; label: string }> = [
  { value: "bedroom", label: "Bedroom" },
  { value: "guest_room", label: "Guest room" },
  { value: "living_room", label: "Living room / Hall" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "balcony", label: "Balcony" },
  { value: "office_cabin", label: "Office cabin" },
  { value: "reception", label: "Reception" },
  { value: "other", label: "Other" },
];

const round = (value: number) => Math.round(value * 100) / 100;
const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const draftKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

type OptionPair = { subcategory_id: string; work_type_id?: string };

type DraftLine = {
  key: string;
  category_id?: string;
  subcategory_id?: string;
  work_type_id?: string;
  option_pairs?: OptionPair[];
  target_work_required_id?: string;
  measure: WorkMeasureBasis;
  walls: 1 | 2;
  quantity: string;
  notes?: string;
  seeded?: boolean;
  editOfItemId?: string;
  manualQuantity?: boolean;
};

type AreaGroup = CustomerAreaDimensionsDraft & {
  key: string;
  area_id?: string;
  create_area?: boolean;
  area_name: string;
  area_type: AreaType;
  open: boolean;
  lines: DraftLine[];
  removedItemIds: string[];
  removedSelections: RemovedSelection[];
};

function dimensions(group: CustomerAreaDimensionsDraft) {
  const normalized = normalizeAreaDimensions(group);
  return {
    length: normalized.length || 0,
    breadth: normalized.breadth || 0,
    height: normalized.height || 0,
  };
}

function pairsForLine(line: DraftLine): OptionPair[] {
  if (line.option_pairs?.length) return line.option_pairs;
  return line.subcategory_id
    ? [{ subcategory_id: line.subcategory_id, work_type_id: line.work_type_id }]
    : [];
}

/**
 * Canonical Customer-owned Area / Work Required capture.
 *
 * Customer Desk, Site Execution and any measurement-adjacent launcher must use
 * this component rather than implementing category/subcategory/work type,
 * L/B/H, measurement basis, quantity, alternatives or serialization again.
 */
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
  const { registerBatch, commitBatches } = useUploadDraft(true);

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

  const rateFor = React.useCallback((subcategoryId?: string, workTypeId?: string) => {
    if (!subcategoryId) return undefined;
    return contractorWorkTypeAverages(
      db.master.contractorRates,
      subcategoryId,
      workTypeId || workTypesFor(subcategoryId)[0]?.id,
    ).total_rate;
  }, [db.master.contractorRates, workTypesFor]);

  const buildGroups = React.useCallback((): AreaGroup[] => {
    const map = new Map<string, AreaGroup>();
    for (const area of areas.filter((row) => !row.is_archived)) {
      map.set(area.id, {
        key: area.id,
        area_id: area.id,
        area_name: area.name,
        area_type: area.area_type || "other",
        open: false,
        length: area.length ? String(area.length) : "",
        breadth: area.width ? String(area.width) : "",
        height: area.height ? String(area.height) : "",
        lines: [],
        removedItemIds: [],
        removedSelections: [],
      });
    }

    const existingKeys = new Set(existingItems.flatMap((item) => itemScopeKeys(item)));
    const seeds = seedDetailedAreaLines({ siteWorks, workSubcategories: db.master.workSubcategories });
    for (const seed of seeds) {
      const seedPairs = seed.option_pairs?.length
        ? seed.option_pairs
        : [{ subcategory_id: seed.subcategory_id, work_type_id: seed.work_type_id }];
      if (seedPairs.every((pair) => existingKeys.has([seed.area_id, pair.subcategory_id || "", pair.work_type_id || ""].join("::")))) continue;
      const group = map.get(seed.area_id);
      if (!group) continue;
      const measured = measuredQuantity(seed.measure, dimensions(group), seed.walls);
      group.lines.push({
        key: draftKey("seed"),
        category_id: seed.category_id,
        subcategory_id: seed.subcategory_id,
        work_type_id: seed.work_type_id,
        option_pairs: seed.option_pairs as OptionPair[] | undefined,
        target_work_required_id: seed.work_required_id,
        measure: seed.measure,
        walls: seed.walls,
        quantity: measured.quantity > 0 ? String(round(measured.quantity)) : "",
        seeded: true,
        manualQuantity: false,
      });
    }

    const rows = [...map.values()];
    const firstWithWork = rows.find((group) =>
      group.lines.length > 0 || existingItems.some((item) => item.area_id === group.area_id),
    );
    const first = firstWithWork || rows[0];
    if (first) first.open = true;
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
      removedItemIds: [],
      removedSelections: [],
    }];
  }, [areas, db.master.workSubcategories, existingItems, siteWorks]);

  const [groups, setGroups] = React.useState<AreaGroup[]>(buildGroups);

  const freshLine = React.useCallback((group: AreaGroup): DraftLine => {
    const subcategoryId = (workRequired.work_subcategory_ids || [])[0];
    const measure = measureFor(subcategoryId);
    const measured = measuredQuantity(measure, dimensions(group), 1);
    return {
      key: draftKey("work"),
      category_id: workRequired.work_category_id,
      subcategory_id: subcategoryId,
      work_type_id: subcategoryId ? workTypesFor(subcategoryId)[0]?.id : undefined,
      target_work_required_id: workRequired.id,
      measure,
      walls: 1,
      quantity: measured.quantity > 0 ? String(round(measured.quantity)) : "",
      manualQuantity: false,
    };
  }, [measureFor, workRequired, workTypesFor]);

  const updateGroup = (key: string, patch: Partial<AreaGroup>) => setGroups((current) => current.map((group) => {
    if (group.key !== key) return group;
    const next = { ...group, ...patch };
    const dims = dimensions(next);
    next.lines = next.lines.map((line) => {
      if (line.manualQuantity) return line;
      const measured = measuredQuantity(line.measure, dims, line.walls);
      return { ...line, quantity: measured.quantity > 0 ? String(round(measured.quantity)) : "" };
    });
    return next;
  }));

  const updateDimensions = (key: string, nextDimensions: CustomerAreaDimensionsDraft) =>
    updateGroup(key, nextDimensions);

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
            const measured = measuredQuantity(next.measure, dimensions(group), next.walls);
            next.quantity = measured.quantity > 0 ? String(round(measured.quantity)) : "";
          }
          return next;
        }
        if ((patch.measure !== undefined || patch.walls !== undefined) && !next.manualQuantity) {
          const measured = measuredQuantity(next.measure, dimensions(group), next.walls);
          next.quantity = measured.quantity > 0 ? String(round(measured.quantity)) : "";
        }
        return next;
      }),
    };
  }));

  const addLine = (groupKey: string) => setGroups((current) => current.map((group) =>
    group.key === groupKey ? { ...group, open: true, lines: [...group.lines, freshLine(group)] } : group,
  ));

  const removeDraftLine = (groupKey: string, lineKey: string) => setGroups((current) => current.map((group) => {
    if (group.key !== groupKey) return group;
    const line = group.lines.find((candidate) => candidate.key === lineKey);
    if (!line) return group;
    const removedSelections = line.seeded && group.area_id
      ? [
          ...group.removedSelections,
          ...pairsForLine(line).map((pair) => ({
            work_required_id: line.target_work_required_id || workRequired.id,
            area_id: group.area_id!,
            subcategory_id: pair.subcategory_id,
            work_type_id: pair.work_type_id,
          })),
        ]
      : group.removedSelections;
    return { ...group, removedSelections, lines: group.lines.filter((candidate) => candidate.key !== lineKey) };
  }));

  const editSavedItem = (groupKey: string, item: LineItem) => {
    setGroups((current) => current.map((group) => {
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
          option_pairs: item.option_pairs as OptionPair[] | undefined,
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
    scrollEditDraftIntoView(item.id);
  };

  const scrollEditDraftIntoView = (itemId: string, tries = 6) => requestAnimationFrame(() => {
    const node = document.getElementById(`customer-work-edit-${itemId}`);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (tries > 0) scrollEditDraftIntoView(itemId, tries - 1);
  });

  const toggleSavedRemoval = (groupKey: string, itemId: string) => setGroups((current) => current.map((group) => {
    if (group.key !== groupKey) return group;
    return {
      ...group,
      removedItemIds: group.removedItemIds.includes(itemId)
        ? group.removedItemIds.filter((id) => id !== itemId)
        : [...group.removedItemIds, itemId],
    };
  }));

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
      removedItemIds: [],
      removedSelections: [],
    },
  ]);

  const removeAreaGroup = (groupKey: string) => setGroups((current) => current.flatMap((group) => {
    if (group.key !== groupKey) return [group];
    if (group.create_area) return [];
    const saved = existingItems.filter((item) => item.area_id === group.area_id).map((item) => item.id);
    const planned = group.lines
      .filter((line) => line.seeded && group.area_id)
      .flatMap((line) => pairsForLine(line).map((pair) => ({
        work_required_id: line.target_work_required_id || workRequired.id,
        area_id: group.area_id!,
        subcategory_id: pair.subcategory_id,
        work_type_id: pair.work_type_id,
      })));
    return [{
      ...group,
      lines: [],
      removedItemIds: [...new Set([...group.removedItemIds, ...saved])],
      removedSelections: [...group.removedSelections, ...planned],
      open: true,
    }];
  }));

  const addAlternative = (groupKey: string, lineKey: string, composite: string) => {
    const [subcategoryId, workTypeId] = composite.split("::");
    if (!subcategoryId) return;
    setGroups((current) => current.map((group) => {
      if (group.key !== groupKey) return group;
      return {
        ...group,
        lines: group.lines.map((line) => {
          if (line.key !== lineKey || !line.subcategory_id) return line;
          const unique = new Map(
            [...pairsForLine(line), { subcategory_id: subcategoryId, work_type_id: workTypeId || undefined }]
              .map((pair) => [`${pair.subcategory_id}::${pair.work_type_id || ""}`, pair]),
          );
          const optionPairs = [...unique.values()];
          return { ...line, option_pairs: optionPairs.length > 1 ? optionPairs : undefined };
        }),
      };
    }));
  };

  const removeAlternative = (groupKey: string, lineKey: string, index: number) => setGroups((current) => current.map((group) => {
    if (group.key !== groupKey) return group;
    return {
      ...group,
      lines: group.lines.map((line) => {
        if (line.key !== lineKey) return line;
        const pairs = pairsForLine(line).filter((_, pairIndex) => pairIndex !== index);
        if (!pairs.length) return line;
        const primary = pairs[0];
        return {
          ...line,
          subcategory_id: primary.subcategory_id,
          work_type_id: primary.work_type_id,
          measure: measureFor(primary.subcategory_id),
          option_pairs: pairs.length > 1 ? pairs : undefined,
        };
      }),
    };
  }));

  const groupIssue = (group: AreaGroup) => {
    if (!group.create_area) return undefined;
    if (!group.area_name.trim()) return "Name this new Area.";
    if (areas.some((area) => !area.is_archived && normalizeName(area.name) === normalizeName(group.area_name))) {
      return `“${group.area_name.trim()}” already exists. Add work inside the existing Area instead.`;
    }
    return undefined;
  };

  const lineIssue = (group: AreaGroup, line: DraftLine) => {
    if (groupIssue(group)) return groupIssue(group);
    if (!line.category_id) return "Choose a category.";
    if (!line.subcategory_id) return "Choose a subcategory.";
    if (!(Number(line.quantity) > 0)) return "Enter Area dimensions or a direct quantity.";
    return undefined;
  };

  const editingIds = new Set(groups.flatMap((group) => group.lines.flatMap((line) => line.editOfItemId ? [line.editOfItemId] : [])));
  const removedIds = new Set(groups.flatMap((group) => group.removedItemIds));
  const liveExistingKeys = new Set(
    existingItems
      .filter((item) => !removedIds.has(item.id) && !editingIds.has(item.id))
      .flatMap((item) => itemScopeKeys(item)),
  );

  const duplicateLineKeys = new Set<string>();
  const draftScopeKeys = new Set<string>();
  for (const group of groups) {
    const areaKey = group.area_id || (group.create_area && group.area_name.trim() ? `new:${normalizeName(group.area_name)}` : "");
    for (const line of group.lines) {
      const keys = pairsForLine(line).map((pair) => [areaKey, pair.subcategory_id, pair.work_type_id || ""].join("::"));
      if (areaKey && keys.some((key) => liveExistingKeys.has(key) || draftScopeKeys.has(key))) duplicateLineKeys.add(line.key);
      keys.forEach((key) => areaKey && draftScopeKeys.add(key));
    }
  }

  const validEntries = groups.flatMap((group) => group.lines
    .filter((line) => !lineIssue(group, line) && !duplicateLineKeys.has(line.key))
    .map((line) => ({ group, line })));

  const areaDims = groups.flatMap((group) => {
    if (groupIssue(group)) return [];
    const next = normalizeAreaDimensions(group);
    if (!next.length && !next.breadth && !next.height) return [];
    if (group.create_area) {
      if (!validEntries.some((entry) => entry.group.key === group.key)) return [];
      return [{
        create_area: true,
        area_name: group.area_name.trim(),
        area_type: group.area_type,
        length_ft: next.length,
        breadth_ft: next.breadth,
        height_ft: next.height,
      }];
    }
    const source = areas.find((area) => area.id === group.area_id);
    if (!source) return [];
    const before = [positiveDimension(source.length), positiveDimension(source.width), positiveDimension(source.height)];
    const after = [next.length, next.breadth, next.height];
    if (after.every((value, index) => value === before[index])) return [];
    return [{
      area_id: group.area_id,
      length_ft: next.length,
      breadth_ft: next.breadth,
      height_ft: next.height,
    }];
  });

  const removedItemIds = [...new Set(groups.flatMap((group) => group.removedItemIds))];
  const removedSelections = groups.flatMap((group) => group.removedSelections);
  const editedIds = validEntries.flatMap(({ line }) => line.editOfItemId ? [line.editOfItemId] : []);
  const skippedLines = groups.reduce((sum, group) => sum + group.lines.length, 0) - validEntries.length;
  const canSave = validEntries.length > 0 || removedItemIds.length > 0 || removedSelections.length > 0 || areaDims.length > 0;

  const lineEstimate = (line: DraftLine) => {
    const rate = rateFor(line.subcategory_id, line.work_type_id);
    return { rate, amount: rate ? round((Number(line.quantity) || 0) * rate) : 0 };
  };
  const estimateTotal = validEntries.reduce((sum, entry) => sum + lineEstimate(entry.line).amount, 0);

  const save = () => {
    if (!canSave) return;
    const payloadLines: CaptureLine[] = validEntries.map(({ group, line }) => {
      const measured = measuredQuantity(line.measure, dimensions(group), line.walls);
      const normalized = normalizeAreaDimensions(group);
      return {
        site_id: site.id,
        area_id: group.area_id,
        area_name: group.create_area ? group.area_name.trim() : undefined,
        create_area: group.create_area,
        area_type: group.area_type,
        category_id: line.category_id!,
        subcategory_id: line.subcategory_id!,
        work_type_id: line.work_type_id,
        option_pairs: line.option_pairs as NonNullable<LineItem["option_pairs"]> | undefined,
        target_work_required_id: line.target_work_required_id,
        length_ft: normalized.length,
        breadth_ft: normalized.breadth,
        height_ft: line.measure === "length" ? undefined : normalized.height,
        floor_area: normalized.length && normalized.breadth ? round(normalized.length * normalized.breadth) : undefined,
        quantity: Number(line.quantity) > 0 ? Number(line.quantity) : measured.quantity,
        unit_id: measured.unit,
        notes: line.notes?.trim() || undefined,
      };
    });

    try {
      captureStructuredWorkRequired(workRequired.id, payloadLines, {
        removedItemIds: [...new Set([...removedItemIds, ...editedIds])],
        removedSelections,
        areaDims,
      });
      commitBatches();
      const parts = [
        payloadLines.length ? `${payloadLines.length} work item${payloadLines.length === 1 ? "" : "s"}` : "",
        areaDims.length ? `${areaDims.length} Area dimension update${areaDims.length === 1 ? "" : "s"}` : "",
        removedItemIds.length + removedSelections.length ? `${removedItemIds.length + removedSelections.length} removal${removedItemIds.length + removedSelections.length === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      toast.success(`Saved ${parts.join(" · ") || "Customer scope"} for ${site.name}.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Detailed work could not be captured.");
    }
  };

  const labelPair = (pair: OptionPair) => {
    const subcategory = db.master.workSubcategories.find((row) => row.id === pair.subcategory_id);
    const workType = pair.work_type_id && subcategory
      ? workTypesForSubcategory(subcategory).find((row) => row.id === pair.work_type_id)
      : undefined;
    return `${subcategory?.name || "Work"}${workType ? ` · ${workType.name}` : ""}`;
  };

  const renderLine = (group: AreaGroup, line: DraftLine) => {
    const subcategories = line.category_id
      ? db.master.workSubcategories.filter((row) => row.category_id === line.category_id)
      : [];
    const workTypes = workTypesFor(line.subcategory_id);
    const pairs = pairsForLine(line);
    const pairKeys = new Set(pairs.map((pair) => `${pair.subcategory_id}::${pair.work_type_id || ""}`));
    const candidateOptions = line.category_id
      ? db.master.workSubcategories
          .filter((row) => row.category_id === line.category_id)
          .flatMap((subcategory) => workTypesForSubcategory(subcategory).map((workType) => ({
            value: `${subcategory.id}::${workType.id}`,
            label: `${subcategory.name} · ${workType.name}`,
          })))
          .filter((candidate) => !pairKeys.has(candidate.value))
      : [];
    const issue = lineIssue(group, line);
    const duplicate = duplicateLineKeys.has(line.key);
    const estimate = lineEstimate(line);

    return (
      <div
        key={line.key}
        id={line.editOfItemId ? `customer-work-edit-${line.editOfItemId}` : undefined}
        className={cn(
          "rounded-md border p-2.5",
          issue || duplicate ? "border-destructive/40 bg-destructive/[0.04]" : line.editOfItemId ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            {line.editOfItemId ? "Editing captured work" : line.seeded ? "Planned work" : "Work item"}
          </span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeDraftLine(group.key, line.key)} aria-label="Remove draft work item"><X className="h-3.5 w-3.5" /></Button>
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
          <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Measurement basis
            <select value={line.measure} onChange={(event) => updateLine(group.key, line.key, { measure: event.target.value as WorkMeasureBasis })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground">
              {MEASURE_OPTIONS.map((basis) => <option key={basis} value={basis}>{WORK_MEASURE_LABELS[basis]}</option>)}
            </select>
          </label>
          {line.measure === "length" && <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Walls
            <select value={line.walls} onChange={(event) => updateLine(group.key, line.key, { walls: event.target.value === "2" ? 2 : 1 })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground"><option value="1">1 wall (L)</option><option value="2">2 walls (L+B)</option></select>
          </label>}
          <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">{WORK_MEASURE_LABELS[line.measure]}
            <Input type="number" min="0" step="any" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(group.key, line.key, { quantity: event.target.value })} className="h-8 text-xs font-normal" placeholder="Auto from Area dimensions" />
          </label>
          <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground sm:col-span-3">Notes
            <Input value={line.notes || ""} onChange={(event) => updateLine(group.key, line.key, { notes: event.target.value })} className="h-8 text-xs font-normal" placeholder="Finish, preference, openings, deductions or scope note" />
          </label>
        </div>

        {pairs.length > 0 && (
          <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Alternatives · customer takes any one · one shared measurement</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pairs.map((pair, index) => {
                const rate = rateFor(pair.subcategory_id, pair.work_type_id);
                return <span key={`${pair.subcategory_id}::${pair.work_type_id || ""}`} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]", index === 0 ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-card")}>
                  <span>{labelPair(pair)}{rate ? ` · ≈ ${formatINR(rate)}/${line.measure === "length" ? "rft" : "sqft"}` : ""}</span>
                  {pairs.length > 1 && <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={() => removeAlternative(group.key, line.key, index)} aria-label={`Remove option ${labelPair(pair)}`}><X className="h-2.5 w-2.5" /></button>}
                </span>;
              })}
            </div>
            {candidateOptions.length > 0 && <select defaultValue="" onChange={(event) => {
              if (event.target.value) addAlternative(group.key, line.key, event.target.value);
              event.currentTarget.value = "";
            }} className="mt-2 h-8 w-full rounded-md border border-input bg-card px-2 text-xs">
              <option value="">＋ Add subcategory / work type alternative</option>
              {candidateOptions.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
            </select>}
          </div>
        )}

        <p className="mt-2 text-[10px] text-muted-foreground">
          {estimate.rate ? `Live contractor-rate estimate ≈ ${formatINR(estimate.rate)}/${line.measure === "length" ? "rft" : "sqft"} · ${formatINR(estimate.amount)}` : "No contractor rate is available for this work type."}
        </p>
        {(issue || duplicate) && <p className="mt-1 text-[11px] text-destructive">{duplicate ? "This Area / work-type scope already exists. Edit the captured item instead." : issue}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="Capture detailed area" className="relative max-h-[96vh] w-full max-w-4xl overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex min-w-0 items-center justify-between border-b border-border px-5 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-bold"><ListChecks className="h-4 w-4 shrink-0 text-primary" />Capture detailed area</h3>
            <p className="text-[11px] text-muted-foreground">{site.name} · canonical Customer Area / Work Required workflow</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="rd-scroll max-h-[60vh] space-y-2 overflow-y-auto overflow-x-hidden px-5 py-4">
          <p className="text-xs text-muted-foreground">Every Site Area reuses one L/B/H source. Each work item chooses its measurement basis; direct quantity overrides dimensions. Alternative work types stay on one measured decision, and valid rows can be saved even while incomplete rows remain untouched.</p>
          <EntityFilesCard entityType="workRequired" entityId={workRequired.id} title="Requirement files" manage allowDetach={false} registerBatch={registerBatch} />

          {groups.map((group) => {
            const savedItems = existingItems.filter((item) => item.area_id === group.area_id);
            const activeSaved = savedItems.filter((item) => !group.removedItemIds.includes(item.id));
            const issue = groupIssue(group);
            const groupEstimate = group.lines.reduce((sum, line) => sum + lineEstimate(line).amount, 0)
              + activeSaved.reduce((sum, item) => sum + (item.amount || 0), 0);
            return (
              <section key={group.key} className={cn("overflow-hidden rounded-lg border bg-muted/20", issue ? "border-destructive/40" : "border-border")}>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <button type="button" onClick={() => updateGroup(group.key, { open: !group.open })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !group.open && "-rotate-90")} />
                    <span className="min-w-0"><span className="block truncate text-sm font-bold">{group.area_name || "New Area"}</span><span className="block text-[10px] text-muted-foreground">{activeSaved.length + group.lines.length} work item(s){groupEstimate ? ` · ≈ ${formatINR(groupEstimate)}` : ""}</span></span>
                  </button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => addLine(group.key)}><Plus className="mr-1 h-3 w-3" />Add work</Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeAreaGroup(group.key)} aria-label={`Clear ${group.area_name || "new Area"}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>

                {group.open && <div className="space-y-3 border-t border-border bg-background px-3 py-3">
                  {group.create_area && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Area name
                      <Input value={group.area_name} onChange={(event) => updateGroup(group.key, { area_name: event.target.value })} className="h-8 text-xs font-normal" placeholder="e.g. Kitchen 2" />
                    </label>
                    <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Area type
                      <select value={group.area_type} onChange={(event) => updateGroup(group.key, { area_type: event.target.value as AreaType })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal text-foreground">
                        {AREA_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>}

                  <div className="rounded-md border border-dashed border-border bg-muted/20 p-2.5">
                    <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Area dimensions · single Customer source</p>
                    <CustomerAreaDimensionsFields value={group} onChange={(next) => updateDimensions(group.key, next)} />
                  </div>

                  {savedItems.length > 0 && <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Captured work</p>
                    {savedItems.map((item) => {
                      const editing = group.lines.find((line) => line.editOfItemId === item.id);
                      if (editing) return <React.Fragment key={item.id}>{renderLine(group, editing)}</React.Fragment>;
                      const removed = group.removedItemIds.includes(item.id);
                      return <div key={item.id} className={cn("flex items-center justify-between gap-2 rounded-md border px-2.5 py-2", removed ? "border-destructive/30 bg-destructive/[0.04] opacity-70" : "border-border bg-card")}>
                        <div className="min-w-0"><p className="truncate text-xs font-semibold">{item.title}</p><p className="text-[10px] text-muted-foreground">{item.quantity} {item.unit_name || item.unit_id || ""}{item.amount ? ` · ${formatINR(item.amount)}` : ""}</p></div>
                        <div className="flex shrink-0 gap-1">
                          {!removed && <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => editSavedItem(group.key, item)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>}
                          <Button size="sm" variant="outline" className={cn("h-6 px-2 text-[10px]", !removed && "text-destructive hover:text-destructive")} onClick={() => toggleSavedRemoval(group.key, item.id)}>{removed ? <><Undo2 className="mr-1 h-3 w-3" />Undo</> : <><Trash2 className="mr-1 h-3 w-3" />Remove</>}</Button>
                        </div>
                      </div>;
                    })}
                  </div>}

                  <div className="space-y-2">{group.lines.filter((line) => !line.editOfItemId).map((line) => renderLine(group, line))}</div>
                  {!savedItems.length && !group.lines.length && <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">No work in this Area. Add work to create the first measured item.</p>}
                  {issue && <p className="text-[11px] text-destructive">{issue}</p>}
                </div>}
              </section>
            );
          })}

          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addArea}><Plus className="mr-1 h-3.5 w-3.5" />Add Area</Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
          <span className="min-w-0 text-[11px] text-muted-foreground">
            {canSave
              ? `${validEntries.length} valid work item(s)${estimateTotal ? ` · ≈ ${formatINR(estimateTotal)}` : ""}${areaDims.length ? ` · ${areaDims.length} Area dimension update(s)` : ""}${removedItemIds.length + removedSelections.length ? ` · ${removedItemIds.length + removedSelections.length} removal(s)` : ""}${skippedLines ? ` · ${skippedLines} incomplete/duplicate row(s) left untouched` : ""}`
              : "All current work is already saved, or no complete change is ready."}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!canSave} onClick={save}>{validEntries.length ? `Capture ${validEntries.length} work item(s)` : areaDims.length ? "Save Area dimensions" : "Apply removals"}<CheckCircle2 className="ml-1.5 h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
