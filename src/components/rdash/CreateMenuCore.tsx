"use client";
import * as React from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { toast } from "sonner";
import { notifyCreated, notifyConverted } from "@/lib/rdash/notify";
import { useRDashStore, type CreateDialogKind, type CreateDialogRequest } from "@/lib/rdash/store";
import type { VisitType, WorkRequired } from "@/lib/rdash/types";
import { indiaDateTimeInputValue } from "@/lib/rdash/format";
import { Plus, ListPlus, FilePlus2, MapPinPlus, PhoneCall, Check, CalendarClock, } from "lucide-react";
const CREATE_OPTIONS: {
    kind: CreateDialogKind;
    label: string;
    desc: string;
    icon: React.ElementType;
    shortcut: string;
}[] = [
    { kind: "task", label: "New task", desc: "Create an actionable task", icon: ListPlus, shortcut: "N T" },
    { kind: "quotation", label: "New quotation", desc: "Draft a quotation for a customer", icon: FilePlus2, shortcut: "N Q" },
    { kind: "visit", label: "Schedule visit", desc: "Plan a site visit or measurement", icon: MapPinPlus, shortcut: "N V" },
    { kind: "followup", label: "New follow-up", desc: "Log a call / payment / quotation follow-up", icon: PhoneCall, shortcut: "N F" },
];
export function CreateMenu({ showTrigger = true, enableHotkeys = showTrigger, }: {
    showTrigger?: boolean;
    enableHotkeys?: boolean;
} = {}) {
    const [menuOpen, setMenuOpen] = React.useState(false);
    const createDialog = useRDashStore((s) => s.createDialog);
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const closeCreateDialog = useRDashStore((s) => s.closeCreateDialog);
    React.useEffect(() => {
        if (!enableHotkeys)
            return;
        let firstN = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onKey = (event: KeyboardEvent) => {
            const tag = (event.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || (event.target as HTMLElement)?.isContentEditable)
                return;
            if (firstN) {
                const shortcutMap: Record<string, CreateDialogKind> = { t: "task", q: "quotation", v: "visit", f: "followup" };
                const kind = shortcutMap[event.key.toLowerCase()];
                if (kind) {
                    event.preventDefault();
                    openCreateDialog({ kind });
                }
                firstN = false;
                if (timer)
                    clearTimeout(timer);
                return;
            }
            if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
                firstN = true;
                if (timer)
                    clearTimeout(timer);
                timer = setTimeout(() => { firstN = false; }, 1200);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            if (timer)
                clearTimeout(timer);
        };
    }, [enableHotkeys, openCreateDialog]);
    return (<>
      {showTrigger && (<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4"/>
              <span className="hidden sm:inline">Create</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Quick create
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CREATE_OPTIONS.map((opt) => (<DropdownMenuItem key={opt.kind} onClick={() => { openCreateDialog({ kind: opt.kind }); setMenuOpen(false); }} className="flex items-start gap-2.5 py-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <opt.icon className="h-3.5 w-3.5"/>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{opt.label}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{opt.desc}</p>
                </div>
                <kbd className="ml-auto rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{opt.shortcut}</kbd>
              </DropdownMenuItem>))}
          </DropdownMenuContent>
        </DropdownMenu>)}

      {createDialog && <CreateDialog request={createDialog} onClose={closeCreateDialog}/>}
    </>);
}
function CreateDialog({ request, onClose }: {
    request: CreateDialogRequest;
    onClose: () => void;
}) {
    const { kind, customerId: prefillCustomerId, siteId: prefillSiteId, workRequiredId: prefillWorkRequiredId, visitType: prefillVisitType } = request;
    const db = useRDashStore((s) => s.db);
    const addTask = useRDashStore((s) => s.addTask);
    const addQuotation = useRDashStore((s) => s.addQuotation);
    const addVisit = useRDashStore((s) => s.addVisit);
    const addFollowup = useRDashStore((s) => s.addFollowup);
    const addWorkRequired = useRDashStore((s) => s.addWorkRequired);
    const addRecentCreated = useRDashStore((s) => s.addRecentCreated);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const customers = db.customers;
    const staff = db.master.staff.filter((member) => member.status === "active");
    const contractors = db.master.contractors;
    const visitAssigneeOptions = React.useMemo(() => {
        const opts: Array<{ value: string; id: string; name: string; label: string; meta: string }> = [
            ...staff.map((s) => ({
                value: `staff:${s.id}`,
                id: s.id,
                name: s.name,
                label: s.name,
                meta: s.role,
            })),
            ...contractors.map((c) => ({
                value: `contractor:${c.id}`,
                id: c.id,
                name: c.name,
                label: `${c.name} (contractor)`,
                meta: c.trade || c.city || "Contractor",
            })),
        ];
        // Flexibility fallback: always allow "Unassigned" so a business with no staff set up
        // yet can still schedule visits (the owner can assign later).
        if (!opts.length) {
            opts.push({ value: "staff:unassigned", id: "unassigned", name: "Unassigned", label: "Unassigned (assign later)", meta: "Owner / unassigned" });
        }
        return opts;
    }, [contractors, staff]);
    const meta = CREATE_OPTIONS.find((o) => o.kind === kind)!;
    const defaultAssignee = staff[0]?.name || "Field Staff";
    const defaultVisitAssignee = visitAssigneeOptions[0]?.value || "";
    const [title, setTitle] = React.useState("");
    const [customerId, setCustomerId] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [priority, setPriority] = React.useState<"low" | "medium" | "high" | "urgent">("medium");
    const [assignee, setAssignee] = React.useState(defaultAssignee);
    const [visitAssignee, setVisitAssignee] = React.useState(defaultVisitAssignee);
    const [dueDate, setDueDate] = React.useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86400000)));
    const [visitScheduledAt, setVisitScheduledAt] = React.useState(() => indiaDateTimeInputValue(new Date(Date.now() + 86400000)));
    const [visitDuration, setVisitDuration] = React.useState("60");
    const [followupDueAt, setFollowupDueAt] = React.useState(() => indiaDateTimeInputValue(new Date(Date.now() + 86400000)));
    const [visitType, setVisitType] = React.useState<VisitType>("site_visit");
    const [visitSiteId, setVisitSiteId] = React.useState("");
    const [visitTargetType, setVisitTargetType] = React.useState<"site" | "vendor">("site");
    const [visitVendorId, setVisitVendorId] = React.useState("");
    const [visitWorkRequiredId, setVisitWorkRequiredId] = React.useState("");
    const [followupType, setFollowupType] = React.useState<"call" | "quotation" | "payment" | "general">("call");
    const [quoteWorkRequiredId, setQuoteWorkRequiredId] = React.useState("");
    const [quoteSiteId, setQuoteSiteId] = React.useState("");
    const [validUntil, setValidUntil] = React.useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    const [submitting, setSubmitting] = React.useState(false);
    React.useEffect(() => {
        setTitle("");
        setCustomerId(prefillCustomerId || "");
        setDescription("");
        setPriority("medium");
        setAssignee(defaultAssignee);
        setVisitAssignee(defaultVisitAssignee);
        setDueDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86400000)));
        setVisitScheduledAt(indiaDateTimeInputValue(new Date(Date.now() + 86400000)));
        setFollowupDueAt(indiaDateTimeInputValue(new Date(Date.now() + 86400000)));
        setVisitDuration("60");
        setValidUntil(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
        setQuoteWorkRequiredId(prefillWorkRequiredId || "");
        setQuoteSiteId(prefillSiteId || "");
        setVisitSiteId(prefillSiteId || "");
        setVisitTargetType("site");
        setVisitVendorId("");
        setVisitWorkRequiredId(prefillWorkRequiredId || "");
        setVisitType(prefillVisitType || "site_visit");
    }, [defaultAssignee, defaultVisitAssignee, kind, prefillCustomerId, prefillSiteId, prefillVisitType, prefillWorkRequiredId]);
    const handleSubmit = () => {
        setSubmitting(true);
        try {
            if (kind === "task") {
                if (!title.trim()) {
                    toast.error("Task title is required");
                    setSubmitting(false);
                    return;
                }
                const id = addTask({
                    title: title.trim(),
                    description: description.trim(),
                    priority,
                    assignee_name: assignee,
                    due_date: dueDate,
                    customer_id: customerId || undefined,
                    task_scope: customerId ? "client" : "general",
                    task_type: "general",
                    status: "todo",
                });
                addRecentCreated({ id, kind: "task", label: title.trim() });
                notifyCreated("task", id, title.trim(), `Due ${dueDate} · ${priority} priority`);
                openDetail("task", id);
            }
            else if (kind === "quotation") {
                if (!customerId) {
                    toast.error("Please select a customer");
                    setSubmitting(false);
                    return;
                }
                const cust = customers.find((c) => c.id === customerId);
                // Resolve a Work Required for the selected customer. If none exists yet, auto-create a "General scope" Work Required against the customer's first site so the quotation can be drafted immediately.
                let workRequired = quoteWorkRequiredId ? db.workRequired.find((row) => row.id === quoteWorkRequiredId && row.customer_id === customerId) : undefined;
                let resolvedSiteId = workRequired?.site_id || quoteSiteId || "";
                if (!workRequired) {
                    const fallbackSite = quoteSiteId ? db.sites.find((row) => row.id === quoteSiteId && row.customer_id === customerId) : db.sites.find((row) => row.customer_id === customerId && !row.is_archived);
                    if (!fallbackSite) {
                        toast.error("Add a customer Site first (Customer Desk → Add Site) before creating a quotation.");
                        setSubmitting(false);
                        return;
                    }
                    resolvedSiteId = fallbackSite.id;
                    const scopeTitle = title.trim() ? `${title.trim()} — scope` : "General scope";
                    try {
                        const newId = addWorkRequired({
                            customer_id: customerId,
                            site_id: fallbackSite.id,
                            title: scopeTitle,
                            area_ids: [],
                            status: "new",
                            priority: "medium",
                        });
                        // db is the React-state snapshot and may be stale immediately after addWorkRequired — synthesise the row locally so the quotation can be drafted in the same tick.
                        workRequired = { id: newId, customer_id: customerId, site_id: fallbackSite.id, title: scopeTitle, area_ids: [], structured_items: [], status: "new" as const, priority: "medium" as const } as unknown as WorkRequired;
                    }
                    catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not create Work Required for this site.");
                        setSubmitting(false);
                        return;
                    }
                }
                const site = db.sites.find((row) => row.id === resolvedSiteId);
                if (!site) {
                    toast.error("A quotation requires a valid customer site");
                    setSubmitting(false);
                    return;
                }
                if (!workRequired) {
                    toast.error("Could not resolve Work Required for this quotation.");
                    setSubmitting(false);
                    return;
                }
                const qTitle = title.trim() || `${site.name} · ${workRequired.title}`;
                const id = addQuotation({
                    customer_id: customerId,
                    site_id: site.id,
                    coverage: [{
                            id: `coverage-${Date.now().toString(36)}`,
                            work_required_id: workRequired.id,
                            area_ids: workRequired.area_ids,
                            measurement_revision_ids: db.measurementRevisions.filter((revision) => revision.site_id === site.id && workRequired.area_ids.includes(revision.area_id)).map((revision) => revision.id),
                            coverage_label: workRequired.title,
                            status: "proposed",
                        }],
                    title: qTitle,
                    valid_until: validUntil,
                    status: "draft",
                });
                if (!id) {
                    toast.error("Quotation could not be created. Check the selected site and work coverage.");
                    setSubmitting(false);
                    return;
                }
                addRecentCreated({ id, kind: "quotation", label: qTitle });
                notifyCreated("quotation", id, qTitle, `Draft for ${cust?.name || "customer"} · ${site.name} · valid until ${validUntil}`);
                openDetail("quotation", id);
            }
            else if (kind === "visit") {
                if (!customerId) {
                    toast.error("Please select a customer");
                    setSubmitting(false);
                    return;
                }
                if (!visitSiteId) {
                    toast.error("Select the customer site for this field visit");
                    setSubmitting(false);
                    return;
                }
                const selectedVisitAssignee = visitAssigneeOptions.find((o) => o.value === visitAssignee) || visitAssigneeOptions[0];
                if (!selectedVisitAssignee) {
                    toast.error("Please select staff or contractor");
                    setSubmitting(false);
                    return;
                }
                const cust = customers.find((c) => c.id === customerId);
                const site = db.sites.find((row) => row.id === visitSiteId && row.customer_id === customerId);
                if (!site) {
                    toast.error("The selected site does not belong to this customer");
                    setSubmitting(false);
                    return;
                }
                const vendor = visitTargetType === "vendor" ? db.master.vendors.find((row) => row.id === visitVendorId) : undefined;
                if (visitTargetType === "vendor" && !vendor) {
                    toast.error("Select the registered Vendor location");
                    setSubmitting(false);
                    return;
                }
                if (visitTargetType === "vendor" && (vendor!.latitude == null || vendor!.longitude == null)) {
                    toast.error("Capture GPS coordinates for this Vendor before scheduling an automatic geofence Visit");
                    setSubmitting(false);
                    return;
                }
                if (visitTargetType === "vendor" && visitType === "measurement") {
                    toast.error("A Measurement Visit must use the selected customer Site, not a Vendor location");
                    setSubmitting(false);
                    return;
                }
                const [assigneeTypeRaw, assigneeIdRaw] = selectedVisitAssignee.value.split(":") as [
                    "staff" | "contractor",
                    string
                ];
                const isUnassigned = assigneeIdRaw === "unassigned";
                const assigneeType = isUnassigned ? "staff" : assigneeTypeRaw;
                const assigneeId = isUnassigned ? "" : assigneeIdRaw;
                const selectedWorkRequiredId = visitWorkRequiredId === "none" ? "" : visitWorkRequiredId;
                if (visitType === "measurement" && !selectedWorkRequiredId) {
                    toast.error("Select the Work Required being measured");
                    setSubmitting(false);
                    return;
                }
                const workRequired = selectedWorkRequiredId ? db.workRequired.find((row) => row.id === visitWorkRequiredId && row.customer_id === customerId && row.site_id === site.id) : undefined;
                if (visitWorkRequiredId && !workRequired) {
                    toast.error("The selected Work Required no longer belongs to this customer site");
                    setSubmitting(false);
                    return;
                }
                const id = addVisit({
                    customer_id: customerId,
                    site_id: site.id,
                    assignee_type: assigneeType,
                    staff_id: assigneeType === "staff" ? assigneeId : "",
                    staff_name: assigneeType === "staff" ? selectedVisitAssignee.name : "",
                    contractor_id: assigneeType === "contractor" ? assigneeId : undefined,
                    contractor_name: assigneeType === "contractor" ? selectedVisitAssignee.name : undefined,
                    work_required_id: workRequired?.id,
                    visit_type: visitType,
                    location_target_type: visitTargetType,
                    vendor_id: vendor?.id,
                    vendor_name: vendor?.name,
                    location_name: visitTargetType === "vendor" ? (vendor?.address || vendor?.name || "Vendor") : (site.address || site.name),
                    status: "scheduled",
                    scheduled_at: visitScheduledAt,
                    scheduled_duration_minutes: Math.max(15, Number(visitDuration) || 60),
                    planned_latitude: visitTargetType === "vendor" ? vendor?.latitude : site.latitude,
                    planned_longitude: visitTargetType === "vendor" ? vendor?.longitude : site.longitude,
                });
                addRecentCreated({ id, kind: "visit", label: `${visitType.replace("_", " ")} · ${site.name}` });
                notifyCreated("visit", id, `${visitType.replace("_", " ")} visit`, `Scheduled for ${cust?.name || "customer"} · ${site.name} · ${visitScheduledAt}`);
                setActiveModule(visitType === "measurement" ? "siteMeasurement" : "fieldOperations");
            }
            else if (kind === "followup") {
                if (!title.trim()) {
                    toast.error("Follow-up title is required");
                    setSubmitting(false);
                    return;
                }
                const cust = customerId ? customers.find((c) => c.id === customerId) : undefined;
                const followupDate = new Date(followupDueAt);
                if (Number.isNaN(followupDate.getTime())) {
                    toast.error("Choose a valid follow-up date and time");
                    setSubmitting(false);
                    return;
                }
                const id = addFollowup({ title: title.trim(), notes: description.trim(), priority, assigned_to: assignee, customer_id: customerId || undefined, followup_type: followupType, due_at: followupDate.toISOString(), due_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(followupDate), status: "pending" });
                addRecentCreated({ id, kind: "followup", label: title.trim() });
                notifyCreated("followup", id, title.trim(), `${followupType.replace("_", " ")} follow-up${cust ? ` · ${cust.name}` : ""}`);
                setActiveModule("workdesk");
            }
            onClose();
        }
        catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not create the record. Please check the details and try again.");
        }
        finally {
            setSubmitting(false);
        }
    };
    return (<Dialog open onOpenChange={(o) => { if (!o)
        onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <meta.icon className="h-5 w-5"/>
            </span>
            <div>
              <DialogTitle className="text-base">{meta.label}</DialogTitle>
              <DialogDescription className="text-xs">{meta.desc}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {kind === "task" && (<>
              <Field label="Task title *">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Confirm modular kitchen scope" autoFocus/>
              </Field>
              {customerId && <p className="rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2 text-[11px] text-muted-foreground">This task is linked to {customers.find((customer) => customer.id === customerId)?.name || "the selected customer"}.</p>}
              <Field label="Description">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" rows={2} className="resize-none"/>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority">
                  <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Assignee">
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Due date">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
              </Field>
            </>)}

          {kind === "quotation" && (<>
              <Field label="Customer *">
                <Select value={customerId} onValueChange={(value) => { setCustomerId(value); setQuoteWorkRequiredId(""); setQuoteSiteId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select customer…"/></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => { const site = db.sites.find((entry) => entry.customer_id === c.id); return <SelectItem key={c.id} value={c.id}>{c.name}{site?.city ? ` · ${site.city}` : ""}</SelectItem>; })}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Site (optional)">
                <Select value={quoteSiteId} onValueChange={(value) => { setQuoteSiteId(value); setQuoteWorkRequiredId(""); }} disabled={!customerId}>
                  <SelectTrigger><SelectValue placeholder={customerId ? "Pick a customer site (or leave to auto-pick)" : "Select customer first"}/></SelectTrigger>
                  <SelectContent>
                    {db.sites.filter((site) => site.customer_id === customerId && !site.is_archived).map((site) => <SelectItem key={site.id} value={site.id}>{site.name}{site.locality ? ` · ${site.locality}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Work Required (optional)">
                <Select value={quoteWorkRequiredId} onValueChange={setQuoteWorkRequiredId} disabled={!customerId}>
                  <SelectTrigger><SelectValue placeholder={customerId ? "Pick existing scope or auto-create general scope" : "Select customer first"}/></SelectTrigger>
                  <SelectContent>
                    {db.workRequired.filter((row) => row.customer_id === customerId && (!quoteSiteId || row.site_id === quoteSiteId)).map((row) => {
                const site = db.sites.find((candidate) => candidate.id === row.site_id);
                return <SelectItem key={row.id} value={row.id}>{site?.name || "Unknown site"} · {row.title}</SelectItem>;
            })}
                    {db.workRequired.filter((row) => row.customer_id === customerId && (!quoteSiteId || row.site_id === quoteSiteId)).length === 0 && <SelectItem value="__auto__" disabled>↪ Auto-create "General scope" on submit</SelectItem>}
                  </SelectContent>
                </Select>
                {customerId && db.workRequired.filter((row) => row.customer_id === customerId && (!quoteSiteId || row.site_id === quoteSiteId)).length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">No work required captured yet — a "General scope" will be created automatically when you submit, so you can start drafting the quotation right away. Capture detailed scope later from Sites & Execution.</p>}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quotation title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Modular kitchen — 3BHK" autoFocus/></Field>
                <Field label="Valid until"><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}/></Field>
              </div>
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"><CalendarClock className="mr-1 inline h-3 w-3"/>Every service quotation is tied to one customer site and selected work coverage. It opens in an editable composer for line items, milestones, terms and revisions.</p>
            </>)}

          {kind === "visit" && (<>
              <Field label="Customer *">
                <Select value={customerId} onValueChange={(value) => { setCustomerId(value); setVisitSiteId(""); setVisitWorkRequiredId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select customer…"/></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => { const site = db.sites.find((entry) => entry.customer_id === c.id); return <SelectItem key={c.id} value={c.id}>{c.name}{site?.city ? ` · ${site.city}` : ""}</SelectItem>; })}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Site *">
                <Select value={visitSiteId} onValueChange={(value) => { setVisitSiteId(value); setVisitWorkRequiredId(""); }} disabled={!customerId}>
                  <SelectTrigger><SelectValue placeholder={customerId ? "Select customer site…" : "Select customer first"}/></SelectTrigger>
                  <SelectContent>
                    {db.sites.filter((site) => site.customer_id === customerId && !site.is_archived).map((site) => <SelectItem key={site.id} value={site.id}>{site.name}{site.locality ? ` · ${site.locality}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Geofence destination *">
                <Select value={visitTargetType} onValueChange={(value) => { setVisitTargetType(value as "site" | "vendor"); setVisitVendorId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="site">Customer Site</SelectItem><SelectItem value="vendor">Registered Vendor location</SelectItem></SelectContent>
                </Select>
              </Field>
              {visitTargetType === "vendor" && (<Field label="Vendor location *">
                  <Select value={visitVendorId} onValueChange={setVisitVendorId}>
                    <SelectTrigger><SelectValue placeholder="Select vendor with GPS…"/></SelectTrigger>
                    <SelectContent>{db.master.vendors.map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}{vendor.city ? ` · ${vendor.city}` : ""}{vendor.latitude == null || vendor.longitude == null ? " · GPS required" : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>)}
              <Field label={visitType === "measurement" ? "Work Required for measurement *" : "Work Required (optional)"}>
                <Select value={visitWorkRequiredId} onValueChange={setVisitWorkRequiredId} disabled={!visitSiteId || visitTargetType === "vendor"}>
                  <SelectTrigger><SelectValue placeholder={visitTargetType === "vendor" ? "Vendor Visits do not use Site measurement scope" : visitSiteId ? "Select site work requirement…" : "Select Site first"}/></SelectTrigger>
                  <SelectContent>
                    {visitType !== "measurement" && <SelectItem value="none">No linked Work Required</SelectItem>}
                    {db.workRequired.filter((work) => work.customer_id === customerId && work.site_id === visitSiteId).map((work) => {
                        const areaNames = work.area_ids.map((areaId) => db.areas.find((area) => area.id === areaId)?.name).filter(Boolean).join(", ");
                        const category = db.master.workCategories.find((row) => row.id === work.work_category_id);
                        const subcategories = (work.work_subcategory_ids || []).map((id) => db.master.workSubcategories.find((row) => row.id === id)?.name).filter(Boolean);
                        const scope = [category?.name || work.title, subcategories.join(" / ")].filter(Boolean).join(" · ");
                        return <SelectItem key={work.id} value={work.id}>{areaNames || "Site-wide"} → {scope}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Visit type">
                  <Select value={visitType} onValueChange={(v) => setVisitType(v as typeof visitType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="measurement">Measurement</SelectItem>
                      <SelectItem value="site_visit">Site visit</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
                      <SelectItem value="collection">Collection</SelectItem>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="handover">Handover</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Assignee">
                  <Select value={visitAssignee} onValueChange={setVisitAssignee}>
                    <SelectTrigger><SelectValue placeholder="Select staff or contractor..."/></SelectTrigger>
                    <SelectContent>
                      {visitAssigneeOptions.map((option) => (<SelectItem key={option.value} value={option.value}>
                          {option.label} · {option.meta}
                        </SelectItem>))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Scheduled date & time"><Input type="datetime-local" value={visitScheduledAt} onChange={(e) => setVisitScheduledAt(e.target.value)}/></Field>
                <Field label="Duration (minutes)"><Input type="number" min="15" step="15" value={visitDuration} onChange={(e) => setVisitDuration(e.target.value)}/></Field>
              </div>
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">The assigned person cannot be scheduled into an overlapping Visit. Automatic geofence check-in/out uses the selected Customer Site or registered Vendor GPS while the app is open; Manual buttons remain available if automation cannot run.</p>
            </>)}

          {kind === "followup" && (<>
              <Field label="Follow-up title *">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call back regarding paint shade" autoFocus/>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <Select value={followupType} onValueChange={(v) => setFollowupType(v as typeof followupType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="quotation">Quotation</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Customer (optional)">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="None"/></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Assignee">
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Due date & time">
                  <Input type="datetime-local" value={followupDueAt} onChange={(e) => setFollowupDueAt(e.target.value)}/>
                </Field>
              </div>
              <Field label="Notes">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes…" rows={2} className="resize-none"/>
              </Field>
            </>)}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            <Check className="h-4 w-4"/>
            Create {meta.label.replace("New ", "").replace("Schedule ", "")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}) {
    return (<div className="flex flex-col gap-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>);
}

