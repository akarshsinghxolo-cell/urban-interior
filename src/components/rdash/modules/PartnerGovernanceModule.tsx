"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  HardHat,
  Layers3,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { formatDate, formatINR, titleCase } from "@/lib/rdash/format";
import {
  canonicalContractorCapabilities,
  contractorCapabilitiesFromGovernance,
  contractorGovernanceCapabilityProjection,
  derivedContractorCategoryNames,
} from "@/lib/rdash/contractor-profile";
import {
  DOCUMENT_KIND_LABELS,
  daysUntilExpiry,
  detectPartnerDuplicates,
  documentStatus,
  governanceId,
  vendorCapabilities,
  partnerDocuments,
  partnerMergePlan,
  vendorPaymentReadiness,
  type ContractorTradeCapability,
  type PartnerComplianceDocument,
  type PartnerDocumentKind,
  type PartnerGovernanceMode,
  type VendorArticleCapability,
} from "@/lib/rdash/partner-governance";
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
import { OperationalMediaPanel } from "../OperationalMediaPanel";
import { entityFiles } from "@/lib/rdash/file-attachments";
import { Partner360Module } from "./Partner360Module";
import { workTypesForSubcategory } from "@/lib/rdash/work-types";

export function Partner360Phase2Workspace({ mode }: { mode: PartnerGovernanceMode }) {
  const [view, setView] = React.useState<"relationship" | "governance">("relationship");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-card">
        <button type="button" onClick={() => setView("relationship")} className={cn("rounded-lg px-4 py-2 text-xs font-semibold", view === "relationship" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>360° relationship</button>
        <button type="button" onClick={() => setView("governance")} className={cn("rounded-lg px-4 py-2 text-xs font-semibold", view === "governance" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>Phase 2 governance</button>
        <span className="ml-auto px-2 text-[10px] text-muted-foreground">Capabilities · documents · expiry · duplicate control</span>
      </div>
      {view === "relationship" ? <Partner360Module mode={mode} /> : <PartnerGovernanceModule mode={mode} />}
    </div>
  );
}

type GovernanceTab = "capabilities" | "documents" | "duplicates";
type PartnerRecord = Record<string, any> & { id: string; name: string; phone?: string; city?: string; status?: string };

const VENDOR_DOCUMENT_KINDS: PartnerDocumentKind[] = [
  "gst_registration", "pan_card", "bank_proof", "udyam_registration", "address_proof",
  "vendor_authorization", "agreement", "insurance", "other",
];
const CONTRACTOR_DOCUMENT_KINDS: PartnerDocumentKind[] = [
  "gst_registration", "pan_card", "bank_proof", "labour_license", "insurance",
  "pf_registration", "esi_registration", "identity_proof", "safety_certificate", "agreement", "other",
];

function statusClass(status: string) {
  if (status === "valid") return "border-success/20 bg-success/10 text-success";
  if (status === "expiring") return "border-warning/20 bg-warning/10 text-warning";
  if (status === "expired") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function PartnerGovernanceModule({ mode }: { mode: PartnerGovernanceMode }) {
  const db = useRDashStore((state) => state.db);
  const updateVendor = useRDashStore((state) => state.updateVendor);
  const updateContractor = useRDashStore((state) => state.updateContractor);
  const addTask = useRDashStore((state) => state.addTask);
  const partners = (mode === "vendor" ? db.master.vendors : db.master.contractors) as PartnerRecord[];
  const [selectedId, setSelectedId] = React.useState(partners[0]?.id || "");
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<GovernanceTab>("capabilities");
  const [capabilityDialog, setCapabilityDialog] = React.useState<{ open: boolean; editId?: string }>({ open: false });
  const [documentDialog, setDocumentDialog] = React.useState<{ open: boolean; editId?: string }>({ open: false });
  const [duplicateDialog, setDuplicateDialog] = React.useState<{ open: boolean; candidateId?: string }>({ open: false });

  React.useEffect(() => {
    if (!partners.length) setSelectedId("");
    else if (!selectedId || !partners.some((partner) => partner.id === selectedId)) setSelectedId(partners[0].id);
  }, [partners, selectedId]);

  const selected = partners.find((partner) => partner.id === selectedId);
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return partners;
    return partners.filter((partner) => [partner.name, partner.legal_name, partner.phone, partner.city, partner.gstin, partner.business_gst, partner.pan].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [partners, query]);
  const duplicateCandidates = React.useMemo(() => detectPartnerDuplicates(partners), [partners]);
  const selectedDuplicates = selected ? duplicateCandidates.filter((candidate) => candidate.leftId === selected.id || candidate.rightId === selected.id) : [];
  const capabilities = selected
    ? mode === "contractor"
      ? contractorGovernanceCapabilityProjection(
          selected.id,
          canonicalContractorCapabilities(selected, db),
        )
      : vendorCapabilities(selected)
    : [];
  const documents = selected ? partnerDocuments(selected) : [];
  const readiness = mode === "vendor" && selected ? vendorPaymentReadiness(selected) : undefined;
  const expiringDocumentCount = documents.filter((document) => documentStatus(document) === "expiring").length;
  const expiredDocumentCount = documents.filter((document) => documentStatus(document) === "expired").length;

  const updatePartner = React.useCallback((id: string, patch: Record<string, unknown>) => {
    if (mode === "vendor") updateVendor(id, patch as any);
    else updateContractor(id, patch as any);
  }, [mode, updateVendor, updateContractor]);

  const updateCapabilities = React.useCallback((next: Array<Record<string, unknown>>) => {
    if (!selected) return;
    if (mode === "vendor") {
      updateVendor(selected.id, { capabilities_v2: next } as any);
      return;
    }
    const workCapabilities = contractorCapabilitiesFromGovernance(next);
    updateContractor(selected.id, {
      work_capabilities: workCapabilities,
      categories: derivedContractorCategoryNames(db, workCapabilities),
    } as any);
  }, [db, mode, selected, updateVendor, updateContractor]);

  const createExpiryTasks = () => {
    if (!selected) return;
    const risky = documents.filter((document) => ["expired", "expiring"].includes(documentStatus(document)));
    let created = 0;
    for (const document of risky) {
      const fingerprint = `Partner document ${document.id}`;
      const alreadyExists = db.tasks.some((task: any) => task.status !== "completed" && task.description?.includes(fingerprint));
      if (alreadyExists) continue;
      const status = documentStatus(document);
      addTask({
        title: `${status === "expired" ? "Renew expired" : "Renew expiring"} ${document.label} · ${selected.name}`,
        description: `${fingerprint}. ${mode === "vendor" ? "Vendor" : "Contractor"} ID ${selected.id}. ${document.expiry_date ? `Expiry ${document.expiry_date}.` : "Expiry review required."}`,
        status: "todo",
        priority: status === "expired" ? "urgent" : "high",
        task_scope: "general",
        task_type: "partner_document_expiry",
        due_date: document.expiry_date && document.expiry_date >= isoDate() ? document.expiry_date : isoDate(),
        auto_generated: true,
      } as any);
      created += 1;
    }
    toast.success(created ? `${created} expiry task${created === 1 ? "" : "s"} created` : "No new expiry tasks were required");
  };

  const quarantineDuplicate = (duplicateId: string, canonicalId: string) => {
    const duplicate = partners.find((partner) => partner.id === duplicateId);
    const canonical = partners.find((partner) => partner.id === canonicalId);
    if (!duplicate || !canonical) return;
    updatePartner(duplicate.id, {
      status: "inactive",
      duplicate_of_id: canonical.id,
      duplicate_resolved_at: new Date().toISOString(),
      duplicate_resolution_note: `Quarantined as a potential duplicate of ${canonical.name}. Historical references were intentionally preserved.`,
    });
    toast.success(`${duplicate.name} quarantined; historical references preserved`);
    setDuplicateDialog({ open: false });
  };

  const Icon = mode === "vendor" ? Building2 : HardHat;

  if (!selected) return <EmptyState title={`No ${mode}s available`} description="Create a partner record before using governance controls." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-bold">{mode === "vendor" ? "Vendor governance" : "Contractor records"}</h1>
            <p className="text-xs text-muted-foreground">{mode === "vendor" ? "Structured capabilities, compliance documents, expiry controls, payment readiness and duplicate quarantine." : "Structured capabilities, optional documents, expiry tracking and duplicate review."}</p>
          </div>
        </div>
        <Button variant="outline" onClick={createExpiryTasks}><ClipboardList className="mr-1.5 h-4 w-4" />Create expiry tasks</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
          <div className="relative mb-3"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${mode}s`} className="h-9 pl-8" /></div>
          <div className="rd-scroll max-h-[calc(100vh-230px)] space-y-2 overflow-y-auto pr-1">
            {filtered.map((partner) => {
              const partnerReadiness = mode === "vendor" ? vendorPaymentReadiness(partner) : undefined;
              const capabilityCount = mode === "contractor" ? canonicalContractorCapabilities(partner, db).length : 0;
              const partnerDuplicates = duplicateCandidates.filter((candidate) => candidate.leftId === partner.id || candidate.rightId === partner.id).length;
              return <button key={partner.id} type="button" onClick={() => setSelectedId(partner.id)} className={cn("w-full rounded-xl border p-3 text-left transition-colors", selectedId === partner.id ? "border-primary bg-primary/[0.04] ring-2 ring-primary/10" : "border-border bg-background hover:bg-accent/20")}>
                <div className="flex items-start gap-2.5"><Avatar name={partner.name} size={38} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{partner.name}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{partner.phone || "Phone pending"} · {partner.city || "City pending"}</p><div className="mt-2 flex items-center justify-between">{mode === "vendor" && partnerReadiness ? <StatusBadge label={partnerReadiness.ready ? "Payment ready" : `${partnerReadiness.blockers.length} blocker${partnerReadiness.blockers.length === 1 ? "" : "s"}`} className={partnerReadiness.ready ? statusClass("valid") : statusClass("expired")} /> : <StatusBadge label={`${capabilityCount} ${capabilityCount === 1 ? "capability" : "capabilities"}`} />}{partnerDuplicates > 0 && <span className="text-[10px] font-semibold text-warning">{partnerDuplicates} duplicate match</span>}</div></div></div>
              </button>;
            })}
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><Avatar name={selected.name} size={48} /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{selected.name}</h2><StatusBadge label={titleCase(selected.status || "active")} /></div><p className="mt-0.5 text-xs text-muted-foreground">{selected.legal_name || (mode === "vendor" ? selected.category : selected.categories?.join(", ") || (capabilities[0] as any)?.work_subcategory_name) || "Legal identity not recorded"}</p></div></div>{mode === "vendor" && readiness && <StatusBadge label={readiness.ready ? "Payment release ready" : "Payment release blocked"} className={readiness.ready ? statusClass("valid") : statusClass("expired")} />}</div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><MetricCard label="Capabilities" value={String(capabilities.length)} tone="primary" /><MetricCard label="Documents" value={String(documents.length)} tone="default" /><MetricCard label="Expiring / expired" value={String(expiringDocumentCount + expiredDocumentCount)} tone={expiredDocumentCount > 0 ? "destructive" : "warning"} /><MetricCard label="Duplicate matches" value={String(selectedDuplicates.length)} tone={selectedDuplicates.length ? "warning" : "success"} /></div>
          </section>

          {mode === "vendor" && readiness && (!readiness.ready || readiness.warnings.length > 0) && <section className={cn("rounded-[var(--panel-radius)] border p-4 shadow-card", readiness.ready ? "border-warning/30 bg-warning/[0.03]" : "border-destructive/30 bg-destructive/[0.03]")}><div className="flex items-start gap-3">{readiness.ready ? <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />}<div><h3 className="text-sm font-bold">{readiness.ready ? "Payment warning" : "Payment release blockers"}</h3><div className="mt-2 space-y-1 text-xs text-muted-foreground">{readiness.blockers.map((blocker) => <p key={blocker}>• {blocker}</p>)}{readiness.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div></div></div></section>}

          <div className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-card">
            <TabButton active={tab === "capabilities"} onClick={() => setTab("capabilities")} icon={Layers3} label="Capabilities" />
            <TabButton active={tab === "documents"} onClick={() => setTab("documents")} icon={FileCheck2} label="Documents & expiry" />
            <TabButton active={tab === "duplicates"} onClick={() => setTab("duplicates")} icon={Users} label="Duplicate control" />
          </div>

          {tab === "capabilities" && <CapabilitiesSection mode={mode} selected={selected} capabilities={capabilities} onAdd={() => setCapabilityDialog({ open: true })} onEdit={(editId) => setCapabilityDialog({ open: true, editId })} onToggle={(id) => updateCapabilities(capabilities.map((capability: any) => capability.id === id ? { ...capability, status: capability.status === "active" ? "inactive" : "active", updated_at: new Date().toISOString() } : capability))} />}
          {tab === "documents" && <DocumentsSection mode={mode} selected={selected} documents={documents} onAdd={() => setDocumentDialog({ open: true })} onEdit={(editId) => setDocumentDialog({ open: true, editId })} onVerify={(id) => updatePartner(selected.id, { compliance_documents: documents.map((document) => document.id === id ? { ...document, verified: !document.verified, verified_at: !document.verified ? new Date().toISOString() : undefined, verified_by: !document.verified ? "Current user" : undefined, updated_at: new Date().toISOString() } : document) })} onDelete={(id) => updatePartner(selected.id, { compliance_documents: documents.filter((document) => document.id !== id) })} />}
          {tab === "duplicates" && <DuplicateSection mode={mode} db={db as any} partners={partners} selected={selected} candidates={selectedDuplicates} onReview={(candidateId) => setDuplicateDialog({ open: true, candidateId })} />}
        </main>
      </div>

      <CapabilityDialog mode={mode} partner={selected} open={capabilityDialog.open} editId={capabilityDialog.editId} onClose={() => setCapabilityDialog({ open: false })} onSave={(next) => { updateCapabilities(next); setCapabilityDialog({ open: false }); }} />
      <DocumentDialog mode={mode} partner={selected} open={documentDialog.open} editId={documentDialog.editId} onClose={() => setDocumentDialog({ open: false })} onSave={(next) => { updatePartner(selected.id, { compliance_documents: next }); setDocumentDialog({ open: false }); }} />
      <DuplicateReviewDialog mode={mode} db={db as any} partners={partners} selected={selected} candidateId={duplicateDialog.candidateId} open={duplicateDialog.open} onClose={() => setDuplicateDialog({ open: false })} onQuarantine={quarantineDuplicate} />
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return <button type="button" onClick={onClick} className={cn("flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-3.5 w-3.5" />{label}</button>;
}

function CapabilitiesSection({ mode, selected, capabilities, onAdd, onEdit, onToggle }: any) {
  return <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-3"><SectionHeader title={mode === "vendor" ? "Vendor–Article capabilities" : "Contractor–Work capabilities"} count={capabilities.length} /><Button size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add capability</Button></div>
    <p className="mt-1 text-xs text-muted-foreground">{mode === "vendor" ? "Article and variant supply records used for sourcing, RFQs and Vendor comparison." : "Work subcategories, work-type labour rates and capacity used for contractor shortlisting."}</p>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {capabilities.map((capability: any) => <div key={capability.id} className="rounded-xl border border-border bg-muted/10 p-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{mode === "vendor" ? capability.article_name || capability.article_id : capability.work_subcategory_name || capability.work_subcategory_id}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{mode === "vendor" ? [capability.variant_name, capability.brand, capability.grade].filter(Boolean).join(" · ") || "General supply" : [capability.crew_required && `${capability.crew_required} crew`, capability.max_daily_capacity && `${capability.max_daily_capacity}/day`].filter(Boolean).join(" · ") || "Work capability"}</p></div><StatusBadge label={titleCase(capability.status || "active")} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">{mode === "vendor" ? <><Value label="Lead time" value={capability.lead_time_days != null ? `${capability.lead_time_days} days` : "—"} /><Value label="Minimum qty" value={capability.minimum_order_qty ?? "—"} /></> : (capability.work_type_rates || []).map((rate: any) => <Value key={rate.work_type_id} label={rate.work_type_name || "Work type"} value={rate.labour_rate != null ? formatINR(rate.labour_rate) : "—"} />)}</div>
        <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => onEdit(capability.id)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="outline" onClick={() => onToggle(capability.id)}><Archive className="mr-1 h-3.5 w-3.5" />{capability.status === "active" ? "Deactivate" : "Activate"}</Button></div>
      </div>)}
      {!capabilities.length && <div className="lg:col-span-2"><EmptyState title="No structured capabilities" description={mode === "vendor" ? "Link this Vendor to Articles and variants they can actually supply." : "Link this Contractor to Work subcategories and work-type labour rates."} action={<Button onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add first capability</Button>} /></div>}
    </div>
  </section>;
}

function DocumentsSection({ mode, selected, documents, onAdd, onEdit, onVerify, onDelete }: any) {
  const db = useRDashStore((state) => state.db);
  const directFiles = entityFiles(db, mode, selected.id);
  const fileNameByAttachmentId = new Map(directFiles.map(({ attachment, asset }) => [attachment.id, asset.file_name]));
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]"><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap items-center justify-between gap-3"><SectionHeader title="Typed document register" count={documents.length} /><Button size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add document</Button></div><div className="mt-4 space-y-2">{documents.map((document: PartnerComplianceDocument) => { const status = documentStatus(document); const days = daysUntilExpiry(document); return <div key={document.id} className="rounded-xl border border-border bg-muted/10 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{document.label}</p><StatusBadge label={titleCase(status)} className={statusClass(status)} />{mode === "vendor" && document.mandatory && <StatusBadge label="Mandatory" />}</div><p className="mt-1 text-[10px] text-muted-foreground">{document.document_no || "Number not recorded"}{document.expiry_date ? ` · Expires ${formatDate(document.expiry_date)}${days != null ? ` (${days} days)` : ""}` : " · No expiry"}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => onEdit(document.id)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => onDelete(document.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{document.attachment_id ? fileNameByAttachmentId.get(document.attachment_id) || "Linked file unavailable" : "Choose a file when editing this document"}</span><Button size="sm" variant={document.verified ? "outline" : "default"} onClick={() => onVerify(document.id)}>{document.verified ? <><BadgeCheck className="mr-1 h-3.5 w-3.5" />Verified</> : <><ShieldCheck className="mr-1 h-3.5 w-3.5" />Verify</>}</Button></div></div>; })}{!documents.length && <EmptyState title={mode === "vendor" ? "No compliance documents" : "No documents"} description={mode === "vendor" ? "Add tax, bank, licence, insurance and agreement records with verification and expiry dates." : "Add any optional reference documents you want to keep with this contractor."} action={<Button onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add first document</Button>} />}</div></section><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Evidence files" /><div className="mt-3"><OperationalMediaPanel entityType={mode} entityId={selected.id} title="Compliance evidence and supporting files" /></div></section></div>;
}

function DuplicateSection({ mode, db, partners, selected, candidates, onReview }: any) {
  return <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Potential duplicate records" count={candidates.length} /><p className="mt-1 text-xs text-muted-foreground">Matches use normalized legal name, city, phone, GSTIN, PAN and bank account. Phase 2 quarantines duplicates safely; it does not silently rewrite financial history.</p><div className="mt-4 space-y-3">{candidates.map((candidate: any) => { const otherId = candidate.leftId === selected.id ? candidate.rightId : candidate.leftId; const other = partners.find((partner: any) => partner.id === otherId); const plan = partnerMergePlan(mode, db, selected.id, otherId); return <div key={`${candidate.leftId}-${candidate.rightId}`} className="rounded-xl border border-warning/30 bg-warning/[0.03] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-warning" /><div><p className="text-sm font-bold">{selected.name} ↔ {other?.name || otherId}</p><p className="mt-1 text-[11px] text-muted-foreground">Score {candidate.score} · {candidate.reasons.join(" · ")}</p><p className="mt-1 text-[10px] text-muted-foreground">{plan.totalReferences} historical reference{plan.totalReferences === 1 ? "" : "s"} would require an atomic merge.</p></div></div><Button size="sm" variant="outline" onClick={() => onReview(otherId)}>Review and quarantine</Button></div></div>; })}{!candidates.length && <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/[0.04] p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /><div><p className="text-sm font-bold">No likely duplicates</p><p className="mt-1 text-xs text-muted-foreground">No record crossed the duplicate-risk threshold.</p></div></div>}</div></section>;
}

function Value({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-background p-2"><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 font-medium">{value}</p></div>;
}

function CapabilityDialog({ mode, partner, open, editId, onClose, onSave }: { mode: PartnerGovernanceMode; partner: PartnerRecord; open: boolean; editId?: string; onClose: () => void; onSave: (next: any[]) => void }) {
  const db = useRDashStore((state) => state.db);
  const current = (mode === "contractor"
    ? contractorGovernanceCapabilityProjection(
        partner.id,
        canonicalContractorCapabilities(partner, db),
      )
    : vendorCapabilities(partner)) as any[];
  const editing = current.find((capability) => capability.id === editId);
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  React.useEffect(() => {
    if (!open) return;
    setDraft(editing ? {
      ...editing,
      work_type_rates: Object.fromEntries((editing.work_type_rates || []).map((rate: any) => [rate.work_type_id, String(rate.labour_rate ?? "")])),
    } : { status: "active", preferred: false, supply_mode: "stocked", work_type_rates: {} });
  }, [open, editId]);
  const set = (key: string, value: any) => setDraft((state) => ({ ...state, [key]: value }));
  const selectedSubcategory = db.master.workSubcategories.find((row: any) => row.id === draft.work_subcategory_id);
  const selectedWorkTypes = selectedSubcategory ? workTypesForSubcategory(selectedSubcategory) : [];
  const save = () => {
    const now = new Date().toISOString();
    if (mode === "vendor") {
      const article = db.master.articles.find((row: any) => row.id === draft.article_id);
      if (!article) { toast.error("Select an Article"); return; }
      const variant = db.master.articleVariants.find((row: any) => row.id === draft.variant_id);
      const record: VendorArticleCapability = { id: editing?.id || governanceId("vcap"), article_id: article.id, article_name: article.name, variant_id: variant?.id, variant_name: variant?.name, brand: draft.brand || variant?.brand, grade: draft.grade || variant?.grade, unit_id: draft.unit_id || variant?.unit_id || article.default_unit_id || article.unit_id, supply_mode: draft.supply_mode || "stocked", lead_time_days: draft.lead_time_days === "" ? undefined : Number(draft.lead_time_days), minimum_order_qty: draft.minimum_order_qty === "" ? undefined : Number(draft.minimum_order_qty), preferred: Boolean(draft.preferred), status: draft.status || "active", notes: draft.notes?.trim() || undefined, created_at: editing?.created_at || now, updated_at: now };
      onSave(editing ? current.map((row) => row.id === editing.id ? record : row) : [record, ...current]);
    } else {
      const subcategory = db.master.workSubcategories.find((row: any) => row.id === draft.work_subcategory_id);
      if (!subcategory) { toast.error("Select a Work subcategory"); return; }
      const record: ContractorTradeCapability = {
        id: editing?.id || governanceId("ccap"),
        work_subcategory_id: subcategory.id,
        work_subcategory_name: subcategory.name,
        work_type_rates: workTypesForSubcategory(subcategory).flatMap((workType) => {
          const value = String(draft.work_type_rates?.[workType.id] ?? "").trim();
          return value ? [{ work_type_id: workType.id, work_type_name: workType.name, labour_rate: Number(value) }] : [];
        }),
        crew_required: draft.crew_required === "" ? undefined : Number(draft.crew_required),
        max_daily_capacity: draft.max_daily_capacity === "" ? undefined : Number(draft.max_daily_capacity),
        preferred: Boolean(draft.preferred),
        status: draft.status || "active",
        notes: draft.notes?.trim() || undefined,
        created_at: editing?.created_at || now,
        updated_at: now,
      };
      onSave(editing ? current.map((row) => row.id === editing.id ? record : row) : [record, ...current]);
    }
    toast.success("Capability saved");
  };
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {mode === "vendor" ? "Vendor–Article" : "Contractor–Work"} capability</DialogTitle><DialogDescription>{mode === "vendor" ? "Structured supply data used for sourcing and shortlisting." : "Assign labour rates by the work types configured in Master Setup."}</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "vendor" ? <>
          <select value={draft.article_id || ""} onChange={(event) => { set("article_id", event.target.value); set("variant_id", ""); }} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="">Select Article</option>{db.master.articles.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          <select value={draft.variant_id || ""} onChange={(event) => set("variant_id", event.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="">Any variant</option>{db.master.articleVariants.filter((row: any) => !draft.article_id || row.article_id === draft.article_id).map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          <Input value={draft.brand || ""} onChange={(event) => set("brand", event.target.value)} placeholder="Brand" /><Input value={draft.grade || ""} onChange={(event) => set("grade", event.target.value)} placeholder="Grade / quality" />
          <select value={draft.supply_mode || "stocked"} onChange={(event) => set("supply_mode", event.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="stocked">Stocked</option><option value="on_order">On order</option><option value="special_order">Special order</option></select>
          <Input value={draft.lead_time_days ?? ""} onChange={(event) => set("lead_time_days", event.target.value)} placeholder="Lead time days" type="number" /><Input value={draft.minimum_order_qty ?? ""} onChange={(event) => set("minimum_order_qty", event.target.value)} placeholder="Minimum order quantity" type="number" />
        </> : <>
          <select value={draft.work_subcategory_id || ""} onChange={(event) => { set("work_subcategory_id", event.target.value); set("work_type_rates", {}); }} className="h-10 rounded-md border border-input bg-card px-3 text-sm sm:col-span-2"><option value="">Select Work subcategory</option>{db.master.workSubcategories.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          <div className="space-y-2 rounded-lg border p-3 sm:col-span-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Labour rate by work type</p>{selectedWorkTypes.map((workType) => <label key={workType.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2 text-xs"><span>{workType.name}</span><Input value={draft.work_type_rates?.[workType.id] || ""} onChange={(event) => set("work_type_rates", { ...(draft.work_type_rates || {}), [workType.id]: event.target.value })} placeholder="₹ 0" type="number" min={0} className="h-8" /></label>)}{selectedSubcategory && !selectedWorkTypes.length ? <p className="text-xs text-destructive">No work types configured for this subcategory.</p> : null}</div>
          <Input value={draft.crew_required ?? ""} onChange={(event) => set("crew_required", event.target.value)} placeholder="Crew required" type="number" /><Input value={draft.max_daily_capacity ?? ""} onChange={(event) => set("max_daily_capacity", event.target.value)} placeholder="Maximum daily capacity" type="number" />
        </>}
        <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(draft.preferred)} onChange={(event) => set("preferred", event.target.checked)} />Preferred capability</label>
        <Textarea value={draft.notes || ""} onChange={(event) => set("notes", event.target.value)} placeholder="Notes" className="sm:col-span-2" />
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save capability</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function DocumentDialog({ mode, partner, open, editId, onClose, onSave }: { mode: PartnerGovernanceMode; partner: PartnerRecord; open: boolean; editId?: string; onClose: () => void; onSave: (next: PartnerComplianceDocument[]) => void }) {
  const db = useRDashStore((state) => state.db);
  const directFiles = entityFiles(db, mode, partner.id);
  const current = partnerDocuments(partner);
  const editing = current.find((document) => document.id === editId);
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  React.useEffect(() => { if (!open) return; setDraft(editing ? { ...editing } : { kind: mode === "vendor" ? "gst_registration" : "labour_license", verified: false, mandatory: false }); }, [open, editId, mode]);
  const set = (key: string, value: any) => setDraft((state) => ({ ...state, [key]: value }));
  const save = () => {
    const now = new Date().toISOString();
    const kind = draft.kind as PartnerDocumentKind;
    const record: PartnerComplianceDocument = { id: editing?.id || governanceId("pdoc"), kind, label: draft.label?.trim() || DOCUMENT_KIND_LABELS[kind], document_no: draft.document_no?.trim() || undefined, issue_date: draft.issue_date || undefined, expiry_date: draft.expiry_date || undefined, verified: Boolean(draft.verified), verified_at: draft.verified ? editing?.verified_at || now : undefined, verified_by: draft.verified ? editing?.verified_by || "Current user" : undefined, attachment_id: draft.attachment_id?.trim() || undefined, mandatory: mode === "vendor" && Boolean(draft.mandatory), notes: draft.notes?.trim() || undefined, created_at: editing?.created_at || now, updated_at: now };
    onSave(editing ? current.map((row) => row.id === editing.id ? record : row) : [record, ...current]);
    toast.success("Compliance document saved");
  };
  const kinds = mode === "vendor" ? VENDOR_DOCUMENT_KINDS : CONTRACTOR_DOCUMENT_KINDS;
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {mode === "vendor" ? "compliance" : "reference"} document</DialogTitle><DialogDescription>{mode === "vendor" ? "Track verification, validity and expiry without hiding document data in notes." : "Keep optional contractor documents and expiry dates for reference."}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><select value={draft.kind || ""} onChange={(event) => { set("kind", event.target.value); set("label", DOCUMENT_KIND_LABELS[event.target.value as PartnerDocumentKind]); }} className="h-10 rounded-md border border-input bg-card px-3 text-sm">{kinds.map((kind) => <option key={kind} value={kind}>{DOCUMENT_KIND_LABELS[kind]}</option>)}</select><Input value={draft.label || DOCUMENT_KIND_LABELS[draft.kind as PartnerDocumentKind] || ""} onChange={(event) => set("label", event.target.value)} placeholder="Document label" /><Input value={draft.document_no || ""} onChange={(event) => set("document_no", event.target.value)} placeholder="Document number" /><select value={draft.attachment_id || ""} onChange={(event) => set("attachment_id", event.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="">No linked file</option>{directFiles.map(({ attachment, asset }) => <option key={attachment.id} value={attachment.id}>{asset.file_name}</option>)}</select><label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Issue date<Input value={draft.issue_date || ""} onChange={(event) => set("issue_date", event.target.value)} type="date" className="mt-1" /></label><label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Expiry date<Input value={draft.expiry_date || ""} onChange={(event) => set("expiry_date", event.target.value)} type="date" className="mt-1" /></label><label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(draft.verified)} onChange={(event) => set("verified", event.target.checked)} />Verified document</label>{mode === "vendor" && <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(draft.mandatory)} onChange={(event) => set("mandatory", event.target.checked)} />Mandatory for payment</label>}<Textarea value={draft.notes || ""} onChange={(event) => set("notes", event.target.value)} placeholder="Notes" className="sm:col-span-2" /></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save document</Button></DialogFooter></DialogContent></Dialog>;
}

function DuplicateReviewDialog({ mode, db, partners, selected, candidateId, open, onClose, onQuarantine }: any) {
  const candidate = partners.find((partner: any) => partner.id === candidateId);
  const plan = candidate ? partnerMergePlan(mode, db, selected.id, candidate.id) : undefined;
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Duplicate impact review</DialogTitle><DialogDescription>Choose the canonical record and quarantine the duplicate. Historical transactions remain untouched until an atomic merge action is implemented.</DialogDescription></DialogHeader>{candidate && plan ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><PartnerIdentityCard label="Keep canonical" partner={selected} /><PartnerIdentityCard label="Potential duplicate" partner={candidate} /></div><div className="rounded-xl border border-border bg-muted/10 p-3"><p className="text-xs font-bold">Historical reference impact</p><div className="mt-2 space-y-1">{plan.impacted.map((row: any) => <div key={row.collection} className="flex items-center justify-between text-xs"><span>{titleCase(row.collection)}</span><strong>{row.count}</strong></div>)}{!plan.impacted.length && <p className="text-xs text-muted-foreground">No linked transaction references found.</p>}</div></div><div className="rounded-xl border border-warning/30 bg-warning/[0.04] p-3 text-xs text-muted-foreground"><p className="font-semibold text-foreground">Why this is quarantine, not automatic merge</p><p className="mt-1">{plan.reason}</p></div></div> : <p className="text-xs text-muted-foreground">Duplicate record not found.</p>}<DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>{candidate && <><Button variant="outline" onClick={() => onQuarantine(selected.id, candidate.id)}>Keep {candidate.name}</Button><Button onClick={() => onQuarantine(candidate.id, selected.id)}><Archive className="mr-1 h-4 w-4" />Keep {selected.name}</Button></>}</DialogFooter></DialogContent></Dialog>;
}

function PartnerIdentityCard({ label, partner }: any) {
  return <div className="rounded-xl border border-border bg-card p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-2 flex items-center gap-2"><Avatar name={partner.name} size={36} /><div><p className="text-sm font-bold">{partner.name}</p><p className="text-[10px] text-muted-foreground">{partner.phone || "No phone"} · {partner.city || "No city"}</p></div></div><div className="mt-2 text-[10px] text-muted-foreground">GST: {partner.gstin || partner.business_gst || "—"} · PAN: {partner.pan || "—"}</div></div>;
}
