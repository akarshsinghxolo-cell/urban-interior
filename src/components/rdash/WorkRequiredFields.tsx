"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Area, Priority, RDashDatabase, Site } from "@/lib/rdash/types";
import { AREA_TYPES } from "./customer-sites-form-model";
import { AddWorkCategoryAction, AddWorkSubcategoryAction } from "./WorkTaxonomyQuickAdd";

const ADD_CATEGORY_VALUE = "__add_work_category__";
const ADD_SUBCATEGORY_VALUE = "__add_work_subcategory__";

export type WorkRequiredFormDraft = {
  title: string;
  categoryId: string;
  subcategoryId: string;
  areaIds: string[];
  description: string;
  priority: Priority;
};

export type NewWorkArea = {
  name: string;
  areaType: Area["area_type"];
  notes: string;
};

export function emptyWorkRequiredFormDraft(): WorkRequiredFormDraft {
  return {
    title: "",
    categoryId: "",
    subcategoryId: "",
    areaIds: [],
    description: "",
    priority: "medium",
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
  onAddSubcategory,
  selectedSubcategoryIds = [],
}: {
  db: RDashDatabase;
  site?: Pick<Site, "id" | "name">;
  areas: Array<Pick<Area, "id" | "name"> & { area_type?: Area["area_type"]; areaType?: Area["area_type"] }>;
  value: WorkRequiredFormDraft;
  onChange: (patch: Partial<WorkRequiredFormDraft>) => void;
  onCreateArea: (area: NewWorkArea) => string;
  onUpdateArea?: (areaId: string, name: string) => void;
  onDeleteArea?: (areaId: string) => void;
  onAddNext?: () => void;
  onAddSubcategory?: (subcategoryId: string) => void;
  selectedSubcategoryIds?: string[];
}) {
  const fieldId = React.useId();
  const categorySelectId = `${fieldId}-category`;
  const subcategorySelectId = `${fieldId}-subcategory`;
  const [addCategoryOpen, setAddCategoryOpen] = React.useState(false);
  const [addSubcategoryOpen, setAddSubcategoryOpen] = React.useState(false);
  const [newAreaOpen, setNewAreaOpen] = React.useState(false);
  const [newAreaTypes, setNewAreaTypes] = React.useState<Area["area_type"][]>([]);
  const [customAreaTypes, setCustomAreaTypes] = React.useState<Array<{ value: string; label: string }>>([]);
  const [customAreaType, setCustomAreaType] = React.useState("");
  const [newAreaNotes, setNewAreaNotes] = React.useState("");
  const subcategories = db.master.workSubcategories.filter((row) => row.category_id === value.categoryId);
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={categorySelectId} className="text-[10px] font-semibold uppercase text-muted-foreground">Primary Category</label>
          <select
            id={categorySelectId}
            value={value.categoryId}
            onChange={(event) => {
              if (event.target.value === ADD_CATEGORY_VALUE) {
                setAddCategoryOpen(true);
                return;
              }
              setAddCategoryOpen(false);
              setAddSubcategoryOpen(false);
              onChange({ categoryId: event.target.value, subcategoryId: "", title: "" });
            }}
            className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="">Select work category</option>
            {db.master.workCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            <option value={ADD_CATEGORY_VALUE}>+ Add category</option>
          </select>
          {addCategoryOpen ? (
            <AddWorkCategoryAction
              key="work-required-add-category"
              initiallyAdding
              onCancelled={() => setAddCategoryOpen(false)}
              onCreated={(categoryId) => {
                setAddCategoryOpen(false);
                onChange({ categoryId, subcategoryId: "", title: "" });
              }}
              className="mt-1"
            />
          ) : null}
        </div>
        <div>
          <label htmlFor={subcategorySelectId} className="text-[10px] font-semibold uppercase text-muted-foreground">Primary Subcategory</label>
          {onAddSubcategory ? <details className="relative mt-1">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-input bg-card px-2 text-sm">
              {value.subcategoryId ? db.master.workSubcategories.find((row) => row.id === value.subcategoryId)?.name : value.categoryId ? "Select work subcategories" : "Select category first"}
              {selectedSubcategoryIds.length > 1 ? <span className="ml-auto text-xs text-muted-foreground">+{selectedSubcategoryIds.length - 1}</span> : null}
            </summary>
            {value.categoryId ? <div className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-popover">
              {subcategories.map((subcategory) => {
                const selected = selectedSubcategoryIds.includes(subcategory.id);
                return <label key={subcategory.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/40">
                  <input type="checkbox" checked={selected} onChange={() => {
                    if (selected) return;
                    if (!value.subcategoryId) onChange({ subcategoryId: subcategory.id, title: subcategory.name });
                    else onAddSubcategory(subcategory.id);
                  }} />
                  {subcategory.name}
                </label>;
              })}
              <button type="button" className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent/40" onClick={() => setAddSubcategoryOpen(true)}>+ Add subcategory</button>
            </div> : null}
          </details> : <select
            id={subcategorySelectId}
            value={value.subcategoryId}
            onChange={(event) => {
              const subcategoryId = event.target.value;
              if (subcategoryId === ADD_SUBCATEGORY_VALUE) {
                setAddSubcategoryOpen(true);
                return;
              }
              setAddSubcategoryOpen(false);
              const title = db.master.workSubcategories.find((row) => row.id === subcategoryId)?.name || "";
              onChange({ subcategoryId, title });
            }}
            disabled={!value.categoryId}
            className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{value.categoryId ? "Select work subcategory" : "Select category first"}</option>
            {subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}
            {value.categoryId ? <option value={ADD_SUBCATEGORY_VALUE}>+ Add subcategory</option> : null}
          </select>}
          {addSubcategoryOpen && value.categoryId ? (
            <AddWorkSubcategoryAction
              key={`work-required-add-subcategory-${value.categoryId}`}
              categoryId={value.categoryId}
              initiallyAdding
              onCancelled={() => setAddSubcategoryOpen(false)}
              onCreated={(subcategoryId, subcategoryName) => {
                setAddSubcategoryOpen(false);
                onChange({ subcategoryId, title: subcategoryName });
              }}
            />
          ) : null}
        </div>
      </div>

      <label>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Work Required title *</span>
        <Input value={value.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="Select a subcategory or enter a title" className="mt-1" />
      </label>

      {site ? <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Covered Areas *</span>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNewAreaOpen((current) => !current)}>
            <Plus className="mr-1 h-3 w-3" />{newAreaOpen ? "Close" : "Add Area"}
          </Button>
        </div>
        {newAreaOpen ? (
          <div className="mt-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3">
            <p className="text-xs font-semibold">Add Areas to {site.name}</p>
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
                  checked={value.areaIds.includes(area.id)}
                  onChange={() => onChange({ areaIds: value.areaIds.includes(area.id) ? value.areaIds.filter((id) => id !== area.id) : [...value.areaIds, area.id] })}
                />
                <Input id={`area-name-${area.id}`} value={area.name} onChange={(event) => onUpdateArea?.(area.id, event.target.value)} readOnly={!onUpdateArea} className="h-7 min-w-0 text-xs" aria-label={`Area name ${area.name}`} />
                {onDeleteArea ? <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" onClick={() => onDeleteArea(area.id)} aria-label={`Delete Area ${area.name}`}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
              </div>
            ))}
          </div>
        ) : <p className="mt-1 rounded-md border border-dashed border-warning/40 bg-warning/[0.04] px-3 py-2 text-xs text-muted-foreground">Add an Area here before saving this Work Required.</p>}
      </div> : <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">This Work Required is linked directly to the customer. Choose a Site later to add covered Areas.</p>}

      <label>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</span>
        <Textarea value={value.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Scope notes, customer preference, access constraints…" rows={3} className="mt-1" />
      </label>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="w-36">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Priority</span>
          <select value={value.priority} onChange={(event) => onChange({ priority: event.target.value as Priority })} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </label>
        {onAddNext ? <Button type="button" size="sm" variant="outline" onClick={onAddNext}><Plus className="mr-1 h-3.5 w-3.5" />Add next Work Required</Button> : null}
      </div>
    </div>
  );
}
