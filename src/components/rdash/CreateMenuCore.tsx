"use client";
import * as React from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { notifyCreated, notifyConverted } from "@/lib/rdash/notify";
import { useRDashStore, type CreateDialogKind, type CreateDialogRequest } from "@/lib/rdash/store";
import type { RDashDatabase, VisitType } from "@/lib/rdash/types";
import { indiaDateTimeInputValue } from "@/lib/rdash/format";
import { Plus, ListPlus, FilePlus2, MapPinPlus, PhoneCall, Check, ChevronDown, } from "lucide-react";
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

function VisitCustomerSitePicker({ customers, sites, customerId, siteId, onSelect }: {
    customers: RDashDatabase["customers"];
    sites: RDashDatabase["sites"];
    customerId: string;
    siteId: string;
    onSelect: (customerId: string, siteId: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [sortOrder, setSortOrder] = React.useState<"az" | "za">("az");
    const [siteFilter, setSiteFilter] = React.useState<"all" | "one" | "multiple" | "none">("all");
    const [expandedCustomerId, setExpandedCustomerId] = React.useState("");
    const selectedCustomer = customers.find((customer) => customer.id === customerId);
    const selectedSite = sites.find((site) => site.id === siteId);
    const rows = React.useMemo(() => customers.map((customer) => {
        const customerSites = sites.filter((site) => site.customer_id === customer.id && !site.is_archived);
        return { customer, customerSites };
    }).filter(({ customer, customerSites }) => {
        const needle = query.trim().toLowerCase();
        const matchesQuery = !needle || [customer.name, ...customerSites.flatMap((site) => [site.name, site.city, site.locality])]
            .filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
        const matchesFilter = siteFilter === "all"
            || (siteFilter === "one" && customerSites.length === 1)
            || (siteFilter === "multiple" && customerSites.length > 1)
            || (siteFilter === "none" && customerSites.length === 0);
        return matchesQuery && matchesFilter;
    }).sort((a, b) => {
        const comparison = a.customer.name.localeCompare(b.customer.name, "en", { sensitivity: "base" });
        return sortOrder === "az" ? comparison : -comparison;
    }), [customers, query, siteFilter, sites, sortOrder]);

    return <Field label="Customer / Site *">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between px-3 font-normal">
            <span className="truncate">{selectedCustomer ? `${selectedCustomer.name}${selectedSite ? ` · ${selectedSite.name}` : " · choose site"}` : "Select customer and site…"}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[420px] max-w-[calc(100vw-2rem)] p-0">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-1 border-b border-border p-2">
            <Input aria-label="Search customers or sites" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers or sites…" className="h-8" autoFocus />
            <select aria-label="Sort customers" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "az" | "za")} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
              <option value="az">A–Z</option><option value="za">Z–A</option>
            </select>
            <select aria-label="Filter customers" value={siteFilter} onChange={(event) => setSiteFilter(event.target.value as typeof siteFilter)} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
              <option value="all">All sites</option><option value="multiple">Multi-site</option><option value="one">One site</option><option value="none">No site</option>
            </select>
          </div>
          <div className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label="Customers and sites">
            {rows.map(({ customer, customerSites }) => {
                const expanded = expandedCustomerId === customer.id;
                return <div key={customer.id} className="rounded-md">
                  <button type="button" disabled={!customerSites.length} aria-expanded={customerSites.length > 1 ? expanded : undefined} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" onClick={() => {
                      if (customerSites.length === 1) {
                          onSelect(customer.id, customerSites[0].id);
                          setOpen(false);
                      } else if (customerSites.length > 1) setExpandedCustomerId(expanded ? "" : customer.id);
                  }}>
                    <span className="min-w-0"><span className="block truncate font-medium">{customer.name}</span><span className="block truncate text-[11px] text-muted-foreground">{customerSites.length ? `${customerSites.length} site${customerSites.length === 1 ? "" : "s"}${customerSites[0]?.city ? ` · ${customerSites[0].city}` : ""}` : "No active site"}</span></span>
                    {customerSites.length > 1 && <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}
                  </button>
                  {expanded && <div className="mb-1 ml-5 border-l border-border pl-2">
                    {customerSites.map((site) => <button type="button" key={site.id} role="option" aria-selected={site.id === siteId} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={() => { onSelect(customer.id, site.id); setOpen(false); }}>
                      <span className="truncate">{site.name}{site.locality ? ` · ${site.locality}` : ""}</span>{site.id === siteId && <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>)}
                  </div>}
                </div>;
            })}
            {!rows.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matching customers or sites.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </Field>;
}

