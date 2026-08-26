"use client";

import * as React from "react";
import { Plus } from "lucide-react";
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
}: {
  db: RDashDatabase;
  site: Pick<Site, "id" | "name">;
  areas: Array<Pick<Area, "id" | "name">>;
  value: WorkRequiredFormDraft;
  onChange: (patch: Partial<WorkRequiredFormDraft>) => void;
  onCreateArea: (area: NewWorkArea) => string;
}) {
  const fieldId = React.useId();
  const categorySelectId = `${fieldId}-category`;
  const subcategorySelectId = `${fieldId}-subcategory`;
  const [addCategoryOpen, setAddCategoryOpen] = React.useState(false);
  const [addSubcategoryOpen, setAddSubcategoryOpen] = React.useState(false);
  const [newAreaOpen, setNewAreaOpen] = React.useState(false);
  const [newAreaName, setNewAreaName] = React.useState("");
  const [newAreaType, setNewAreaType] = React.useState<Area["area_type"]>("other");
  const [newAreaNotes, setNewAreaNotes] = React.useState("");
  const subcategories = db.master.workSubcategories.filter((row) => row.category_id === value.categoryId);

  const changeAreaType = (areaType: Area["area_type"]) => {
    const previousLabel = AREA_TYPES.find((option) => option.value === newAreaType)?.label || "";
    const nextLabel = AREA_TYPES.find((option) => option.value === areaType)?.label || "";
    setNewAreaType(areaType);
    setNewAreaName((current) => !current.trim() || current === previousLabel ? nextLabel : current);
  };

  const createArea = () => {
    if (!newAreaName.trim()) return;
    const areaId = onCreateArea({
      name: newAreaName.trim(),
      areaType: newAreaType,
      notes: newAreaNotes.trim(),
    });
    onChange({ areaIds: [...new Set([...value.areaIds, areaId])] });
    setNewAreaName("");
    setNewAreaType("other");
    setNewAreaNotes("");
    setNewAreaOpen(false);
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
          <select
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
          </select>
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

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Covered Areas *</span>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNewAreaOpen((current) => !current)}>
            <Plus className="mr-1 h-3 w-3" />{newAreaOpen ? "Close" : "Add Area"}
          </Button>
        </div>
        {newAreaOpen ? (
          <div className="mt-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3">
            <p className="text-xs font-semibold">Add an Area to {site.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">The new Area stays linked to this Site and is selected for the current Work Required.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Area type *</span>
                <select value={newAreaType} onChange={(event) => changeAreaType(event.target.value as Area["area_type"])} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                  {AREA_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Area name *</span>
                <Input value={newAreaName} onChange={(event) => setNewAreaName(event.target.value)} placeholder="e.g. Dining room" className="mt-1 h-9" />
              </label>
              <label className="sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Area notes</span>
                <Input value={newAreaNotes} onChange={(event) => setNewAreaNotes(event.target.value)} placeholder="Optional area-specific notes" className="mt-1 h-9" />
              </label>
              <div className="flex justify-end sm:col-span-2">
                <Button type="button" size="sm" onClick={createArea} disabled={!newAreaName.trim()}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>
              </div>
            </div>
          </div>
        ) : null}
        {areas.length ? (
          <div className="mt-1 grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {areas.map((area) => (
              <label key={area.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent/50">
                <input
                  type="checkbox"
                  checked={value.areaIds.includes(area.id)}
                  onChange={() => onChange({ areaIds: value.areaIds.includes(area.id) ? value.areaIds.filter((id) => id !== area.id) : [...value.areaIds, area.id] })}
                />
                <span className="truncate">{area.name}</span>
              </label>
            ))}
          </div>
        ) : <p className="mt-1 rounded-md border border-dashed border-warning/40 bg-warning/[0.04] px-3 py-2 text-xs text-muted-foreground">Add an Area here before saving this Work Required.</p>}
      </div>

      <label>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</span>
        <Textarea value={value.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Scope notes, customer preference, access constraints…" rows={3} className="mt-1" />
      </label>
      <label>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Priority</span>
        <select value={value.priority} onChange={(event) => onChange({ priority: event.target.value as Priority })} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select>
      </label>
    </div>
  );
}
