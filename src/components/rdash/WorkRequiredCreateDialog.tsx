"use client";
import * as React from "react";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRDashStore } from "@/lib/rdash/store";
import type { Priority, Site } from "@/lib/rdash/types";
export interface WorkRequiredCreateDialogProps {
    open: boolean;
    customerId: string;
    site: Site;
    initialAreaIds?: string[];
    onOpenChange: (open: boolean) => void;
    onCreated?: (workRequiredId: string) => void;
}
export function WorkRequiredCreateDialog({ open, customerId, site, initialAreaIds, onOpenChange, onCreated, }: WorkRequiredCreateDialogProps) {
    const db = useRDashStore((state) => state.db);
    const addWorkRequired = useRDashStore((state) => state.addWorkRequired);
    const siteAreas = React.useMemo(() => db.areas.filter((area) => area.site_id === site.id && !area.is_archived), [db.areas, site.id]);
    const [title, setTitle] = React.useState("");
    const [categoryId, setCategoryId] = React.useState("");
    const [subcategoryId, setSubcategoryId] = React.useState("");
    const [systemName, setSystemName] = React.useState("");
    const [specification, setSpecification] = React.useState("");
    const [priority, setPriority] = React.useState<Priority>("medium");
    const [areaIds, setAreaIds] = React.useState<string[]>([]);
    const [prefilledFromCustomer, setPrefilledFromCustomer] = React.useState(false);
    const subcategories = React.useMemo(() => db.master.workSubcategories.filter((row) => row.category_id === categoryId), [categoryId, db.master.workSubcategories]);

    // Look up the customer's interest categories/subcategories (captured during
    // customer creation) so we can pre-fill the work required form. This gives
    // preference to the customer-level work preferences when creating site-level
    // work required, avoiding re-entry and keeping the quotation flow consistent.
    const customerInterests = React.useMemo(() => {
        const customer = db.customers.find((row) => row.id === customerId);
        if (!customer) return { categories: [] as string[], subcategories: [] as string[] };
        return {
            categories: customer.interest_category_ids || [],
            subcategories: customer.interest_work_subcategory_ids || [],
        };
    }, [db.customers, customerId]);

    const initialAreaIdsKey = (initialAreaIds || []).join("|");
    React.useEffect(() => {
        if (!open)
            return;
        const permittedInitialIds = (initialAreaIdsKey ? initialAreaIdsKey.split("|") : []).filter((id) => siteAreas.some((area) => area.id === id));

        // Pre-fill from customer interests (preference): pick the first interest
        // category that exists in the master, and the first matching subcategory.
        let prefillCategoryId = "";
        let prefillSubcategoryId = "";
        let prefillTitle = "";
        let didPrefill = false;
        if (customerInterests.categories.length) {
            const matchedCategory = customerInterests.categories
                .find((id) => db.master.workCategories.some((cat) => cat.id === id));
            if (matchedCategory) {
                prefillCategoryId = matchedCategory;
                const catName = db.master.workCategories.find((cat) => cat.id === matchedCategory)?.name || "";
                // Pick a matching subcategory from the customer's interests that belongs to this category
                const matchedSub = customerInterests.subcategories
                    .find((id) => db.master.workSubcategories.some((sub) => sub.id === id && sub.category_id === matchedCategory));
                prefillSubcategoryId = matchedSub || "";
                const subName = matchedSub
                    ? db.master.workSubcategories.find((sub) => sub.id === matchedSub)?.name || ""
                    : "";
                prefillTitle = [catName, subName].filter(Boolean).join(" — ");
                didPrefill = true;
            }
        }

        setTitle(prefillTitle);
        setCategoryId(prefillCategoryId);
        setSubcategoryId(prefillSubcategoryId);
        setSystemName("");
        setSpecification("");
        setPriority("medium");
        setAreaIds(permittedInitialIds.length ? permittedInitialIds : siteAreas.map((area) => area.id));
        setPrefilledFromCustomer(didPrefill);
    }, [initialAreaIdsKey, open, siteAreas, customerInterests, db.master.workCategories, db.master.workSubcategories]);
    const toggleArea = (areaId: string) => {
        setAreaIds((current) => current.includes(areaId)
            ? current.filter((id) => id !== areaId)
            : [...current, areaId]);
    };
    const save = () => {
        if (!title.trim()) {
            toast.error("Work Required title is required.");
            return;
        }
        if (!siteAreas.length) {
            toast.error("Add at least one Area before defining work required.");
            return;
        }
        if (!areaIds.length) {
            toast.error("Select at least one covered Area.");
            return;
        }
        try {
            const id = addWorkRequired({
                customer_id: customerId,
                site_id: site.id,
                title: title.trim(),
                work_category_id: categoryId || undefined,
                work_subcategory_id: subcategoryId || undefined,
                system_name: systemName.trim() || undefined,
                specification: specification.trim() || undefined,
                area_ids: areaIds,
                status: "new",
                priority,
            });
            toast.success(`Work Required created for ${site.name}`);
            onCreated?.(id);
            onOpenChange(false);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Work Required could not be created.");
        }
    };
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary"/> Add Work Required</DialogTitle>
          <DialogDescription>{site.name} · the work, areas, quotation, and execution remain linked to this Customer Site.</DialogDescription>
        </DialogHeader>
        {prefilledFromCustomer && (
          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2 text-xs">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-foreground/80">
              Pre-filled from this customer's interest categories (captured during customer creation).
              The category, subcategory, and title are suggestions — edit if this site needs different scope.
            </span>
          </div>
        )}
        <div className="grid gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Work Required title *</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Living room false ceiling" className="mt-1" autoFocus/>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Primary Category
                {prefilledFromCustomer && categoryId && <Sparkles className="h-3 w-3 text-primary" aria-label="From customer interests" />}
              </label>
              <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(""); }} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value="">Select later during structured capture</option>
                {db.master.workCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Primary Subcategory
                {prefilledFromCustomer && subcategoryId && <Sparkles className="h-3 w-3 text-primary" aria-label="From customer interests" />}
              </label>
              <select value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)} disabled={!categoryId} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                <option value="">Select later during structured capture</option>
                {subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">System / specification</label>
            <Input value={systemName} onChange={(event) => setSystemName(event.target.value)} placeholder="e.g. 12.5 mm gypsum board with GI framework" className="mt-1"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Covered Areas *</label>
            {siteAreas.length ? (<div className="mt-1 grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
                {siteAreas.map((area) => (<label key={area.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent/50">
                    <input type="checkbox" checked={areaIds.includes(area.id)} onChange={() => toggleArea(area.id)}/>
                    <span className="truncate">{area.name}</span>
                  </label>))}
              </div>) : <p className="mt-1 rounded-md border border-dashed border-warning/40 bg-warning/[0.04] px-3 py-2 text-xs text-muted-foreground">Add an Area to this Site first. Work Required must belong to at least one Area.</p>}
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</label>
            <Textarea value={specification} onChange={(event) => setSpecification(event.target.value)} placeholder="Scope notes, customer preference, access constraints…" rows={3} className="mt-1"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Priority</label>
            <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!siteAreas.length}><Plus className="mr-1 h-3.5 w-3.5"/> Create Work Required</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
