"use client";

import * as React from "react";
import { PanelsTopLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AREA_TYPES, newAreaDraft, type AreaDraft, type SiteDraft } from "./customer-sites-form-model";

export function CustomerAreasDraftSection({
  sites,
  areas,
  setAreas,
}: {
  sites: SiteDraft[];
  areas: AreaDraft[];
  setAreas: React.Dispatch<React.SetStateAction<AreaDraft[]>>;
}) {
  const availableSites = React.useMemo(
    () => sites.filter((site) => (site.existing || site.enabled) && !site.archiveRequested),
    [sites],
  );
  const siteById = React.useMemo(
    () => new Map(availableSites.map((site) => [site.id, site])),
    [availableSites],
  );

  const addArea = () => {
    const firstSite = availableSites[0];
    if (!firstSite) return;
    setAreas((current) => [...current, newAreaDraft(firstSite.id)]);
  };

  const updateArea = (areaId: string, patch: Partial<AreaDraft>) => {
    setAreas((current) => current.map((area) => area.id === areaId ? { ...area, ...patch } : area));
  };

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PanelsTopLeft className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Areas</h3>
            <p className="text-[11px] text-muted-foreground">Add rooms or work zones under a Site before selecting broad work interests.</p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={!availableSites.length} onClick={addArea}>
          <Plus className="mr-1 h-3.5 w-3.5" />Add Area
        </Button>
      </div>

      {!availableSites.length ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Add and keep at least one Site before adding an Area.
        </div>
      ) : areas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium">No Area added</p>
          <p className="mt-1 text-xs text-muted-foreground">Areas are optional and always belong to a Site.</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={addArea}>
            <Plus className="mr-1 h-3.5 w-3.5" />Add first Area
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {areas.map((area, index) => {
            const linkedSite = siteById.get(area.siteId);
            const unavailable = !linkedSite;
            return (
              <div key={area.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Area {index + 1}{area.existing ? " · Existing" : ""}</p>
                  {!area.existing ? (
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remove Area ${index + 1}`} onClick={() => setAreas((current) => current.filter((row) => row.id !== area.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
                {unavailable ? (
                  <p className="mb-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">This Area is preserved, but its Site is being removed or archived. Restore that Site to edit the Area here.</p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Site *</span>
                    <select
                      value={area.siteId}
                      disabled={area.existing}
                      onChange={(event) => updateArea(area.id, { siteId: event.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {unavailable ? <option value={area.siteId}>Unavailable Site</option> : null}
                      {availableSites.map((site) => <option key={site.id} value={site.id}>{site.name || "Unnamed Site"}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Area name *</span>
                    <Input id={`area-name-${area.id}`} value={area.name} disabled={unavailable} onChange={(event) => updateArea(area.id, { name: event.target.value })} placeholder="e.g. Living Room" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Area type *</span>
                    <select value={area.areaType} disabled={unavailable} onChange={(event) => updateArea(area.id, { areaType: event.target.value as AreaDraft["areaType"] })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:cursor-not-allowed disabled:opacity-70">
                      {AREA_TYPES.map((areaType) => <option key={areaType.value} value={areaType.value}>{areaType.label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="mt-2 block space-y-1">
                  <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Area notes</span>
                  <Input value={area.notes} disabled={unavailable} onChange={(event) => updateArea(area.id, { notes: event.target.value })} placeholder="Optional area-specific notes" />
                </label>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
