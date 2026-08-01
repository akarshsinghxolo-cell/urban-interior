"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  BadgeIndianRupee,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  HardHat,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Wallet,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  contractorOutstanding,
  useRDashStore,
  vendorBalance,
} from "@/lib/rdash/store";
import { formatDate, formatINR, formatINRShort, titleCase } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, EmptyState, MetricCard, SectionHeader, StatusBadge } from "../primitives";
import { EntityFormDialog } from "../EntityFormDialog";
import { OperationalMediaPanel } from "../OperationalMediaPanel";

export type Partner360Mode = "vendor" | "contractor";

type TabId = "overview" | "profile" | "commercial" | "work" | "finance" | "compliance" | "activity";

type PartnerRecord = Record<string, any> & {
  id: string;
  name: string;
  phone?: string;
  city?: string;
  locality?: string;
  address?: string;
  status?: string;
};

type ChecklistItem = {
  label: string;
  complete: boolean;
  detail?: string;
  critical?: boolean;
  optional?: boolean;
};

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "profile", label: "Profile", icon: Building2 },
  { id: "commercial", label: "Rates & Terms", icon: BadgeIndianRupee },
  { id: "work", label: "Work & Sites", icon: Wrench },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "activity", label: "Activity", icon: ClipboardCheck },
];

