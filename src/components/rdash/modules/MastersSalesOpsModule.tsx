"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import type { DetailPanelKind } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { SavedViewsBar } from "../SavedViewsBar";
import { BulkActionBar, SelectCheckbox, type BulkAction } from "../BulkActions";
import { EntityFormDialog } from "../EntityFormDialog";
import { StaffEditDialog } from "../StaffEditDialog";
import { formatINR, formatINRShort, formatDate, relativeDay, titleCase, invoiceStatusStyle } from "@/lib/rdash/format";
import { Building2, Users, HardHat, HandCoins, Star, Phone, MapPin, TrendingUp, AlertTriangle, CheckCircle2, Search, Plus, ArrowRight, Pencil, CheckSquare, Wallet, Bell, Clock, ShieldCheck, FileUp, FileText, Trash2, CheckCircle, XCircle, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { OperationalMediaPanel } from "../OperationalMediaPanel";
import { STAFF_MODULES, STAFF_ROLE_KEYS, STAFF_ROLE_LABELS, type StaffPermissionRecord, type StaffRoleKey } from "@/lib/rdash/staff-operations";
import type { StaffDocument } from "@/lib/rdash/types";
import { latestQuotationRevisions } from "@/lib/rdash/metrics";
import { resolveArticleRateConfig } from "@/lib/rdash/article-rate-config";
export function MastersModule({ submodule }: {
    submodule: string;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [q, setQ] = React.useState("");
    const [addVendorOpen, setAddVendorOpen] = React.useState(false);
    const [addContractorOpen, setAddContractorOpen] = React.useState(false);
    const [editVendorId, setEditVendorId] = React.useState<string | undefined>(undefined);
    const [editContractorId, setEditContractorId] = React.useState<string | undefined>(undefined);
    const [editStaffId, setEditStaffId] = React.useState<string | undefined>(undefined);
    const [staffEditOpen, setStaffEditOpen] = React.useState(false);
    const [vendorsTab, setVendorsTab] = React.useState<"vendors" | "rates">("vendors");
    const [contractorsTab, setContractorsTab] = React.useState<"contractors" | "rates">("contractors");
    const [permissionRole, setPermissionRole] = React.useState<StaffRoleKey>("OPERATIONS_MANAGER");
    const [permissionModuleKey, setPermissionModuleKey] = React.useState("");
    const [docDraft, setDocDraft] = React.useState<{ staffId: string; documentType: StaffDocument["document_type"]; documentNo: string; fileName: string; fileUrl: string; mimeType?: string; fileSizeBytes?: number }>({ staffId: "", documentType: "photo", documentNo: "", fileName: "", fileUrl: "" });
    const upsertStaffRolePermission = useRDashStore((s) => s.upsertStaffRolePermission);
    const updateStaffRolePermission = useRDashStore((s) => s.updateStaffRolePermission);
    const removeStaffRolePermission = useRDashStore((s) => s.removeStaffRolePermission);
    const registerStaffDocument = useRDashStore((s) => s.registerStaffDocument);
    const updateStaffDocument = useRDashStore((s) => s.updateStaffDocument);
    const removeStaffDocument = useRDashStore((s) => s.removeStaffDocument);
    const addSourcePartner = useRDashStore((s) => s.addSourcePartner);
    const addContractorRate = useRDashStore((s) => s.addContractorRate);
    const addCommissionRule = useRDashStore((s) => s.addCommissionRule);
    // F.12: Add-dialog state for master entities that were previously read-only
    const [addSpOpen, setAddSpOpen] = React.useState(false);
    const [addCrOpen, setAddCrOpen] = React.useState(false);
    const [addCruleOpen, setAddCruleOpen] = React.useState(false);
    const [spDraft, setSpDraft] = React.useState({ name: "", phone: "", email: "", commission_pct: "5" });
    const [crDraft, setCrDraft] = React.useState({ contractor_id: "", trade: "", rate: "" });
    const [cruleDraft, setCruleDraft] = React.useState({ source_partner_id: "", rate_pct: "5", applies_to: "partner" as "partner" | "category", category_id: "" });
    const effectiveSubmodule = submodule === "vendors" && vendorsTab === "rates" ? "vendorRates"
        : submodule === "contractors" && contractorsTab === "rates" ? "contractorRates"
            : submodule;
    const renderVendorsTabToggle = () => (<div className="inline-flex w-fit gap-1 rounded-md border border-border bg-muted/40 p-1">
      <button type="button" onClick={() => setVendorsTab("vendors")} className={cn("rounded px-3 py-1 text-xs font-semibold transition-colors", vendorsTab === "vendors" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        Vendors
      </button>
      <button type="button" onClick={() => setVendorsTab("rates")} className={cn("rounded px-3 py-1 text-xs font-semibold transition-colors", vendorsTab === "rates" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        Rates
      </button>
    </div>);
    const renderContractorsTabToggle = () => (<div className="inline-flex w-fit gap-1 rounded-md border border-border bg-muted/40 p-1">
      <button type="button" onClick={() => setContractorsTab("contractors")} className={cn("rounded px-3 py-1 text-xs font-semibold transition-colors", contractorsTab === "contractors" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        Contractors
      </button>
      <button type="button" onClick={() => setContractorsTab("rates")} className={cn("rounded px-3 py-1 text-xs font-semibold transition-colors", contractorsTab === "rates" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        Rates
      </button>
    </div>);
    if (effectiveSubmodule === "vendors" || effectiveSubmodule === "vendorExposure") {
        const isExposure = submodule === "vendorExposure";
        const allVendors = db.master.vendors;
        const vendors = (isExposure
            ? [...allVendors].sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0))
            : allVendors.filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()) || (v.city || "").toLowerCase().includes(q.toLowerCase())));
        const totalOutstanding = allVendors.reduce((n, v) => n + (v.outstanding || 0), 0);
        const withDue = allVendors.filter((v) => (v.outstanding || 0) > 0).length;
        return (<div className="flex flex-col gap-5">
        {!isExposure && renderVendorsTabToggle()}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <MastersHeader icon={<Building2 className="h-5 w-5"/>} title={isExposure ? "Vendor Exposure" : "Vendors"} desc={isExposure ? "Outstanding payables & reliability — sorted by exposure" : "Material suppliers with outstanding, rates and reliability scores"} count={allVendors.length} q={q} setQ={setQ}/>
          {!isExposure && (<Button size="sm" onClick={() => { setEditVendorId(undefined); setAddVendorOpen(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5"/> Add Vendor
            </Button>)}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Total vendors" value={allVendors.length} tone="primary" icon={<Building2 className="h-4 w-4"/>}/>
          <MetricCard label="Outstanding" value={formatINRShort(totalOutstanding)} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
          <MetricCard label="Vendors with dues" value={withDue} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
          <MetricCard label="Avg reliability" value={`${Math.round(allVendors.reduce((n, v) => n + (v.reliability_score || 0), 0) / (allVendors.length || 1))}/100`} tone="success" icon={<Star className="h-4 w-4"/>}/>
        </div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {vendors.map((v) => {
                const rates = db.master.vendorRates.filter((r) => r.vendor_id === v.id);
                return (<div key={v.id} role="button" tabIndex={0} onClick={() => openDetail("vendor" as any, v.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail("vendor" as any, v.id); } }} className="group relative cursor-pointer rounded-[var(--panel-radius)] border border-border bg-card p-4 text-left shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
                {!isExposure && (<button type="button" onClick={(event) => { event.stopPropagation(); setEditVendorId(v.id); setAddVendorOpen(true); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Edit ${v.name}`} title="Edit vendor">
                    <Pencil className="h-3.5 w-3.5"/>
                  </button>)}
                <div className="flex items-start justify-between pr-8">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={v.name} size={40}/>
                    <div><p className="text-sm font-bold">{v.name}</p><p className="text-[11px] text-muted-foreground">{v.category} · {v.city}</p></div>
                  </div>
                  <div className="flex gap-1">
                    <StatusBadge label={`${v.reliability_score || 0}/100`} className={(v.reliability_score || 0) >= 85 ? "bg-success/10 text-success border-success/20" : (v.reliability_score || 0) >= 70 ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}/>
                    {v.outstanding ? <StatusBadge label="Due" className="bg-destructive/10 text-destructive border-destructive/20"/> : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Phone</p><p className="font-medium truncate">{v.phone || "—"}</p></div>
                  <div className="rounded-md bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Outstanding</p><p className={cn("font-mono font-bold", v.outstanding ? "text-destructive" : "text-success")}>{formatINRShort(v.outstanding || 0)}</p></div>
                  <div className="rounded-md bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">On-time</p><p className="font-bold">{v.on_time_pct || 0}%</p></div>
                </div>
                {rates.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{rates.map((r) => <span key={r.id} className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px]">{db.master.articles.find((article) => article.id === r.article_id)?.name || "Unknown Article"}: {formatINR(r.quoted_rate)}</span>)}</div>}
                <div className="mt-3 border-t border-border pt-3">
                  <OperationalMediaPanel entityType="vendor" entityId={v.id} title="Vendor files, catalogues & boards" compact/>
                </div>
              </div>);
            })}
          {vendors.length === 0 && (<div className="lg:col-span-2">
              <EmptyState title="No vendors" description="Vendors will appear here once added." icon={<Building2 className="h-8 w-8"/>}/>
            </div>)}
        </div>
        {!isExposure && <EntityFormDialog type="vendor" open={addVendorOpen} onClose={() => { setAddVendorOpen(false); setEditVendorId(undefined); }} editId={editVendorId}/>}
      </div>);
    }
    if (effectiveSubmodule === "staff") {
        const staff = db.master.staff.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.role.toLowerCase().includes(q.toLowerCase()));
        const permissions = ((db as unknown as { staffRolePermissions?: StaffPermissionRecord[] }).staffRolePermissions || []);
        const roleCoverage = Array.from(new Set(permissions.map((p) => p.role_key))).length;
        const selectedPermissions = permissions.filter((p) => p.role_key === permissionRole).sort((a, b) => a.module_label.localeCompare(b.module_label));
        const missingModules = STAFF_MODULES.filter(([moduleKey]) => !selectedPermissions.some((p) => p.module_key === moduleKey));
        const staffDocuments = ((db as unknown as { staffDocuments?: StaffDocument[] }).staffDocuments || []);
        const fileAssetsById = new Map<string, any>((db.master.fileAssets || []).map((file: any) => [file.id, file]));
        const staffById = new Map<string, any>(db.master.staff.map((member) => [member.id, member]));
        const addPermission = () => {
            const staffModule = STAFF_MODULES.find(([key]) => key === permissionModuleKey);
            if (!staffModule) return toast.error("Choose a module to add permission.");
            upsertStaffRolePermission({
                id: `perm-${permissionRole.toLowerCase()}-${staffModule[0]}`,
                role_key: permissionRole,
                module_key: staffModule[0],
                module_label: staffModule[1],
                can_view: true,
                can_create: false,
                can_update: false,
                can_approve: false,
                can_delete: false,
                updated_at: new Date().toISOString(),
            });
            setPermissionModuleKey("");
            toast.success("Permission added");
        };
        const registerDocument = () => {
            if (!docDraft.staffId) return toast.error("Choose staff for the document.");
            if (!docDraft.fileName.trim()) return toast.error("Choose a file or enter a document file name.");
            if (!docDraft.fileUrl.trim().startsWith("https://drive.google.com/")) return toast.error("Paste the Google Drive file link for this staff document.");
            registerStaffDocument({ staffId: docDraft.staffId, documentType: docDraft.documentType, documentNo: docDraft.documentNo, fileName: docDraft.fileName.trim(), fileUrl: docDraft.fileUrl.trim() || undefined, mimeType: docDraft.mimeType, fileSizeBytes: docDraft.fileSizeBytes });
            setDocDraft({ staffId: docDraft.staffId, documentType: "photo", documentNo: "", fileName: "", fileUrl: "" });
            toast.success("Staff Drive link registered as pending verification");
        };
        return (<div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <MastersHeader icon={<Users className="h-5 w-5"/>} title="Staff Operations Master" desc="Staff profile, login, role permissions, attendance, GPS, visits, tasks and payroll spine" count={db.master.staff.length} q={q} setQ={setQ}/>
          <Button size="sm" onClick={() => { setEditStaffId(undefined); setStaffEditOpen(true); }}><Plus className="mr-1.5 h-3.5 w-3.5"/> Add Staff</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Total staff" value={db.master.staff.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
          <MetricCard label="Active" value={db.master.staff.filter((s) => s.status === "active").length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          <MetricCard label="Monthly payroll" value={formatINRShort(db.master.staff.reduce((n, s) => n + (s.monthly_salary || 0), 0))} tone="warning" icon={<TrendingUp className="h-4 w-4"/>}/>
          <MetricCard label="Role matrices" value={roleCoverage} tone="default" icon={<ShieldCheck className="h-4 w-4"/>}/>
        </div>
        <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm font-bold">Editable permission matrix</p><p className="text-[11px] text-muted-foreground">Add, remove and toggle role permissions. The same persisted rows control sidebar visibility and server mutation checks.</p></div>
            <StatusBadge label={`${permissions.length} rules`} className="bg-primary/10 text-primary border-primary/20"/>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {STAFF_ROLE_KEYS.map((role) => <button key={role} type="button" onClick={() => setPermissionRole(role)} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", permissionRole === role ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/30 text-muted-foreground hover:text-foreground")}>{STAFF_ROLE_LABELS[role]}</button>)}
          </div>
          <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <select value={permissionModuleKey} onChange={(event) => setPermissionModuleKey(event.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-xs outline-none ring-ring focus-visible:ring-2">
              <option value="">Add missing module permission…</option>
              {missingModules.map(([moduleKey, label]) => <option key={moduleKey} value={moduleKey}>{label}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={addPermission}><Plus className="mr-1 h-3.5 w-3.5"/> Add permission</Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Module</th><th className="px-3 py-2 text-center">View</th><th className="px-3 py-2 text-center">Create</th><th className="px-3 py-2 text-center">Update</th><th className="px-3 py-2 text-center">Approve</th><th className="px-3 py-2 text-center">Delete</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-border">
                {selectedPermissions.map((p) => {
                    const toggle = (key: "can_view" | "can_create" | "can_update" | "can_approve" | "can_delete") => updateStaffRolePermission(p.id, { [key]: !p[key] } as Partial<StaffPermissionRecord>);
                    return <tr key={p.id} className="bg-card/60 hover:bg-muted/20"><td className="px-3 py-2"><p className="font-semibold">{p.module_label}</p><p className="text-[10px] text-muted-foreground">{p.module_key}</p></td>{(["can_view", "can_create", "can_update", "can_approve", "can_delete"] as const).map((key) => <td key={key} className="px-3 py-2 text-center"><input type="checkbox" checked={Boolean(p[key])} onChange={() => toggle(key)} className="h-4 w-4 accent-primary" aria-label={`${p.module_label} ${key}`}/></td>)}<td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => { removeStaffRolePermission(p.id); toast.success("Permission removed"); }}><Trash2 className="mr-1 h-3.5 w-3.5"/>Remove</Button></td></tr>;
                })}
                {!selectedPermissions.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No permissions for this role. Add a module permission above.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold">Staff Drive-link registration & verification</p><p className="text-[11px] text-muted-foreground">Register links to staff documents that already exist in Google Drive, then verify, reject, expire or remove them. No local file is uploaded here.</p></div><StatusBadge label={`${staffDocuments.length} documents`} className="bg-success/10 text-success border-success/20"/></div>
          <div className="grid gap-2 md:grid-cols-6">
            <select value={docDraft.staffId} onChange={(event) => setDocDraft((value) => ({ ...value, staffId: event.target.value }))} className="h-9 rounded-md border border-input bg-card px-3 text-xs md:col-span-2"><option value="">Select staff…</option>{db.master.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
            <select value={docDraft.documentType} onChange={(event) => setDocDraft((value) => ({ ...value, documentType: event.target.value as StaffDocument["document_type"] }))} className="h-9 rounded-md border border-input bg-card px-3 text-xs"><option value="photo">Photo</option><option value="aadhaar">Aadhaar</option><option value="pan">PAN</option><option value="id_proof">ID proof</option><option value="address_proof">Address proof</option><option value="bank">Bank</option><option value="other">Other</option></select>
            <input value={docDraft.documentNo} onChange={(event) => setDocDraft((value) => ({ ...value, documentNo: event.target.value }))} placeholder="Document no." className="h-9 rounded-md border border-input bg-card px-3 text-xs"/>
            <input value={docDraft.fileUrl} onChange={(event) => setDocDraft((value) => ({ ...value, fileUrl: event.target.value }))} placeholder="Google Drive file URL required" className="h-9 rounded-md border border-input bg-card px-3 text-xs md:col-span-2"/>
            <input value={docDraft.fileName} onChange={(event) => setDocDraft((value) => ({ ...value, fileName: event.target.value }))} placeholder="File name as shown in Drive" className="h-9 rounded-md border border-input bg-card px-3 text-xs md:col-span-4"/>
            <Button size="sm" className="md:col-span-2" onClick={registerDocument}><FileText className="mr-1 h-3.5 w-3.5"/> Register Drive link</Button>
          </div>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {staffDocuments.map((doc) => { const staffRow = staffById.get(doc.staff_id); const file = doc.file_asset_id ? fileAssetsById.get(doc.file_asset_id) as any : undefined; return <div key={doc.id} className="grid gap-2 px-3 py-2 text-xs lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"><div><p className="font-semibold">{staffRow?.name || doc.staff_id} · {titleCase(doc.document_type.replaceAll("_", " "))}</p><p className="text-[10px] text-muted-foreground">{doc.document_no || "No document number"} · {file?.file_name || "No linked file"}</p></div><div className="flex flex-wrap items-center gap-1.5"><StatusBadge label={titleCase(doc.status)} className={doc.status === "verified" ? "bg-success/10 text-success border-success/20" : doc.status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/20" : doc.status === "expired" ? "bg-warning/10 text-warning border-warning/20" : "bg-muted text-muted-foreground border-border"}/>{file?.web_view_link ? <a className="rounded border border-border px-2 py-0.5 text-[10px] text-primary" href={file.web_view_link} target="_blank" rel="noreferrer">Open file</a> : null}</div><div className="flex flex-wrap justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => updateStaffDocument(doc.id, { status: "verified" })}><CheckCircle className="mr-1 h-3.5 w-3.5"/>Verify</Button><Button size="sm" variant="ghost" onClick={() => updateStaffDocument(doc.id, { status: "rejected" })}><XCircle className="mr-1 h-3.5 w-3.5"/>Reject</Button><Button size="sm" variant="ghost" onClick={() => updateStaffDocument(doc.id, { status: "expired" })}>Expire</Button><Button size="sm" variant="ghost" onClick={() => removeStaffDocument(doc.id)}><Trash2 className="mr-1 h-3.5 w-3.5"/>Remove</Button></div></div>; })}
            {!staffDocuments.length && <div className="px-3 py-8 text-center text-xs text-muted-foreground">No staff documents uploaded yet.</div>}
          </div>
        </div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {staff.map((s) => {
                const tasks = db.tasks.filter((t) => t.assignee_id === s.id);
                const visits = db.visits.filter((v) => v.staff_id === s.id);
                const docs = staffDocuments.filter((doc) => doc.staff_id === s.id);
                return (<div key={s.id} role="button" tabIndex={0} onClick={() => openDetail("staff" as any, s.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail("staff" as any, s.id); } }} className="group relative flex cursor-pointer items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-4 text-left shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
                <button type="button" onClick={(event) => { event.stopPropagation(); setEditStaffId(s.id); setStaffEditOpen(true); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Edit ${s.name}`} title="Edit staff">
                  <Pencil className="h-3.5 w-3.5"/>
                </button>
                <Avatar name={s.name} size={42}/>
                <div className="min-w-0 flex-1 pr-6">
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.role} · {s.department || "Team"} · {s.city}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5"><Phone className="h-2.5 w-2.5"/>{s.phone}</span>
                    {s.monthly_salary && <span className="font-mono">· {formatINR(s.monthly_salary)}/mo</span>}
                    {s.login_email && <span>· login</span>}
                    <span>· {docs.filter((doc) => doc.status === "verified").length}/{docs.length} docs verified</span>
                  </div>
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
    if (effectiveSubmodule === "contractors") {
        const contractors = db.master.contractors;
        return (<div className="flex flex-col gap-5">
        {renderContractorsTabToggle()}
        <MastersHeader icon={<HardHat className="h-5 w-5"/>} title="Contractors" desc="Trade crews with ratings, active workOrders and outstanding" count={contractors.length} q={q} setQ={setQ}/>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Contractors" value={contractors.length} tone="primary" icon={<HardHat className="h-4 w-4"/>}/>
          <MetricCard label="Active workOrders" value={contractors.reduce((n, c) => n + (c.active_jobs || 0), 0)} tone="warning" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          <MetricCard label="Avg rating" value={`${(contractors.reduce((n, c) => n + (c.rating || 0), 0) / (contractors.length || 1)).toFixed(1)}★`} tone="success" icon={<Star className="h-4 w-4"/>}/>
          <MetricCard label="Outstanding" value={formatINRShort(contractors.reduce((n, c) => n + (c.outstanding || 0), 0))} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        </div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {contractors.map((c) => {
                const workOrders = db.workOrders.filter((j) => j.contractor_id === c.id);
                return (<div key={c.id} role="button" tabIndex={0} onClick={() => openDetail("contractor" as any, c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDetail("contractor" as any, c.id);
                } }} className="group relative cursor-pointer rounded-[var(--panel-radius)] border border-border bg-card p-4 text-left shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
                <button type="button" onClick={(e) => { e.stopPropagation(); setEditContractorId(c.id); setAddContractorOpen(true); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Edit ${c.name}`} title="Edit contractor">
                  <Pencil className="h-3.5 w-3.5"/>
                </button>
                <div className="flex items-center justify-between pr-8">
                  <div className="flex items-center gap-2.5"><Avatar name={c.name} size={38}/><div><p className="text-sm font-bold">{c.name}</p><p className="text-[11px] text-muted-foreground">{c.trade} · {c.city}</p></div></div>
                  <span className="inline-flex items-center gap-0.5 text-sm font-bold"><Star className="h-3.5 w-3.5 fill-warning text-warning"/>{c.rating || "—"}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-muted/40 p-1.5 text-center"><p className="text-[10px] uppercase text-muted-foreground">Phone</p><p className="text-[10px] font-medium truncate">{c.phone || "—"}</p></div>
                  <div className="rounded-md bg-muted/40 p-1.5 text-center"><p className="text-[10px] uppercase text-muted-foreground">Work Orders</p><p className="text-sm font-bold">{c.active_jobs || 0}</p></div>
                  <div className="rounded-md bg-muted/40 p-1.5 text-center"><p className="text-[10px] uppercase text-muted-foreground">Due</p><p className={cn("font-mono font-bold text-xs", c.outstanding ? "text-destructive" : "text-success")}>{formatINRShort(c.outstanding || 0)}</p></div>
                </div>
              </div>);
            })}
        </div>
        <EntityFormDialog type="contractor" open={addContractorOpen} onClose={() => { setAddContractorOpen(false); setEditContractorId(undefined); }} editId={editContractorId}/>
      </div>);
    }
    if (effectiveSubmodule === "sourcePartners") {
        return (<div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <MastersHeader icon={<HandCoins className="h-5 w-5"/>} title="Source Partners" desc="Referral partners with commission rates" count={db.master.sourcePartners.length} q={q} setQ={setQ}/>
          <Button size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => { setSpDraft({ name: "", phone: "", email: "", commission_pct: "5" }); setAddSpOpen(true); }}><Plus className="h-3.5 w-3.5"/> Add partner</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard label="Partners" value={db.master.sourcePartners.length} tone="primary" icon={<HandCoins className="h-4 w-4"/>}/>
          <MetricCard label="Total referred" value={db.customers.filter((p) => p.source_partner_id).length} tone="default" icon={<Users className="h-4 w-4"/>}/>
          <MetricCard label="Commission rules" value={db.master.commissionRules.length} tone="warning" icon={<TrendingUp className="h-4 w-4"/>}/>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {db.master.sourcePartners.map((sp) => {
                const customers = db.customers.filter((p) => p.source_partner_id === sp.id);
                return (<div key={sp.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5"><Avatar name={sp.name} size={36}/><div><p className="text-sm font-bold">{sp.name}</p><p className="text-[11px] text-muted-foreground">{titleCase(sp.type || "Partner")}</p></div></div>
                  <StatusBadge label={`${sp.commission_pct || 0}%`} className="bg-warning/10 text-warning border-warning/20"/>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-0.5"><Phone className="h-3 w-3"/>{sp.phone}</span><span>· {customers.length} customers referred</span></div>
              </div>);
            })}
        </div>
      </div>);
    }
    if (effectiveSubmodule === "vendorRates" || effectiveSubmodule === "contractorRates" || effectiveSubmodule === "commissionRules") {
        const isVendor = effectiveSubmodule === "vendorRates";
        const isContractor = effectiveSubmodule === "contractorRates";
        const isCommission = effectiveSubmodule === "commissionRules";
        const title = isVendor ? "Vendor Rates" : isContractor ? "Contractor Rates" : "Commission Rules";
        const icon = isVendor ? <Building2 className="h-5 w-5"/> : isContractor ? <HardHat className="h-5 w-5"/> : <HandCoins className="h-5 w-5"/>;
        // B: For commission rules, resolve the work-category name (if any) so
        //    category-specific rules display the human-readable category, not
        //    a UUID. Mirrors `findCommissionRule` match priority.
        const categoryById = new Map(db.master.workCategories.map((c) => [c.id, c]));
        return (<div className="flex flex-col gap-5">
        {submodule === "vendors" && renderVendorsTabToggle()}
        {submodule === "contractors" && renderContractorsTabToggle()}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
            <div><h2 className="text-lg font-bold tracking-tight">{title}</h2><p className="text-xs text-muted-foreground">Rate master configuration</p></div>
          </div>
          {isContractor && <Button size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => { setCrDraft({ contractor_id: db.master.contractors[0]?.id || "", trade: "", rate: "" }); setAddCrOpen(true); }}><Plus className="h-3.5 w-3.5"/> Add rate</Button>}
          {isCommission && <Button size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => { setCruleDraft({ source_partner_id: db.master.sourcePartners[0]?.id || "", rate_pct: "5", applies_to: "partner", category_id: "" }); setAddCruleOpen(true); }}><Plus className="h-3.5 w-3.5"/> Add rule</Button>}
        </div>
        {/* B: Banner explains that commission rules are consumed by findCommissionRule
            (masters.ts), which Agent B's contractors.ts accrueCommission will use
            to pick the best-matching rule for a (partner, workCategory) pair. */}
        {isCommission && (<div className="rounded-[var(--panel-radius)] border border-primary/20 bg-primary/[0.04] p-3 text-xs text-foreground/80">
            <p><span className="font-semibold text-primary">Match priority:</span> exact category rule → workOrder-scoped rule → partner-specific catch-all → global fallback. <code className="rounded bg-muted px-1 py-0.5 text-[10px]">findCommissionRule(db, partnerId, categoryId)</code> in <code className="rounded bg-muted px-1 py-0.5 text-[10px]">masters.ts</code> resolves this; <code className="rounded bg-muted px-1 py-0.5 text-[10px]">accrueCommission</code> (contractors.ts) should consult it before falling back to <code className="rounded bg-muted px-1 py-0.5 text-[10px]">partner.commission_pct</code>.</p>
          </div>)}
        <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          {isVendor && db.master.vendorRates.map((r) => {
                const v = db.master.vendors.find((x) => x.id === r.vendor_id);
                const article = db.master.articles.find((row) => row.id === r.article_id);
                const config = resolveArticleRateConfig({ articleId: r.article_id, variantId: r.variant_id, articles: db.master.articles, variants: db.master.articleVariants });
                return <button key={r.id} type="button" onClick={() => openDetail("vendorRate" as any, r.id)} className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-accent/20 focus-visible:bg-accent/30 focus-visible:outline-none"><div><p className="font-medium">{article?.name || "Unknown Article"}</p><p className="text-[11px] text-muted-foreground">{v?.name} · {config.rateUnit || "Unit not configured"} · click for rate context</p></div><span className="font-mono font-bold">{formatINR(r.quoted_rate)}</span></button>;
            })}
          {isContractor && db.master.contractorRates.map((r) => {
                const c = db.master.contractors.find((x) => x.id === r.contractor_id);
                return <div key={r.id} className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-accent/20"><div><p className="font-medium">{r.trade}</p><p className="text-[11px] text-muted-foreground">{c?.name} · {r.unit_id}</p></div><span className="font-mono font-bold">{formatINR(r.rate)}</span></div>;
            })}
          {isCommission && db.master.commissionRules.map((r) => {
                const categoryName = r.category_id ? categoryById.get(r.category_id)?.name : undefined;
                const priority = r.applies_to === "category" ? 1 : r.applies_to === "workOrder" ? 2 : 3;
                return (<div key={r.id} className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-accent/20">
                    <div>
                      <p className="font-medium">{r.source_partner_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {titleCase(r.applies_to)}{categoryName ? ` · ${categoryName}` : r.category_id ? ` · ${r.category_id}` : ""} · priority {priority}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-warning">{r.rate_pct}%</span>
                  </div>);
            })}
        </div>
      </div>);
    }
    return <EmptyState title="Not configured" description={`Submodule "${submodule}" doesn't have a dedicated view yet.`} icon={<Building2 className="h-8 w-8"/>}/>;
}
function MastersHeader({ icon, title, desc, count, q, setQ }: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    count: number;
    q: string;
    setQ: (v: string) => void;
}) {
    return (<div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <div><h2 className="text-lg font-bold tracking-tight">{title}</h2><p className="text-xs text-muted-foreground">{desc}</p></div>
      </div>
      <div className="relative w-56">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm outline-none ring-ring focus-visible:ring-2"/>
      </div>
    </div>);
}
export function SalesOpsModule({ submodule, filterPresets, statusFilter, expiringFilter, }: {
    submodule: string;
    filterPresets?: import("@/lib/rdash/modules").FilterPreset[];
    statusFilter?: string;
    expiringFilter?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    if (submodule === "opportunities") {
        return (<OpportunitiesView quotations={db.quotations} openDetail={openDetail} filterPresets={filterPresets} statusFilter={statusFilter} expiringFilter={expiringFilter}/>);
    }
    if (submodule === "salesOrders") {
        const orders = latestQuotationRevisions(db.quotations).filter((q) => q.status === "accepted");
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success"><CheckCircle2 className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Accepted Site Quotations</h2><p className="text-xs text-muted-foreground">Customer-approved coverage enters contractor bidding; contractor award creates the work order</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Orders" value={orders.length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          <MetricCard label="Total value" value={formatINRShort(orders.reduce((n, q) => n + q.total_amount, 0))} tone="primary" icon={<TrendingUp className="h-4 w-4"/>}/>
          <MetricCard label="Awarded work orders" value={orders.filter((q) => q.work_order_ids.length > 0).length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          <MetricCard label="Awaiting contractor award" value={orders.filter((q) => q.work_order_ids.length === 0).length} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        </div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {orders.map((q) => (<div key={q.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-card hover:to-accent/30 hover:shadow-soft">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5"><Avatar name={(q.customer_name || "Customer")} size={36}/><div><p className="text-sm font-bold">{q.quotation_no}</p><p className="text-[11px] text-muted-foreground">{(q.customer_name || "Customer")}</p></div></div>
                <span className="font-mono text-sm font-bold">{formatINRShort(q.total_amount)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {q.work_order_ids.length > 0 ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDetail("workOrder", q.work_order_ids[0])}><ArrowRight className="mr-1 h-3 w-3"/> Open work order</Button> : <StatusBadge label="Contractor bidding" className="bg-warning/10 text-warning border-warning/20"/>}
              </div>
            </div>))}
        </div>
      </div>);
    }
    if (submodule === "invoices") {
        return (<InvoicesView invoices={db.invoices} openDetail={openDetail} filterPresets={filterPresets} statusFilter={statusFilter}/>);
    }
    return null;
}
function InvoicesView({ invoices, openDetail, filterPresets, statusFilter, }: {
    invoices: import("@/lib/rdash/types").CustomerInvoice[];
    openDetail: (kind: DetailPanelKind, id: string) => void;
    filterPresets?: import("@/lib/rdash/modules").FilterPreset[];
    statusFilter?: string;
}) {
    const presets: import("@/lib/rdash/modules").FilterPreset[] = filterPresets && filterPresets.length > 0
        ? filterPresets
        : [
            { id: "all", label: "All", filter: {} },
            { id: "paid", label: "Paid", filter: { status: "paid" } },
            { id: "issued", label: "Issued", filter: { status: "issued" } },
            { id: "overdue", label: "Overdue", filter: { status: "overdue" } },
        ];
    const initialIdx = React.useMemo(() => {
        if (statusFilter) {
            const i = presets.findIndex((p) => p.filter.status === statusFilter);
            if (i >= 0)
                return i;
        }
        return 0;
    }, [statusFilter, presets]);
    const [presetIdx, setPresetIdx] = React.useState(initialIdx);
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const activeStatus = presets[presetIdx]?.filter.status;
    const filtered = activeStatus ? invoices.filter((invoice) => invoice.status === activeStatus) : invoices;
    const handlePresetChange = (i: number) => {
        setPresetIdx(i);
        setActiveSavedViewId(null);
    };
    const handleApplySavedView = (view: SavedView) => {
        if (view.presetId) {
            const idx = presets.findIndex((p) => p.id === view.presetId);
            if (idx >= 0)
                setPresetIdx(idx);
        }
        setActiveSavedViewId(view.id);
    };
    const db = useRDashStore((s) => s.db);
    const updateInvoice = useRDashStore((s) => s.updateInvoice);
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
            label: "Mark issued",
            icon: <Clock className="h-3.5 w-3.5"/>,
            onClick: (ids) => {
                ids.forEach((id) => updateInvoice(id, { status: "issued" }));
                toast.success(`${ids.length} invoice${ids.length > 1 ? "s" : ""} marked issued`);
                clearSelection();
            },
        },
        {
            label: "Mark Overdue",
            icon: <AlertTriangle className="h-3.5 w-3.5"/>,
            variant: "destructive",
            onClick: (ids) => {
                ids.forEach((id) => updateInvoice(id, { status: "overdue" }));
                toast.warning(`${ids.length} invoice${ids.length > 1 ? "s" : ""} marked overdue`);
                clearSelection();
            },
        },
    ];
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Invoices</h2><p className="text-xs text-muted-foreground">Customer invoices linked to a customer, Site and payment milestone · {filtered.length} shown. Record a receipt from the payment, never by changing the invoice alone.</p></div></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setSelectMode((s) => !s); if (selectMode)
        setSelectedIds(new Set()); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", selectMode ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <CheckSquare className="h-3.5 w-3.5"/> {selectMode ? "Exit select" : "Select"}
          </button>
          {selectMode && filtered.length > 1 && (<button type="button" onClick={() => setSelectedIds(new Set(filtered.map((p) => p.id)))} className="text-[11px] font-medium text-primary hover:underline">
              Select all ({filtered.length})
            </button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total invoices" value={invoices.length} tone="primary" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Paid" value={formatINRShort(invoices.filter((invoice) => invoice.status === "paid").reduce((n, invoice) => n + invoice.total_amount, 0))} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Open" value={formatINRShort(invoices.filter((invoice) => invoice.status === "issued" || invoice.status === "partial").reduce((n, invoice) => n + invoice.balance_amount, 0))} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Overdue" value={formatINRShort(invoices.filter((invoice) => invoice.status === "overdue").reduce((n, invoice) => n + invoice.balance_amount, 0))} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
      </div>
      <section aria-label="Invoice status filters" className="flex flex-wrap items-center gap-1.5">
        {presets.map((p, i) => {
            const active = i === presetIdx;
            return (<button key={p.id} type="button" role="tab" aria-selected={active} onClick={() => handlePresetChange(i)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
              {p.label}
              <span className={cn("ml-1.5 rounded px-1 text-[10px]", active ? "bg-primary-foreground/20" : "bg-muted")}>
                {p.filter.status ? invoices.filter((invoice) => invoice.status === p.filter.status).length : invoices.length}
              </span>
            </button>);
        })}
      </section>

      <SavedViewsBar workspaceKey="invoices" presets={presets} currentPresetId={presets[presetIdx]?.id} currentSearch="" currentExtra={activeStatus ? { status: activeStatus } : undefined} onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>
      {selectMode && (<BulkActionBar selectedIds={selectedArr} totalCount={filtered.length} onClear={clearSelection} actions={bulkActions}/>)}
      <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        {filtered.length === 0 ? (<div className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices match this filter.</div>) : (filtered.map((invoice) => {
            const checked = selectedIds.has(invoice.id);
            const status = invoiceStatusStyle(invoice.status);
            const amount = invoice.balance_amount || invoice.total_amount;
            if (selectMode) {
                return (<div key={invoice.id} className={cn("flex w-full items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 transition-colors", checked ? "bg-primary/[0.03]" : "hover:bg-accent/20")}>
                  <SelectCheckbox checked={checked} onToggle={toggleSelect} id={invoice.id}/>
                  <Avatar name={(invoice.customer_name || "Customer")} size={32}/>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invoice.invoice_no} - {(invoice.customer_name || "Customer")}</p><p className="text-[10px] text-muted-foreground">{db.sites.find((site) => site.id === invoice.site_id)?.name || "Retail / unlinked site"} · Due {formatDate(invoice.due_date)} - {invoice.title}</p></div>
                  <span className="font-mono text-sm font-bold">{formatINR(amount)}</span>
                  <StatusBadge label={status.label} className={status.className}/>
                </div>);
            }
            return (<button key={invoice.id} type="button" onClick={() => openDetail("invoice", invoice.id)} className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-0 hover:bg-accent/20">
                <Avatar name={(invoice.customer_name || "Customer")} size={32}/>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invoice.invoice_no} - {(invoice.customer_name || "Customer")}</p><p className="text-[10px] text-muted-foreground">{db.sites.find((site) => site.id === invoice.site_id)?.name || "Retail / unlinked site"} · Due {formatDate(invoice.due_date)} - {invoice.title}</p></div>
                <span className="font-mono text-sm font-bold">{formatINR(amount)}</span>
                <StatusBadge label={status.label} className={status.className}/>
              </button>);
        }))}
      </div>
    </div>);
}
function OpportunitiesView({ quotations, openDetail, filterPresets, statusFilter, expiringFilter, }: {
    quotations: import("@/lib/rdash/types").Quotation[];
    openDetail: (kind: DetailPanelKind, id: string) => void;
    filterPresets?: import("@/lib/rdash/modules").FilterPreset[];
    statusFilter?: string;
    expiringFilter?: string;
}) {
    const presets: import("@/lib/rdash/modules").FilterPreset[] = filterPresets && filterPresets.length > 0
        ? filterPresets
        : [
            { id: "all", label: "All Open", filter: {} },
            { id: "sent", label: "Sent", filter: { status: "sent" } },
            { id: "cancelled", label: "Cancelled", filter: { status: "cancelled" } },
            { id: "expiring", label: "Expiring Soon", filter: { expiring: "3d" } },
        ];
    const initialIdx = React.useMemo(() => {
        if (statusFilter) {
            const i = presets.findIndex((p) => p.filter.status === statusFilter);
            if (i >= 0)
                return i;
        }
        if (expiringFilter) {
            const i = presets.findIndex((p) => p.filter.expiring);
            if (i >= 0)
                return i;
        }
        return 0;
    }, [statusFilter, expiringFilter, presets]);
    const [presetIdx, setPresetIdx] = React.useState(initialIdx);
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const active = presets[presetIdx];
    const handlePresetChange = (i: number) => {
        setPresetIdx(i);
        setActiveSavedViewId(null);
    };
    const handleApplySavedView = (view: SavedView) => {
        if (view.presetId) {
            const idx = presets.findIndex((p) => p.id === view.presetId);
            if (idx >= 0)
                setPresetIdx(idx);
        }
        setActiveSavedViewId(view.id);
    };
    const currentQuotations = React.useMemo(() => latestQuotationRevisions(quotations), [quotations]);
    const openQuotes = currentQuotations.filter((q) => q.status === "sent");
    const now = Date.now();
    const isExpiringSoon = (q: {
        valid_until: string;
    }) => new Date(q.valid_until).getTime() < now + 3 * 86400000;
    const filtered = !active?.filter.status
        ? active?.filter.expiring
            ? openQuotes.filter((q) => isExpiringSoon(q))
            : openQuotes
        : currentQuotations.filter((q) => q.status === active.filter.status);
    const countFor = (preset: import("@/lib/rdash/modules").FilterPreset) => {
        if (preset.filter.expiring)
            return openQuotes.filter((q) => isExpiringSoon(q)).length;
        if (preset.filter.status)
            return currentQuotations.filter((q) => q.status === preset.filter.status).length;
        return openQuotes.length;
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Opportunities</h2><p className="text-xs text-muted-foreground">Active quotations awaiting customer decision · {filtered.length} shown</p></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Open quotes" value={openQuotes.length} tone="primary" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Value" value={formatINRShort(openQuotes.reduce((n, q) => n + q.total_amount, 0))} tone="warning" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Avg deal" value={formatINRShort(openQuotes.length ? openQuotes.reduce((n, q) => n + q.total_amount, 0) / openQuotes.length : 0)} tone="default" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Expiring soon" value={openQuotes.filter((q) => isExpiringSoon(q)).length} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
      </div>
      <section aria-label="Opportunity filters" className="flex flex-wrap items-center gap-1.5">
        {presets.map((p, i) => {
            const isActive = i === presetIdx;
            return (<button key={p.id} type="button" role="tab" aria-selected={isActive} onClick={() => handlePresetChange(i)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
              {p.label}
              <span className={cn("ml-1.5 rounded px-1 text-[10px]", isActive ? "bg-primary-foreground/20" : "bg-muted")}>
                {countFor(p)}
              </span>
            </button>);
        })}
      </section>
      <SavedViewsBar workspaceKey="opportunities" presets={presets} currentPresetId={presets[presetIdx]?.id} currentSearch="" onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>
      <div className="rd-stagger grid gap-3 lg:grid-cols-2">
        {filtered.length === 0 ? (<div className="col-span-full rounded-[var(--panel-radius)] border border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent px-4 py-10 text-center text-sm text-muted-foreground">No opportunities match this filter.</div>) : (filtered.map((q) => {
            const expiring = isExpiringSoon(q);
            return (<button key={q.id} type="button" onClick={() => openDetail("quotation", q.id)} className={cn("group flex items-center gap-3 rounded-[var(--panel-radius)] border bg-card p-3 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-card hover:to-accent/30 hover:shadow-soft", expiring ? "border-destructive/30" : "border-border")}>
                <Avatar name={(q.customer_name || "Customer")} size={36}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{q.quotation_no} · {(q.customer_name || "Customer")}</p>
                  <p className="text-[11px] text-muted-foreground">{q.title} · valid until {formatDate(q.valid_until)}</p>
                  {expiring && <p className="mt-0.5 text-[10px] font-semibold text-destructive">⚠ Expiring soon</p>}
                </div>
                <div className="text-right"><p className="font-mono text-sm font-bold">{formatINRShort(q.total_amount)}</p><StatusBadge label={titleCase(q.status)} className="bg-primary/10 text-primary border-primary/20"/></div>
              </button>);
        }))}
      </div>
    </div>);
}
export function ObstacleThreadsModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const resolveBlocked = useRDashStore((s) => s.resolveBlocked);
    const active = db.blocked.filter((b) => !b.resolved);
    const resolved = db.blocked.filter((b) => b.resolved);
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Obstacle Threads</h2><p className="text-xs text-muted-foreground">Blocked work with discussion threads — resolve to unblock</p></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Active obstacles" value={active.length} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Resolved" value={resolved.length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="With thread" value={db.blocked.filter((b) => b.thread_id).length} tone="primary" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="With workOrder" value={db.blocked.filter((b) => b.linked_work_order_id).length} tone="default" icon={<Building2 className="h-4 w-4"/>}/>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Active ({active.length})</h3>
        {active.length === 0 ? <EmptyState title="No active obstacles 🎉" description="All blocked work has been resolved." icon={<CheckCircle2 className="h-8 w-8"/>}/> : (<div className="space-y-2">
            {active.map((b) => {
                const thread = b.thread_id ? db.threads.find((t) => t.id === b.thread_id) : null;
                return (<div key={b.id} className="rounded-[var(--panel-radius)] border border-destructive/25 bg-destructive/[0.04] p-3 shadow-card">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive"/>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{b.title}</p>
                      <p className="text-[11px] text-muted-foreground">{b.reason}</p>
                      {(b.customer_name || "Customer") && <p className="mt-0.5 text-[10px] text-muted-foreground">Customer: {(b.customer_name || "Customer")}</p>}
                      {thread && <p className="mt-0.5 text-[10px] text-primary">{thread.messages.length} messages in thread</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDetail("blocked", b.id)}>Open</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => { resolveBlocked(b.id); toast.success("Obstacle resolved"); }}><CheckCircle2 className="mr-1 h-3 w-3"/> Resolve</Button>
                    </div>
                  </div>
                </div>);
            })}
          </div>)}
        {resolved.length > 0 && (<>
            <h3 className="mt-4 text-sm font-semibold text-muted-foreground">Resolved ({resolved.length})</h3>
            <div className="space-y-1">
              {resolved.map((b) => (<div key={b.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-1.5 text-xs opacity-60">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success"/><span className="truncate">{b.title}</span>
                </div>))}
            </div>
          </>)}
      </div>
    </div>);
}
