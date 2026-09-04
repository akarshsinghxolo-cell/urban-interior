"use client";

import * as React from "react";
import { Plus, Trash2, Wrench } from "lucide-react";
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

  const addWorkRequired = (siteId = "") => setWorkRequired((current) => [...current, newCustomerWorkRequiredDraft(siteId)]);

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
        const displayNumber = draft.existing ? index + 1 : Math.max(existingCount, visibleWorkRequired.filter((row) => row.existing).length) + visibleWorkRequired.slice(0, index + 1).filter((row) => !row.existing).length;
        return (
          <article key={draft.id} className="rounded-lg border border-border p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold">Work Required {displayNumber}</span>
              <select
                value={draft.siteId}
                onChange={(event) => updateWorkRequired(draft.id, { siteId: event.target.value, areaIds: [] })}
                disabled={draft.existing && Boolean(draft.siteId)}
                className="ml-auto h-8 w-auto min-w-0 max-w-full shrink basis-28 rounded-md border border-input bg-card px-2 text-xs"
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
            <WorkRequiredFields
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
              onAddNext={() => addWorkRequired(draft.siteId)}
            />
          </article>
        );
      })}
    </section>
  );
}