function compactPhone(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

function whatsappHref(value?: string) {
  const digits = compactPhone(value);
  if (!digits) return undefined;
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

function mapHref(partner?: PartnerRecord) {
  if (!partner) return undefined;
  if (Number.isFinite(partner.latitude) && Number.isFinite(partner.longitude)) {
    return `https://www.google.com/maps?q=${partner.latitude},${partner.longitude}`;
  }
  const address = [partner.address, partner.locality, partner.city].filter(Boolean).join(", ");
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined;
}

function lifecycleClass(status?: string) {
  const normalized = status || "active";
  if (normalized === "active") return "bg-success/10 text-success border-success/20";
  if (normalized === "onboarding") return "bg-primary/10 text-primary border-primary/20";
  if (normalized === "on_hold") return "bg-warning/10 text-warning border-warning/20";
  if (normalized === "blocked" || normalized === "blacklisted") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
}

function auditTime(row: any) {
  return row.created_at || row.timestamp || row.at || row.updated_at || "";
}

function formatOptionalDate(value?: string) {
  return value ? formatDate(value) : "—";
}

function InfoCell({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn("mt-1 text-sm font-medium", mono && "font-mono")}>{value || "—"}</div>
    </div>
  );
}

function SmallRecord({
  title,
  subtitle,
  amount,
  status,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  amount?: number;
  status?: string;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {amount != null && <span className="font-mono text-xs font-bold">{formatINRShort(amount)}</span>}
        {status && <StatusBadge label={titleCase(status.replaceAll("_", " "))} className={lifecycleClass(status)} />}
      </div>
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent/20">
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">{body}</div>
  );
}

export function Partner360Module({ mode }: { mode: Partner360Mode }) {
  const db = useRDashStore((state) => state.db);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const openDetail = useRDashStore((state) => state.openDetail);
  const partners = (mode === "vendor" ? db.master.vendors : db.master.contractors) as PartnerRecord[];
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>(() => partners[0]?.id || "");
  const [tab, setTab] = React.useState<TabId>("overview");
  const [entityDialogOpen, setEntityDialogOpen] = React.useState(false);
  const [entityEditId, setEntityEditId] = React.useState<string | undefined>(undefined);
  const [businessDialogOpen, setBusinessDialogOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return partners;
    return partners.filter((partner) => [
      partner.name,
      partner.phone,
      partner.city,
      partner.locality,
      partner.category,
      partner.trade,
      partner.legal_name,
      partner.email,
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [partners, query]);

  React.useEffect(() => {
    if (!partners.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !partners.some((row) => row.id === selectedId)) {
      setSelectedId(partners[0].id);
    }
  }, [partners, selectedId]);

  const selected = partners.find((row) => row.id === selectedId);
  const model = React.useMemo(() => selected ? buildPartnerModel(mode, db as any, selected) : undefined, [mode, db, selected]);

  const openAdd = () => {
    setEntityEditId(undefined);
    setEntityDialogOpen(true);
  };
  const openEdit = () => {
    if (!selected) return;
    setEntityEditId(selected.id);
    setEntityDialogOpen(true);
  };

  const title = mode === "vendor" ? "Vendor 360°" : "Contractor 360°";
  const description = mode === "vendor"
    ? "Supplier profile, catalogue, rates, procurement, delivery quality, bills, payments and compliance in one relationship record."
    : "Contractor profile, capabilities, bids, work orders, RA bills, settlements, payments, capacity and compliance in one relationship record.";
  const Icon = mode === "vendor" ? Building2 : HardHat;

  if (!selected || !model) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
            <div><h1 className="text-xl font-bold">{title}</h1><p className="text-xs text-muted-foreground">{description}</p></div>
          </div>
          <Button onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" />Add {mode}</Button>
        </div>
        <EmptyState title={`No ${mode}s yet`} description={`Create the first ${mode} to start the 360° relationship record.`} action={<Button onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Add {mode}</Button>} />
        <EntityFormDialog type={mode} open={entityDialogOpen} onClose={() => setEntityDialogOpen(false)} onSaved={(id) => setSelectedId(id)} />
      </div>
    );
  }

  const wa = whatsappHref(selected.whatsapp || selected.phone);
  const maps = mapHref(selected);
  const requiredCompliance = model.compliance.filter((item) => !item.optional);
  const completionPct = Math.round((requiredCompliance.filter((item) => item.complete).length / Math.max(1, requiredCompliance.length)) * 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
          <div><h1 className="text-xl font-bold">{title}</h1><p className="max-w-4xl text-xs text-muted-foreground">{description}</p></div>
        </div>
        <Button onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" />Add {mode}</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${mode}s`} className="h-9 pl-8" />
          </div>
          <div className="rd-scroll max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pr-1">
            {filtered.map((partner) => {
              const rowModel = buildPartnerModel(mode, db as any, partner);
              return (
                <button key={partner.id} type="button" onClick={() => { setSelectedId(partner.id); setTab("overview"); }} className={cn("w-full rounded-xl border p-3 text-left transition-all", selectedId === partner.id ? "border-primary bg-primary/[0.04] ring-2 ring-primary/10" : "border-border bg-background hover:bg-accent/20")}>
                  <div className="flex items-start gap-2.5">
                    <Avatar name={partner.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold">{partner.name}</p><StatusBadge label={titleCase(partner.status || "active")} className={lifecycleClass(partner.status)} /></div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{mode === "vendor" ? partner.category || "Supplier" : partner.trade || partner.categories?.join(", ") || "Contractor"} · {partner.city || "City pending"}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{rowModel.workCount} linked {mode === "vendor" ? "orders" : "work orders"}</span><span className={rowModel.outstanding > 0 ? "font-semibold text-destructive" : "text-success"}>{formatINRShort(rowModel.outstanding)} due</span></div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!filtered.length && <p className="py-8 text-center text-xs text-muted-foreground">No matching records.</p>}
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={selected.name} size={52} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-bold">{selected.name}</h2><StatusBadge label={titleCase(selected.status || "active")} className={lifecycleClass(selected.status)} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{selected.legal_name && selected.legal_name !== selected.name ? `${selected.legal_name} · ` : ""}{mode === "vendor" ? selected.category || "Material supplier" : selected.trade || selected.categories?.join(", ") || "Trade contractor"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {selected.phone && <a href={`tel:${selected.phone}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{selected.phone}</a>}
                    {selected.email && <a href={`mailto:${selected.email}`} className="inline-flex items-center gap-1 hover:text-primary"><Mail className="h-3 w-3" />{selected.email}</a>}
                    {(selected.locality || selected.city) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[selected.locality, selected.city].filter(Boolean).join(", ")}</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="mr-1 h-3.5 w-3.5" />{mode === "contractor" ? "Edit contractor" : "Basic profile"}</Button>
                {mode === "vendor" && <Button size="sm" variant="outline" onClick={() => setBusinessDialogOpen(true)}><ShieldCheck className="mr-1 h-3.5 w-3.5" />Business details</Button>}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {selected.phone && <Button asChild size="sm" variant="outline" className="h-8"><a href={`tel:${selected.phone}`}><Phone className="mr-1 h-3.5 w-3.5" />Call</a></Button>}
              {wa && <Button asChild size="sm" variant="outline" className="h-8"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3.5 w-3.5" />WhatsApp</a></Button>}
              {maps && <Button asChild size="sm" variant="outline" className="h-8"><a href={maps} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-3.5 w-3.5" />Maps</a></Button>}
              <Button size="sm" variant="outline" className="h-8" onClick={() => setActiveModule(mode === "vendor" ? "vendorRates" : "contractorDetail")}><Star className="mr-1 h-3.5 w-3.5" />{mode === "vendor" ? "Price matrix" : "Contractor management"}</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setActiveModule(mode === "vendor" ? "vendorBills" : "contractorPayments")}><Wallet className="mr-1 h-3.5 w-3.5" />Bills & payments</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setActiveModule(mode === "vendor" ? "procurementInventory" : "siteExecution")}><Wrench className="mr-1 h-3.5 w-3.5" />{mode === "vendor" ? "Procurement" : "Execution"}</Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label={mode === "vendor" ? "PO / Award value" : "Award value"} value={formatINRShort(model.committedValue)} tone="primary" />
              <MetricCard label="Billed" value={formatINRShort(model.totalBilled)} tone="warning" />
              <MetricCard label="Paid" value={formatINRShort(model.totalPaid)} tone="success" />
              <MetricCard label="Outstanding" value={formatINRShort(model.outstanding)} tone={model.outstanding > 0 ? "destructive" : "success"} />
            </div>
          </section>

          <div className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-card rd-scroll">
            {TABS.map((entry) => {
              const TabIcon = entry.icon;
              return <button key={entry.id} type="button" onClick={() => setTab(entry.id)} className={cn("flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold", tab === entry.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><TabIcon className="h-3.5 w-3.5" />{entry.label}</button>;
            })}
          </div>

          {tab === "overview" && <OverviewTab mode={mode} selected={selected} model={model} completionPct={completionPct} openDetail={openDetail} setTab={setTab} />}
          {tab === "profile" && <ProfileTab mode={mode} selected={selected} model={model} />}
          {tab === "commercial" && <CommercialTab mode={mode} selected={selected} model={model} openDetail={openDetail} />}
          {tab === "work" && <WorkTab mode={mode} model={model} openDetail={openDetail} />}
          {tab === "finance" && <FinanceTab mode={mode} model={model} openDetail={openDetail} />}
          {tab === "compliance" && <ComplianceTab mode={mode} selected={selected} items={model.compliance} completionPct={completionPct} onEdit={() => setBusinessDialogOpen(true)} />}
          {tab === "activity" && <ActivityTab mode={mode} selected={selected} model={model} />}
        </main>
      </div>

      <EntityFormDialog type={mode} editId={entityEditId} open={entityDialogOpen} onClose={() => { setEntityDialogOpen(false); setEntityEditId(undefined); }} onSaved={(id) => setSelectedId(id)} />
      {mode === "vendor" && <PartnerBusinessDialog mode="vendor" partner={selected} open={businessDialogOpen} onClose={() => setBusinessDialogOpen(false)} />}
    </div>
  );
}

function buildPartnerModel(mode: Partner360Mode, db: any, partner: PartnerRecord) {
  if (mode === "vendor") {
    const purchaseOrders = (db.purchaseOrders || []).filter((row: any) => row.vendor_id === partner.id);
    const poIds = new Set(purchaseOrders.map((row: any) => row.id));
    const workOrderIds = new Set(purchaseOrders.map((row: any) => row.work_order_id).filter(Boolean));
    const siteIds = new Set(purchaseOrders.map((row: any) => row.site_id).filter(Boolean));
    const rfqs = (db.vendorRfqs || []).filter((row: any) => row.vendor_ids?.includes(partner.id));
    const bids = (db.vendorBids || []).filter((row: any) => row.vendor_id === partner.id);
    const bills = (db.vendorBills || []).filter((row: any) => row.vendor_id === partner.id);
    const payments = (db.vendorPayments || []).filter((row: any) => row.vendor_id === partner.id);
    const grns = (db.grns || []).filter((row: any) => poIds.has(row.po_id));
    const rates = (db.master.vendorRates || []).filter((row: any) => row.vendor_id === partner.id);
    const sites = (db.sites || []).filter((row: any) => siteIds.has(row.id));
    const workOrders = (db.workOrders || []).filter((row: any) => workOrderIds.has(row.id));
    const customerIds = new Set(workOrders.map((row: any) => row.customer_id).filter(Boolean));
    const customers = (db.customers || []).filter((row: any) => customerIds.has(row.id));
    const delivered = purchaseOrders.filter((row: any) => row.actual_delivery && row.expected_delivery);
    const onTime = delivered.length ? Math.round(delivered.filter((row: any) => row.actual_delivery <= row.expected_delivery).length / delivered.length * 100) : partner.on_time_pct || 0;
    const committedValue = purchaseOrders.reduce((sum: number, row: any) => sum + (row.total_amount || 0), 0);
    const totalBilled = bills.reduce((sum: number, row: any) => sum + (row.total_amount || row.amount || 0), 0);
    const totalPaid = payments.filter((row: any) => row.status !== "cancelled").reduce((sum: number, row: any) => sum + (row.amount || 0), 0);
    let outstanding = 0;
    try { outstanding = vendorBalance(db, partner.id).outstanding; }
    catch { outstanding = bills.reduce((sum: number, row: any) => sum + Math.max(0, row.balance_amount || 0), 0); }
    const relatedIds = new Set<string>([partner.id, ...purchaseOrders.map((x: any) => x.id), ...rfqs.map((x: any) => x.id), ...bids.map((x: any) => x.id), ...bills.map((x: any) => x.id), ...payments.map((x: any) => x.id), ...grns.map((x: any) => x.id)]);
    const activity = (db.auditLog || []).filter((row: any) => row.entity_id && relatedIds.has(row.entity_id)).sort((a: any, b: any) => auditTime(b).localeCompare(auditTime(a)));
    const compliance: ChecklistItem[] = [
      { label: "GSTIN", complete: Boolean(partner.gstin || partner.business_gst), detail: partner.gstin || partner.business_gst, critical: true },
      { label: "PAN", complete: Boolean(partner.pan), detail: partner.pan, critical: true },
      { label: "Bank account and IFSC", complete: Boolean(partner.bank_account && partner.ifsc), detail: partner.bank_account && partner.ifsc ? `${partner.bank_account} · ${partner.ifsc}` : undefined, critical: true },
      { label: "Bank verification", complete: Boolean(partner.verified_bank), detail: partner.verified_bank ? "Verified" : "Pending verification", critical: true },
      { label: "Payment terms", complete: Boolean(partner.payment_terms || partner.credit_days), detail: partner.payment_terms || (partner.credit_days ? `${partner.credit_days} credit days` : undefined) },
      { label: "MSME / Udyam", complete: Boolean(partner.udyam_no), detail: partner.udyam_no },
      { label: "Business card", complete: Boolean(partner.business_card_attachment_id) },
      { label: "Shop / warehouse proof", complete: Boolean(partner.shop_attachment_id) },
      { label: "Rate catalogue", complete: rates.length > 0, detail: `${rates.length} structured rate${rates.length === 1 ? "" : "s"}` },
    ];
    return { purchaseOrders, rfqs, bids, bills, payments, grns, rates, sites, workOrders, customers, activity, compliance, committedValue, totalBilled, totalPaid, outstanding, onTime, workCount: purchaseOrders.length };
  }

  const workOrders = (db.workOrders || []).filter((row: any) => row.contractor_id === partner.id);
  const siteIds = new Set(workOrders.map((row: any) => row.site_id).filter(Boolean));
  const bids = (db.contractorBids || []).filter((row: any) => row.contractor_id === partner.id);
  const bills = (db.contractorBills || []).filter((row: any) => row.contractor_id === partner.id);
  const payments = (db.contractorPayments || []).filter((row: any) => row.contractor_id === partner.id);
  const settlements = (db.contractorSettlements || []).filter((row: any) => row.contractor_id === partner.id);
  const rates = (db.master.contractorRates || []).filter((row: any) => row.contractor_id === partner.id);
  const sites = (db.sites || []).filter((row: any) => siteIds.has(row.id));
  const customerIds = new Set(workOrders.map((row: any) => row.customer_id).filter(Boolean));
  const customers = (db.customers || []).filter((row: any) => customerIds.has(row.id));
  const committedValue = workOrders.reduce((sum: number, row: any) => sum + (row.contractor_award_amount || 0), 0);
  const totalBilled = bills.reduce((sum: number, row: any) => sum + (row.amount || 0), 0);
  const totalPaid = payments.filter((row: any) => row.status === "paid").reduce((sum: number, row: any) => sum + (row.amount || 0), 0);
  let outstanding = 0;
  try { outstanding = contractorOutstanding(db, partner.id); }
  catch { outstanding = Math.max(0, totalBilled - totalPaid - settlements.reduce((sum: number, row: any) => sum + (row.payable_amount || 0), 0)); }
  const relatedIds = new Set<string>([partner.id, ...workOrders.map((x: any) => x.id), ...bids.map((x: any) => x.id), ...bills.map((x: any) => x.id), ...payments.map((x: any) => x.id), ...settlements.map((x: any) => x.id)]);
  const activity = (db.auditLog || []).filter((row: any) => row.entity_id && relatedIds.has(row.entity_id)).sort((a: any, b: any) => auditTime(b).localeCompare(auditTime(a)));
  const insuranceValid = partner.insurance_expiry ? new Date(partner.insurance_expiry).getTime() >= Date.now() : false;
  const compliance: ChecklistItem[] = [
    { label: "GSTIN", complete: Boolean(partner.business_gst), detail: partner.business_gst, optional: true },
    { label: "PAN", complete: Boolean(partner.pan), detail: partner.pan, optional: true },
    { label: "Bank account and IFSC", complete: Boolean(partner.bank_account && partner.ifsc), detail: partner.bank_account && partner.ifsc ? `${partner.bank_account} · ${partner.ifsc}` : undefined, optional: true },
    { label: "Bank verification", complete: Boolean(partner.bank_verified), detail: partner.bank_verified ? "Verified" : "Not verified", optional: true },
    { label: "Supervisor contact", complete: Boolean(partner.supervisor_name && partner.supervisor_phone), detail: partner.supervisor_name && partner.supervisor_phone ? `${partner.supervisor_name} · ${partner.supervisor_phone}` : undefined },
    { label: "Labour registration", complete: Boolean(partner.labour_registration_no), detail: partner.labour_registration_no, optional: true },
    { label: "Insurance", complete: insuranceValid, detail: partner.insurance_expiry ? `Expires ${formatOptionalDate(partner.insurance_expiry)}` : "Not recorded", optional: true },
    { label: "PF / ESI", complete: Boolean(partner.pf_no || partner.esi_no), detail: [partner.pf_no && `PF ${partner.pf_no}`, partner.esi_no && `ESI ${partner.esi_no}`].filter(Boolean).join(" · ") || undefined },
    { label: "Photo and business card", complete: Boolean(partner.photo_attachment_id && partner.business_card_attachment_id) },
    { label: "Structured capabilities", complete: Boolean(partner.work_capabilities?.length), detail: `${partner.work_capabilities?.length || 0} capability record${partner.work_capabilities?.length === 1 ? "" : "s"}` },
  ];
  return { workOrders, bids, bills, payments, settlements, rates, sites, customers, activity, compliance, committedValue, totalBilled, totalPaid, outstanding, onTime: partner.on_time_pct || 0, workCount: workOrders.length };
}

function OverviewTab({ mode, selected, model, completionPct, openDetail, setTab }: any) {
  const activeWork = mode === "vendor"
    ? model.purchaseOrders.filter((row: any) => !["closed", "cancelled", "received"].includes(row.status))
    : model.workOrders.filter((row: any) => ["scheduled", "in_progress", "on_hold"].includes(row.status));
  const criticalMissing = mode === "vendor" ? model.compliance.filter((item: ChecklistItem) => item.critical && !item.complete) : [];
  const recent = model.activity.slice(0, 5);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
      <div className="space-y-4">
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <SectionHeader title="Relationship health" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <InfoCell label="Reliability" value={selected.reliability_score != null ? `${selected.reliability_score}/100` : titleCase(selected.reliability_rating || "not rated")} />
            <InfoCell label="On-time" value={`${model.onTime || 0}%`} />
            <InfoCell label={mode === "vendor" ? "Orders" : "Work orders"} value={model.workCount} />
            <InfoCell label={mode === "vendor" ? "Compliance" : "Profile"} value={`${completionPct}%`} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", completionPct >= 80 ? "bg-success" : completionPct >= 50 ? "bg-warning" : "bg-destructive")} style={{ width: `${completionPct}%` }} /></div>
          <p className="mt-1 text-[10px] text-muted-foreground">{mode === "vendor" ? "Structured business and compliance profile completion." : "Structured contractor profile completion."}</p>
        </section>

        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <SectionHeader title={mode === "vendor" ? "Open procurement" : "Active execution"} count={activeWork.length} />
          <div className="mt-3 space-y-2">
            {activeWork.slice(0, 6).map((row: any) => <SmallRecord key={row.id} title={mode === "vendor" ? `${row.po_no || row.id}` : `${row.work_order_no || row.id} · ${row.title || "Work order"}`} subtitle={mode === "vendor" ? `${row.vendor_name || "Vendor"} · ${row.expected_delivery ? `Expected ${formatOptionalDate(row.expected_delivery)}` : "Delivery date pending"}` : `${row.customer_name || "Customer"} · ${row.progress || 0}% complete`} amount={mode === "vendor" ? row.total_amount : row.contractor_award_amount} status={row.status} onOpen={() => openDetail(mode === "vendor" ? "purchaseOrder" : "workOrder", row.id)} />)}
            {!activeWork.length && <EmptyState title="No active work" description={mode === "vendor" ? "No open purchase order is linked to this Vendor." : "No active work order is linked to this Contractor."} />}
          </div>
        </section>
      </div>

      <div className="space-y-4">
        {mode === "vendor" && <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <SectionHeader title="Immediate attention" />
          <div className="mt-3 space-y-2">
            {model.outstanding > 0 && <button type="button" onClick={() => setTab("finance")} className="flex w-full items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.04] p-3 text-left"><Wallet className="mt-0.5 h-4 w-4 text-warning" /><div><p className="text-xs font-semibold">Outstanding payable</p><p className="text-[11px] text-muted-foreground">{formatINR(model.outstanding)} remains open.</p></div></button>}
            {criticalMissing.map((item: ChecklistItem) => <button key={item.label} type="button" onClick={() => setTab("compliance")} className="flex w-full items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3 text-left"><AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /><div><p className="text-xs font-semibold">Missing {item.label}</p><p className="text-[11px] text-muted-foreground">Complete before new awards or payment release.</p></div></button>)}
            {!model.outstanding && !criticalMissing.length && <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/[0.04] p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /><div><p className="text-xs font-semibold">No critical exception</p><p className="text-[11px] text-muted-foreground">Finance and mandatory compliance are currently clear.</p></div></div>}
          </div>
        </section>}

        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <SectionHeader title="Recent activity" count={model.activity.length} />
          <div className="mt-3 space-y-2">
            {recent.map((row: any) => <div key={row.id} className="rounded-lg border border-border bg-muted/10 p-2.5"><p className="text-xs font-medium">{row.action || row.entity_label || "Activity"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.actor || "System"}{auditTime(row) ? ` · ${formatOptionalDate(auditTime(row))}` : ""}</p></div>)}
            {!recent.length && <p className="py-6 text-center text-xs text-muted-foreground">No linked audit activity yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProfileTab({ mode, selected, model }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <SectionHeader title="Identity and contact" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <InfoCell label="Display name" value={selected.name} />
          <InfoCell label="Legal name" value={selected.legal_name} />
          <InfoCell label="Phone" value={selected.phone} />
          <InfoCell label="WhatsApp" value={selected.whatsapp || selected.phone} />
          <InfoCell label="Alternate phone" value={selected.alternate_phone} />
          <InfoCell label="Email" value={selected.email} />
          <InfoCell label="City" value={selected.city} />
          <InfoCell label="Locality" value={selected.locality} />
        </div>
        <div className="mt-2"><InfoCell label="Address" value={selected.address} /></div>
        <div className="mt-2"><InfoCell label="Referred by" value={selected.source_partner_name} /></div>
      </section>

      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <SectionHeader title={mode === "vendor" ? "Supplier capability" : "Contractor capability"} />
        {mode === "vendor" ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <InfoCell label="Category" value={selected.category || "General supplier"} />
            <InfoCell label="Return policy" value={titleCase(selected.return_policy || "not recorded")} />
            <InfoCell label="Delivery rating" value={titleCase(selected.delivery_time_rating || "not rated")} />
            <InfoCell label="Reliability rating" value={titleCase(selected.reliability_rating || "not rated")} />
            <InfoCell label="Standard lead time" value={selected.standard_lead_time_days ? `${selected.standard_lead_time_days} days` : "—"} />
            <InfoCell label="Service regions" value={selected.service_regions?.join(", ")} />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoCell label="Trade" value={selected.trade || selected.categories?.join(", ")} />
              <InfoCell label="Workers" value={selected.available_workers != null ? `${selected.available_workers} available` : selected.worker_count_range} />
              <InfoCell label="Concurrent sites" value={selected.concurrent_site_limit} />
              <InfoCell label="Mobilisation" value={formatOptionalDate(selected.earliest_mobilisation_date)} />
              <InfoCell label="Supervisor" value={selected.supervisor_name} />
              <InfoCell label="Supervisor phone" value={selected.supervisor_phone} />
              <InfoCell label="Politeness" value={titleCase(selected.politeness_rating || "not rated")} />
              <InfoCell label="Deadline commitment" value={titleCase(selected.deadline_commitment || "not rated")} />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">{(selected.work_capabilities || []).map((cap: any) => <span key={cap.subcategory_id} className="rounded-full border border-border bg-muted/30 px-2 py-1 text-[11px]">{cap.subcategory_name || cap.subcategory_id}{cap.labour_rate ? ` · ${formatINR(cap.labour_rate)}` : ""}</span>)}{!selected.work_capabilities?.length && <span className="text-xs text-muted-foreground">No structured capabilities recorded.</span>}</div>
            </div>
          </div>
        )}
        {selected.notes && <div className="mt-3"><InfoCell label="Notes" value={selected.notes} /></div>}
        <div className="mt-3 text-[11px] text-muted-foreground">Linked footprint: {model.customers.length} customer{model.customers.length === 1 ? "" : "s"}, {model.sites.length} site{model.sites.length === 1 ? "" : "s"}.</div>
      </section>
    </div>
  );
}

function CommercialTab({ mode, selected, model, openDetail }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <SectionHeader title={mode === "vendor" ? "Structured Vendor rates" : "Contractor rates"} count={model.rates.length} />
        <div className="mt-3 space-y-2">
          {model.rates.map((rate: any) => <SmallRecord key={rate.id} title={mode === "vendor" ? rate.article_name || "Article" : rate.work_subcategory_name || rate.trade || "Trade"} subtitle={[rate.brand, rate.grade, rate.unit_id, rate.valid_from && `From ${formatOptionalDate(rate.valid_from)}`].filter(Boolean).join(" · ")} amount={rate.rate ?? rate.labour_rate} onOpen={mode === "vendor" ? () => openDetail("vendorRate", rate.id) : undefined} />)}
          {!model.rates.length && <EmptyState title="No structured rates" description={mode === "vendor" ? "Add Vendor rates from Vendor Price Matrix or an actual invoice." : "Add Contractor rates from the Contractor Rates master."} />}
        </div>
      </section>

      <div className="space-y-4">
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <SectionHeader title="Commercial terms" />
          <div className="mt-3 grid gap-2">
            {mode === "vendor" ? <>
              <InfoCell label="Payment terms" value={selected.payment_terms} />
              <InfoCell label="Credit days" value={selected.credit_days != null ? `${selected.credit_days} days` : "—"} />
              <InfoCell label="Credit limit" value={selected.credit_limit != null ? formatINR(selected.credit_limit) : "—"} />
              <InfoCell label="Minimum order" value={selected.minimum_order_value != null ? formatINR(selected.minimum_order_value) : "—"} />
              <InfoCell label="Warranty terms" value={selected.warranty_terms} />
            </> : <>
              <InfoCell label="Crew range" value={selected.worker_count_range} />
              <InfoCell label="Available workers" value={selected.available_workers} />
              <InfoCell label="Concurrent-site limit" value={selected.concurrent_site_limit} />
              <InfoCell label="Earliest mobilisation" value={formatOptionalDate(selected.earliest_mobilisation_date)} />
              <InfoCell label="Service radius" value={selected.service_radius_km != null ? `${selected.service_radius_km} km` : "—"} />
            </>}
          </div>
        </section>
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <SectionHeader title="Bid history" count={model.bids.length} />
          <div className="mt-3 space-y-2">{model.bids.slice(0, 8).map((bid: any) => <SmallRecord key={bid.id} title={mode === "vendor" ? `${bid.vendor_name || selected.name} bid` : `${bid.bid_no || bid.id} · ${bid.scope || "Scope"}`} subtitle={mode === "vendor" ? `${bid.lines?.length || 0} lines · ${bid.delivery_days || "—"} days` : `${bid.work_order_no || "Scope bid"} · ${bid.estimated_days || "—"} days`} amount={mode === "vendor" ? bid.quoted_amount : bid.quote_amount} status={bid.status} />)}{!model.bids.length && <p className="py-6 text-center text-xs text-muted-foreground">No bid history.</p>}</div>
        </section>
      </div>
    </div>
  );
}

function WorkTab({ mode, model, openDetail }: any) {
  const rows = mode === "vendor" ? model.purchaseOrders : model.workOrders;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <SectionHeader title={mode === "vendor" ? "Purchase orders" : "Work orders"} count={rows.length} />
        <div className="mt-3 space-y-2">{rows.map((row: any) => <SmallRecord key={row.id} title={mode === "vendor" ? `${row.po_no || row.id}` : `${row.work_order_no || row.id} · ${row.title || "Work order"}`} subtitle={mode === "vendor" ? `${row.vendor_name || "Vendor"} · ${row.expected_delivery ? `Expected ${formatOptionalDate(row.expected_delivery)}` : "No expected date"}` : `${row.customer_name || "Customer"} · ${row.progress || 0}% complete`} amount={mode === "vendor" ? row.total_amount : row.contractor_award_amount} status={row.status} onOpen={() => openDetail(mode === "vendor" ? "purchaseOrder" : "workOrder", row.id)} />)}{!rows.length && <EmptyState title="No linked work" description={`No ${mode === "vendor" ? "purchase order" : "work order"} has been linked yet.`} />}</div>
      </section>
      <div className="space-y-4">
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Sites served" count={model.sites.length} /><div className="mt-3 space-y-2">{model.sites.map((site: any) => <SmallRecord key={site.id} title={site.name} subtitle={[site.locality, site.city].filter(Boolean).join(", ")} status={site.stage} onOpen={() => openDetail("site", site.id)} />)}{!model.sites.length && <p className="py-6 text-center text-xs text-muted-foreground">No linked sites.</p>}</div></section>
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Customers served" count={model.customers.length} /><div className="mt-3 flex flex-wrap gap-1.5">{model.customers.map((customer: any) => <button type="button" key={customer.id} onClick={() => openDetail("customer", customer.id)} className="rounded-full border border-border bg-muted/20 px-2.5 py-1 text-xs hover:bg-accent">{customer.name}</button>)}{!model.customers.length && <span className="text-xs text-muted-foreground">No linked customers.</span>}</div></section>
      </div>
    </div>
  );
}

function FinanceTab({ mode, model, openDetail }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Committed" value={formatINRShort(model.committedValue)} tone="primary" />
        <MetricCard label="Billed" value={formatINRShort(model.totalBilled)} tone="warning" />
        <MetricCard label="Paid" value={formatINRShort(model.totalPaid)} tone="success" />
        <MetricCard label="Outstanding" value={formatINRShort(model.outstanding)} tone={model.outstanding > 0 ? "destructive" : "success"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title={mode === "vendor" ? "Vendor bills" : "RA bills"} count={model.bills.length} /><div className="mt-3 space-y-2">{model.bills.map((bill: any) => <SmallRecord key={bill.id} title={mode === "vendor" ? `${bill.bill_no} · ${bill.vendor_invoice_no || bill.po_no || "Invoice"}` : `${bill.ra_no || bill.bill_no} · ${bill.description || "RA bill"}`} subtitle={`Balance ${formatINRShort(bill.balance_amount || 0)}${bill.due_date ? ` · Due ${formatOptionalDate(bill.due_date)}` : ""}`} amount={mode === "vendor" ? bill.total_amount : bill.amount} status={bill.status} onOpen={() => openDetail(mode === "vendor" ? "vendorBill" : "contractorBill", bill.id)} />)}{!model.bills.length && <p className="py-6 text-center text-xs text-muted-foreground">No bills recorded.</p>}</div></section>
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Payments" count={model.payments.length} /><div className="mt-3 space-y-2">{model.payments.map((payment: any) => <SmallRecord key={payment.id} title={`${payment.payment_no || payment.id}`} subtitle={`${payment.mode || "Mode pending"}${payment.reference ? ` · ${payment.reference}` : ""}${payment.paid_at ? ` · ${formatOptionalDate(payment.paid_at)}` : ""}`} amount={payment.amount} status={payment.status} onOpen={() => openDetail(mode === "vendor" ? "vendorPayment" : "contractorPayment", payment.id)} />)}{!model.payments.length && <p className="py-6 text-center text-xs text-muted-foreground">No payments recorded.</p>}</div></section>
      </div>
      {mode === "contractor" && model.settlements?.length > 0 && <section className="rounded-[var(--panel-radius)] border border-destructive/20 bg-card p-4 shadow-card"><SectionHeader title="Settlements" count={model.settlements.length} /><div className="mt-3 space-y-2">{model.settlements.map((row: any) => <SmallRecord key={row.id} title={`${row.settlement_no} · ${titleCase(row.type)}`} subtitle={`${row.completed_pct}% complete · ${row.reason}`} amount={row.payable_amount} status="settled" onOpen={() => openDetail("workOrder", row.work_order_id)} />)}</div></section>}
    </div>
  );
}

function ComplianceTab({ mode, selected, items, completionPct, onEdit }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">{mode === "contractor" ? "Contractor profile" : "Compliance checklist"}</h3><p className="text-xs text-muted-foreground">{mode === "contractor" ? "Optional records and operational profile details." : "Mandatory business, banking and operational readiness for awards and payment release."}</p></div><Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Update details</Button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item: ChecklistItem) => <div key={item.label} className={cn("rounded-xl border p-3", item.complete ? "border-success/25 bg-success/[0.04]" : item.optional ? "border-border bg-muted/10" : item.critical ? "border-destructive/30 bg-destructive/[0.04]" : "border-warning/30 bg-warning/[0.04]")}><div className="flex items-start gap-2">{item.complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4", item.optional ? "text-muted-foreground" : item.critical ? "text-destructive" : "text-warning")} />}<div><div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-semibold">{item.label}</p>{item.optional && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">Optional</span>}</div><p className="mt-0.5 text-[10px] text-muted-foreground">{item.detail || (item.complete ? "Recorded" : item.optional ? "Not recorded" : "Missing")}</p></div></div></div>)}</div>
        <div className="mt-4"><div className="flex items-center justify-between text-xs"><span>Profile completion</span><strong>{completionPct}%</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", completionPct >= 80 ? "bg-success" : completionPct >= 50 ? "bg-warning" : "bg-destructive")} style={{ width: `${completionPct}%` }} /></div></div>
      </section>
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Files and evidence" /><div className="mt-3"><OperationalMediaPanel entityType={mode} entityId={selected.id} title={`${mode === "vendor" ? "Vendor" : "Contractor"} files, agreements and evidence`} /></div></section>
    </div>
  );
}

