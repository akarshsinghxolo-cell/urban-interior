"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { ApprovalPolicy, ApprovalTrigger } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, EmptyState } from "../primitives";
import { formatINR, formatDate, relativeDay, titleCase } from "@/lib/rdash/format";
import { ShieldCheck, ShieldAlert, Plus, Power, Trash2, Edit3, X, CheckCircle2, AlertTriangle, ArrowRight, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
const TRIGGER_LABELS: Record<ApprovalTrigger, string> = {
    po_amount: "Purchase Order amount",
    quotation_discount: "Quotation discount %",
    contractor_payment: "Contractor payment",
    vendor_bill: "Vendor bill amount",
    expense: "General expense",
};
const TRIGGER_ICONS: Record<ApprovalTrigger, React.ReactNode> = {
    po_amount: <ShieldCheck className="h-4 w-4"/>,
    quotation_discount: <ShieldAlert className="h-4 w-4"/>,
    contractor_payment: <ShieldCheck className="h-4 w-4"/>,
    vendor_bill: <ShieldAlert className="h-4 w-4"/>,
    expense: <ShieldCheck className="h-4 w-4"/>,
};
export function ApprovalPoliciesModule() {
    const db = useRDashStore((s) => s.db);
    const togglePolicy = useRDashStore((s) => s.toggleApprovalPolicy);
    const deletePolicy = useRDashStore((s) => s.deleteApprovalPolicy);
    const addPolicy = useRDashStore((s) => s.addApprovalPolicy);
    const updatePolicy = useRDashStore((s) => s.updateApprovalPolicy);
    const [editing, setEditing] = React.useState<ApprovalPolicy | null>(null);
    const [creating, setCreating] = React.useState(false);
    const enabled = db.approvalPolicies.filter((p) => p.enabled).length;
    const disabled = db.approvalPolicies.filter((p) => !p.enabled).length;
    const pendingApprovals = db.actions.filter((a) => a.status === "pending").length;
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Approval Policies</h2>
            <p className="text-xs text-muted-foreground">Threshold-based approval rules — auto-route decisions to the right approver</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-3.5 w-3.5"/> New Policy
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total policies" value={db.approvalPolicies.length} tone="primary" icon={<ShieldCheck className="h-4 w-4"/>}/>
        <MetricCard label="Active" value={enabled} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Disabled" value={disabled} tone="warning" icon={<Power className="h-4 w-4"/>}/>
        <MetricCard label="Pending approvals" value={pendingApprovals} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {db.approvalPolicies.map((p) => (<div key={p.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-4 shadow-card transition-all hover:shadow-soft", p.enabled ? "border-border" : "border-dashed border-border opacity-70")}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", p.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {TRIGGER_ICONS[p.trigger]}
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{TRIGGER_LABELS[p.trigger]}</p>
                </div>
              </div>
              <StatusBadge label={p.enabled ? "Active" : "Disabled"} className={p.enabled ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}/>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Condition</p>
                <p className="font-mono font-semibold">{p.operator} {p.trigger === "quotation_discount" ? `${p.threshold}%` : formatINR(p.threshold)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Approver</p>
                <p className="font-semibold">{p.approver_name || p.approver_role}</p>
              </div>
              {p.auto_escalate_hours && (<div className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Escalate after</p>
                  <p className="font-semibold">{p.auto_escalate_hours}h → {p.escalate_to || "Owner"}</p>
                </div>)}
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Updated</p>
                <p className="font-semibold">{relativeDay(p.updated_at)}</p>
              </div>
            </div>
            {p.description && <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>}
            <div className="mt-3 flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => togglePolicy(p.id)}>
                <Power className="mr-1 h-3.5 w-3.5"/> {p.enabled ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                <Edit3 className="mr-1 h-3.5 w-3.5"/> Edit
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:bg-destructive/10" onClick={() => { deletePolicy(p.id); toast.success("Policy deleted"); }}>
                <Trash2 className="h-3.5 w-3.5"/>
              </Button>
            </div>
          </div>))}
      </div>

      {db.approvalPolicies.length === 0 && (<EmptyState title="No approval policies" description="Create threshold-based rules to auto-route approvals." icon={<ShieldCheck className="h-8 w-8"/>} action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-3.5 w-3.5"/> New Policy</Button>}/>)}
      <div className="rounded-[var(--panel-radius)] border border-primary/20 bg-primary/[0.04] p-4">
        <div className="mb-2 flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-primary"/>
          <h3 className="text-sm font-semibold text-primary">How the policy engine works</h3>
        </div>
        <ol className="space-y-1.5 text-xs text-foreground/80">
          <li><span className="font-semibold">1.</span> When an action is taken (e.g. a PO is created), the store calls <code className="rounded bg-muted px-1 py-0.5 text-[10px]">requiresApproval(trigger, amount)</code>.</li>
          <li><span className="font-semibold">2.</span> If a matching active policy is found, an <span className="font-semibold">ApprovalAction</span> + owner task is auto-created.</li>
          <li><span className="font-semibold">3.</span> The approval appears in Daily Work → Approvals queue with the policy name + threshold.</li>
          <li><span className="font-semibold">4.</span> Approving/rejecting triggers downstream automation (e.g. PO approve → send to vendor).</li>
          <li><span className="font-semibold">5.</span> If <span className="font-semibold">auto_escalate_hours</span> passes without a decision, an escalation task is created for the escalate_to role.</li>
        </ol>
      </div>

      {(creating || editing) && (<PolicyDialog policy={editing} onClose={() => { setCreating(false); setEditing(null); }} onSave={(data) => {
                if (editing) {
                    updatePolicy(editing.id, data);
                    toast.success("Policy updated");
                }
                else {
                    addPolicy(data);
                    toast.success("Policy created");
                }
                setCreating(false);
                setEditing(null);
            }}/>)}
    </div>);
}
function PolicyDialog({ policy, onClose, onSave }: {
    policy: ApprovalPolicy | null;
    onClose: () => void;
    onSave: (data: Partial<ApprovalPolicy>) => void;
}) {
    const [name, setName] = React.useState(policy?.name || "");
    const [trigger, setTrigger] = React.useState<ApprovalTrigger>(policy?.trigger || "po_amount");
    const [threshold, setThreshold] = React.useState(policy?.threshold || 0);
    const [operator, setOperator] = React.useState<ApprovalPolicy["operator"]>(policy?.operator || ">");
    const [approverRole, setApproverRole] = React.useState(policy?.approver_role || "Owner");
    const [escalateHours, setEscalateHours] = React.useState(policy?.auto_escalate_hours || 24);
    const [escalateTo, setEscalateTo] = React.useState(policy?.escalate_to || "Owner");
    const [description, setDescription] = React.useState(policy?.description || "");
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary"/> {policy ? "Edit Policy" : "New Approval Policy"}
          </DialogTitle>
          <DialogDescription className="text-xs">Define when this action requires approval and who decides.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 rd-scroll">
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Policy name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PO above ₹50,000" className="h-9 text-sm"/>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Trigger</label>
              <select value={trigger} onChange={(e) => setTrigger(e.target.value as ApprovalTrigger)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Operator</label>
              <select value={operator} onChange={(e) => setOperator(e.target.value as any)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value=">">Greater than ({">"})</option>
                <option value=">=">Greater or equal ({">="})</option>
                <option value="=">Equal (=)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Threshold {trigger === "quotation_discount" ? "(%)" : "(₹)"}</label>
              <Input type="number" value={threshold || ""} onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)} className="h-9 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Approver role</label>
              <select value={approverRole} onChange={(e) => setApproverRole(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option>Owner</option><option>Accounts</option><option>Designer</option><option>Sales Lead</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Escalate after (hours)</label>
              <Input type="number" value={escalateHours || ""} onChange={(e) => setEscalateHours(parseFloat(e.target.value) || 0)} className="h-9 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Escalate to</label>
              <Input value={escalateTo} onChange={(e) => setEscalateTo(e.target.value)} className="h-9 text-sm"/>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explain what this policy protects…" rows={2} className="text-sm"/>
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button size="sm" onClick={() => onSave({ name, trigger, threshold, operator, approver_role: approverRole, approver_name: approverRole, auto_escalate_hours: escalateHours, escalate_to: escalateTo, description })} disabled={!name}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> {policy ? "Save Changes" : "Create Policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
