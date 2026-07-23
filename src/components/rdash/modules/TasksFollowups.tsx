"use client";
import { indiaDate, isDateOnlyOverdue } from "@/lib/rdash/date";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ListTodo, CheckCircle2, CalendarDays, Users, Repeat, PhoneCall, RefreshCw, Plus, CheckSquare, XCircle, MessageSquare, Send, } from "lucide-react";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import { QueueSection, type QueueRecord } from "../QueueSection";
import { MetricCard, StatusBadge } from "../primitives";
import { SavedViewsBar } from "../SavedViewsBar";
import { BulkActionBar, SelectCheckbox, type BulkAction, type BulkAssignOption, type BulkPriorityOption } from "../BulkActions";
import { taskStatusStyle, followupStatusStyle, relativeDay, titleCase, } from "@/lib/rdash/format";
import { buildTaskActions, buildFollowupActions } from "../recordActions";
import type { FilterPreset, DataSource } from "@/lib/rdash/modules";
import { toast } from "sonner";
import { notifyCreated } from "@/lib/rdash/notify";
import { CHANNEL_META } from "./CommunicationCentreModule";
import { formatDateTime } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
type Scope = "all" | "today" | "daily" | "weekly" | "client" | "site" | "staff" | "completed" | "calls" | "quotation" | "payment";
const SCOPES: {
    key: Scope;
    label: string;
}[] = [
    { key: "all", label: "All" },
    { key: "today", label: "Today" },
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "client", label: "Client" },
    { key: "site", label: "Site / WorkOrder" },
    { key: "staff", label: "Staff" },
    { key: "completed", label: "Completed" },
];
export function TasksFollowups({ moduleId, submoduleFilter, filterPresets, dataSource, }: {
    moduleId: string;
    submoduleFilter?: Record<string, string>;
    filterPresets?: FilterPreset[];
    dataSource?: DataSource;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const updateTask = useRDashStore((s) => s.updateTask);
    const updateFollowup = useRDashStore((s) => s.updateFollowup);
    const completeTask = useRDashStore((s) => s.completeTask);
    const addTask = useRDashStore((s) => s.addTask);
    const addFollowup = useRDashStore((s) => s.addFollowup);
    const runFollowupReconciliation = useRDashStore((s) => s.runFollowupReconciliation);
    const currentUser = useRDashStore((s) => s.currentUser);
    const user = currentUser();
    // I: "+ New follow-up" dialog state.
    const [createFollowupOpen, setCreateFollowupOpen] = React.useState(false);
    React.useEffect(() => {
        if (user.role !== "Owner" && user.role !== "Operations Manager")
            return;
        try {
            runFollowupReconciliation();
        }
        catch { }
    }, [runFollowupReconciliation, user.role]);
    const presets = filterPresets && filterPresets.length > 0 ? filterPresets : null;
    const [activePresetId, setActivePresetId] = React.useState<string>(presets?.[0]?.id ?? "all");
    const [scope, setScope] = React.useState<Scope>("all");
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const activeWorkspaceModuleId = useRDashStore((state) => state.activeModuleId);
    React.useEffect(() => {
        if (activeWorkspaceModuleId !== moduleId || (moduleId !== "tasks" && moduleId !== "followups" && moduleId !== "history"))
            return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable))
                return;
            if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
                return;
            const key = e.key;
            if (!/^[1-9]$/.test(key))
                return;
            const idx = parseInt(key, 10) - 1;
            if (presets && idx < presets.length) {
                e.preventDefault();
                const p = presets[idx];
                setActivePresetId(p.id);
                setActiveSavedViewId(null);
                toast.info(`Filter: ${p.label}`, { duration: 1500 });
            }
            else if (!presets && idx < SCOPES.length) {
                e.preventDefault();
                const s = SCOPES[idx];
                setScope(s.key);
                setActiveSavedViewId(null);
                toast.info(`Scope: ${s.label}`, { duration: 1500 });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [presets, moduleId, activeWorkspaceModuleId]);
    const handlePresetChange = (id: string) => {
        setActivePresetId(id);
        setActiveSavedViewId(null);
    };
    const handleScopeChange = (s: Scope) => {
        setScope(s);
        setActiveSavedViewId(null);
    };
    const handleApplySavedView = (view: SavedView) => {
        if (presets) {
            if (view.presetId && presets.some((p) => p.id === view.presetId)) {
                setActivePresetId(view.presetId);
            }
            else {
                setActivePresetId(presets[0]?.id ?? "all");
            }
        }
        else if (view.extra?.scope) {
            setScope(view.extra.scope as Scope);
        }
        setActiveSavedViewId(view.id);
    };
    const activePresetFilter = presets
        ? presets.find((p) => p.id === activePresetId)?.filter || {}
        : {};
    const effectiveFilter: Record<string, string> = {
        ...(submoduleFilter || {}),
        ...activePresetFilter,
    };
    const isFollowupBoard = dataSource === "followups" || effectiveFilter.followup_type != null;
    const [selectMode, setSelectMode] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const toggleSelect = (id: string) => setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) {
        n.delete(id);
    }
    else {
        n.add(id);
    } return n; });
    const clearSelection = () => { setSelectedIds(new Set()); setSelectMode(false); };
    const selectedArr = Array.from(selectedIds);
    const bulkActions: BulkAction[] = [
        {
            label: "Complete",
            icon: <CheckCircle2 className="h-3.5 w-3.5"/>,
            onClick: (ids) => { let completed = 0; ids.forEach((id) => { try {
                completeTask(id, { note: "Bulk completion recorded from Tasks & Follow-ups." });
                completed += 1;
            }
            catch { } }); toast.success(`${completed} task${completed !== 1 ? "s" : ""} completed; protected decision tasks remain open.`); clearSelection(); },
        },
        {
            label: "Cancel",
            icon: <XCircle className="h-3.5 w-3.5"/>,
            variant: "destructive",
            onClick: (ids) => { ids.forEach((id) => updateTask(id, { status: "cancelled" })); toast.warning(`${ids.length} task${ids.length > 1 ? "s" : ""} cancelled`); clearSelection(); },
        },
    ];
    const bulkAssignOptions: BulkAssignOption[] = db.master.staff.map((s) => ({
        label: s.name,
        sublabel: s.role,
        onClick: (ids) => {
            ids.forEach((id) => updateTask(id, { assignee_id: s.id, assignee_name: s.name, assigned_to: s.name }));
            toast.success(`${ids.length} task${ids.length > 1 ? "s" : ""} assigned to ${s.name}`);
            clearSelection();
        },
    }));
    const bulkPriorityOptions: BulkPriorityOption[] = [
        {
            label: "Low",
            tone: "default",
            onClick: (ids) => { ids.forEach((id) => updateTask(id, { priority: "low" })); toast.success(`${ids.length} task${ids.length > 1 ? "s" : ""} set to Low priority`); clearSelection(); },
        },
        {
            label: "Medium",
            tone: "primary",
            onClick: (ids) => { ids.forEach((id) => updateTask(id, { priority: "medium" })); toast.success(`${ids.length} task${ids.length > 1 ? "s" : ""} set to Medium priority`); clearSelection(); },
        },
        {
            label: "High",
            tone: "warning",
            onClick: (ids) => { ids.forEach((id) => updateTask(id, { priority: "high" })); toast.success(`${ids.length} task${ids.length > 1 ? "s" : ""} set to High priority`); clearSelection(); },
        },
        {
            label: "Urgent",
            tone: "destructive",
            onClick: (ids) => { ids.forEach((id) => updateTask(id, { priority: "urgent" })); toast.warning(`${ids.length} task${ids.length > 1 ? "s" : ""} set to Urgent priority`); clearSelection(); },
        },
    ];
    const taskDispatch = React.useMemo(() => ({ updateTask }), [updateTask]);
    const fuDispatch = React.useMemo(() => ({ updateFollowup }), [updateFollowup]);
    const todayStr = indiaDate();
    const applyTaskFilter = (t: (typeof db.tasks)[number]) => {
        if (effectiveFilter.status) {
            const statuses = effectiveFilter.status.split(",");
            if (!statuses.includes(t.status))
                return false;
        }
        if (effectiveFilter.task_scope && t.task_scope !== effectiveFilter.task_scope)
            return false;
        if (effectiveFilter.scope) {
            switch (effectiveFilter.scope) {
                case "today":
                    return t.due_date === todayStr;
                case "weekly":
                    return t.task_scope === "office";
                case "staff":
                    return !!t.assignee_name;
            }
        }
        if (!presets) {
            switch (scope) {
                case "today": return t.due_date === todayStr;
                case "daily": return t.task_scope === "general";
                case "weekly": return t.task_scope === "office";
                case "client": return t.task_scope === "client";
                case "site": return t.task_scope === "site";
                case "staff": return !!t.assignee_name;
                case "completed": return t.status === "completed";
                default: return true;
            }
        }
        return true;
    };
    const applyFuFilter = (f: (typeof db.followups)[number]) => {
        if (effectiveFilter.followup_type && f.followup_type !== effectiveFilter.followup_type)
            return false;
        return true;
    };
    const tasks = db.tasks.filter(applyTaskFilter);
    const followups = db.followups.filter(applyFuFilter).filter((f) => f.status !== "closed");
    const taskRecords: QueueRecord[] = tasks.map((t) => {
        const customer = db.customers.find((p) => p.id === t.customer_id);
        return {
            id: t.id,
            title: t.title,
            subtitle: t.site_id ? db.sites.find((site) => site.id === t.site_id)?.name : undefined,
            customerName: customer?.name,
            status: taskStatusStyle(t.status),
            priority: t.priority,
            due: t.due_date,
            assignee: t.assignee_name,
            meta: titleCase(t.task_scope),
            tone: t.due_date < todayStr && t.status !== "completed" ? "danger" : "default",
            onClick: () => openDetail("task", t.id),
            actions: buildTaskActions(t.id, taskDispatch, { onOpen: () => openDetail("task", t.id) }),
        };
    });
    const fuRecords: QueueRecord[] = followups.map((f) => {
        const customer = db.customers.find((p) => p.id === f.customer_id);
        return {
            id: f.id,
            title: f.title,
            subtitle: f.notes,
            customerName: customer?.name,
            status: followupStatusStyle(f.status),
            priority: f.priority,
            due: f.due_date,
            assignee: f.assigned_to,
            tone: f.status === "missed" ? "danger" : "default",
            onClick: () => openDetail("followup", f.id),
            actions: buildFollowupActions(f.id, fuDispatch, { onOpen: () => openDetail("followup", f.id) }),
        };
    });
    const completedCount = db.tasks.filter((t) => t.status === "completed").length;
    const overdueCount = db.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled" && t.due_date < todayStr).length;
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            {isFollowupBoard ? "Follow-up Board" : "Tasks & Follow-ups"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isFollowupBoard
            ? "Calls, quotation & payment follow-ups"
            : "Daily, weekly, client and site tasks"}
          </p>
        </div>
        {!isFollowupBoard && (<div className="flex items-center gap-2">
            <button type="button" onClick={() => { setSelectMode((s) => !s); if (selectMode)
            setSelectedIds(new Set()); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150 active:scale-95", selectMode ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <CheckSquare className="h-3.5 w-3.5"/> {selectMode ? "Exit select" : "Select"}
            </button>
            {selectMode && tasks.length > 1 && (<button type="button" onClick={() => setSelectedIds(new Set(tasks.map((t) => t.id)))} className="text-[11px] font-medium text-primary hover:underline">
                Select all ({tasks.length})
              </button>)}
            <button type="button" onClick={() => { const id = addTask({ title: "New task", status: "todo", priority: "medium", due_date: todayStr }); notifyCreated("task", id, "New task", `Due ${todayStr} · medium priority`); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5"/> New task
            </button>
            <button type="button" onClick={() => setCreateFollowupOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15">
              <PhoneCall className="h-3.5 w-3.5"/> New follow-up
            </button>
          </div>)}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Open tasks" value={db.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length} tone="primary" icon={<ListTodo className="h-4 w-4"/>}/>
        <MetricCard label="Overdue" value={overdueCount} tone="destructive" icon={<CalendarDays className="h-4 w-4"/>}/>
        <MetricCard label="Follow-ups" value={db.followups.filter((f) => f.status === "pending" || f.status === "scheduled").length} tone="warning" icon={<PhoneCall className="h-4 w-4"/>}/>
        <MetricCard label="Completed" value={completedCount} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
      </div>

      {presets ? (<div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter presets">
          {presets.map((p) => {
                const active = p.id === activePresetId;
                return (<button key={p.id} type="button" role="tab" aria-selected={active} onClick={() => handlePresetChange(p.id)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
                {p.label}
              </button>);
            })}
        </div>) : (<div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Task scopes">
          {SCOPES.map((s) => (<button key={s.key} type="button" role="tab" aria-selected={scope === s.key} onClick={() => handleScopeChange(s.key)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", scope === s.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
              {s.label}
            </button>))}
        </div>)}
      <SavedViewsBar workspaceKey={isFollowupBoard ? "followups" : "tasks"} presets={presets} currentPresetId={presets ? activePresetId : undefined} currentSearch="" currentExtra={presets ? undefined : { scope }} onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>

      {!isFollowupBoard && selectMode && (<BulkActionBar selectedIds={selectedArr} totalCount={tasks.length} onClear={clearSelection} actions={bulkActions} assignOptions={bulkAssignOptions} priorityOptions={bulkPriorityOptions}/>)}

      {!isFollowupBoard && (selectMode ? (<section aria-label="Tasks (select mode)" className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ListTodo className="h-4 w-4 text-primary"/> Tasks · {tasks.length} shown
            </div>
            {tasks.length === 0 ? (<div className="rounded-[var(--panel-radius)] border border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent px-4 py-8 text-center text-sm text-muted-foreground">No tasks in this view.</div>) : (<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {tasks.map((t) => {
                    const customer = db.customers.find((p) => p.id === t.customer_id);
                    const checked = selectedIds.has(t.id);
                    const st = taskStatusStyle(t.status);
                    const overdue = isDateOnlyOverdue(t.due_date) && t.status !== "completed";
                    return (<div key={t.id} className={cn("flex items-start gap-2.5 rounded-[var(--panel-radius)] border bg-card px-3 py-2.5 shadow-card transition-all", checked ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]" : "border-border hover:border-primary/30")}>
                      <SelectCheckbox checked={checked} onToggle={toggleSelect} id={t.id}/>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{t.title}</p>
                        {customer?.name && <p className="truncate text-xs text-muted-foreground">{customer.name}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span className={cn("font-medium", overdue && "text-destructive")}>Due {relativeDay(t.due_date)}</span>
                          {t.assignee_name && <span>· {t.assignee_name}</span>}
                        </div>
                      </div>
                      <StatusBadge label={st.label} className={st.className}/>
                    </div>);
                })}
              </div>)}
          </section>) : (<QueueSection title="Tasks" icon={<ListTodo className="h-4 w-4 text-primary"/>} records={taskRecords} columns={3} emptyTitle="No tasks in this view"/>))}

      <QueueSection title="Follow-ups" icon={<PhoneCall className="h-4 w-4 text-primary"/>} records={fuRecords} columns={3} emptyTitle="No follow-ups"/>

      <FollowupCommunicationsSection followupIds={db.followups.map((f) => f.id)} />

      {createFollowupOpen && <CreateFollowupDialog
        db={db}
        onClose={() => setCreateFollowupOpen(false)}
        onCreate={(payload) => {
            try {
                const id = addFollowup({
                    title: payload.title,
                    notes: payload.notes,
                    status: "pending",
                    priority: payload.priority,
                    due_date: payload.due_date,
                    due_at: new Date(`${payload.due_date}T${payload.due_time || "09:00"}:00`).toISOString(),
                    assigned_to: payload.assigned_to,
                    assigned_role: payload.assigned_role,
                    customer_id: payload.customer_id,
                    work_required_id: payload.work_required_id,
                    quotation_id: payload.quotation_id,
                    followup_type: payload.followup_type,
                });
                notifyCreated("followup", id, payload.title, `Due ${payload.due_date}${payload.assigned_to ? ` · ${payload.assigned_to}` : ""}`);
                setCreateFollowupOpen(false);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not create follow-up");
            }
        }}
      />}
    </div>);
}

// I: "+ New follow-up" dialog — captures linked entity + due date + assignee + purpose.
function CreateFollowupDialog({ db, onClose, onCreate }: {
    db: import("@/lib/rdash/types").RDashDatabase;
    onClose: () => void;
    onCreate: (payload: {
        title: string;
        notes: string;
        priority: "low" | "medium" | "high" | "urgent";
        due_date: string;
        due_time: string;
        assigned_to: string;
        assigned_role: string;
        customer_id?: string;
        work_required_id?: string;
        quotation_id?: string;
        followup_type: "call" | "quotation" | "payment" | "general" | "note";
    }) => void;
}) {
    const todayStr = indiaDate();
    const [title, setTitle] = React.useState("");
    const [notes, setNotes] = React.useState("");
    const [priority, setPriority] = React.useState<"low" | "medium" | "high" | "urgent">("medium");
    const [dueDate, setDueDate] = React.useState(todayStr);
    const [dueTime, setDueTime] = React.useState("09:00");
    const [assignedTo, setAssignedTo] = React.useState("");
    const [assignedRole, setAssignedRole] = React.useState("Sales");
    const [followupType, setFollowupType] = React.useState<"call" | "quotation" | "payment" | "general" | "note">("general");
    const [customerId, setCustomerId] = React.useState<string>("");
    const [quotationId, setQuotationId] = React.useState<string>("");
    const [workRequiredId, setWorkRequiredId] = React.useState<string>("");
    const customerQuotations = db.quotations.filter((q) => !customerId || q.customer_id === customerId);
    const customerWorkRequired = db.workRequired.filter((w) => !customerId || w.customer_id === customerId);
    const valid = title.trim().length > 0 && dueDate;
    const submit = () => {
        if (!valid) {
            toast.error("Title and due date are required.");
            return;
        }
        onCreate({
            title: title.trim(),
            notes: notes.trim(),
            priority,
            due_date: dueDate,
            due_time: dueTime,
            assigned_to: assignedTo.trim() || "Owner",
            assigned_role: assignedRole,
            customer_id: customerId || undefined,
            quotation_id: quotationId || undefined,
            work_required_id: workRequiredId || undefined,
            followup_type: followupType,
        });
    };
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="h-4 w-4 text-primary"/> New follow-up
          </DialogTitle>
          <DialogDescription className="text-xs">Schedule a call, quotation reminder, or payment chase. Links to a customer/quotation/workRequired for full traceability.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 rd-scroll">
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call customer to confirm paint brand" className="mt-1 h-9 text-sm" autoFocus/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Purpose</Label>
              <select value={followupType} onChange={(e) => setFollowupType(e.target.value as typeof followupType)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm capitalize">
                <option value="general">General</option>
                <option value="call">Call</option>
                <option value="quotation">Quotation</option>
                <option value="payment">Payment</option>
                <option value="note">Note</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Priority</Label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm capitalize">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Due date *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-9 text-sm"/>
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Due time</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="mt-1 h-9 text-sm"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Assignee name</Label>
              <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="e.g. Pooja Singh" className="mt-1 h-9 text-sm"/>
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Assignee role</Label>
              <select value={assignedRole} onChange={(e) => setAssignedRole(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option>Sales</option>
                <option>Owner</option>
                <option>Operations Manager</option>
                <option>Finance</option>
                <option>Designer</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Linked customer (optional)</Label>
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setQuotationId(""); setWorkRequiredId(""); }} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              <option value="">— No linked customer —</option>
              {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {customerId && (<div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Linked quotation</Label>
              <select value={quotationId} onChange={(e) => setQuotationId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value="">— None —</option>
                {customerQuotations.map((q) => <option key={q.id} value={q.id}>{q.quotation_no}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Linked work required</Label>
              <select value={workRequiredId} onChange={(e) => setWorkRequiredId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value="">— None —</option>
                {customerWorkRequired.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
            </div>
          </div>)}
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, last conversation, what to say…" rows={2} className="mt-1 text-sm"/>
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!valid} onClick={submit}><PhoneCall className="mr-1 h-3.5 w-3.5"/> Create follow-up</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}

/**
 * Follow-up Communications Section — shows every commSends row that is linked
 * to a follow-up, grouped by the follow-up. This closes the operations loop:
 * a staff member can see, at a glance, which follow-ups have comms logged
 * against them and what was sent (WhatsApp / Pinterest / Email / etc.).
 *
 * Renders only when at least one follow-up has linked communications.
 */
function FollowupCommunicationsSection({ followupIds }: { followupIds: string[] }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    const grouped = React.useMemo(() => {
        const idSet = new Set(followupIds);
        const rows = db.commSends.filter((c) => c.followup_id && idSet.has(c.followup_id));
        const map = new Map<string, typeof rows>();
        for (const c of rows) {
            const arr = map.get(c.followup_id!) || [];
            arr.push(c);
            map.set(c.followup_id!, arr);
        }
        return Array.from(map.entries())
            .map(([followupId, comms]) => {
                const followup = db.followups.find((f) => f.id === followupId);
                return { followupId, followup, comms: comms.sort((a, b) => b.sent_at.localeCompare(a.sent_at)) };
            })
            .sort((a, b) => (b.comms[0]?.sent_at || "").localeCompare(a.comms[0]?.sent_at || ""));
    }, [db.commSends, db.followups, followupIds]);
    if (grouped.length === 0)
        return null;
    const toggle = (id: string) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    return (<section aria-label="Follow-up communications" className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="h-4 w-4 text-primary"/> Communications linked to follow-ups · {grouped.length} follow-up{grouped.length === 1 ? "" : "s"}
      </div>
      <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        {grouped.map(({ followupId, followup, comms }) => {
            const isOpen = expanded.has(followupId);
            const customer = followup ? db.customers.find((p) => p.id === followup.customer_id) : undefined;
            return (<div key={followupId} className="border-b border-border last:border-0">
              <button type="button" onClick={() => toggle(followupId)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/30">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><PhoneCall className="h-3.5 w-3.5"/></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{followup?.title || followupId}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{customer?.name || "—"} · {comms.length} comm{comms.length === 1 ? "" : "s"}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{relativeDay(comms[0]?.sent_at || "")}</span>
              </button>
              {isOpen && (<div className="divide-y divide-border border-t border-border bg-muted/20">
                  {comms.map((c) => {
                    const meta = CHANNEL_META[c.channel];
                    return (<button key={c.id} type="button" onClick={() => openDetail("customer", c.customer_id)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent/30">
                      <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", meta.color)}>{meta.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{c.subject}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{meta.label} · {c.staff_name} · {formatDateTime(c.sent_at)}</p>
                        {c.body && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{c.body}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{c.status}</span>
                    </button>);
                  })}
                  <button type="button" onClick={() => setActiveModule("communicationCentre")} className="flex w-full items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-medium text-primary hover:bg-primary/5">
                    <Send className="h-3 w-3"/> Open Communication Centre to send a new message
                  </button>
                </div>)}
            </div>);
        })}
      </div>
    </section>);
}
