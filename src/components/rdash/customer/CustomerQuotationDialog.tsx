"use client";

import * as React from "react";
import { CalendarClock, Check, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyCreated } from "@/lib/rdash/notify";
import { useRDashStore, type CreateDialogRequest } from "@/lib/rdash/store";
import type { RDashDatabase, WorkRequired } from "@/lib/rdash/types";
import { workTypeNamesForIds } from "@/lib/rdash/work-types";

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
  const [workRequiredIds, setWorkRequiredIds] = React.useState<string[]>(request.workRequiredId ? [request.workRequiredId] : []);
  const [title, setTitle] = React.useState(initialWorkRequired?.title || (initialCustomer ? `${initialCustomer.name}${initialSite ? ` · ${initialSite.name}` : ""}` : ""));
  const [validUntil, setValidUntil] = React.useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);

  const customerSites = React.useMemo(
    () => db.sites.filter((site) => site.customer_id === customerId && !site.is_archived),
    [customerId, db.sites],
  );
  const matchingWorkRequired = React.useMemo(
    () => db.workRequired.filter((work) => work.customer_id === customerId && work.site_id === siteId),
    [customerId, db.workRequired, siteId],
  );

  const defaultTitle = () => {
    const customer = db.customers.find((row) => row.id === customerId);
    const site = customerSites.find((row) => row.id === siteId);
    return customer ? `${customer.name}${site ? ` · ${site.name}` : ""}` : "";
  };

  const toggleWorkRequired = (workId: string) => {
    const ids = workRequiredIds.includes(workId)
      ? workRequiredIds.filter((id) => id !== workId)
      : [...workRequiredIds, workId];
    setWorkRequiredIds(ids);
    setTitle(ids.map((id) => matchingWorkRequired.find((work) => work.id === id)?.title).filter(Boolean).join(" / ") || defaultTitle());
  };

  const workRequiredLabel = (work: WorkRequired) => [
    (work.work_subcategory_ids || [])
      .map((id) => db.master.workSubcategories.find((subcategory) => subcategory.id === id)?.name)
      .filter(Boolean)
      .join(" + "),
    ...workTypeNamesForIds(db.master.workSubcategories, work.work_type_ids),
  ].filter(Boolean).join(" · ") || work.title;

  const handleSubmit = () => {
    if (!customerId) {
      toast.error("Please select a customer");
      return;
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
        selectedWorkRequired = created ? [created] : [{
          id: newId,
          customer_id: customerId,
          site_id: site.id,
          title: scopeTitle,
          area_ids: [],
          structured_items: [],
          status: "new",
          priority: "medium",
        } as WorkRequired];
      }

      // One active commercial path per Work Required. Site Execution used to
      // implement this check separately; it now belongs to the Customer-owned
      // canonical quotation workflow and therefore applies from every module.
      const alreadyCovered = selectedWorkRequired.flatMap((work) => {
        const quotation = activeQuotationForWork(db, work.id);
        return quotation ? [{ work, quotation }] : [];
      });
      if (alreadyCovered.length) {
        if (alreadyCovered.length === 1 && selectedWorkRequired.length === 1) {
          toast.info(`${alreadyCovered[0].quotation.quotation_no} already covers this Work Required.`);
          openDetail("quotation", alreadyCovered[0].quotation.id);
          onClose();
          return;
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
          const measuredAreaIds = new Set(
            db.measurementRevisions
              .filter((revision) => verified.includes(revision.id))
              .map((revision) => revision.area_id),
          );
          const missingAreas = work.area_ids.filter((areaId) => !measuredAreaIds.has(areaId));
          if (missingAreas.length) {
            const names = missingAreas
              .map((areaId) => db.areas.find((area) => area.id === areaId)?.name || areaId)
              .join(", ");
            throw new Error(`Complete a verified Measurement Visit for ${names} before preparing this quotation.`);
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
      });

      addRecentCreated({ id, kind: "quotation", label: quotationTitle });
      notifyCreated(
        "quotation",
        id,
        quotationTitle,
        `Draft for ${customer.name}${site ? ` · ${site.name}` : " · no site yet"} · valid until ${validUntil}`,
      );
      openDetail("quotation", id);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create quotation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FilePlus2 className="h-5 w-5" /></span>
            <div>
              <DialogTitle className="text-base">New quotation</DialogTitle>
              <DialogDescription className="text-xs">Canonical Customer quotation workflow</DialogDescription>
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
                setWorkRequiredIds([]);
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
                  setWorkRequiredIds([]);
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

          <Field label="Work Required (optional)">
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-input bg-card p-2">
              {matchingWorkRequired.length ? matchingWorkRequired.map((work) => (
                <label key={work.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent/40">
                  <input type="checkbox" checked={workRequiredIds.includes(work.id)} onChange={() => toggleWorkRequired(work.id)} />
                  <span>{workRequiredLabel(work)}</span>
                </label>
              )) : <p className="px-1 py-1 text-xs text-muted-foreground">{customerId ? "No Work Required for this selection" : "Select a customer first"}</p>}
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
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5"><Check className="h-4 w-4" />Create quotation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function activeQuotationForWork(db: Pick<RDashDatabase, "quotations">, workRequiredId: string) {
  return db.quotations.find((quotation) =>
    quotation.status !== "cancelled" &&
    quotation.coverage.some((coverage) => coverage.work_required_id === workRequiredId),
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>{children}</div>;
}
