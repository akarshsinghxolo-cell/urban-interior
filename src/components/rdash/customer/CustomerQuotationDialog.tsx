"use client";

import * as React from "react";
import { CalendarClock, Check, FilePlus2, Plus, Ruler } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyCreated } from "@/lib/rdash/notify";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import { useRDashStore, type CreateDialogRequest } from "@/lib/rdash/store";
import type { RDashDatabase, WorkRequired } from "@/lib/rdash/types";
import { workTypeNamesForIds } from "@/lib/rdash/work-types";
import { quotationMeasuredLine } from "@/lib/rdash/quotation-measurement";
import {
  CustomerAreaDimensionsFields,
  positiveDimension,
  type CustomerAreaDimensionsDraft,
} from "./CustomerAreaDimensionsFields";

type MeasurementRequest = { workIds: string[]; areaId?: string };

/**
 * Canonical quotation workflow for the whole app.
 *
 * Customer Desk, Quotation Desk and Site Execution must launch this component
 * through openCreateDialog({ kind: "quotation", ...context }). Business rules,
 * coverage construction and mutation live here so another module cannot create
 * a second quotation path with different measurement or Work Required rules.
 */
export function CustomerQuotationDialog({ request, onClose }: {
  request: CreateDialogRequest;
  onClose: () => void;
}) {
  const db = useRDashStore((state) => state.db);
  const addQuotation = useRDashStore((state) => state.addQuotation);
  const addWorkRequired = useRDashStore((state) => state.addWorkRequired);
  const addRecentCreated = useRDashStore((state) => state.addRecentCreated);
  const openDetail = useRDashStore((state) => state.openDetail);

  const initialCustomerId = request.customerId || "";
  const initialSites = db.sites.filter((site) => site.customer_id === initialCustomerId && !site.is_archived);
  const initialSiteId = request.siteId || (initialSites.length === 1 ? initialSites[0].id : "");
  const initialCustomer = db.customers.find((customer) => customer.id === initialCustomerId);
  const initialSite = initialSites.find((site) => site.id === initialSiteId);
  const initialWorkRequired = request.workRequiredId
    ? db.workRequired.find((work) => work.id === request.workRequiredId)
    : undefined;

  const [customerId, setCustomerId] = React.useState(initialCustomerId);
  const [siteId, setSiteId] = React.useState(initialSiteId);
  const initialSelection: Record<string, string[]> = initialWorkRequired ? { [initialWorkRequired.id]: initialWorkRequired.area_ids } : {};
  const [selectedAreas, setSelectedAreas] = React.useState(initialSelection);
  const workRequiredIds = Object.keys(selectedAreas);
  const [grouping, setGrouping] = React.useState<"work" | "area">(request.quotationGrouping || "work");
  const [title, setTitle] = React.useState(initialWorkRequired?.title || (initialCustomer ? `${initialCustomer.name}${initialSite ? ` · ${initialSite.name}` : ""}` : ""));
  const [initialValidUntil] = React.useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = React.useState(initialValidUntil);
  const [submitting, setSubmitting] = React.useState(false);
  const [measurementRequest, setMeasurementRequest] = React.useState<MeasurementRequest | null>(null);
  const initialForm = {
    customerId: initialCustomerId,
    siteId: initialSiteId,
    selectedAreas: initialSelection,
    grouping: request.quotationGrouping || "work",
    title: initialWorkRequired?.title || (initialCustomer ? `${initialCustomer.name}${initialSite ? ` · ${initialSite.name}` : ""}` : ""),
    validUntil: initialValidUntil,
  };
  const formId = `quotation:new:${request.customerId || "customer"}:${request.siteId || "no-site"}`;
  const dirty = JSON.stringify({ customerId, siteId, selectedAreas, grouping, title, validUntil }) !== JSON.stringify(initialForm);

  const customerSites = React.useMemo(
    () => db.sites.filter((site) => site.customer_id === customerId && !site.is_archived),
    [customerId, db.sites],
  );
  const matchingWorkRequired = React.useMemo(
    () => db.workRequired.filter((work) => work.customer_id === customerId && work.site_id === siteId),
    [customerId, db.workRequired, siteId],
  );
  const siteAreas = React.useMemo(
    () => db.areas.filter((area) => area.site_id === siteId && !area.is_archived),
    [db.areas, siteId],
  );

  const defaultTitle = () => {
    const customer = db.customers.find((row) => row.id === customerId);
    const site = customerSites.find((row) => row.id === siteId);
    return customer ? `${customer.name}${site ? ` · ${site.name}` : ""}` : "";
  };

  const changeSelection = (works: WorkRequired[], areaId?: string) => {
    const included = works.every((work) => areaId ? selectedAreas[work.id]?.includes(areaId) :
      selectedAreas[work.id] && work.area_ids.every((id) => selectedAreas[work.id].includes(id)));
    const next = { ...selectedAreas };
    for (const work of works) {
      if (areaId) {
        const ids = included ? (next[work.id] || []).filter((id) => id !== areaId) : [...new Set([...(next[work.id] || []), areaId])];
        if (ids.length) next[work.id] = ids;
        else delete next[work.id];
      } else if (included) delete next[work.id];
      else next[work.id] = [...work.area_ids];
    }
    setSelectedAreas(next);
    setTitle([...new Set(Object.keys(next).map((id) => matchingWorkRequired.find((work) => work.id === id)?.title).filter(Boolean))].join(" / ") || defaultTitle());
  };

  const workRequiredLabel = (work: WorkRequired) => [
    (work.work_subcategory_ids || [])
      .map((id) => db.master.workSubcategories.find((subcategory) => subcategory.id === id)?.name)
      .filter(Boolean)
      .join(" + "),
    ...workTypeNamesForIds(db.master.workSubcategories, work.work_type_ids),
  ].filter(Boolean).join(" · ") || work.title;

  // Group the display only: coverage continues to reference the original work records.
  const workGroups = new Map<string, WorkRequired[]>();
  for (const work of matchingWorkRequired) {
    const label = workRequiredLabel(work);
    workGroups.set(label, [...(workGroups.get(label) || []), work]);
  }
  const areaName = (areaId: string) => db.areas.find((area) => area.id === areaId)?.name || "Unknown area";
  const roomIds = [...new Set(matchingWorkRequired.flatMap((work) => work.area_ids))];
  const chipClass = (included: boolean) => `min-h-8 rounded-md border px-2 py-1 text-left text-xs whitespace-normal ${included
    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
    : "border-border bg-muted text-muted-foreground"}`;

  const handleSubmit = (): boolean => {
    if (!customerId) {
      toast.error("Please select a customer");
      return false;
    }

    setSubmitting(true);
    try {
      const customer = db.customers.find((row) => row.id === customerId);
      if (!customer) throw new Error("The selected customer no longer exists");

      const site = siteId
        ? db.sites.find((row) => row.id === siteId && row.customer_id === customerId && !row.is_archived)
        : undefined;
      if (siteId && !site) throw new Error("The selected Site no longer belongs to this Customer");

      let selectedWorkRequired = workRequiredIds
        .map((id) => db.workRequired.find((row) => row.id === id && row.customer_id === customerId && row.site_id === siteId))
        .filter((work): work is WorkRequired => Boolean(work));

      if (selectedWorkRequired.length !== workRequiredIds.length) {
        throw new Error("One or more selected Work Required records no longer match this Customer and Site");
      }
      if (matchingWorkRequired.length && !selectedWorkRequired.length) {
        throw new Error("Select at least one work item or room to include in this quotation.");
      }
      selectedWorkRequired = selectedWorkRequired.map((work) => {
        const areaIds = selectedAreas[work.id];
        if (areaIds.some((id) => !work.area_ids.includes(id))) throw new Error("A selected room is no longer linked to this work item.");
        return { ...work, area_ids: areaIds };
      });

      // A site quotation always has one canonical Work Required relationship.
      // If the user has not created scope yet, create the same general-scope
      // record every launcher uses instead of letting modules invent payloads.
      if (site && !selectedWorkRequired.length) {
        const scopeTitle = title.trim() ? `${title.trim()} — scope` : "General scope";
        const newId = addWorkRequired({
          customer_id: customerId,
          site_id: site.id,
          title: scopeTitle,
          area_ids: [],
          status: "new",
          priority: "medium",
        });
        const created = db.workRequired.find((row) => row.id === newId);
        const now = new Date().toISOString();
        const fallback: WorkRequired = {
          id: newId,
          customer_id: customerId,
          site_id: site.id,
          title: scopeTitle,
          area_ids: [],
          structured_items: [],
          status: "new",
          priority: "medium",
          created_at: now,
          updated_at: now,
        };
        selectedWorkRequired = [created || fallback];
      }

      // Rooms can be quoted separately; only overlapping work/room coverage
      // should lead back to an existing quotation.
      const alreadyCovered = selectedWorkRequired.flatMap((work) => {
        const quotation = activeQuotationForWork(db, work.id, work.area_ids);
        return quotation ? [{ work, quotation }] : [];
      });
      if (alreadyCovered.length) {
        if (alreadyCovered.length === 1 && selectedWorkRequired.length === 1) {
          toast.info(`${alreadyCovered[0].quotation.quotation_no} already covers some or all of the selected rooms for this work.`);
          openDetail("quotation", alreadyCovered[0].quotation.id);
          dirtyFormRegistry.markClean(formId);
          onClose();
          return true;
        }
        throw new Error(`Existing active quotation coverage: ${alreadyCovered.map(({ quotation }) => quotation.quotation_no).join(", ")}`);
      }

      // Site-scoped coverage must be based on verified measurements for every
      // declared Area. This was previously only enforced by Site Execution,
      // which allowed Customer / Quotation Desk to create a different result.
      const verifiedByWork = new Map<string, string[]>();
      if (site) {
        for (const work of selectedWorkRequired) {
          const verified = verifiedMeasurementRevisionIds(db, site.id, work);
          const missingAreas = unverifiedAreaIdsForWork(db, site.id, work);
          if (missingAreas.length) {
            const group = workGroups.get(workRequiredLabel(work)) || [work];
            setMeasurementRequest({
              workIds: group.filter((entry) => selectedAreas[entry.id]?.includes(missingAreas[0])).map((entry) => entry.id),
              areaId: missingAreas[0],
            });
            toast.info(`Add the verified measurement for ${areaName(missingAreas[0])} to continue.`);
            return false;
          }
          verifiedByWork.set(work.id, verified);
        }
      }

      const quotationTitle = title.trim() || `${customer.name}${site ? ` · ${site.name}` : ""}`;
      const coverage = site
        ? selectedWorkRequired.map((work, index) => ({
            id: `coverage-${Date.now().toString(36)}-${index}`,
            work_required_id: work.id,
            area_ids: work.area_ids,
            measurement_revision_ids: verifiedByWork.get(work.id) || [],
            coverage_label: workRequiredLabel(work),
            status: "proposed" as const,
          }))
        : [];

      // Customer-level quotations have no Site coverage. Captured scope is
      // copied as starter lines and becomes linked coverage only after a Site
      // exists; this is the single serialization path for that case.
      const scopeLines = site ? undefined : selectedWorkRequired.flatMap((work, index) => {
        const items = (work.structured_items || []).filter((item) => Number.isFinite(item.quantity));
        if (!items.length) return [];
        const primary = items.find((item) => item.option_pairs?.length) || items[0];
        const amount = Math.round(items.reduce((sum, item) => sum + (item.amount || 0), 0) * 100) / 100;
        const quantity = Math.round(items.reduce((sum, item) => sum + (item.quantity || 0), 0) * 100) / 100;
        return [{
          id: `qi-${Date.now().toString(36)}-${index}`,
          title: workRequiredLabel(work) || work.title,
          category_id: primary.category_id,
          article_id: primary.article_id,
          work_required_article_id: primary.work_required_article_id,
          option_pairs: primary.option_pairs,
          quantity: quantity || 1,
          unit_id: primary.unit_id,
          unit_name: primary.unit_name,
          rate: quantity ? Math.round((amount / quantity) * 100) / 100 : primary.rate || 0,
          amount,
          tax_rate: primary.tax_rate,
          source_kind: "quotation" as const,
        }];
      });

      const id = addQuotation({
        customer_id: customerId,
        site_id: site?.id || "",
        coverage,
        ...(scopeLines ? { scope_lines: scopeLines } : {}),
        title: quotationTitle,
        valid_until: validUntil,
        status: "draft",
        grouping,
      });

      addRecentCreated({ id, kind: "quotation", label: quotationTitle });
      notifyCreated(
        "quotation",
        id,
        quotationTitle,
        `Draft for ${customer.name}${site ? ` · ${site.name}` : " · no site yet"} · valid until ${validUntil}`,
      );
      openDetail("quotation", id);
      dirtyFormRegistry.markClean(formId);
      onClose();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create quotation");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  useDirtyFormRegistration({
    id: formId,
    label: "Quotation draft",
    dirty,
    save: handleSubmit,
    discard: () => true,
  });
  const requestClose = React.useCallback(() => {
    dirtyFormRegistry.requestNavigation(onClose, { reason: "close this quotation form" });
  }, [onClose]);

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FilePlus2 className="h-5 w-5" /></span>
            <div>
              <DialogTitle className="text-base">{grouping === "area" ? "Area/room wise quotation" : "Work wise quotation"}</DialogTitle>
              <DialogDescription className="text-xs">Choose the work and rooms to include. Green rooms are included; grey rooms are excluded.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Customer *">
              <Select value={customerId} onValueChange={(value) => {
                const sites = db.sites.filter((row) => row.customer_id === value && !row.is_archived);
                const nextSite = sites.length === 1 ? sites[0] : undefined;
                const customer = db.customers.find((row) => row.id === value);
                setCustomerId(value);
                setSiteId(nextSite?.id || "");
                setSelectedAreas({});
                setTitle(customer ? `${customer.name}${nextSite ? ` · ${nextSite.name}` : ""}` : "");
              }}>
                <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
                <SelectContent>
                  {db.customers.map((customer) => {
                    const customerSite = db.sites.find((entry) => entry.customer_id === customer.id);
                    return <SelectItem key={customer.id} value={customer.id}>{customer.name}{customerSite?.city ? ` · ${customerSite.city}` : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Site (optional)">
              <Select
                value={siteId || "__customer_level__"}
                onValueChange={(value) => {
                  const nextSiteId = value === "__customer_level__" ? "" : value;
                  const customer = db.customers.find((row) => row.id === customerId);
                  const site = customerSites.find((row) => row.id === nextSiteId);
                  setSiteId(nextSiteId);
                  setSelectedAreas({});
                  setTitle(customer ? `${customer.name}${site ? ` · ${site.name}` : ""}` : "");
                }}
                disabled={!customerId}
              >
                <SelectTrigger><SelectValue placeholder={customerId ? "No site yet" : "Select customer first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__customer_level__">No site yet · customer-level draft</SelectItem>
                  {customerSites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}{site.locality ? ` · ${site.locality}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Quotation layout">
            <Button type="button" size="sm" variant={grouping === "work" ? "default" : "outline"} aria-pressed={grouping === "work"} onClick={() => setGrouping("work")}>Work wise</Button>
            <Button type="button" size="sm" variant={grouping === "area" ? "default" : "outline"} aria-pressed={grouping === "area"} onClick={() => setGrouping("area")}>Area/room wise</Button>
          </div>
          <Field label={grouping === "area" ? "Rooms and required work" : "Work Required and rooms"}>
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-input bg-card p-3">
              {grouping === "work" ? [...workGroups].map(([label, works]) => {
                const areas = [...new Set(works.flatMap((work) => work.area_ids))];
                const otherAreas = siteAreas.filter((area) => !areas.includes(area.id));
                const targetWorkIds = works[0] ? [works[0].id] : [];
                const included = works.every((work) => selectedAreas[work.id] && work.area_ids.every((id) => selectedAreas[work.id].includes(id)));
                return <section key={label} aria-label={label} className="space-y-2 rounded-md border border-border p-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                    <input type="checkbox" className="mt-1 shrink-0" checked={included} onChange={() => changeSelection(works)} />
                    <span className="min-w-0 whitespace-normal break-words">{label}</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {areas.map((areaId) => {
                      const linkedWorks = works.filter((work) => work.area_ids.includes(areaId));
                      const selected = linkedWorks.every((work) => selectedAreas[work.id]?.includes(areaId));
                      return <button key={areaId} type="button" aria-pressed={selected} className={chipClass(selected)} onClick={() => changeSelection(linkedWorks, areaId)}>{areaName(areaId)}</button>;
                    })}
                    {works.some((work) => !work.area_ids.length) && <button type="button" className={chipClass(works.filter((work) => !work.area_ids.length).every((work) => Boolean(selectedAreas[work.id])))} aria-pressed={works.filter((work) => !work.area_ids.length).every((work) => Boolean(selectedAreas[work.id]))} onClick={() => changeSelection(works.filter((work) => !work.area_ids.length))}>No room assigned</button>}
                  </div>
                  {siteId && <div className="border-t border-dashed border-border pt-2">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Add another area and measurement</p>
                    <div className="flex flex-wrap gap-1.5">
                      {otherAreas.map((area) => <Button key={area.id} type="button" size="sm" variant="outline" className="min-h-8 h-auto whitespace-normal border-amber-500/30 bg-amber-500/[0.07] px-2 py-1 text-left text-xs text-amber-800 dark:text-amber-300" onClick={() => setMeasurementRequest({ workIds: targetWorkIds, areaId: area.id })}>{area.name}</Button>)}
                      <Button type="button" size="sm" variant="outline" className="min-h-8 h-auto px-2 py-1 text-xs" onClick={() => setMeasurementRequest({ workIds: targetWorkIds })}><Plus className="mr-1 h-3.5 w-3.5" />New area</Button>
                    </div>
                  </div>}
                </section>;
              }) : [...roomIds, ...(matchingWorkRequired.some((work) => !work.area_ids.length) ? [""] : [])].map((areaId) => {
                const works = matchingWorkRequired.filter((work) => areaId ? work.area_ids.includes(areaId) : !work.area_ids.length);
                const included = works.every((work) => areaId ? selectedAreas[work.id]?.includes(areaId) : Boolean(selectedAreas[work.id]));
                return <section key={areaId} aria-label={areaId ? areaName(areaId) : "No room assigned"} className="space-y-2 rounded-md border border-border p-2">
                  <button type="button" aria-pressed={included} className={`${chipClass(included)} font-semibold`} onClick={() => changeSelection(works, areaId || undefined)}>{areaId ? areaName(areaId) : "No room assigned"}</button>
                  <div className="space-y-2">
                    {[...workGroups].map(([label, group]) => {
                      const linked = group.filter((work) => works.includes(work));
                      if (!linked.length) return null;
                      const selected = linked.every((work) => areaId ? selectedAreas[work.id]?.includes(areaId) : Boolean(selectedAreas[work.id]));
                      return <label key={label} className="flex cursor-pointer items-start gap-2 text-xs">
                        <input type="checkbox" className="mt-0.5 shrink-0" checked={selected} onChange={() => changeSelection(linked, areaId || undefined)} /><span>{label}</span>
                      </label>;
                    })}
                  </div>
                </section>;
              })}
              {!matchingWorkRequired.length && <p className="text-xs text-muted-foreground">{customerId ? "No Work Required for this selection" : "Select a customer first"}</p>}
            </div>
            {customerId && !siteId && <p className="mt-1 text-[11px] text-muted-foreground">Customer-level Work Required can be included now and remains unlinked coverage until a Site exists.</p>}
            {customerId && siteId && matchingWorkRequired.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">A General scope will be created on this Site when you submit.</p>}
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Quotation title"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Modular kitchen — 3BHK" autoFocus /></Field>
            <Field label="Valid until"><Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field>
          </div>

          <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <CalendarClock className="mr-1 inline h-3 w-3" />
            Site coverage uses verified Measurement revisions only. Customer-level drafts remain valid before a Site exists.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={requestClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || (matchingWorkRequired.length > 0 && !workRequiredIds.length)} className="gap-1.5"><Check className="h-4 w-4" />Create quotation</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
      {measurementRequest && siteId && <QuotationMeasurementDialog
        siteId={siteId}
        workIds={measurementRequest.workIds}
        initialAreaId={measurementRequest.areaId}
        onClose={() => setMeasurementRequest(null)}
        onSaved={(areaId, workIds) => {
          setSelectedAreas((current) => {
            const next = { ...current };
            for (const workId of workIds) next[workId] = [...new Set([...(next[workId] || []), areaId])];
            return next;
          });
          setMeasurementRequest(null);
        }}
      />}
    </>
  );
}

export function activeQuotationForWork(db: Pick<RDashDatabase, "quotations">, workRequiredId: string, areaIds?: string[]) {
  return db.quotations.find((quotation) =>
    quotation.status !== "cancelled" &&
    quotation.coverage.some((coverage) => coverage.work_required_id === workRequiredId &&
      (!areaIds?.length || !coverage.area_ids.length || coverage.area_ids.some((id) => areaIds.includes(id)))),
  );
}

export function verifiedMeasurementRevisionIds(
  db: Pick<RDashDatabase, "measurementRevisions">,
  siteId: string,
  work: Pick<WorkRequired, "id" | "area_ids">,
): string[] {
  const allowedAreas = new Set(work.area_ids);
  return db.measurementRevisions
    .filter((revision) =>
      revision.site_id === siteId &&
      revision.work_required_id === work.id &&
      revision.status === "verified" &&
      allowedAreas.has(revision.area_id),
    )
    .map((revision) => revision.id);
}

export function unverifiedAreaIdsForWork(
  db: Pick<RDashDatabase, "measurementRevisions">,
  siteId: string,
  work: Pick<WorkRequired, "id" | "area_ids">,
): string[] {
  const measured = new Set(
    db.measurementRevisions
      .filter((revision) => revision.site_id === siteId && revision.work_required_id === work.id && revision.status === "verified")
      .map((revision) => revision.area_id),
  );
  return work.area_ids.filter((areaId) => !measured.has(areaId));
}

function QuotationMeasurementDialog({ siteId, workIds, initialAreaId, onClose, onSaved }: {
  siteId: string;
  workIds: string[];
  initialAreaId?: string;
  onClose: () => void;
  onSaved: (areaId: string, workIds: string[]) => void;
}) {
  const db = useRDashStore((state) => state.db);
  const addArea = useRDashStore((state) => state.addArea);
  const updateArea = useRDashStore((state) => state.updateArea);
  const updateWorkRequired = useRDashStore((state) => state.updateWorkRequired);
  const addMeasurementRevision = useRDashStore((state) => state.addMeasurementRevision);
  const currentUser = useRDashStore((state) => state.currentUser);
  const site = db.sites.find((row) => row.id === siteId && !row.is_archived);
  const works = workIds.map((id) => db.workRequired.find((row) => row.id === id && row.site_id === siteId)).filter((work): work is WorkRequired => Boolean(work));
  const existingAreas = db.areas.filter((area) => area.site_id === siteId && !area.is_archived);
  const initialArea = existingAreas.find((area) => area.id === initialAreaId);
  const [areaId, setAreaId] = React.useState(initialArea?.id || "__new__");
  const [name, setName] = React.useState(initialArea?.name || "");
  const [dimensions, setDimensions] = React.useState<CustomerAreaDimensionsDraft>({
    length: initialArea?.length ? String(initialArea.length) : "",
    breadth: initialArea?.width ? String(initialArea.width) : "",
    height: initialArea?.height ? String(initialArea.height) : "",
  });
  const [unit, setUnit] = React.useState<"ft" | "m">(initialArea?.unit || "ft");
  const [notes, setNotes] = React.useState(initialArea?.notes || "");
  const [saving, setSaving] = React.useState(false);

  const chooseArea = (value: string) => {
    setAreaId(value);
    const area = existingAreas.find((row) => row.id === value);
    setName(area?.name || "");
    setDimensions({
      length: area?.length ? String(area.length) : "",
      breadth: area?.width ? String(area.width) : "",
      height: area?.height ? String(area.height) : "",
    });
    setUnit(area?.unit || "ft");
    setNotes(area?.notes || "");
  };

  const save = () => {
    if (!site || !works.length || works.length !== workIds.length) return toast.error("The selected Site or Work Required is no longer available.");
    const length = positiveDimension(dimensions.length);
    const width = positiveDimension(dimensions.breadth);
    const height = positiveDimension(dimensions.height);
    if (!name.trim()) return toast.error("Enter the area name.");
    if (!length || !width) return toast.error("Enter a positive length and breadth.");

    setSaving(true);
    try {
      let savedAreaId = areaId === "__new__" ? "" : areaId;
      const duplicate = existingAreas.find((area) => area.name.trim().toLowerCase() === name.trim().toLowerCase() && area.id !== savedAreaId);
      if (duplicate) throw new Error(`Area “${duplicate.name}” already exists. Select it instead of creating a duplicate.`);
      if (savedAreaId) {
        updateArea(savedAreaId, { name: name.trim(), length, width, height, unit, notes: notes.trim() || undefined, stage: "measured" });
      } else {
        savedAreaId = addArea({ site_id: site.id, name: name.trim(), area_type: "other", length, width, height, unit, notes: notes.trim() || undefined, stage: "measured" });
      }
      for (const work of works) {
        const area = db.areas.find((row) => row.id === savedAreaId) || {
          id: savedAreaId,
          name: name.trim(),
        };
        const alreadyCaptured = (work.structured_items || []).some((item) => item.area_id === savedAreaId);
        const structuredItems = alreadyCaptured
          ? work.structured_items || []
          : [...(work.structured_items || []), quotationMeasuredLine({
              work,
              area,
              siteName: site.name,
              dimensions: { length, breadth: width, height: height || 0 },
              workSubcategories: db.master.workSubcategories,
              contractorRates: db.master.contractorRates,
              id: `req-line-${crypto.randomUUID()}`,
            })];
        updateWorkRequired(work.id, {
          area_ids: work.area_ids.includes(savedAreaId) ? work.area_ids : [...work.area_ids, savedAreaId],
          structured_items: structuredItems,
        });
        addMeasurementRevision({
          site_id: site.id,
          area_id: savedAreaId,
          work_required_id: work.id,
          length,
          width,
          height,
          unit,
          notes: notes.trim() || "Verified while preparing quotation",
          captured_by: currentUser().name,
          status: "verified",
        });
      }
      toast.success(`${name.trim()} measured and added to this quotation.`);
      onSaved(savedAreaId, works.map((work) => work.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the verified measurement.");
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <div className="flex items-start gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Ruler className="h-5 w-5" /></span><div><DialogTitle className="text-base">Add verified area measurement</DialogTitle><DialogDescription className="text-xs">Stay in the quotation and add or measure a room for {works.map((work) => work.title).join(" / ") || "this work"}.</DialogDescription></div></div>
      </DialogHeader>
      <div className="rd-scroll max-h-[65vh] space-y-4 overflow-y-auto py-2">
        <Field label="Area / room">
          <Select value={areaId} onValueChange={chooseArea}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__new__">＋ New area / room</SelectItem>{existingAreas.map((area) => <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Area name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2nd Bedroom near hall" autoFocus /></Field>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <CustomerAreaDimensionsFields value={dimensions} onChange={setDimensions} />
          <Field label="Unit"><select value={unit} onChange={(event) => setUnit(event.target.value as "ft" | "m")} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="ft">feet</option><option value="m">metres</option></select></Field>
        </div>
        <Field label="Measurement notes"><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional site notes" /></Field>
        <p className="rounded-md border border-dashed border-primary/30 bg-primary/[0.04] px-3 py-2 text-[11px] text-muted-foreground">Saving creates the verified measurement revision required by quotation coverage and links this area to the selected work.</p>
      </div>
      <DialogFooter className="gap-2"><Button type="button" size="sm" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="button" size="sm" onClick={save} disabled={saving}><Check className="mr-1 h-3.5 w-3.5" />{saving ? "Saving…" : "Save measurement"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>{children}</div>;
}
