"use client";
import { workSubcategoryCategoryIds } from "@/lib/rdash/work-types";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Area, Priority, RDashDatabase, Site } from "@/lib/rdash/types";
import { isActiveWorkTaxonomy, pruneWorkTypeIds, subcategoriesWithSelectedWorkTypes, withPrimaryWorkTypeIds, workRequiredTitleFromSelection, workTypesForSubcategory } from "@/lib/rdash/work-types";
import { useRDashStore } from "@/lib/rdash/store";
import { AREA_TYPES } from "./customer-sites-form-model";
import { AddWorkCategoryAction, AddWorkSubcategoryAction, AddWorkTypeAction } from "./WorkTaxonomyQuickAdd";
import { MultiTickDropdown } from "./MultiTickDropdown";

export type WorkRequiredFormDraft = {
  title: string;
  categoryIds: string[];
  subcategoryIds: string[];
  workTypeIds: string[];
  areaIds: string[];
  description: string;
  priority: Priority;
  budget: string;
};

type NewWorkArea = {
  name: string;
  areaType: Area["area_type"];
  notes: string;
};

export function emptyWorkRequiredFormDraft(): WorkRequiredFormDraft {
  return {
    title: "",
    categoryIds: [],
    subcategoryIds: [],
    workTypeIds: [],
    areaIds: [],
    description: "",
    priority: "medium",
    budget: "",
  };
}

