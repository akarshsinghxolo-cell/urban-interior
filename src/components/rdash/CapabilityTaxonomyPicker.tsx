"use client";

import type { WorkCategory, WorkSubcategory } from "@/lib/rdash/types";
import { cn } from "@/lib/utils";
import { AddWorkCategoryAction, AddWorkSubcategoryAction } from "./WorkTaxonomyQuickAdd";

// The same catalogue controls serve work capabilities and supply filters;
// their callers retain their different selection/persistence rules.
export function CapabilityTaxonomyPicker({ categories, subcategories, categoryIds, subcategoryIds, onCategory, onSubcategory }: {
  categories: WorkCategory[];
  subcategories: WorkSubcategory[];
  categoryIds: string[];
  subcategoryIds: string[];
  onCategory: (id: string) => void;
  onSubcategory: (categoryId: string, id: string) => void;
}) {
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Capability categories">
      {categories.map((category) => <button
        key={category.id}
        type="button"
        aria-pressed={categoryIds.includes(category.id)}
        onClick={() => onCategory(category.id)}
        className={cn("max-w-full rounded-full border px-3 py-1.5 text-left text-xs font-medium break-words", categoryIds.includes(category.id)
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted")}
      >{category.name}</button>)}
    </div>
    {categories.filter((category) => categoryIds.includes(category.id)).map((category) => <div key={category.id} className="rounded-lg border border-border bg-muted/20 p-2.5">
      <p className="mb-2 text-xs font-semibold">{category.name} · Select subcategories</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${category.name} subcategories`}>
        {subcategories.filter((row) => row.category_id === category.id).map((row) => <button
          key={row.id}
          type="button"
          aria-pressed={subcategoryIds.includes(row.id)}
          onClick={() => onSubcategory(category.id, row.id)}
          className={cn("max-w-full rounded-full border px-2.5 py-1 text-left text-xs break-words", subcategoryIds.includes(row.id)
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-muted")}
        >{row.name}</button>)}
      </div>
      <div className="mt-2"><AddWorkSubcategoryAction categoryId={category.id} /></div>
    </div>)}
    <AddWorkCategoryAction />
  </div>;
}