function CreateDialog({ request, onClose }: {
    request: CreateDialogRequest;
    onClose: () => void;
}) {
    const { kind, customerId: prefillCustomerId, siteId: prefillSiteId, workRequiredId: prefillWorkRequiredId, visitType: prefillVisitType } = request;
    const db = useRDashStore((s) => s.db);
    const addTask = useRDashStore((s) => s.addTask);
    const addVisit = useRDashStore((s) => s.addVisit);
    const addFollowup = useRDashStore((s) => s.addFollowup);
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
    const defaultAssignee = staff[0]?.id || "";
    const defaultVisitAssignee = visitAssigneeOptions[0]?.value || "";
    const [title, setTitle] = React.useState("");
    const [customerId, setCustomerId] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [priority, setPriority] = React.useState<"low" | "medium" | "high" | "urgent">("medium");
    const [assignee, setAssignee] = React.useState(defaultAssignee);
    const [visitAssignee, setVisitAssignee] = React.useState(defaultVisitAssignee);
    const [dueDate, setDueDate] = React.useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86400000)));
    const [visitScheduledAt, setVisitScheduledAt] = React.useState(() => indiaDateTimeInputValue(new Date(Date.now() + 86400000)));
    const [followupDueAt, setFollowupDueAt] = React.useState(() => indiaDateTimeInputValue(new Date(Date.now() + 86400000)));
    const visitType: VisitType = prefillVisitType || "site_visit";
    const [visitSiteId, setVisitSiteId] = React.useState("");
    const [followupType, setFollowupType] = React.useState<"call" | "quotation" | "payment" | "general">("call");
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
        const customerSites = db.sites.filter((site) => site.customer_id === prefillCustomerId && !site.is_archived);
        setVisitSiteId(prefillSiteId || (customerSites.length === 1 ? customerSites[0].id : ""));
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
                    assigned_staff_id: assignee || undefined,
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
                const [assigneeTypeRaw, assigneeIdRaw] = selectedVisitAssignee.value.split(":") as [
                    "staff" | "contractor",
                    string
                ];
                const isUnassigned = assigneeIdRaw === "unassigned";
                const assigneeType = isUnassigned ? "staff" : assigneeTypeRaw;
                const assigneeId = isUnassigned ? "" : assigneeIdRaw;
                const workRequired = prefillWorkRequiredId ? db.workRequired.find((row) => row.id === prefillWorkRequiredId && row.customer_id === customerId && row.site_id === site.id) : undefined;
                const id = addVisit({
                    customer_id: customerId,
                    site_id: site.id,
                    assignee_type: assigneeType,
                    assigned_staff_id: assigneeType === "staff" ? assigneeId : undefined,
                    contractor_id: assigneeType === "contractor" ? assigneeId : undefined,
                    contractor_name: assigneeType === "contractor" ? selectedVisitAssignee.name : undefined,
                    work_required_id: workRequired?.id,
                    visit_type: visitType,
                    location_target_type: "site",
                    location_name: site.address || site.name,
                    status: "scheduled",
                    scheduled_at: visitScheduledAt,
                    planned_latitude: site.latitude,
                    planned_longitude: site.longitude,
                    notes: description.trim(),
                });
                addRecentCreated({ id, kind: "visit", label: `${visitType.replace("_", " ")} · ${site.name}` });
                notifyCreated("visit", id, `${visitType.replace("_", " ")} visit`, `Scheduled for ${cust?.name || "customer"} · ${site.name} · ${visitScheduledAt}`);
                setActiveModule("fieldOperations");
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
                const id = addFollowup({ title: title.trim(), notes: description.trim(), priority, assigned_staff_id: assignee || undefined, customer_id: customerId || undefined, followup_type: followupType, due_at: followupDate.toISOString(), due_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(followupDate), status: "pending" });
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
                      {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Due date">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
              </Field>
            </>)}

          {kind === "visit" && (<>
              <VisitCustomerSitePicker customers={customers} sites={db.sites} customerId={customerId} siteId={visitSiteId} onSelect={(nextCustomerId, nextSiteId) => { setCustomerId(nextCustomerId); setVisitSiteId(nextSiteId); }} />
              <Field label="Notes">
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Purpose, instructions, or access notes…" rows={3} className="resize-none" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
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
                <Field label="Scheduled date & time"><Input type="datetime-local" value={visitScheduledAt} onChange={(e) => setVisitScheduledAt(e.target.value)}/></Field>
              </div>
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">The selected Customer Site supplies the geofence automatically. GPS check-in and check-out calculate the actual time spent on site; manual buttons remain available if automation cannot run.</p>
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
                      {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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

