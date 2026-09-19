"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ArrowRight, CheckCircle2, MapPin, MessageCircle, Pencil, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { formatDate, formatINR, formatINRShort, titleCase } from "@/lib/rdash/format";
import { partnerPortfolio, type PartnerKind, type PartnerSection } from "@/lib/rdash/partner-workspace";
import type { Contractor, ContractorBid, Vendor, WorkOrder } from "@/lib/rdash/types";
import { EntityFormDialog } from "../EntityFormDialog";
import { EntityFilesCard } from "../EntityFilesCard";
import { Avatar, EmptyState, MetricCard, StatusBadge } from "../primitives";
import { useActiveTabScroll } from "../use-active-tab-scroll";

const ProcurementModule = dynamic(() => import("./ProcurementModule").then((module) => module.ProcurementModule));
const VendorBillsModule = dynamic(() => import("./VendorBillsModule").then((module) => module.VendorBillsModule));
const ContractorPaymentsModule = dynamic(() => import("./ContractorPaymentsModule").then((module) => module.ContractorPaymentsModule));
const VendorPriceMasterModule = dynamic(() => import("./VendorPriceMasterModule").then((module) => module.VendorPriceMasterModule));
const EditContractorBidDialog = dynamic(() => import("./ContractorWorkDialogs").then((module) => module.EditContractorBidDialog));
const CreateRABillDialog = dynamic(() => import("./ContractorWorkDialogs").then((module) => module.CreateRABillDialog));

const sections: Array<[PartnerSection, string]> = [["overview", "Overview"], ["profile", "Profile"], ["capabilities", "Capabilities & rates"], ["work", "Work & orders"], ["finance", "Bills & payments"], ["tasks", "Tasks"], ["files", "Files"], ["activity", "Activity"]];
type Portfolio = ReturnType<typeof partnerPortfolio>;

function Info({ label, children }: { label: string; children?: React.ReactNode }) {
  return <div className="min-w-0 rounded-lg border border-border bg-muted/15 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1 break-words text-sm">{children ?? "Not recorded"}</div></div>;
}

