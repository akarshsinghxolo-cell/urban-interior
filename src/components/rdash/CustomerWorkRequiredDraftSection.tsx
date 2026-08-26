"use client";

import * as React from "react";
import { Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RDashDatabase } from "@/lib/rdash/types";
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
  sites,
  areas,
  setAreas,
  workRequired,
  setWorkRequired,
}: {
  db: RDashDatabase;
  sites: SiteDraft[];
  areas: AreaDraft[];
  setAreas: React.Dispatch<React.SetStateAction<AreaDraft[]>>;
  workRequired: CustomerWorkRequiredDraft[];
  setWorkRequired: React.Dispatch<React.SetStateAction<CustomerWorkRequiredDraft[]>>;
}) {
  const liveSites = sites.filter((site) => (site.existing || site.enabled) && !site.archiveRequested);
  const liveSiteIds = new Set(liveSites.map((site) => site.id));

  const addWorkRequired = () => {
    const siteId = liveSites[0]?.id;
    if (!siteId) return;
    setWorkRequired((current) => [...current, newCustomerWorkRequiredDraft(siteId)]);
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
            <p className="text-[11px] text-muted-foreground">Add or edit Site-linked work and its covered Areas.</p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addWorkRequired} disabled={!liveSites.length}>
          <Plus className="mr-1 h-3.5 w-3.5" />Add Work Required
        </Button>
      </div>

      {!liveSites.length ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Add a Site before adding Work Required.</p>
      ) : null}

      {workRequired.filter((draft) => liveSiteIds.has(draft.siteId)).map((draft, index) => {
        const site = liveSites.find((row) => row.id === draft.siteId);
        if (!site) return null;
        const siteAreas = areas.filter((area) => area.siteId === site.id);
        return (
          <article key={draft.id} className="rounded-lg border border-border p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold">Work Required {index + 1}</span>
              <select
                value={site.id}
                onChange={(event) => updateWorkRequired(draft.id, { siteId: event.target.value, areaIds: [] })}
                disabled={draft.existing}
                className="ml-auto h-8 min-w-40 rounded-md border border-input bg-card px-2 text-xs"
                aria-label={`Site for Work Required ${index + 1}`}
              >
                {liveSites.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              {draft.existing ? null : (
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setWorkRequired((current) => current.filter((row) => row.id !== draft.id))} aria-label={`Remove Work Required ${index + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <WorkRequiredFields
              db={db}
              site={site}
              areas={siteAreas}
              value={draft}
              onChange={(patch) => updateWorkRequired(draft.id, patch)}
              onCreateArea={({ name, areaType, notes }) => {
                const area = { ...newAreaDraft(site.id), name, areaType, notes };
                setAreas((current) => [...current, area]);
                return area.id;
              }}
            />
          </article>
        );
      })}
    </section>
  );
}
