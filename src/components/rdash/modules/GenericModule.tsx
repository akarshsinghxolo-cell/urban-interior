"use client";
import * as React from "react";
import { ProfileNameEditor } from "../ProfileNameEditor";
import { Wallet, FileText, Building2, Users, Settings as SettingsIcon, Database, Download, Upload, History, ShieldCheck, Workflow, ArrowLeft, CheckCircle2, Phone, Plus, Sun, Moon, Pencil, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar } from "../primitives";
import { StaffEditDialog } from "../StaffEditDialog";
import { formatINR, formatINRShort, titleCase, } from "@/lib/rdash/format";
import type { DataSource, FilterPreset } from "@/lib/rdash/modules";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Generic module entry point.
 *
 * The workspace route registry routes exactly one module here:
 * `systemSettings` (renderer "system"). Everything the module renders lives
 * in `SystemShell` below. The former generic records browser (resolveRecords,
 * computeMetrics, RecordTile, ReportsShell, MastersShell and the job-board
 * bulk actions) was unreachable dead code and was removed: the router's
 * renderer switch is statically exhaustive
 * (`renderUnreachableModule(_renderer: never)`), so no route can reach
 * GenericModule with any renderer other than "system".
 */
export function GenericModule({ renderer, moduleId, label, }: {
    renderer: "system";
    dataSource?: DataSource;
    filter?: Record<string, string>;
    filterPresets?: FilterPreset[];
    moduleId: string;
    label: string;
    description?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    if (renderer !== "system") return null;
    return <SystemShell moduleId={moduleId} label={label} db={db} setActiveModule={setActiveModule}/>;
}

function ResetWorkspaceControl() {
    const authUser = useRDashStore((s) => s.authUser);
    const resetDatabase = useRDashStore((s) => s.resetDatabase);
    const [open, setOpen] = React.useState(false);
    const [confirmation, setConfirmation] = React.useState("");
    const [resetting, setResetting] = React.useState(false);
    if (authUser?.role !== "Owner")
        return null;
    const confirmReset = async () => {
        try {
            setResetting(true);
            await resetDatabase(confirmation);
            setOpen(false);
            setConfirmation("");
            toast.success("Workspace reset to canonical seed data.");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Workspace reset was rejected.");
        }
        finally {
            setResetting(false);
        }
    };
    return (<>
      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => { setConfirmation(""); setOpen(true); }}>
        <Database className="h-3.5 w-3.5"/> Reset workspace
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!resetting)
        setOpen(next); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset entire workspace</DialogTitle>
            <p className="text-xs text-muted-foreground">This Owner-only action permanently replaces operational data with canonical seed data. It cannot be undone.</p>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold">Type <span className="font-mono">RESET WORKSPACE</span> to confirm</label>
            <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RESET WORKSPACE" autoComplete="off"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={resetting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReset} disabled={resetting || confirmation.trim() !== "RESET WORKSPACE"}>
              {resetting ? "Resetting…" : "Permanently reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}

function SystemShell({ moduleId, label, db, setActiveModule, }: {
    moduleId: string;
    label: string;
    db: import("@/lib/rdash/types").RDashDatabase;
    setActiveModule: (id: string, label?: string, icon?: string) => void;
}) {
    const activeSubmoduleId = moduleId;
    const { theme, setTheme } = useTheme();
    const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
    const addStaff = useRDashStore((s) => s.addStaff);
    const [editStaffId, setEditStaffId] = React.useState<string | undefined>(undefined);
    const [staffEditOpen, setStaffEditOpen] = React.useState(false);
    if (activeSubmoduleId === "systemSettings") {
        const isDark = theme === "dark";
        return (<div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Settings</h2>
          <p className="text-xs text-muted-foreground">Workspace configuration and preferences</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Customers" value={db.customers.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
          <MetricCard label="Quotations" value={db.quotations.length} tone="warning" icon={<FileText className="h-4 w-4"/>}/>
          <MetricCard label="Work Orders" value={db.workOrders.length} tone="success" icon={<Building2 className="h-4 w-4"/>}/>
          <MetricCard label="Tasks" value={db.tasks.length} tone="default" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">{isDark ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}</span>
              <h3 className="text-sm font-semibold">Appearance</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Switch between light and dark themes.</p>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setTheme(isDark ? "light" : "dark")}>
              {isDark ? <Sun className="h-3.5 w-3.5"/> : <Moon className="h-3.5 w-3.5"/>} {isDark ? "Light mode" : "Dark mode"}
            </Button>
          </div>
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Users className="h-4 w-4"/></span>
              <h3 className="text-sm font-semibold">Active Role</h3>
            </div>
            <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">Signed in as <ProfileNameEditor /></p>
            <p className="text-xs text-muted-foreground">Server-assigned role: <span className="font-semibold text-foreground">{role}</span></p>
            <p className="mt-3 text-[11px] text-muted-foreground">Role changes are managed by the administrator in the server role registry and cannot be changed from this browser.</p>
          </div>
        </div>
        <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Database className="h-4 w-4"/></span>
            <h3 className="text-sm font-semibold">Data Management</h3>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataImport")}><Upload className="h-3.5 w-3.5"/> Import</Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataExport")}><Download className="h-3.5 w-3.5"/> Export</Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("auditLog")}><History className="h-3.5 w-3.5"/> Audit log</Button>
            <ResetWorkspaceControl />
          </div>
        </div>
      </div>);
    }
    if (activeSubmoduleId === "usersRoles") {
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5"/></span>
            <div><h2 className="text-lg font-bold tracking-tight">Staff Directory</h2><p className="text-xs text-muted-foreground">Team records, contact and salary. Secure access is assigned in the server role registry.</p></div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => {
                const id = addStaff({ name: "New Staff", role: "Staff", status: "active" });
                setEditStaffId(id);
                setStaffEditOpen(true);
                toast.success("New staff member added — edit details below");
            }}><Plus className="h-3.5 w-3.5"/> Add Staff</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Total staff" value={db.master.staff.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
          <MetricCard label="Active" value={db.master.staff.filter((s) => s.status === "active").length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          <MetricCard label="Monthly payroll" value={formatINRShort(db.master.staff.reduce((n, s) => n + (s.monthly_salary || 0), 0))} tone="warning" icon={<Wallet className="h-4 w-4"/>}/>
          <MetricCard label="Avg salary" value={formatINRShort(db.master.staff.length ? db.master.staff.reduce((n, s) => n + (s.monthly_salary || 0), 0) / db.master.staff.length : 0)} tone="default" icon={<Wallet className="h-4 w-4"/>}/>
        </div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {db.master.staff.map((s) => {
                const tasks = db.tasks.filter((t) => t.assignee_id === s.id);
                const visits = db.visits.filter((v) => v.staff_id === s.id);
                return (<div key={s.id} className="group relative flex items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
                <button type="button" onClick={() => { setEditStaffId(s.id); setStaffEditOpen(true); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Edit ${s.name}`} title="Edit staff"><Pencil className="h-3.5 w-3.5"/></button>
                <Avatar name={s.name} size={42}/>
                <div className="min-w-0 flex-1 pr-6">
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.role} · {s.city}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-0.5"><Phone className="h-2.5 w-2.5"/>{s.phone || "—"}</span>{s.monthly_salary && <span className="font-mono">· {formatINR(s.monthly_salary)}/mo</span>}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge label={titleCase(s.status || "active")} className="bg-success/10 text-success border-success/20"/>
                  <span className="text-[10px] text-muted-foreground">{tasks.length} tasks · {visits.length} visits</span>
                </div>
              </div>);
            })}
        </div>
        <StaffEditDialog staffId={editStaffId} open={staffEditOpen} onClose={() => { setStaffEditOpen(false); setEditStaffId(undefined); }}/>
      </div>);
    }
    return (<div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{label}</h2>
        <p className="text-xs text-muted-foreground">Workspace configuration and data management</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="group rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><SettingsIcon className="h-4 w-4"/></span>
            <h3 className="text-sm font-semibold">Workspace</h3>
          </div>
          <p className="text-xs text-muted-foreground">Secure server-backed workspace. Operational data is persisted only after authenticated server validation.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("systemSettings")}>
              <SettingsIcon className="h-3.5 w-3.5"/> Settings
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("controlBrainWorkflows")}>
              <Workflow className="h-3.5 w-3.5"/> Workflow builder
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("approvalPolicies")}>
              <ShieldCheck className="h-3.5 w-3.5"/> Approval policies
            </Button>
          </div>
        </div>
        <div className="group rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Database className="h-4 w-4"/></span>
            <h3 className="text-sm font-semibold">Data</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {db.customers.length} customers · {db.quotations.length} quotations · {db.workOrders.length} workOrders · {db.tasks.length} tasks
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataImport")}>
              <Upload className="h-3.5 w-3.5"/> Data import
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataExport")}>
              <Download className="h-3.5 w-3.5"/> Data export
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("auditLog")}>
              <History className="h-3.5 w-3.5"/> Audit log
            </Button>
            <ResetWorkspaceControl />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
            { id: "usersRoles", label: "Staff Directory & Access", icon: Users, desc: "Staff directory and server-managed access" },
            { id: "attendancePayroll", label: "Attendance & Payroll Rules", icon: Wallet, desc: "GPS, absence and salary rules" },
            { id: "threads", label: "Conversations", icon: FileText, desc: "Threaded discussions" },
            { id: "controlBrainWorkflows", label: "Control Brain", icon: Workflow, desc: "Automation workflows" },
            { id: "approvalPolicies", label: "Approval Policies", icon: ShieldCheck, desc: "Threshold rules" },
            { id: "auditLog", label: "Audit Log", icon: History, desc: "Full activity trace" },
            { id: "dataImport", label: "Data Import", icon: Upload, desc: "Bulk import records" },
            { id: "dataExport", label: "Data Export", icon: Download, desc: "Export to CSV/JSON" },
        ].map((item) => (<button key={item.id} type="button" onClick={() => setActiveModule(item.id)} className="group flex items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-soft">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <item.icon className="h-4 w-4"/>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
            <ArrowLeft className="h-3.5 w-3.5 shrink-0 rotate-180 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"/>
          </button>))}
      </div>
    </div>);
}
