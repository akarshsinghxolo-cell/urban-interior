"use client";

import * as React from "react";
import { CreateMenu as CoreCreateMenu } from "./CreateMenuCore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarClock, Check, FilePlus2 } from "lucide-react";
import { notifyCreated } from "@/lib/rdash/notify";
import { useRDashStore, type CreateDialogRequest } from "@/lib/rdash/store";
import type { WorkRequired } from "@/lib/rdash/types";

type CreateMenuProps = {
    showTrigger?: boolean;
    enableHotkeys?: boolean;
};

/**
 * Keep the existing quick-create implementation for every record type except
 * quotation. Quotations need one extra business path: a customer-level draft
 * must be creatable before the customer has a Site.
 */
export function CreateMenu(props: CreateMenuProps = {}) {
    const createDialog = useRDashStore((state) => state.createDialog);
    const closeCreateDialog = useRDashStore((state) => state.closeCreateDialog);

    if (createDialog?.kind === "quotation") {
        return <CustomerQuotationDialog request={createDialog} onClose={closeCreateDialog} />;
    }

    return <CoreCreateMenu {...props} />;
}

function CustomerQuotationDialog({ request, onClose }: {
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
    const [customerId, setCustomerId] = React.useState(initialCustomerId);
    const [siteId, setSiteId] = React.useState(initialSiteId);
    const [workRequiredIds, setWorkRequiredIds] = React.useState<string[]>(request.workRequiredId ? [request.workRequiredId] : []);
    const [title, setTitle] = React.useState(initialCustomer ? `${initialCustomer.name}${initialSite ? ` · ${initialSite.name}` : ""}` : "");
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

    const handleSubmit = () => {
        if (!customerId) {
            toast.error("Please select a customer");
            return;
        }

        setSubmitting(true);
        try {
            const customer = db.customers.find((row) => row.id === customerId);
            if (!customer) {
                toast.error("The selected customer no longer exists");
                return;
            }

            const site = siteId
                ? db.sites.find((row) => row.id === siteId && row.customer_id === customerId && !row.is_archived)
                : undefined;
            let selectedWorkRequired = workRequiredIds
                .map((id) => db.workRequired.find((row) => row.id === id && row.customer_id === customerId && row.site_id === siteId))
                .filter((work): work is WorkRequired => Boolean(work));

            if (selectedWorkRequired.length !== workRequiredIds.length) {
                toast.error("One or more selected Work Required records no longer match this Customer and Site");
                return;
            }
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
                selectedWorkRequired = [{
                    id: newId,
                    customer_id: customerId,
                    site_id: site.id,
                    title: scopeTitle,
                    area_ids: [],
                    structured_items: [],
                    status: "new",
                    priority: "medium",
                } as unknown as WorkRequired];
            }

            const quotationTitle = title.trim() || `${customer.name}${site ? ` · ${site.name}` : ""}`;
            const coverage = selectedWorkRequired.map((work, index) => ({
                    id: `coverage-${Date.now().toString(36)}-${index}`,
                    work_required_id: work.id,
                    area_ids: work.area_ids,
                    measurement_revision_ids: db.measurementRevisions
                        .filter((revision) => revision.site_id === site?.id && work.area_ids.includes(revision.area_id))
                        .map((revision) => revision.id),
                    coverage_label: work.title,
                    status: "proposed" as const,
                }));

            const id = addQuotation({
                customer_id: customerId,
                site_id: site?.id || "",
                coverage,
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
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create quotation");
        }
        finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FilePlus2 className="h-5 w-5" />
                        </span>
                        <div>
                            <DialogTitle className="text-base">New quotation</DialogTitle>
                            <DialogDescription className="text-xs">Draft a quotation for a customer</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-2">
                    <Field label="Customer *">
                        <Select value={customerId} onValueChange={(value) => {
                            const sites = db.sites.filter((site) => site.customer_id === value && !site.is_archived);
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
                                {customerSites.map((site) => (
                                    <SelectItem key={site.id} value={site.id}>{site.name}{site.locality ? ` · ${site.locality}` : ""}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>

                    <Field label="Work Required (optional)">
                        <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-input bg-card p-2">
                            {matchingWorkRequired.length ? matchingWorkRequired.map((work) => (
                                <label key={work.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent/40">
                                    <input
                                        type="checkbox"
                                        checked={workRequiredIds.includes(work.id)}
                                        onChange={() => setWorkRequiredIds((current) => current.includes(work.id) ? current.filter((id) => id !== work.id) : [...current, work.id])}
                                    />
                                    <span>{work.title}</span>
                                </label>
                            )) : <p className="px-1 py-1 text-xs text-muted-foreground">{customerId ? "No Work Required for this selection" : "Select a customer first"}</p>}
                        </div>
                        {customerId && !siteId && (
                            <p className="mt-1 text-[11px] text-muted-foreground">Customer-level Work Required can be included now and will remain linked when a Site is added.</p>
                        )}
                        {customerId && siteId && matchingWorkRequired.length === 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">No Work Required exists for this Site yet. A General scope will be created on the selected Site when you submit.</p>
                        )}
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Quotation title">
                            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Modular kitchen — 3BHK" autoFocus />
                        </Field>
                        <Field label="Valid until">
                            <Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                        </Field>
                    </div>

                    <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                        <CalendarClock className="mr-1 inline h-3 w-3" />
                        A quotation can start at Customer level. Site-specific coverage remains strictly linked to a real Site and Work Required once those are selected.
                    </p>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                        <Check className="h-4 w-4" />
                        Create quotation
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
            {children}
        </div>
    );
}