function RecordLink({ title, description, status, onClick }: { title: string; description?: string; status?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-background p-3 text-left hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"><div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold">{title}</p>{description && <p className="mt-1 break-words text-xs text-muted-foreground">{description}</p>}</div>{status && <StatusBadge label={titleCase(status.replaceAll("_", " "))} />}<ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></button>;
}

export function PartnerDetailContent({ kind, id }: { kind: PartnerKind; id: string }) {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);
  const [section, setSection] = React.useState<PartnerSection>("overview");
  const [editOpen, setEditOpen] = React.useState(false);
  const { stripRef, bindActiveTab } = useActiveTabScroll(section);
  const partner = (kind === "vendor" ? db.master.vendors : db.master.contractors).find((row) => row.id === id);
  const model = React.useMemo(() => partner ? partnerPortfolio(db, kind, partner) : undefined, [db, kind, partner]);
  if (!partner || !model) return <EmptyState title="Partner not found" description="Return to the directory and choose an existing partner." />;
  const digits = (partner.phone || "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const address = [partner.address, partner.locality, partner.city].filter(Boolean).join(", ");
  const mapUrl = Number.isFinite(partner.latitude) && Number.isFinite(partner.longitude)
    ? `https://www.google.com/maps?q=${partner.latitude},${partner.longitude}`
    : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined;

  return <div className="min-w-0 space-y-4 p-4" data-testid="partner-profile">
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Avatar name={partner.name} size={48} /><div className="min-w-0"><h2 className="break-words text-lg font-bold">{partner.name}</h2><p className="mt-1 text-xs text-muted-foreground">{partner.phone || "Mobile pending"} · {partner.city || "City pending"}</p><div className="mt-2"><StatusBadge label={titleCase((partner.status || "onboarding").replaceAll("_", " "))} /></div></div></div><Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit profile</Button></div>
      <div className="flex flex-wrap gap-2">
        {digits && <Button size="sm" variant="outline" asChild><a href={`tel:${digits}`}><Phone className="mr-1 h-3.5 w-3.5" />Call</a></Button>}
        {phone && <Button size="sm" variant="outline" asChild><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3.5 w-3.5" />WhatsApp</a></Button>}
        {mapUrl && <Button size="sm" variant="outline" asChild><a href={mapUrl} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-3.5 w-3.5" />Directions</a></Button>}
        <Button size="sm" onClick={() => setSection("work")}>{kind === "vendor" ? "Manage purchasing" : "Manage site work"}</Button>
        <Button size="sm" variant="outline" onClick={() => setSection("finance")}>Manage bills & payments</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><MetricCard label="Active orders" value={model.activeOrders} tone="primary" /><MetricCard label="Sites" value={model.sites.length} /><MetricCard label="Paid" value={formatINRShort(model.paid)} tone="success" /><MetricCard label="Outstanding" value={formatINRShort(model.outstanding)} tone="warning" /></div>
    </section>
    <div ref={stripRef} role="group" aria-label="Partner sections" className="flex max-w-full gap-1 overflow-x-auto border-b border-border pb-1 rd-scroll">{sections.map(([key, label]) => <button key={key} type="button" ref={bindActiveTab(key)} aria-pressed={section === key} onClick={() => setSection(key)} className={cn("min-h-10 shrink-0 rounded-md px-3 py-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring", section === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{label}{key === "tasks" ? ` (${model.tasks.length})` : key === "files" ? ` (${model.files.length})` : ""}</button>)}</div>

    {section === "overview" && <div className="space-y-4">
      <section className="space-y-2"><h3 className="text-sm font-semibold">Pending actions <span className="text-muted-foreground">({model.actions.length})</span></h3>{model.actions.map((action) => <RecordLink key={action.id} title={action.title} description={action.description} onClick={() => action.kind && action.recordId ? openDetail(action.kind, action.recordId) : setSection(action.section)} />)}{!model.actions.length && <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />No pending actions</div>}</section>
      <section className="space-y-2"><h3 className="text-sm font-semibold">Capabilities</h3><p className="rounded-lg border border-border p-3 text-sm">{model.capabilityNames.join(" · ") || "No capabilities recorded yet."}</p><Button size="sm" variant="outline" onClick={() => setSection("capabilities")}>View capabilities & rates</Button></section>
      <LinkedSites model={model} />
      <div className="grid grid-cols-2 gap-2"><Info label="Bills">{model.bills.length}</Info><Info label="Payments awaiting completion">{formatINR(model.committed)}</Info><Info label="Profile reliability">{partner.reliability_rating ? titleCase(partner.reliability_rating.replaceAll("_", " ")) : "Not rated"}</Info><Info label={kind === "vendor" ? "Receipts recorded" : "Completed work orders"}>{kind === "vendor" ? model.grns.length : model.workOrders.filter((row) => row.status === "completed" && row.contractor_id === id).length}</Info></div>
    </div>}

    {section === "profile" && <div className="space-y-3"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Info label="Name">{partner.name}</Info><Info label="Legal name">{partner.legal_name}</Info><Info label="Mobile">{partner.phone}</Info><Info label="City / locality">{[partner.city, partner.locality].filter(Boolean).join(" · ") || undefined}</Info><Info label="Referred by">{db.master.sourcePartners.find((row) => row.id === partner.source_partner_id)?.name || partner.source_partner_name}</Info><Info label="Status">{titleCase((partner.status || "onboarding").replaceAll("_", " "))}</Info>
      {kind === "vendor" ? <><Info label="Vendor type">{titleCase((partner as Vendor).vendor_type || "other")}</Info><Info label="GSTIN">{(partner as Vendor).gstin}</Info><Info label="Brands">{(partner as Vendor).brands?.join(", ") || undefined}</Info><Info label="Return policy">{(partner as Vendor).return_policy?.replaceAll("_", " ")}</Info><Info label="Delivery rating">{(partner as Vendor).delivery_time_rating?.replaceAll("_", " ")}</Info></> : <><Info label="Crew size">{(partner as Contractor).worker_count_range}</Info><Info label="Workers available">{(partner as Contractor).available_workers}</Info><Info label="Service radius">{(partner as Contractor).service_radius_km != null ? `${(partner as Contractor).service_radius_km} km` : undefined}</Info><Info label="Deadline commitment">{(partner as Contractor).deadline_commitment?.replaceAll("_", " ")}</Info><Info label="Politeness rating">{(partner as Contractor).politeness_rating}</Info></>}
      </div><Info label="Address">{address || undefined}</Info><Info label="Notes"><span className="whitespace-pre-wrap">{partner.notes || "No notes yet"}</span></Info><Button variant="outline" onClick={() => setEditOpen(true)}>Edit profile & capabilities</Button></div>}

    {section === "capabilities" && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{kind === "vendor" ? "Supply capabilities" : "Work capabilities"}</h3><Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit capabilities</Button></div>
      {!model.capabilityCount && <EmptyState title="No capabilities recorded" description="Add the materials supplied or the work this partner can carry out." />}
      {model.contractorCapabilities.map((capability) => <section key={capability.subcategory_id} className="space-y-2 rounded-lg border border-border p-3"><h4 className="text-sm font-semibold">{capability.subcategory_name || "Work category"}</h4>{(capability.work_type_rates || []).map((rate) => <div key={rate.work_type_id} className="rounded-md bg-muted/30 p-3"><p className="text-xs font-medium">{rate.work_type_name}</p><dl className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted-foreground">Material</dt><dd>{rate.material_rate != null ? formatINR(rate.material_rate) : "Not quoted"}</dd></div><div><dt className="text-muted-foreground">Labour</dt><dd>{rate.labour_rate != null ? formatINR(rate.labour_rate) : "Not quoted"}</dd></div><div><dt className="text-muted-foreground">Unit</dt><dd>{db.master.units.find((unit) => unit.id === rate.unit_id)?.symbol || rate.unit_id || "Not set"}</dd></div></dl>{rate.notes && <p className="mt-2 text-xs text-muted-foreground">{rate.notes}</p>}</div>)}{!capability.work_type_rates?.length && <p className="text-xs text-muted-foreground">Capability recorded. Add work types and agreed rates in Edit capabilities.</p>}</section>)}
      {model.vendorCapabilities.map((capability) => <div key={capability.id || capability.article_id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold">{capability.article_name || "Article"}</p><StatusBadge label={titleCase((capability.availability || "unknown").replaceAll("_", " "))} /></div><p className="mt-1 text-xs text-muted-foreground">{[capability.brand, capability.typical_lead_time_days != null ? `${capability.typical_lead_time_days} days lead time` : "Lead time not recorded", capability.moq != null ? `MOQ ${capability.moq}` : undefined, capability.status === "inactive" ? "Inactive capability" : undefined].filter(Boolean).join(" · ")}</p>{capability.notes && <p className="mt-2 text-xs">{capability.notes}</p>}</div>)}
      {kind === "vendor" && <VendorPriceMasterModule key={id} vendorId={id} />}
    </div>}

    {section === "work" && <div className="space-y-4"><LinkedSites model={model} />{kind === "vendor" ? <><ProcurementModule key={id} vendorId={id} /><section className="space-y-2"><h3 className="text-sm font-semibold">Delivery receipts</h3>{model.grns.map((row) => <RecordLink key={row.id} title={row.grn_no} description={`${row.po_no} · ${formatDate(row.received_at)}`} status={row.status} onClick={() => openDetail("grn", row.id)} />)}{!model.grns.length && <p className="text-xs text-muted-foreground">Delivery receipts will appear here when the purchase order is received.</p>}</section></> : <ContractorWork model={model} />}</div>}
    {section === "finance" && <div className="space-y-4">{kind === "vendor" ? <VendorBillsModule key={id} vendorId={id} /> : <ContractorPaymentsModule key={id} contractorId={id} />}<section className="space-y-2"><h3 className="text-sm font-semibold">Payment history</h3>{model.payments.map((row) => <RecordLink key={row.id} title={row.payment_no} description={`${formatINR(row.amount)} · ${formatDate(row.paid_at || row.created_at)}`} status={row.status} onClick={() => openDetail(kind === "vendor" ? "vendorPayment" : "contractorPayment", row.id)} />)}{!model.payments.length && <p className="text-xs text-muted-foreground">No payments recorded.</p>}</section></div>}
    {section === "tasks" && <div className="space-y-2"><p className="text-xs text-muted-foreground">Tasks linked to this partner&apos;s purchase orders and work orders.</p>{model.tasks.map((row) => <RecordLink key={row.id} title={row.title} description={`Due ${formatDate(row.due_date)}`} status={row.status} onClick={() => openDetail("task", row.id)} />)}{!model.tasks.length && <EmptyState title="No linked tasks" description="Tasks attached to this partner&apos;s orders appear here." />}</div>}
    {section === "files" && <EntityFilesCard entityType={kind} entityId={id} title={`${titleCase(kind)} files`} manage showEmpty />}
    {section === "activity" && <div className="space-y-2"><h3 className="text-sm font-semibold">Recent activity</h3><p className="text-xs text-muted-foreground">Profile changes and linked business records.</p>{model.activity.map((entry) => <RecordLink key={entry.id} title={entry.action} description={`${entry.actor} · ${formatDate(entry.timestamp)}`} onClick={() => openDetail("audit", entry.id)} />)}{!model.activity.length && <EmptyState title="No recent activity" description="New profile updates and linked transactions will appear here." />}</div>}
    <EntityFormDialog type={kind} editId={id} open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => setEditOpen(false)} />
  </div>;
}

function LinkedSites({ model }: { model: Portfolio }) {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);
  return <section className="space-y-2"><h3 className="text-sm font-semibold">Linked sites <span className="text-muted-foreground">({model.sites.length})</span></h3>{model.sites.map((site) => <div key={site.id} className="space-y-1 rounded-lg border border-border p-3"><RecordLink title={site.name} description={[site.locality, site.city].filter(Boolean).join(", ")} onClick={() => openDetail("site", site.id)} /><button type="button" onClick={() => openDetail("customer", site.customer_id)} className="px-1 py-2 text-xs font-medium text-primary">Customer: {db.customers.find((row) => row.id === site.customer_id)?.name || "Open customer"}</button></div>)}{!model.sites.length && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Sites appear automatically when this partner is linked to an order or bid.</p>}</section>;
}

function ContractorWork({ model }: { model: Portfolio }) {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);
  const currentUser = useRDashStore((state) => state.currentUser);
  const [editBid, setEditBid] = React.useState<ContractorBid | null>(null);
  const [billWork, setBillWork] = React.useState<WorkOrder | null>(null);
  const [newBid, setNewBid] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const canManage = ["Owner", "Operations Manager", "Finance"].includes(currentUser().role);
  const save = async (action: () => void, message: string) => {
    if (saving) return;
    setSaving(true);
    try { action(); await useRDashStore.getState().awaitServerSync(); setEditBid(null); setBillWork(null); toast.success(message); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save changes"); }
    finally { setSaving(false); }
  };
  return <div className="space-y-4">
    <section className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Bids</h3>{canManage && <Button size="sm" variant="outline" disabled={(model.partner.status || "onboarding") !== "active"} onClick={() => setNewBid(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add bid</Button>}</div>{model.contractorBids.map((bid) => <div key={bid.id} className="space-y-2 rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-semibold">{bid.bid_no} · {formatINR(bid.quote_amount || 0)}</h4><StatusBadge label={titleCase(bid.status)} /></div><p className="text-xs text-muted-foreground">{bid.scope} · {bid.estimated_days != null ? `${bid.estimated_days} days` : "Duration pending"}</p><div className="flex flex-wrap gap-2">{canManage && bid.status === "submitted" && <Button size="sm" variant="outline" onClick={() => setEditBid(bid)}>Edit / withdraw bid</Button>}{bid.work_order_id ? <Button size="sm" variant="outline" onClick={() => openDetail("workOrder", bid.work_order_id || "")}>Open work order</Button> : bid.site_id && <Button size="sm" variant="outline" onClick={() => openDetail("site", bid.site_id || "")}>Review site & award</Button>}</div></div>)}{!model.contractorBids.length && <p className="text-xs text-muted-foreground">No bids yet. Add a bid against customer-accepted work.</p>}</section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">Work orders</h3>{model.workOrders.map((work) => <div key={work.id} className="space-y-2 rounded-lg border border-border p-3"><RecordLink title={`${work.work_order_no} · ${work.title}`} description={`${work.progress}% complete · ${work.contractor_award_amount != null ? formatINR(work.contractor_award_amount) : "Award amount not set"}${work.contractor_id !== model.partner.id ? " · Previous contractor" : ""}`} status={work.status} onClick={() => openDetail("workOrder", work.id)} />{canManage && work.contractor_id === model.partner.id && work.status !== "cancelled" && work.status !== "abandoned" && <Button size="sm" variant="outline" onClick={() => setBillWork(work)}>Create RA bill</Button>}</div>)}{!model.workOrders.length && <EmptyState title="No work orders yet" description="Award accepted customer work to this contractor to connect execution, costs and billing." />}</section>
    {editBid && <EditContractorBidDialog bid={editBid} saving={saving} onClose={() => setEditBid(null)} onSave={(patch) => void save(() => useRDashStore.getState().updateContractorBid(editBid.id, patch), "Bid saved")} onWithdraw={() => void save(() => useRDashStore.getState().updateContractorBid(editBid.id, { status: "withdrawn" }), "Bid withdrawn")} />}
    {billWork && <CreateRABillDialog contractor={model.partner} workOrder={billWork} saving={saving} releaseGuard={useRDashStore.getState().canReleaseContractorPayment(billWork.id)} onClose={() => setBillWork(null)} onUploadProof={() => { setBillWork(null); openDetail("workOrder", billWork.id); }} onSubmit={(amount, description, progress) => void save(() => { useRDashStore.getState().createContractorRABill(billWork.id, model.partner.id, amount, description, progress); }, "RA bill saved. Manage payment in Bills & payments.")} />}
    {newBid && <NewContractorBid contractor={model.partner as Contractor} onClose={() => setNewBid(false)} />}
    {!db.acceptedScopes.some((scope) => scope.status === "contractor_bidding") && !model.contractorBids.length && <p className="text-xs text-muted-foreground">No accepted scopes are awaiting contractor bids yet.</p>}
  </div>;
}

function NewContractorBid({ contractor, onClose }: { contractor: Contractor; onClose: () => void }) {
  const db = useRDashStore((state) => state.db);
  const [scopeId, setScopeId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [days, setDays] = React.useState("");
  const [material, setMaterial] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const scopes = db.acceptedScopes.filter((scope) => scope.status === "contractor_bidding" && !db.contractorBids.some((bid) => bid.accepted_scope_id === scope.id && bid.contractor_id === contractor.id && bid.status !== "withdrawn" && bid.status !== "rejected"));
  const valid = scopes.some((scope) => scope.id === scopeId) && Number.isFinite(Number(amount)) && Number(amount) > 0 && (!days || (Number.isInteger(Number(days)) && Number(days) > 0));
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const state = useRDashStore.getState();
      const id = state.addContractorBid({ contractor_id: contractor.id, accepted_scope_id: scopeId, quote_amount: Number(amount), estimated_days: days ? Number(days) : undefined, with_material: material });
      if (!id) throw new Error("The selected scope is no longer available.");
      await state.awaitServerSync();
      toast.success("Contractor bid saved"); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save bid"); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Add contractor bid</DialogTitle><DialogDescription>{contractor.name} · choose customer-accepted work awaiting bids.</DialogDescription></DialogHeader><label className="space-y-1 text-sm">Accepted scope<select className="h-10 w-full rounded-md border border-input bg-card px-2" value={scopeId} onChange={(event) => setScopeId(event.target.value)}><option value="">Select accepted scope</option>{scopes.map((scope) => <option key={scope.id} value={scope.id}>{db.sites.find((site) => site.id === scope.site_id)?.name} · {scope.label}</option>)}</select></label>{!scopes.length && <p className="text-sm text-muted-foreground">No eligible scopes. Open a customer&apos;s accepted quotation and begin contractor bidding first.</p>}<label className="space-y-1 text-sm">Quote amount (₹)<Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="space-y-1 text-sm">Estimated days (optional)<Input type="number" min="1" step="1" value={days} onChange={(event) => setDays(event.target.value)} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={material} onChange={(event) => setMaterial(event.target.checked)} />Contractor supplies materials</label><DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={!valid || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save bid"}</Button></DialogFooter></DialogContent></Dialog>;
}
