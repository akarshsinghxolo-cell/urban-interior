"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { genId } from "@/lib/rdash/store/helpers";
import { MetricCard, StatusBadge, EmptyState } from "../primitives";
import { titleCase } from "@/lib/rdash/format";
import { Settings, FileText, Calendar, Percent, ShieldCheck, Power, CheckCircle2, Star, Plus, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
type ConfigType = "commercial" | "payment" | "tax" | "validity";
const CONFIG_META: Record<ConfigType, {
    label: string;
    icon: React.ReactNode;
    desc: string;
}> = {
    commercial: { label: "Commercial Terms", icon: <FileText className="h-4 w-4"/>, desc: "Reusable terms & conditions clauses for quotations" },
    payment: { label: "Payment Terms Templates", icon: <Calendar className="h-4 w-4"/>, desc: "Pre-defined milestone split templates" },
    tax: { label: "Tax Configuration", icon: <Percent className="h-4 w-4"/>, desc: "GST/CGST/SGST/IGST rates for quotations" },
    validity: { label: "Validity Control", icon: <ShieldCheck className="h-4 w-4"/>, desc: "Default quotation validity periods and expiry actions" },
};
const COMMERCIAL_CATEGORIES = ["warranty", "delivery", "payment", "scope", "other"] as const;
const TAX_TYPES = ["gst", "cgst", "sgst", "igst"] as const;
const VALIDITY_ACTIONS = ["alert", "auto_revoke", "extend"] as const;
export function QuotationConfigModule({ config }: {
    config?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const toggleCommercialTerm = useRDashStore((s) => s.toggleCommercialTerm);
    const toggleTaxConfig = useRDashStore((s) => s.toggleTaxConfig);
    const toggleValidityConfig = useRDashStore((s) => s.toggleValidityConfig);
    const setDefaultPTT = useRDashStore((s) => s.setDefaultPaymentTermTemplate);
    const logAudit = useRDashStore((s) => s.logAudit);
    const currentUser = useRDashStore((s) => s.currentUser);
    const initialConfig = (config && config in CONFIG_META ? config : "commercial") as ConfigType;
    const [activeConfig, setActiveConfig] = React.useState<ConfigType>(initialConfig);
    React.useEffect(() => {
        if (config && config in CONFIG_META)
            setActiveConfig(config as ConfigType);
    }, [config]);
    const meta = CONFIG_META[activeConfig];
    // B-10: Local state for the "Add new" dialog. The finance slice (which owns toggle/setDefault
    // actions for these configs) is owned by the parallel CV-FIX agent — we cannot add new
    // addXxx actions there. Instead, the dialog mutates db.<configRows> directly via
    // useRDashStore.setState, then calls logAudit (which goes through commitState) so the
    // change is normalized, validated, and queued for server-save. This is a deliberate
    // workaround that keeps the fix within files this agent owns.
    const [addOpen, setAddOpen] = React.useState(false);
    const handleCreate = (payload: NewConfigPayload) => {
        try {
            const actor = currentUser();
            useRDashStore.setState((s) => {
                const db = s.db;
                if (payload.kind === "commercial") {
                    const row = { id: genId("ct"), label: payload.label, text: payload.text, enabled: true, category: payload.category };
                    return { db: { ...db, commercialTerms: [...db.commercialTerms, row] } };
                }
                if (payload.kind === "payment") {
                    const row = { id: genId("ptt"), name: payload.label, terms: [{ id: genId("ptt-term"), label: "Advance", percentage: 100, due_event: "on acceptance" }], is_default: false };
                    return { db: { ...db, paymentTermTemplates: [...db.paymentTermTemplates, row] } };
                }
                if (payload.kind === "tax") {
                    const row = { id: genId("tax"), name: payload.label, rate: payload.rate, type: payload.taxType, enabled: true };
                    return { db: { ...db, taxConfigs: [...db.taxConfigs, row] } };
                }
                // validity
                const row = { id: genId("vc"), name: payload.label, default_days: payload.defaultDays, expiry_action: payload.expiryAction, enabled: true };
                return { db: { ...db, validityConfigs: [...db.validityConfigs, row] } };
            });
            logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Created ${payload.kind} config "${payload.label}"`,
                entity_type: "general",
                entity_label: payload.label,
                kind: "create",
            });
            toast.success(`${CONFIG_META[payload.kind as ConfigType].label.slice(0, -1)} "${payload.label}" created`);
            setAddOpen(false);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create the config row.");
        }
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Settings className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{meta.label}</h2>
            <p className="text-xs text-muted-foreground">{meta.desc}</p>
          </div>
        </div>
        {/* B-10: Add new config row button. Opens a small dialog tailored to the active tab. */}
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5"/> Add new
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(CONFIG_META) as ConfigType[]).map((c) => {
            const m = CONFIG_META[c];
            return (<button key={c} type="button" onClick={() => setActiveConfig(c)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", activeConfig === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
              {m.icon} {m.label}
            </button>);
        })}
      </div>

      {activeConfig === "commercial" && (<CommercialTermsView terms={db.commercialTerms} onToggle={(id) => { toggleCommercialTerm(id); toast.success("Term toggled"); }}/>)}
      {activeConfig === "payment" && (<PaymentTemplatesView templates={db.paymentTermTemplates} onSetDefault={(id) => { setDefaultPTT(id); toast.success("Default template updated"); }}/>)}
      {activeConfig === "tax" && (<TaxConfigView configs={db.taxConfigs} onToggle={(id) => { toggleTaxConfig(id); toast.success("Tax config toggled"); }}/>)}
      {activeConfig === "validity" && (<ValidityConfigView configs={db.validityConfigs} onToggle={(id) => { toggleValidityConfig(id); toast.success("Validity config toggled"); }}/>)}

      <AddConfigDialog open={addOpen} onOpenChange={setAddOpen} activeConfig={activeConfig} onCreate={handleCreate}/>
    </div>);
}

type NewConfigPayload =
    | { kind: "commercial"; label: string; text: string; category: typeof COMMERCIAL_CATEGORIES[number] }
    | { kind: "payment"; label: string }
    | { kind: "tax"; label: string; rate: number; taxType: typeof TAX_TYPES[number] }
    | { kind: "validity"; label: string; defaultDays: number; expiryAction: typeof VALIDITY_ACTIONS[number] };

function AddConfigDialog({ open, onOpenChange, activeConfig, onCreate }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    activeConfig: ConfigType;
    onCreate: (payload: NewConfigPayload) => void;
}) {
    const [label, setLabel] = React.useState("");
    const [text, setText] = React.useState("");
    const [category, setCategory] = React.useState<typeof COMMERCIAL_CATEGORIES[number]>("other");
    const [rate, setRate] = React.useState<string>("18");
    const [taxType, setTaxType] = React.useState<typeof TAX_TYPES[number]>("gst");
    const [defaultDays, setDefaultDays] = React.useState<string>("30");
    const [expiryAction, setExpiryAction] = React.useState<typeof VALIDITY_ACTIONS[number]>("alert");
    React.useEffect(() => {
        if (open) {
            setLabel("");
            setText("");
            setCategory("other");
            setRate("18");
            setTaxType("gst");
            setDefaultDays("30");
            setExpiryAction("alert");
        }
    }, [open, activeConfig]);
    const valid = (() => {
        if (!label.trim())
            return false;
        if (activeConfig === "commercial")
            return text.trim().length > 0;
        if (activeConfig === "tax") {
            const r = parseFloat(rate);
            return !isNaN(r) && r >= 0;
        }
        if (activeConfig === "validity") {
            const d = parseInt(defaultDays, 10);
            return !isNaN(d) && d > 0;
        }
        return true;
    })();
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!valid)
            return;
        if (activeConfig === "commercial") {
            onCreate({ kind: "commercial", label: label.trim(), text: text.trim(), category });
        }
        else if (activeConfig === "payment") {
            onCreate({ kind: "payment", label: label.trim() });
        }
        else if (activeConfig === "tax") {
            onCreate({ kind: "tax", label: label.trim(), rate: parseFloat(rate), taxType });
        }
        else {
            onCreate({ kind: "validity", label: label.trim(), defaultDays: parseInt(defaultDays, 10), expiryAction });
        }
    }
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary"><Plus className="h-4 w-4"/></span>
            Add {CONFIG_META[activeConfig].label.toLowerCase().replace(/s$/, "")}
          </DialogTitle>
          <DialogDescription>Create a new {CONFIG_META[activeConfig].label.toLowerCase()} row. It will be enabled by default; toggle it off after creation if needed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cfg-label">Name <span className="text-destructive">*</span></Label>
            <Input id="cfg-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={activeConfig === "commercial" ? "e.g. Site visit charges" : activeConfig === "payment" ? "e.g. 50% advance, 50% on handover" : activeConfig === "tax" ? "e.g. GST 18%" : "e.g. Standard 30-day validity"} autoFocus required/>
          </div>

          {activeConfig === "commercial" && (<>
            <div className="grid gap-1.5">
              <Label htmlFor="cfg-text">Clause text <span className="text-destructive">*</span></Label>
              <Textarea id="cfg-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Full clause wording shown on the quotation…" rows={3} required/>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cfg-category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof COMMERCIAL_CATEGORIES[number])}>
                <SelectTrigger id="cfg-category" className="w-full"><SelectValue/></SelectTrigger>
                <SelectContent>
                  {COMMERCIAL_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </>)}

          {activeConfig === "tax" && (<>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cfg-rate">Rate (%) <span className="text-destructive">*</span></Label>
                <Input id="cfg-rate" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required/>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cfg-tax-type">Type</Label>
                <Select value={taxType} onValueChange={(v) => setTaxType(v as typeof TAX_TYPES[number])}>
                  <SelectTrigger id="cfg-tax-type" className="w-full"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {TAX_TYPES.map((t) => (<SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>)}

          {activeConfig === "validity" && (<>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cfg-days">Default days <span className="text-destructive">*</span></Label>
                <Input id="cfg-days" type="number" min={1} step="1" value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)} required/>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cfg-action">On expiry</Label>
                <Select value={expiryAction} onValueChange={(v) => setExpiryAction(v as typeof VALIDITY_ACTIONS[number])}>
                  <SelectTrigger id="cfg-action" className="w-full"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alert">Alert owner (no auto-action)</SelectItem>
                    <SelectItem value="auto_revoke">Auto-revoke the quotation</SelectItem>
                    <SelectItem value="extend">Auto-extend by default_days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>)}

          {activeConfig === "payment" && (<p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">The new template starts with a single 100% milestone due on acceptance. Use "Set default" on the card after creation to make it the quotation default.</p>)}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid}><Plus className="mr-1 h-3.5 w-3.5"/> Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>);
}
function CommercialTermsView({ terms, onToggle }: {
    terms: import("@/lib/rdash/types").CommercialTerm[];
    onToggle: (id: string) => void;
}) {
    const enabled = terms.filter((t) => t.enabled).length;
    return (<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total terms" value={terms.length} tone="primary" icon={<FileText className="h-4 w-4"/>}/>
        <MetricCard label="Enabled" value={enabled} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Disabled" value={terms.length - enabled} tone="warning" icon={<Power className="h-4 w-4"/>}/>
        <MetricCard label="Categories" value={new Set(terms.map((t) => t.category)).size} tone="default" icon={<Settings className="h-4 w-4"/>}/>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {terms.map((t) => (<div key={t.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-4 shadow-card transition-all", t.enabled ? "border-border" : "border-dashed border-border opacity-70")}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", t.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}><FileText className="h-3.5 w-3.5"/></span>
                <div>
                  <p className="text-sm font-bold">{t.label}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">{titleCase(t.category)}</p>
                </div>
              </div>
              <StatusBadge label={t.enabled ? "Active" : "Disabled"} className={t.enabled ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}/>
            </div>
            <p className="mt-2 text-xs text-foreground/80">{t.text}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onToggle(t.id)}>
              <Power className="mr-1 h-3.5 w-3.5"/> {t.enabled ? "Disable" : "Enable"}
            </Button>
          </div>))}
      </div>
    </>);
}
function PaymentTemplatesView({ templates, onSetDefault }: {
    templates: import("@/lib/rdash/types").PaymentTermTemplate[];
    onSetDefault: (id: string) => void;
}) {
    return (<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Templates" value={templates.length} tone="primary" icon={<Calendar className="h-4 w-4"/>}/>
        <MetricCard label="Default" value={templates.filter((t) => t.is_default).length} tone="success" icon={<Star className="h-4 w-4"/>}/>
        <MetricCard label="Milestone templates" value={templates.filter((t) => t.terms.length > 2).length} tone="warning" icon={<Calendar className="h-4 w-4"/>}/>
        <MetricCard label="Avg milestones" value={templates.length ? Math.round(templates.reduce((n, t) => n + t.terms.length, 0) / templates.length) : 0} tone="default" icon={<Percent className="h-4 w-4"/>}/>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {templates.map((t) => (<div key={t.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-4 shadow-card", t.is_default ? "border-primary/40 ring-1 ring-primary/20" : "border-border")}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{t.name}</p>
              {t.is_default ? <StatusBadge label="Default" className="bg-primary/10 text-primary border-primary/20"/> : (<Button size="sm" variant="outline" onClick={() => onSetDefault(t.id)}>Set default</Button>)}
            </div>
            <div className="mt-3 flex items-center gap-1">
              {t.terms.map((term, i) => (<React.Fragment key={term.id}>
                  <div className="flex flex-1 flex-col items-center gap-0.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <span className="text-[10px] text-muted-foreground">{term.label}</span>
                    <span className="text-sm font-bold text-primary">{term.percentage}%</span>
                    <span className="text-[9px] text-muted-foreground">{term.due_event.replace(/_/g, " ")}</span>
                  </div>
                  {i < t.terms.length - 1 && <span className="text-xs text-muted-foreground">→</span>}
                </React.Fragment>))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Total: {t.terms.reduce((n, x) => n + x.percentage, 0)}%</p>
          </div>))}
      </div>
    </>);
}
function TaxConfigView({ configs, onToggle }: {
    configs: import("@/lib/rdash/types").TaxConfig[];
    onToggle: (id: string) => void;
}) {
    return (<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Tax configs" value={configs.length} tone="primary" icon={<Percent className="h-4 w-4"/>}/>
        <MetricCard label="Enabled" value={configs.filter((t) => t.enabled).length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Active rate" value={`${configs.filter((t) => t.enabled).map((t) => t.rate).join("%, ") || "0"}%`} tone="warning" icon={<Percent className="h-4 w-4"/>}/>
        <MetricCard label="Types" value={new Set(configs.map((t) => t.type)).size} tone="default" icon={<Settings className="h-4 w-4"/>}/>
      </div>
      <div className="overflow-x-auto rd-scroll rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="min-w-[440px]">
        <div className="grid grid-cols-[1fr_0.5fr_0.5fr_0.5fr] gap-2 border-b border-border bg-muted/50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Name</span><span>Type</span><span className="text-right">Rate</span><span className="text-center">Status</span>
        </div>
        {configs.map((t) => (<div key={t.id} className="grid grid-cols-[1fr_0.5fr_0.5fr_0.5fr] items-center gap-2 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-accent/30">
            <div>
              <p className="font-medium">{t.name}</p>
            </div>
            <span className="text-xs uppercase text-muted-foreground">{t.type}</span>
            <span className="text-right font-mono font-semibold">{t.rate}%</span>
            <div className="flex justify-center">
              <button type="button" onClick={() => onToggle(t.id)} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", t.enabled ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border")}>
                <Power className="h-2.5 w-2.5"/> {t.enabled ? "On" : "Off"}
              </button>
            </div>
          </div>))}
        </div>
      </div>
    </>);
}
function ValidityConfigView({ configs, onToggle }: {
    configs: import("@/lib/rdash/types").ValidityConfig[];
    onToggle: (id: string) => void;
}) {
    return (<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Validity configs" value={configs.length} tone="primary" icon={<ShieldCheck className="h-4 w-4"/>}/>
        <MetricCard label="Enabled" value={configs.filter((v) => v.enabled).length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Default days" value={configs.find((v) => v.enabled)?.default_days || 0} tone="warning" icon={<Calendar className="h-4 w-4"/>}/>
        <MetricCard label="Expiry actions" value={new Set(configs.map((v) => v.expiry_action)).size} tone="default" icon={<Settings className="h-4 w-4"/>}/>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {configs.map((v) => (<div key={v.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-4 shadow-card", v.enabled ? "border-primary/40 ring-1 ring-primary/20" : "border-dashed border-border opacity-70")}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold">{v.name}</p>
                <p className="text-[11px] text-muted-foreground">{v.default_days} days default</p>
              </div>
              <StatusBadge label={v.enabled ? "Active" : "Disabled"} className={v.enabled ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}/>
            </div>
            <div className="mt-2 rounded-md bg-muted/40 p-2">
              <p className="text-[10px] uppercase text-muted-foreground">On expiry</p>
              <p className="text-xs font-medium">{v.expiry_action === "alert" ? "Alert owner (no auto-action)" : v.expiry_action === "auto_revoke" ? "Auto-revoke the quotation" : "Auto-extend by default_days"}</p>
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onToggle(v.id)}>
              <Power className="mr-1 h-3.5 w-3.5"/> {v.enabled ? "Disable" : "Enable"}
            </Button>
          </div>))}
      </div>
    </>);
}