export function WorkRequiredFields({
  db,
  site,
  areas,
  value,
  onChange,
  onCreateArea,
  onUpdateArea,
  onDeleteArea,
  onAddNext,
}: {
  db: RDashDatabase;
  site?: Pick<Site, "id" | "name">;
  areas: Array<Pick<Area, "id" | "name"> & { area_type?: Area["area_type"]; areaType?: Area["area_type"] }>;
  value: WorkRequiredFormDraft;
  onChange: (patch: Partial<WorkRequiredFormDraft>) => void;
  onCreateArea: (area: NewWorkArea) => string;
  onUpdateArea?: (areaId: string, name: string) => void;
  onDeleteArea?: (areaId: string) => void;
  onAddNext?: (mode: "areas" | "copy") => void;
}) {
  const [addCategoryOpen, setAddCategoryOpen] = React.useState(false);
  const [addSubcategoryCategoryId, setAddSubcategoryCategoryId] = React.useState<string | null>(null);
  const [addWorkTypeSubcategoryId, setAddWorkTypeSubcategoryId] = React.useState<string | null>(null);
  const [newAreaOpen, setNewAreaOpen] = React.useState(false);
  const [newAreaTypes, setNewAreaTypes] = React.useState<Area["area_type"][]>([]);
  const [customAreaTypes, setCustomAreaTypes] = React.useState<Array<{ value: string; label: string }>>([]);
  const [customAreaType, setCustomAreaType] = React.useState("");
  const [newAreaNotes, setNewAreaNotes] = React.useState("");
  const categories = db.master.workCategories.filter((row) => isActiveWorkTaxonomy(row) || value.categoryIds.includes(row.id));
  const subcategories = db.master.workSubcategories.filter((row) =>
    workSubcategoryCategoryIds(row).some((id) => value.categoryIds.includes(id))
    && (isActiveWorkTaxonomy(row) || value.subcategoryIds.includes(row.id)));
  const subcategoryGroups = value.categoryIds.flatMap((categoryId) => {
    const category = db.master.workCategories.find((row) => row.id === categoryId);
    if (!category) return [];
    return [{
      key: category.id,
      items: subcategories
        .filter((subcategory) => workSubcategoryCategoryIds(subcategory).includes(category.id)
          && (value.subcategoryIds.includes(subcategory.id) || isActiveWorkTaxonomy(category)))
        .map((subcategory) => ({ id: subcategory.id, name: `${category.name} · ${subcategory.name}` })),
      footer: isActiveWorkTaxonomy(category) ? (close: () => void) => (
        <button
          type="button"
          className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent/40"
          onClick={() => {
            close();
            setAddSubcategoryCategoryId(category.id);
          }}
        >
          + Add subcategory to {category.name}
        </button>
      ) : undefined,
    }];
  });
  const selectedWorkTypes = value.subcategoryIds.flatMap((subcategoryId) => {
    const subcategory = db.master.workSubcategories.find((row) => row.id === subcategoryId);
    const category = subcategory && db.master.workCategories.find((row) => workSubcategoryCategoryIds(subcategory).includes(row.id) && value.categoryIds.includes(row.id) && isActiveWorkTaxonomy(row));
    const canSelectNewWorkTypes = isActiveWorkTaxonomy(category) && isActiveWorkTaxonomy(subcategory);
    return subcategory ? workTypesForSubcategory(subcategory)
      .filter((workType) => value.workTypeIds.includes(workType.id) || (canSelectNewWorkTypes && isActiveWorkTaxonomy(workType)))
      .map((workType) => ({ subcategory, workType })) : [];
  });
  const workTypeGroups = value.subcategoryIds.flatMap((subcategoryId) => {
    const subcategory = db.master.workSubcategories.find((row) => row.id === subcategoryId);
    if (!subcategory) return [];
    const category = db.master.workCategories.find((row) => workSubcategoryCategoryIds(subcategory).includes(row.id) && value.categoryIds.includes(row.id) && isActiveWorkTaxonomy(row));
    const canSelectNewWorkTypes = isActiveWorkTaxonomy(category) && isActiveWorkTaxonomy(subcategory);
    return [{
      key: subcategory.id,
      items: workTypesForSubcategory(subcategory).filter((workType) => value.workTypeIds.includes(workType.id) || (canSelectNewWorkTypes && isActiveWorkTaxonomy(workType))).map((workType) => ({
        id: workType.id,
        name: `${subcategory.name} · ${workType.name}`,
      })),
      // Per-group add row: with several subcategories ticked the target of
      // "+ Add work type" is the group it sits in — no ambiguity.
      footer: canSelectNewWorkTypes ? (close: () => void) => (
        <button
          type="button"
          className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent/40"
          aria-label={`Add work type to ${subcategory.name}`}
          onClick={() => {
            close();
            setAddWorkTypeSubcategoryId(subcategory.id);
          }}
        >
          + Add work type
        </button>
      ) : undefined,
    }];
  });
  const toggleWorkType = (workType: { id: string }) => {
    const selected = value.workTypeIds.includes(workType.id);
    const workTypeIds = selected
      ? value.workTypeIds.filter((id) => id !== workType.id)
      : [...value.workTypeIds, workType.id];
    const subcategoryIds = selected
      ? subcategoriesWithSelectedWorkTypes(db.master.workSubcategories, value.subcategoryIds, workTypeIds)
      : value.subcategoryIds;
    const retainedCategoryIds = new Set(db.master.workSubcategories
      .filter((subcategory) => subcategoryIds.includes(subcategory.id))
      .flatMap(workSubcategoryCategoryIds));
    const categoryIds = selected
      ? value.categoryIds.filter((categoryId) => retainedCategoryIds.has(categoryId))
      : value.categoryIds;
    // The title IS the selection (quotation line label): re-derive on every
    // work-type change so the quotation always quotes what is ticked.
    onChange({
      categoryIds,
      subcategoryIds,
      workTypeIds,
      title: workRequiredTitleFromSelection(db.master.workSubcategories, subcategoryIds, workTypeIds),
    });
  };
  const areaTypeOptions = [
    ...AREA_TYPES,
    ...areas.map((area) => {
      const value = area.area_type || area.areaType || "other";
      return { value, label: value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) };
    }),
    ...customAreaTypes,
  ].filter((option, index, all) => all.findIndex((row) => row.value === option.value) === index);

  const createAreas = () => {
    if (!newAreaTypes.length) return;
    const areaIds = newAreaTypes.map((areaType) => onCreateArea({
      name: areaTypeOptions.find((option) => option.value === areaType)?.label || areaType,
      areaType,
      notes: newAreaNotes.trim(),
    }));
    onChange({ areaIds: [...new Set([...value.areaIds, ...areaIds])] });
    setNewAreaTypes([]);
    setNewAreaNotes("");
    setNewAreaOpen(false);
  };

  const addCustomAreaType = () => {
    const label = customAreaType.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    setCustomAreaTypes((current) => [...current.filter((row) => row.value !== value), { value, label }]);
    setNewAreaTypes((current) => [...new Set([...current, value])]);
    setCustomAreaType("");
  };

  return (
    <div className="grid gap-3">
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Covered Areas</span>
          <div className="flex flex-wrap justify-end gap-1">
            {areas.length ? <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange({ areaIds: areas.map((area) => area.id) })}>Select all</Button> : null}
            {value.areaIds.length ? <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange({ areaIds: [] })}>Clear</Button> : null}
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNewAreaOpen((current) => !current)}>
              <Plus className="mr-1 h-3 w-3" />{newAreaOpen ? "Close" : "Add Area"}
            </Button>
          </div>
        </div>
        {newAreaOpen ? (
          <div className="mt-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3">
            <p className="text-xs font-semibold">Add Areas to {site?.name || "this Customer"}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Select one or more Area types. Their names can be edited below.</p>
            <div className="mt-2 grid gap-2">
              <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-3">
                {areaTypeOptions.map((option) => <label key={option.value} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={newAreaTypes.includes(option.value)} onChange={() => setNewAreaTypes((current) => current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value])} />{option.label}</label>)}
              </div>
              <div className="flex gap-2">
                <Input value={customAreaType} onChange={(event) => setCustomAreaType(event.target.value)} placeholder="New area type" className="h-9" />
                <Button type="button" size="sm" variant="outline" onClick={addCustomAreaType} disabled={!customAreaType.trim()}>Add area type</Button>
              </div>
              <label>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Area notes</span>
                <Input value={newAreaNotes} onChange={(event) => setNewAreaNotes(event.target.value)} placeholder="Optional area-specific notes" className="mt-1 h-9" />
              </label>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={createAreas} disabled={!newAreaTypes.length}><Plus className="mr-1 h-3.5 w-3.5" />Add selected Areas</Button>
              </div>
            </div>
          </div>
        ) : null}
        {areas.length ? (
          <div className="mt-1 grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {areas.map((area) => (
              <div key={area.id} className="flex items-center gap-1 rounded px-1 py-1 text-xs hover:bg-accent/50">
                <input
                  type="checkbox"
                  aria-label={`Include Area ${area.name}`}
                  checked={value.areaIds.includes(area.id)}
                  onChange={() => onChange({ areaIds: value.areaIds.includes(area.id) ? value.areaIds.filter((id) => id !== area.id) : [...value.areaIds, area.id] })}
                />
                <Input id={`area-name-${area.id}`} value={area.name} onChange={(event) => onUpdateArea?.(area.id, event.target.value)} readOnly={!onUpdateArea} className="h-7 min-w-0 text-xs" aria-label={`Area name ${area.name}`} />
                {onDeleteArea ? <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" onClick={() => onDeleteArea(area.id)} aria-label={`Delete Area ${area.name}`}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
              </div>
            ))}
          </div>
        ) : <p className="mt-1 rounded-md border border-dashed border-warning/40 bg-warning/[0.04] px-3 py-2 text-xs text-muted-foreground">Add an Area here when the work location is known.</p>}
      </div>

      <div className="rounded-md border border-border p-3">
        <p className="text-xs font-semibold">Work selection</p>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Tick every required category, subcategory, and work type.</p>
          <a href="/workspace/masters" className="text-[11px] font-medium text-primary hover:underline">Manage catalogue</a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Work Categories</span>
          <div className="mt-1">
            <MultiTickDropdown
              ariaLabel="Work categories"
              selected={value.categoryIds}
              groups={categories.map((category) => ({ key: category.id, items: [{ id: category.id, name: `${category.name}${isActiveWorkTaxonomy(category) ? "" : " (Archived)"}` }] }))}
              inline
              searchable
              placeholder="Select work category"
              onToggle={(categoryId) => {
                const selected = value.categoryIds.includes(categoryId);
                const categoryIds = selected ? value.categoryIds.filter((id) => id !== categoryId) : [...value.categoryIds, categoryId];
                const subcategoryIds = value.subcategoryIds.filter((id) => {
                  const subcategory = db.master.workSubcategories.find((row) => row.id === id);
                  return Boolean(subcategory && workSubcategoryCategoryIds(subcategory).some((id) => categoryIds.includes(id)));
                });
                const workTypeIds = withPrimaryWorkTypeIds(
                  db.master.workSubcategories,
                  subcategoryIds,
                  pruneWorkTypeIds(db.master.workSubcategories, subcategoryIds, value.workTypeIds),
                );
                setAddCategoryOpen(false);
                setAddSubcategoryCategoryId(null);
                onChange({
                  categoryIds,
                  subcategoryIds,
                  workTypeIds,
                  title: workRequiredTitleFromSelection(db.master.workSubcategories, subcategoryIds, workTypeIds),
                });
              }}
              footer={(close) => (
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent/40"
                  onClick={() => {
                    close();
                    setAddCategoryOpen(true);
                  }}
                >
                  + Add category
                </button>
              )}
            />
          </div>
          {addCategoryOpen ? (
            <AddWorkCategoryAction
              key="work-required-add-category"
              initiallyAdding
              onCancelled={() => setAddCategoryOpen(false)}
              onCreated={(categoryId) => {
                setAddCategoryOpen(false);
                onChange({ categoryIds: [...new Set([...value.categoryIds, categoryId])] });
              }}
              className="mt-1"
            />
          ) : null}
        </div>
        <div>
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Work Subcategories</span>
          <div className="mt-1">
            <MultiTickDropdown
              key={value.categoryIds.join("|") || "no-category"}
              ariaLabel="Work subcategories"
              selected={value.subcategoryIds}
              groups={subcategoryGroups}
              disabled={!value.categoryIds.length}
              inline
              searchable
              placeholder={value.categoryIds.length ? "Select work subcategories" : "Select categories first"}
              onToggle={(subcategoryId) => {
                const selected = value.subcategoryIds.includes(subcategoryId);
                const subcategoryIds = selected ? value.subcategoryIds.filter((id) => id !== subcategoryId) : [...value.subcategoryIds, subcategoryId];
                const retainedWorkTypeIds = pruneWorkTypeIds(db.master.workSubcategories, subcategoryIds, value.workTypeIds);
                const addedSubcategory = db.master.workSubcategories.find((row) => row.id === subcategoryId);
                const addedWorkTypeIds = selected || !addedSubcategory
                  ? []
                  : workTypesForSubcategory(addedSubcategory).filter(isActiveWorkTaxonomy).slice(0, 1).map((row) => row.id);
                const workTypeIds = [...new Set([...retainedWorkTypeIds, ...addedWorkTypeIds])];
                const title = workRequiredTitleFromSelection(db.master.workSubcategories, subcategoryIds, workTypeIds);
                onChange({ subcategoryIds, workTypeIds, title });
              }}
            />
          </div>
          {addSubcategoryCategoryId && value.categoryIds.includes(addSubcategoryCategoryId) ? (
            <AddWorkSubcategoryAction
              key={`work-required-add-subcategory-${addSubcategoryCategoryId}`}
              categoryId={addSubcategoryCategoryId}
              initiallyAdding
              onCancelled={() => setAddSubcategoryCategoryId(null)}
              onCreated={(subcategoryId) => {
                setAddSubcategoryCategoryId(null);
                // The db prop is one render behind the master store here
                // (AddWorkSubcategoryAction just mutated it) — derive from
                // the fresh store state so the new subcategory is included.
                const master = useRDashStore.getState().db.master;
                const subcategoryIds = [...new Set([...value.subcategoryIds, subcategoryId])];
                const workTypeIds = withPrimaryWorkTypeIds(master.workSubcategories, subcategoryIds, pruneWorkTypeIds(master.workSubcategories, subcategoryIds, value.workTypeIds));
                const title = workRequiredTitleFromSelection(master.workSubcategories, subcategoryIds, workTypeIds);
                onChange({ subcategoryIds, workTypeIds, title });
              }}
            />
          ) : null}
        </div>
        </div>

      {selectedWorkTypes.length ? (
        <div className="mt-3">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Work Types</span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Grade within each selected subcategory, e.g. Kitchen Cabinets (Modular) · Premium.</p>
          {/* ponytail: same tick-dropdown format as subcategories; each group
              carries its own "+ Add work type" row (scoped to that
              subcategory), writing master via AddWorkTypeAction and
              auto-ticking the created grade. */}
          <div className="mt-1">
            <MultiTickDropdown
              key={value.subcategoryIds.join("|")}
              ariaLabel="Work types"
              selected={value.workTypeIds}
              groups={workTypeGroups}
              placeholder="Select work types"
              onToggle={(workTypeId) => toggleWorkType({ id: workTypeId })}
              inline
              searchable
            />
          </div>
          {addWorkTypeSubcategoryId && value.subcategoryIds.includes(addWorkTypeSubcategoryId) ? (
            <AddWorkTypeAction
              key={`work-required-add-work-type-${addWorkTypeSubcategoryId}`}
              subcategoryId={addWorkTypeSubcategoryId}
              initiallyAdding
              onCancelled={() => setAddWorkTypeSubcategoryId(null)}
              onCreated={(workTypeId) => {
                setAddWorkTypeSubcategoryId(null);
                const workTypeIds = [...new Set([...value.workTypeIds, workTypeId])];
                // The title IS the selection: re-derive so the new grade
                // appears in the quotation line label immediately. Read the
                // fresh master from the store — the db prop is one render
                // behind AddWorkTypeAction's mutation within this tick.
                const master = useRDashStore.getState().db.master;
                onChange({
                  workTypeIds,
                  title: workRequiredTitleFromSelection(master.workSubcategories, value.subcategoryIds, workTypeIds),
                });
              }}
            />
          ) : null}
        </div>
      ) : null}
      </div>

      <label>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Work Required title *</span>
        {/* ponytail: the title is derived, not typed — it mirrors the ticked
            work types so quotation line labels always match the selection. */}
        <Input value={value.title} readOnly placeholder="Select a subcategory" className="mt-1 cursor-default bg-muted/30" aria-readonly />
        <span className="mt-0.5 block text-[10px] text-muted-foreground">Auto-filled from the selected work types — this is the line label used in quotations.</span>
      </label>

      <label>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</span>
        <Textarea value={value.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Scope notes, customer preference, access constraints…" rows={3} className="mt-1" />
      </label>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-36">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Priority</span>
            <select value={value.priority} onChange={(event) => onChange({ priority: event.target.value as Priority })} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="w-36">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Budget (₹)</span>
            <Input type="number" min={0} inputMode="numeric" value={value.budget} onChange={(event) => onChange({ budget: event.target.value })} placeholder="e.g. 150000" className="mt-1 h-9 w-full" />
          </label>
        </div>
        {onAddNext ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onAddNext("areas")}><Plus className="mr-1 h-3.5 w-3.5" />Add another using these Areas</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onAddNext("copy")}>Copy this requirement</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
