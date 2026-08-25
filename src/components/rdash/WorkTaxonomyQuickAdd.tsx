"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRDashStore } from "@/lib/rdash/store";
import { normalizeCatalogName } from "@/lib/rdash/work-category-master";
import type { WorkCategory, WorkSubcategory } from "@/lib/rdash/types";
import { defaultWorkTypeId } from "@/lib/rdash/work-types";
import { cn } from "@/lib/utils";

const newCatalogId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const optionalRate = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export function AddWorkCategoryAction({
  onCreated,
  className,
}: {
  onCreated?: (categoryId: string) => void;
  className?: string;
}) {
  const categories = useRDashStore((state) => state.db.master.workCategories);
  const mutateMaster = useRDashStore((state) => state.mutateMaster);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");

  function save() {
    const clean = name.trim();
    if (!clean) return toast.error("Work category name is required.");
    if (categories.some((category) => normalizeCatalogName(category.name) === normalizeCatalogName(clean))) {
      return toast.error("A work category with this name already exists.");
    }
    const now = new Date().toISOString();
    const category: WorkCategory = {
      id: newCatalogId("cat"),
      name: clean,
      sort_order: categories.length,
      created_at: now,
      updated_at: now,
    };
    mutateMaster((master) => ({
      ...master,
      workCategories: [...master.workCategories, category],
    }));
    setName("");
    setAdding(false);
    onCreated?.(category.id);
    toast.success("Work category added.");
  }

  if (!adding) {
    return (
      <Button type="button" variant="outline" size="sm" className={cn("h-8 w-full border-dashed text-xs", className)} onClick={() => setAdding(true)}>
        <Plus className="h-3.5 w-3.5" /> Add category
      </Button>
    );
  }

  return (
    <div className={cn("rounded-md border border-dashed bg-muted/20 p-2", className)}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">New work category</p>
      <div className="flex gap-1.5">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); save(); }
            if (event.key === "Escape") { setAdding(false); setName(""); }
          }}
          placeholder="Category name"
          className="h-8 text-xs"
          autoFocus
        />
        <Button type="button" size="icon" className="h-8 w-8 shrink-0" onClick={save} aria-label="Save work category"><Check className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setAdding(false); setName(""); }} aria-label="Cancel adding work category"><X className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export function AddWorkSubcategoryAction({
  categoryId,
  onCreated,
}: {
  categoryId: string;
  onCreated?: (subcategoryId: string) => void;
}) {
  const master = useRDashStore((state) => state.db.master);
  const mutateMaster = useRDashStore((state) => state.mutateMaster);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [unitId, setUnitId] = React.useState("sqft");
  const [labourRate, setLabourRate] = React.useState("");
  const [materialRate, setMaterialRate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  function reset() {
    setAdding(false);
    setName("");
    setUnitId("sqft");
    setLabourRate("");
    setMaterialRate("");
    setNotes("");
  }

  function save() {
    const clean = name.trim();
    if (!clean) return toast.error("Subcategory name is required.");
    if (master.workSubcategories.some((subcategory) =>
      subcategory.category_id === categoryId &&
      normalizeCatalogName(subcategory.name) === normalizeCatalogName(clean))) {
      return toast.error("This category already has a subcategory with this name.");
    }
    if (!master.units.some((unit) => unit.id === unitId)) return toast.error("Choose a valid execution unit.");
    const now = new Date().toISOString();
    const subcategoryId = newCatalogId("work");
    const subcategory: WorkSubcategory = {
      id: subcategoryId,
      category_id: categoryId,
      name: clean,
      unit_id: unitId,
      work_types: [{
        id: defaultWorkTypeId(subcategoryId),
        name: "Standard",
        unit_id: unitId,
        labour_rate: optionalRate(labourRate),
        material_rate: optionalRate(materialRate),
        notes: notes.trim() || undefined,
        created_at: now,
        updated_at: now,
      }],
      notes: notes.trim() || undefined,
      work_required_article_ids: [],
      created_at: now,
      updated_at: now,
    };
    mutateMaster((current) => ({
      ...current,
      workSubcategories: [...current.workSubcategories, subcategory],
    }));
    reset();
    onCreated?.(subcategory.id);
    toast.success("Work subcategory added.");
  }

  if (!adding) {
    return (
      <button type="button" onClick={() => setAdding(true)} className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-dashed px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary">
        <Plus className="h-3 w-3" /> Add subcategory
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1.5 rounded-md border border-dashed bg-muted/20 p-2">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Subcategory name" className="h-8 text-xs" autoFocus />
      <div className="grid grid-cols-3 gap-1.5">
        <select value={unitId} onChange={(event) => setUnitId(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="Execution unit">
          {master.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}
        </select>
        <Input type="number" min={0} value={labourRate} onChange={(event) => setLabourRate(event.target.value)} placeholder="Labour ₹" className="h-8 text-xs" />
        <Input type="number" min={0} value={materialRate} onChange={(event) => setMaterialRate(event.target.value)} placeholder="Material ₹" className="h-8 text-xs" />
      </div>
      <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Scope notes (optional)" className="min-h-14 text-xs" />
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={reset}>Cancel</Button>
        <Button type="button" size="sm" className="h-7 text-xs" onClick={save}><Check className="h-3 w-3" /> Save subcategory</Button>
      </div>
    </div>
  );
}