function ActivityTab({ mode, selected, model }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Linked audit timeline" count={model.activity.length} /><div className="mt-3 space-y-2">{model.activity.map((row: any) => <div key={row.id} className="rounded-lg border border-border bg-muted/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{row.action || row.entity_label || "Activity"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.actor || "System"} · {row.actor_role || row.kind || "Activity"}</p></div>{auditTime(row) && <span className="shrink-0 text-[10px] text-muted-foreground">{formatOptionalDate(auditTime(row))}</span>}</div>{row.reason && <p className="mt-2 text-[11px] text-muted-foreground">{row.reason}</p>}</div>)}{!model.activity.length && <EmptyState title="No linked activity" description="Actions on related orders, bills, payments and work orders will appear here." />}</div></section>
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Operational files" /><div className="mt-3"><OperationalMediaPanel entityType={mode} entityId={selected.id} title="Files, references and evidence" /></div></section>
    </div>
  );
}

function PartnerBusinessDialog({ mode, partner, open, onClose }: { mode: Partner360Mode; partner: PartnerRecord; open: boolean; onClose: () => void }) {
  const updateVendor = useRDashStore((state) => state.updateVendor);
  const updateContractor = useRDashStore((state) => state.updateContractor);
  const [draft, setDraft] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    if (!open) return;
    setDraft({
      legal_name: partner.legal_name || "",
      email: partner.email || "",
      whatsapp: partner.whatsapp || partner.phone || "",
      alternate_phone: partner.alternate_phone || "",
      status: partner.status || "active",
      gstin: partner.gstin || partner.business_gst || "",
      pan: partner.pan || "",
      bank_account: partner.bank_account || "",
      ifsc: partner.ifsc || "",
      payment_terms: partner.payment_terms || "",
      credit_days: partner.credit_days ?? "",
      credit_limit: partner.credit_limit ?? "",
      minimum_order_value: partner.minimum_order_value ?? "",
      standard_lead_time_days: partner.standard_lead_time_days ?? "",
      warranty_terms: partner.warranty_terms || "",
      udyam_no: partner.udyam_no || "",
      verified_bank: Boolean(partner.verified_bank),
      supervisor_name: partner.supervisor_name || "",
      supervisor_phone: partner.supervisor_phone || "",
      available_workers: partner.available_workers ?? "",
      concurrent_site_limit: partner.concurrent_site_limit ?? "",
      earliest_mobilisation_date: partner.earliest_mobilisation_date || "",
      service_radius_km: partner.service_radius_km ?? "",
      labour_registration_no: partner.labour_registration_no || "",
      insurance_expiry: partner.insurance_expiry || "",
      pf_no: partner.pf_no || "",
      esi_no: partner.esi_no || "",
      bank_verified: Boolean(partner.bank_verified),
      notes: partner.notes || "",
    });
  }, [open, partner]);

  const set = (key: string, value: any) => setDraft((current) => ({ ...current, [key]: value }));
  const numberOrUndefined = (value: any) => value === "" || value == null ? undefined : Number(value);
  const save = () => {
    const common = {
      legal_name: draft.legal_name.trim() || undefined,
      email: draft.email.trim() || undefined,
      whatsapp: draft.whatsapp.trim() || undefined,
      alternate_phone: draft.alternate_phone.trim() || undefined,
      status: draft.status,
      notes: draft.notes.trim() || undefined,
    };
    if (mode === "vendor") {
      updateVendor(partner.id, {
        ...common,
        gstin: draft.gstin.trim() || undefined,
        pan: draft.pan.trim() || undefined,
        bank_account: draft.bank_account.trim() || undefined,
        ifsc: draft.ifsc.trim() || undefined,
        payment_terms: draft.payment_terms.trim() || undefined,
        credit_days: numberOrUndefined(draft.credit_days),
        credit_limit: numberOrUndefined(draft.credit_limit),
        minimum_order_value: numberOrUndefined(draft.minimum_order_value),
        standard_lead_time_days: numberOrUndefined(draft.standard_lead_time_days),
        warranty_terms: draft.warranty_terms.trim() || undefined,
        udyam_no: draft.udyam_no.trim() || undefined,
        verified_bank: Boolean(draft.verified_bank),
      } as any);
    } else {
      updateContractor(partner.id, {
        ...common,
        business_gst: draft.gstin.trim() || undefined,
        pan: draft.pan.trim() || undefined,
        bank_account: draft.bank_account.trim() || undefined,
        ifsc: draft.ifsc.trim() || undefined,
        supervisor_name: draft.supervisor_name.trim() || undefined,
        supervisor_phone: draft.supervisor_phone.trim() || undefined,
        available_workers: numberOrUndefined(draft.available_workers),
        concurrent_site_limit: numberOrUndefined(draft.concurrent_site_limit),
        earliest_mobilisation_date: draft.earliest_mobilisation_date || undefined,
        service_radius_km: numberOrUndefined(draft.service_radius_km),
        labour_registration_no: draft.labour_registration_no.trim() || undefined,
        insurance_expiry: draft.insurance_expiry || undefined,
        pf_no: draft.pf_no.trim() || undefined,
        esi_no: draft.esi_no.trim() || undefined,
        bank_verified: Boolean(draft.bank_verified),
      } as any);
    }
    toast.success(`${mode === "vendor" ? "Vendor" : "Contractor"} business details updated`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4"><DialogTitle>{mode === "vendor" ? "Vendor business details" : "Contractor business details"}</DialogTitle><DialogDescription>Structured identity, tax, banking, commercial and operational readiness fields used by the 360° workspace.</DialogDescription></DialogHeader>
        <div className="rd-scroll max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Identity and lifecycle</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.legal_name || ""} onChange={(e) => set("legal_name", e.target.value)} placeholder="Legal / registered name" /><Input value={draft.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="Email" type="email" /><Input value={draft.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="WhatsApp number" /><Input value={draft.alternate_phone || ""} onChange={(e) => set("alternate_phone", e.target.value)} placeholder="Alternate phone" /><select value={draft.status || "active"} onChange={(e) => set("status", e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="on_hold">On hold</option><option value={mode === "vendor" ? "blocked" : "blacklisted"}>{mode === "vendor" ? "Blocked" : "Blacklisted"}</option><option value="inactive">Inactive</option></select></div></section>
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tax and banking</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.gstin || ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="GSTIN" /><Input value={draft.pan || ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} placeholder="PAN" /><Input value={draft.bank_account || ""} onChange={(e) => set("bank_account", e.target.value)} placeholder="Bank account number" /><Input value={draft.ifsc || ""} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} placeholder="IFSC" /></div><label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(mode === "vendor" ? draft.verified_bank : draft.bank_verified)} onChange={(e) => set(mode === "vendor" ? "verified_bank" : "bank_verified", e.target.checked)} />Bank details independently verified</label></section>
          {mode === "vendor" ? <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Commercial terms</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.payment_terms || ""} onChange={(e) => set("payment_terms", e.target.value)} placeholder="Payment terms" /><Input value={draft.credit_days ?? ""} onChange={(e) => set("credit_days", e.target.value)} placeholder="Credit days" type="number" /><Input value={draft.credit_limit ?? ""} onChange={(e) => set("credit_limit", e.target.value)} placeholder="Credit limit" type="number" /><Input value={draft.minimum_order_value ?? ""} onChange={(e) => set("minimum_order_value", e.target.value)} placeholder="Minimum order value" type="number" /><Input value={draft.standard_lead_time_days ?? ""} onChange={(e) => set("standard_lead_time_days", e.target.value)} placeholder="Standard lead time (days)" type="number" /><Input value={draft.udyam_no || ""} onChange={(e) => set("udyam_no", e.target.value)} placeholder="MSME / Udyam number" /><Input value={draft.warranty_terms || ""} onChange={(e) => set("warranty_terms", e.target.value)} placeholder="Warranty terms" className="sm:col-span-2" /></div></section> : <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Capacity and compliance</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.supervisor_name || ""} onChange={(e) => set("supervisor_name", e.target.value)} placeholder="Supervisor / foreman name" /><Input value={draft.supervisor_phone || ""} onChange={(e) => set("supervisor_phone", e.target.value)} placeholder="Supervisor phone" /><Input value={draft.available_workers ?? ""} onChange={(e) => set("available_workers", e.target.value)} placeholder="Workers currently available" type="number" /><Input value={draft.concurrent_site_limit ?? ""} onChange={(e) => set("concurrent_site_limit", e.target.value)} placeholder="Concurrent site limit" type="number" /><Input value={draft.earliest_mobilisation_date || ""} onChange={(e) => set("earliest_mobilisation_date", e.target.value)} type="date" /><Input value={draft.service_radius_km ?? ""} onChange={(e) => set("service_radius_km", e.target.value)} placeholder="Service radius (km)" type="number" /><Input value={draft.labour_registration_no || ""} onChange={(e) => set("labour_registration_no", e.target.value)} placeholder="Labour registration number" /><Input value={draft.insurance_expiry || ""} onChange={(e) => set("insurance_expiry", e.target.value)} type="date" /><Input value={draft.pf_no || ""} onChange={(e) => set("pf_no", e.target.value)} placeholder="PF number" /><Input value={draft.esi_no || ""} onChange={(e) => set("esi_no", e.target.value)} placeholder="ESI number" /></div></section>}
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Internal notes</p><Textarea value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Relationship notes, special conditions, escalation or operating instructions" /></section>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}><CheckCircle2 className="mr-1 h-4 w-4" />Save business details</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
