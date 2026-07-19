"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { AutomationRule, AutomationTrigger, AutomationActionType } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, EmptyState } from "../primitives";
import { relativeDay, formatDateTime, titleCase } from "@/lib/rdash/format";
import { Brain, Zap, Power, Plus, ArrowRight, Workflow, Activity, CheckCircle2, Bell, FileText, Package, Truck, Wrench, AlertTriangle, DollarSign, Building2, X, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
const TRIGGER_META: Record<AutomationTrigger, {
    icon: React.ReactNode;
    color: string;
    source: string;
}> = {
    quotation_created: { icon: <FileText className="h-4 w-4"/>, color: "bg-success/10 text-success", source: "Quotation Desk" },
    quotation_accepted: { icon: <FileText className="h-4 w-4"/>, color: "bg-success/10 text-success", source: "Quotation Desk" },
    quotation_sent: { icon: <FileText className="h-4 w-4"/>, color: "bg-primary/10 text-primary", source: "Quotation Desk" },
    po_created: { icon: <Package className="h-4 w-4"/>, color: "bg-warning/10 text-warning", source: "Procurement" },
    po_approved: { icon: <CheckCircle2 className="h-4 w-4"/>, color: "bg-success/10 text-success", source: "Procurement" },
    grn_filed: { icon: <Truck className="h-4 w-4"/>, color: "bg-primary/10 text-primary", source: "GRN" },
    grn_mismatch: { icon: <AlertTriangle className="h-4 w-4"/>, color: "bg-destructive/10 text-destructive", source: "GRN" },
    visit_checkout: { icon: <Activity className="h-4 w-4"/>, color: "bg-primary/10 text-primary", source: "Field Visits" },
    payment_promise: { icon: <DollarSign className="h-4 w-4"/>, color: "bg-warning/10 text-warning", source: "Payment Recovery" },
    payment_overdue: { icon: <AlertTriangle className="h-4 w-4"/>, color: "bg-destructive/10 text-destructive", source: "Payment Recovery" },
    obstacle_created: { icon: <AlertTriangle className="h-4 w-4"/>, color: "bg-destructive/10 text-destructive", source: "Obstacles" },
    job_milestone: { icon: <Building2 className="h-4 w-4"/>, color: "bg-primary/10 text-primary", source: "Work Orders" },
    dispatch_issued: { icon: <Wrench className="h-4 w-4"/>, color: "bg-primary/10 text-primary", source: "Site Dispatch" },
    approval_decided: { icon: <CheckCircle2 className="h-4 w-4"/>, color: "bg-success/10 text-success", source: "Approvals" },
};
const ACTION_ICONS: Record<string, React.ReactNode> = {
    create_task: <CheckCircle2 className="h-3 w-3"/>,
    create_approval: <CheckCircle2 className="h-3 w-3"/>,
    create_obstacle: <AlertTriangle className="h-3 w-3"/>,
    create_payment: <DollarSign className="h-3 w-3"/>,
    create_job: <Building2 className="h-3 w-3"/>,
    create_boq: <FileText className="h-3 w-3"/>,
    create_commission: <DollarSign className="h-3 w-3"/>,
    send_alert: <Bell className="h-3 w-3"/>,
    update_status: <Activity className="h-3 w-3"/>,
};
const ALL_TRIGGERS = Object.keys(TRIGGER_META) as AutomationTrigger[];
const ALL_ACTION_TYPES: AutomationActionType[] = ["create_task", "create_approval", "create_obstacle", "create_payment", "create_job", "create_boq", "create_commission", "send_alert", "update_status"];
export function ControlBrainModule() {
    const db = useRDashStore((s) => s.db);
    const toggleRule = useRDashStore((s) => s.toggleAutomationRule);
    const addRule = useRDashStore((s) => s.addAutomationRule);
    const enabled = db.automationRules.filter((r) => r.enabled).length;
    const totalFires = db.automationRules.reduce((n, r) => n + r.fires_count, 0);
    const recentAudit = db.auditLog.filter((a) => a.kind === "system" || a.kind === "alert").slice(0, 8);
    // E: Fire history — every audit entry that mentions "Automation fired" or
    //    an automation_rule entity. Sorted most-recent first.
    const fireHistory = React.useMemo(() => {
        return db.auditLog
            .filter((a) => a.entity_type === "automation_rule" || a.action.toLowerCase().includes("automation"))
            .slice(0, 20);
    }, [db.auditLog]);
    const [createOpen, setCreateOpen] = React.useState(false);
    const handleCreate = (data: { name: string; trigger: AutomationTrigger; description: string; actionType: AutomationActionType; actionLabel: string; }) => {
        try {
            addRule({
                name: data.name,
                trigger: data.trigger,
                trigger_label: TRIGGER_META[data.trigger].source,
                actions: [{ type: data.actionType, label: data.actionLabel || titleCase(data.actionType.replace(/_/g, " ")) }],
                enabled: true,
                description: data.description,
            });
            toast.success(`Automation rule "${data.name}" created`);
            setCreateOpen(false);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create rule");
        }
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Brain className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Control Brain / Workflows</h2>
            <p className="text-xs text-muted-foreground">The automation engine — every trigger fires a chain of actions automatically</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5"/> Create rule
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Automation rules" value={db.automationRules.length} tone="primary" icon={<Workflow className="h-4 w-4"/>}/>
        <MetricCard label="Active" value={enabled} tone="success" icon={<Power className="h-4 w-4"/>}/>
        <MetricCard label="Total fires" value={totalFires} tone="warning" icon={<Zap className="h-4 w-4"/>}/>
        <MetricCard label="System events" value={db.auditLog.filter((a) => a.kind === "system").length} tone="default" icon={<Activity className="h-4 w-4"/>}/>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Automation Rules</h3>
        {db.automationRules.length === 0 ? (<EmptyState title="No automation rules" description="Create your first rule to start automating tasks, alerts, and status updates." icon={<Workflow className="h-8 w-8"/>} action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-3.5 w-3.5"/> Create rule</Button>}/>) : (db.automationRules.map((rule) => {
            const meta = TRIGGER_META[rule.trigger];
            return (<div key={rule.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-4 shadow-card transition-all", rule.enabled ? "border-border" : "border-dashed border-border opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.color)}>{meta.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-foreground">{rule.name}</p>
                    <p className="text-[11px] text-muted-foreground">{rule.trigger_label} · Source: {meta.source}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rule.fires_count > 0 && (<span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                      <Zap className="h-3 w-3"/> {rule.fires_count} fires
                    </span>)}
                  <StatusBadge label={rule.enabled ? "Active" : "Disabled"} className={rule.enabled ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}/>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">TRIGGER</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground"/>
                {rule.actions.map((a, i) => (<React.Fragment key={i}>
                    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium", rule.enabled ? "border-primary/20 bg-primary/[0.06] text-primary" : "border-border bg-muted text-muted-foreground")}>
                      {ACTION_ICONS[a.type] || <Activity className="h-3 w-3"/>}
                      {a.label}
                    </span>
                    {i < rule.actions.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground"/>}
                  </React.Fragment>))}
              </div>
              {rule.description && <p className="mt-2 text-xs text-muted-foreground">{rule.description}</p>}
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { toggleRule(rule.id); toast.success(rule.enabled ? "Rule disabled" : "Rule enabled"); }}>
                  <Power className="mr-1 h-3.5 w-3.5"/> {rule.enabled ? "Disable" : "Enable"}
                </Button>
                {rule.last_fired_at && <span className="text-[10px] text-muted-foreground">Last fired {relativeDay(rule.last_fired_at)}</span>}
              </div>
            </div>);
        }))}
      </div>
      {/* E: Fire history table — surfaces every automation fire batch from the audit log. */}
      <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-warning"/>
          <h3 className="text-sm font-semibold text-foreground">Fire history</h3>
          <span className="rounded-full bg-muted px-2 py-0 text-[11px] text-muted-foreground">{fireHistory.length}</span>
        </div>
        {fireHistory.length === 0 ? (<p className="py-3 text-center text-xs text-muted-foreground">No automation has fired yet. Create a rule and trigger it (e.g. create a quotation).</p>) : (<ol className="relative space-y-2 border-l border-border pl-4 max-h-80 overflow-y-auto rd-scroll">
            {fireHistory.map((e) => (<li key={e.id} className="relative">
                <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card", e.kind === "alert" ? "bg-destructive" : "bg-warning")}/>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs text-foreground/90">{e.action}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(e.timestamp)}</span>
                </div>
                {e.entity_label && <p className="text-[10px] text-muted-foreground">{e.entity_label}</p>}
                {e.reason && <p className="mt-0.5 text-[10px] text-muted-foreground/80">{e.reason}</p>}
              </li>))}
          </ol>)}
      </div>
      <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary"/>
          <h3 className="text-sm font-semibold text-foreground">Recent system events</h3>
          <span className="rounded-full bg-muted px-2 py-0 text-[11px] text-muted-foreground">{recentAudit.length}</span>
        </div>
        {recentAudit.length === 0 ? (<p className="py-3 text-center text-xs text-muted-foreground">No system events yet.</p>) : (<ol className="relative space-y-2 border-l border-border pl-4">
            {recentAudit.map((e) => (<li key={e.id} className="relative">
                <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card", e.kind === "alert" ? "bg-destructive" : "bg-primary")}/>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs text-foreground/90">{e.action}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{relativeDay(e.timestamp)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{e.entity_label || e.entity_type}</p>
              </li>))}
          </ol>)}
      </div>
      <div className="rounded-[var(--panel-radius)] border border-primary/20 bg-primary/[0.04] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary"/>
          <h3 className="text-sm font-semibold text-primary">How the Control Brain works</h3>
        </div>
        <p className="text-xs text-foreground/80">
          The Control Brain watches every action in the workspace. When a trigger fires (e.g. a quotation is created or accepted), it executes the chained actions automatically — creating tasks, alerts, or updating status. Each fire is logged in the Audit Log with the rule name so you can trace every automated decision. Toggle rules on/off to control the automation level. Disabled rules keep their config but stop firing.
        </p>
      </div>
      {createOpen && <CreateRuleDialog onClose={() => setCreateOpen(false)} onCreate={handleCreate}/>}
    </div>);
}
function CreateRuleDialog({ onClose, onCreate }: {
    onClose: () => void;
    onCreate: (data: { name: string; trigger: AutomationTrigger; description: string; actionType: AutomationActionType; actionLabel: string; }) => void;
}) {
    const [name, setName] = React.useState("");
    const [trigger, setTrigger] = React.useState<AutomationTrigger>("quotation_created");
    const [actionType, setActionType] = React.useState<AutomationActionType>("create_task");
    const [actionLabel, setActionLabel] = React.useState("");
    const [description, setDescription] = React.useState("");
    const valid = name.trim().length > 0;
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary"/> New Automation Rule
          </DialogTitle>
          <DialogDescription className="text-xs">Define a trigger and the action the Control Brain should perform when it fires.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 rd-scroll">
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Rule name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New quote → notify owner" className="mt-1 h-9 text-sm"/>
          </div>
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Trigger (when should this fire?)</Label>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationTrigger)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              {ALL_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_META[t].source} · {t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Action (what should happen?)</Label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value as AutomationActionType)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              {ALL_ACTION_TYPES.map((a) => <option key={a} value={a}>{titleCase(a.replace(/_/g, " "))}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Action label (optional)</Label>
            <Input value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="e.g. Notify sales owner" className="mt-1 h-9 text-sm"/>
          </div>
          <div>
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why does this rule exist? What business constraint does it enforce?" rows={2} className="mt-1 text-sm"/>
          </div>
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            The rule fires automatically every time the trigger occurs. You can add more actions or conditions later by editing the rule. Each fire is recorded in the Fire History table and the Audit Log.
          </p>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button size="sm" disabled={!valid} onClick={() => onCreate({ name: name.trim(), trigger, actionType, actionLabel: actionLabel.trim(), description: description.trim() })}>
            <Plus className="mr-1 h-3.5 w-3.5"/> Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
