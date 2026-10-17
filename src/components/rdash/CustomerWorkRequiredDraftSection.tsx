"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRDashStore } from "@/lib/rdash/store";
import type { RDashDatabase } from "@/lib/rdash/types";
import { confirmDialog } from "./ConfirmDialog";
import { WorkRequiredFields } from "./WorkRequiredFields";
import {
  newAreaDraft,
  newCustomerWorkRequiredDraft,
  type AreaDraft,
  type CustomerWorkRequiredDraft,
  type SiteDraft,
} from "./customer-sites-form-model";

export function CustomerWorkRequiredDraftSection({
  db,
  customerId,
  customerName,
  sites,
  areas,
  setAreas,
  workRequired,
  setWorkRequired,
}: {
  db: RDashDatabase;
  customerId?: string;
  customerName: string;
  sites: SiteDraft[];
  areas: AreaDraft[];
  setAreas: React.Dispatch<React.SetStateAction<AreaDraft[]>>;
  workRequired: CustomerWorkRequiredDraft[];
  setWorkRequired: React.Dispatch<React.SetStateAction<CustomerWorkRequiredDraft[]>>;
}) {
  const liveSites = sites.filter((site) => (site.existing || site.enabled) && !site.archiveRequested);
  const liveSiteIds = new Set(liveSites.map((site) => site.id));
  const visibleWorkRequired = workRequired.filter((draft) => !draft.siteId || liveSiteIds.has(draft.siteId));
  const existingCount = customerId ? db.workRequired.filter((work) => work.customer_id === customerId).length : 0;
  const cascadeDeleteRecord = useRDashStore((s) => s.cascadeDeleteRecord);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set(workRequired.filter((draft) => !draft.existing).map((draft) => draft.id)));

  const appendDraft = (draft: CustomerWorkRequiredDraft) => {
    setWorkRequired((current) => [...current, draft]);
    setExpandedIds((current) => new Set(current).add(draft.id));
  };

  const addWorkRequired = (siteId = "") => appendDraft(newCustomerWorkRequiredDraft(siteId));

  const addFromWorkRequired = (source: CustomerWorkRequiredDraft, mode: "areas" | "copy") => {
    const base = newCustomerWorkRequiredDraft(source.siteId);
    appendDraft(mode === "copy" ? {
      ...base,
      title: source.title,
      categoryIds: [...source.categoryIds],
      subcategoryIds: [...source.subcategoryIds],
      workTypeIds: [...source.workTypeIds],
      areaIds: [...source.areaIds],
      description: source.description,
      priority: source.priority,
      budget: "",
    } : {
      ...base,
      areaIds: [...source.areaIds],
      priority: source.priority,
    });
  };

  // New drafts are unsaved state — drop them from the array. Existing rows
  // go through the store's cascade delete (restrict rules, audit, sync);
  // the sync layer diffs the committed db and emits the server deleteIds.
  const deleteWorkRequired = async (draft: CustomerWorkRequiredDraft, displayNumber: number) => {
    const label = draft.title.trim() || `Work Required ${displayNumber}`;
    if (draft.existing) {
      const confirmed = await confirmDialog({
        title: `Delete ${label}?`,
        description: `"${label}" will be permanently removed from this customer. This cannot be undone.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) return;
      const result = cascadeDeleteRecord("workRequired", draft.id);
      if (!result.success) {
        toast.error(result.blocked[0]?.reason || `"${label}" cannot be deleted while linked records exist.`);
        return;
      }
      toast.success(`Deleted ${label}`);
    }
    setWorkRequired((current) => current.filter((row) => row.id !== draft.id));
    setExpandedIds((current) => {
      const next = new Set(current);
      next.delete(draft.id);
      return next;
    });
  };

  const updateWorkRequired = (id: string, patch: Partial<CustomerWorkRequiredDraft>) => {
    setWorkRequired((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Work Required</h3>
            <p className="text-[11px] text-muted-foreground">Add customer-level work, or link it to a Site and covered Areas.</p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => addWorkRequired()}>
          <Plus className="mr-1 h-3.5 w-3.5" />Add Work Required
        </Button>
      </div>

      {visibleWorkRequired.map((draft, index) => {
        const site = liveSites.find((row) => row.id === draft.siteId);
        const siteAreas = areas.filter((area) => area.siteId === (site?.id || "") && !area.archiveRequested);
        const selectedAreaNames = siteAreas.filter((area) => draft.areaIds.includes(area.id)).map((area) => area.name).filter(Boolean);
        const displayNumber = draft.existing ? index + 1 : Math.max(existingCount, visibleWorkRequired.filter((row) => row.existing).length) + visibleWorkRequired.slice(0, index + 1).filter((row) => !row.existing).length;
        const expanded = expandedIds.has(draft.id);
        return (
          <article key={draft.id} className="rounded-lg border border-border p-3">
            <div className={expanded ? "mb-3 flex items-center gap-2" : "flex items-center gap-2"}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => setExpandedIds((current) => {
                  const next = new Set(current);
                  if (next.has(draft.id)) next.delete(draft.id); else next.add(draft.id);
                  return next;
                })}
                aria-label={`${expanded ? "Collapse" : "Edit"} Work Required ${displayNumber}`}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{draft.title.trim() || `Work Required ${displayNumber}`}</p>
                {!expanded ? <p className="truncate text-[10px] text-muted-foreground">{site?.name || customerName || "Customer"} · {selectedAreaNames.length ? selectedAreaNames.join(", ") : "No Areas selected"} · {draft.workTypeIds.length} work type{draft.workTypeIds.length === 1 ? "" : "s"}</p> : null}
              </div>
              <select
                value={draft.siteId}
                onChange={(event) => updateWorkRequired(draft.id, { siteId: event.target.value, areaIds: [] })}
                disabled={draft.existing && Boolean(draft.siteId)}
                className="h-8 w-auto min-w-0 max-w-full shrink basis-28 rounded-md border border-input bg-card px-2 text-xs"
                aria-label={`Customer or Site for Work Required ${displayNumber}`}
              >
                <option value="">{customerName.trim() || "Customer"}</option>
                {liveSites.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-destructive"
                onClick={() => void deleteWorkRequired(draft, displayNumber)}
                aria-label={`${draft.existing ? "Delete" : "Remove"} Work Required ${displayNumber}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {expanded ? <WorkRequiredFields
              db={db}
              site={site}
              areas={siteAreas}
              value={draft}
              onChange={(patch) => updateWorkRequired(draft.id, patch)}
              onCreateArea={({ name, areaType, notes }) => {
                const area = { ...newAreaDraft(site?.id || ""), name, areaType, notes };
                setAreas((current) => [...current, area]);
                return area.id;
              }}
              onUpdateArea={(areaId, name) => setAreas((current) => current.map((area) => area.id === areaId ? { ...area, name } : area))}
              onDeleteArea={(areaId) => {
                setAreas((current) => current.flatMap((area) => area.id !== areaId ? [area] : area.existing ? [{ ...area, archiveRequested: true }] : []));
                setWorkRequired((current) => current.map((work) => ({ ...work, areaIds: work.areaIds.filter((id) => id !== areaId) })));
              }}
              onAddNext={(mode) => addFromWorkRequired(draft, mode)}
            /> : null}
          </article>
        );
      })}
    </section>
  );
}
