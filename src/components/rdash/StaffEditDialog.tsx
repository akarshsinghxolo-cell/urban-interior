"use client";

import * as React from "react";
import { ExternalLink, FileUp, MapPin, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { createDefaultAttendancePolicy, normalizeAttendancePolicy } from "@/lib/rdash/attendance-policy";
import { captureDeviceGps, deviceGpsErrorMessage } from "@/lib/rdash/device-gps";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { STAFF_ROLE_KEYS, STAFF_ROLE_LABELS, normalizeRoleKey, roleLabel } from "@/lib/rdash/staff-operations";
import type { AttendancePolicy, Staff, StaffDocument, StaffRoleKey } from "@/lib/rdash/types";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusOptions = ["pending", "active", "inactive", "blocked", "blacklisted", "exited"] as const;
const documentTypeOptions: Array<[StaffDocument["document_type"], string]> = [
  ["photo", "Photo"],
  ["aadhaar", "Aadhaar"],
  ["pan", "PAN"],
  ["id_proof", "ID proof"],
  ["address_proof", "Address proof"],
  ["bank", "Bank proof"],
  ["other", "Other"],
];

function fieldLabel(text: string) {
  return <label className="text-[10px] font-semibold uppercase text-muted-foreground">{text}</label>;
}

function documentStatusClass(status: StaffDocument["status"]) {
  if (status === "verified") return "text-success";
  if (status === "rejected") return "text-destructive";
  if (status === "expired") return "text-warning";
  return "text-muted-foreground";
}

export function StaffEditDialog({ staffId, open, onClose }: { staffId?: string; open: boolean; onClose: () => void }) {
  const db = useRDashStore((s) => s.db);
  const addStaff = useRDashStore((s) => s.addStaff);
  const updateStaff = useRDashStore((s) => s.updateStaff);
  const registerStaffDocument = useRDashStore((s) => s.registerStaffDocument);
  const updateStaffDocument = useRDashStore((s) => s.updateStaffDocument);
  const removeStaffDocument = useRDashStore((s) => s.removeStaffDocument);

  const staff = staffId ? db.master.staff.find((row) => row.id === staffId) : undefined;
  const baseStaff = React.useMemo(
    () => staff || ({
      id: "",
      name: "",
      role: "Field Staff",
      role_key: "FIELD_STAFF",
      status: "active",
      attendance_policy: createDefaultAttendancePolicy(),
      salary_type: "monthly",
      gps_tracking_enabled: true,
    } as Staff),
    [staff],
  );
  const initialDraft = React.useMemo<Partial<Staff>>(
    () => ({
      ...baseStaff,
      role_key: normalizeRoleKey(baseStaff.role_key || baseStaff.role),
      role: roleLabel(normalizeRoleKey(baseStaff.role_key || baseStaff.role)),
      login_email: baseStaff.login_email || baseStaff.email || "",
      attendance_policy: normalizeAttendancePolicy(baseStaff.attendance_policy),
    }),
    [baseStaff],
  );

  const [draft, setDraft] = React.useState<Partial<Staff>>(initialDraft);
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [documentType, setDocumentType] = React.useState<StaffDocument["document_type"]>("photo");
  const [documentNo, setDocumentNo] = React.useState("");
  const [documentFile, setDocumentFile] = React.useState<File | null>(null);
  const [documentUploading, setDocumentUploading] = React.useState(false);
  const policy = normalizeAttendancePolicy(draft.attendance_policy);
  const isNew = !staffId;

  React.useEffect(() => {
    if (!open) return;
    setDraft(initialDraft);
    setDocumentType("photo");
    setDocumentNo("");
    setDocumentFile(null);
  }, [initialDraft, open]);

  const patch = (value: Partial<Staff>) => setDraft((current) => ({ ...current, ...value }));
  const patchPolicy = (value: Partial<AttendancePolicy>) => patch({ attendance_policy: { ...policy, ...value } });
  const formId = `staff:${staffId || "new"}`;
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const documents = React.useMemo(
    () => (db.staffDocuments || []).filter((row) => row.staff_id === staffId),
    [db.staffDocuments, staffId],
  );
  const assetsById = React.useMemo(
    () => new Map((db.master.fileAssets || []).map((asset) => [asset.id, asset])),
    [db.master.fileAssets],
  );

  const handleSave = (): boolean => {
    if (!draft.name?.trim()) {
      toast.error("Staff name is required");
      return false;
    }
    const roleKey = normalizeRoleKey(draft.role_key || draft.role);
    const salaryType = draft.salary_type || "monthly";
    const payload: Partial<Staff> = {
      ...draft,
      name: draft.name.trim(),
      phone: draft.phone?.trim() || undefined,
      email: staff?.auth_user_id ? staff.email : draft.email?.trim() || undefined,
      address: draft.address?.trim() || undefined,
      emergency_contact: draft.emergency_contact?.trim() || undefined,
      role_key: roleKey,
      role: roleLabel(roleKey),
      status: draft.status || "active",
      salary_type: salaryType,
      monthly_salary: salaryType === "monthly" ? draft.monthly_salary : undefined,
      daily_wage: salaryType === "daily_wage" ? draft.daily_wage : undefined,
      login_enabled: staff?.login_enabled,
      login_email: staff?.login_email || staff?.email,
      temporary_password: undefined,
      force_password_change: undefined,
      attendance_policy: policy,
    };
    if (salaryType === "monthly" && Number(payload.monthly_salary || 0) < 0) {
      toast.error("Monthly salary cannot be negative.");
      return false;
    }
    if (salaryType === "daily_wage" && Number(payload.daily_wage || 0) < 0) {
      toast.error("Daily wage cannot be negative.");
      return false;
    }
    if (policy.auto_absent_after_minutes < 0 || !Number.isFinite(policy.auto_absent_after_minutes)) {
      toast.error("Auto absent delay must be a valid number of minutes.");
      return false;
    }
    if (isNew) {
      addStaff(payload);
      toast.success(`Staff "${payload.name}" created`);
    } else if (staff) {
      updateStaff(staff.id, payload);
      toast.success(`Staff "${payload.name}" updated`);
    }
    dirtyFormRegistry.markClean(formId);
    onClose();
    return true;
  };

  useDirtyFormRegistration({
    id: formId,
    label: "Staff Operations profile",
    dirty,
    save: handleSave,
    discard: () => {
      setDraft(initialDraft);
      return true;
    },
  });

  const requestClose = React.useCallback(() => {
    dirtyFormRegistry.requestNavigation(onClose, { reason: "close this Staff profile form" });
  }, [onClose]);

  const captureOfficeGps = async () => {
    setGpsLoading(true);
    try {
      const capture = await captureDeviceGps({ mode: "master-location" });
      patchPolicy({
        office_latitude: capture.latitude,
        office_longitude: capture.longitude,
      });
      toast.success(`Office GPS captured · ±${Math.round(capture.accuracy_m)} m`);
    } catch (error) {
      toast.error(deviceGpsErrorMessage(error));
    } finally {
      setGpsLoading(false);
    }
  };

  const uploadDocument = async () => {
    if (!staffId) {
      toast.error("Save the Staff profile before uploading documents.");
      return;
    }
    if (!documentFile) {
      toast.error("Choose a document file.");
      return;
    }
    setDocumentUploading(true);
    try {
      const body = new FormData();
      body.set("staffId", staffId);
      body.set("file", documentFile);
      const response = await fetch("/api/staff-documents", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        assetId?: string;
        fileName?: string;
        mimeType?: string;
        fileSizeBytes?: number;
        storageBucket?: string;
        storagePath?: string;
      };
      if (!response.ok || !result.assetId || !result.storageBucket || !result.storagePath) {
        throw new Error(result.error || "Document upload failed.");
      }
      registerStaffDocument({
        staffId,
        documentType,
        documentNo,
        assetId: result.assetId,
        fileName: result.fileName || documentFile.name,
        mimeType: result.mimeType || documentFile.type,
        fileSizeBytes: result.fileSizeBytes ?? documentFile.size,
        storageBucket: result.storageBucket,
        storagePath: result.storagePath,
      });
      setDocumentNo("");
      setDocumentFile(null);
      toast.success("Staff document uploaded to private Supabase Storage.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document upload failed.");
    } finally {
      setDocumentUploading(false);
    }
  };

  const deleteDocument = async (document: StaffDocument) => {
    const asset = document.file_asset_id ? assetsById.get(document.file_asset_id) : undefined;
    try {
      if (asset?.id) {
        const response = await fetch(`/api/staff-documents?assetId=${encodeURIComponent(asset.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const result = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Stored file could not be deleted.");
      }
      removeStaffDocument(document.id);
      toast.success("Staff document removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Staff document could not be removed.");
    }
  };

  const gpsValue = policy.office_latitude != null && policy.office_longitude != null
    ? `${policy.office_latitude.toFixed(6)}, ${policy.office_longitude.toFixed(6)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && requestClose()}>
      <DialogContent className="max-h-[94vh] max-w-5xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isNew ? <UserPlus className="h-4 w-4 text-primary"/> : <Pencil className="h-4 w-4 text-primary"/>}
            {isNew ? "Add Staff Operations Profile" : "Edit Staff Operations Profile"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            One canonical Staff profile owns HR details, attendance policy and compensation. Login identity stays in User Approvals.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4 rd-scroll">
          <Tabs defaultValue="basic" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="salary">Salary</TabsTrigger>
              <TabsTrigger value="documents">Docs</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Name")}<Input value={draft.name || ""} onChange={(e) => patch({ name: e.target.value })} autoFocus className="h-9"/></div>
              <div>{fieldLabel("Phone")}<Input value={draft.phone || ""} onChange={(e) => patch({ phone: sanitizeIndianMobile(e.target.value) })} type="tel" inputMode="numeric" maxLength={10} className="h-9"/></div>
              <div>{fieldLabel(staff?.auth_user_id ? "Email (managed in User Approvals)" : "Email")}<Input value={draft.email || ""} onChange={(e) => patch({ email: e.target.value })} disabled={Boolean(staff?.auth_user_id)} className="h-9"/></div>
              <div>{fieldLabel("Department")}<Input value={draft.department || ""} onChange={(e) => patch({ department: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Designation")}<Input value={draft.designation || ""} onChange={(e) => patch({ designation: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("City")}<Input value={draft.city || ""} onChange={(e) => patch({ city: e.target.value })} className="h-9"/></div>
              <div className="md:col-span-2">{fieldLabel("Address")}<Input value={draft.address || ""} onChange={(e) => patch({ address: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Emergency contact")}<Input value={draft.emergency_contact || ""} onChange={(e) => patch({ emergency_contact: sanitizeIndianMobile(e.target.value) })} type="tel" inputMode="numeric" maxLength={10} className="h-9"/></div>
            </TabsContent>

            <TabsContent value="login" className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 md:col-span-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
                  <div>
                    <p className="text-xs font-semibold">Login access is managed in User Approvals</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Authentication remains in Supabase Auth and User Approvals; this form only edits the operational Staff record.
                    </p>
                  </div>
                </div>
              </div>
              {staff?.auth_user_id ? <div>{fieldLabel("Linked login email")}<Input value={staff.login_email || staff.email || ""} disabled className="h-9"/></div> : null}
            </TabsContent>

            <TabsContent value="access" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Controlled role")}
                <Select value={normalizeRoleKey(draft.role_key || draft.role)} onValueChange={(value) => patch({ role_key: value as StaffRoleKey, role: roleLabel(value) })} disabled={staff?.status === "pending"}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAFF_ROLE_KEYS.map((key) => <SelectItem key={key} value={key}>{STAFF_ROLE_LABELS[key]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>{fieldLabel("Reporting manager")}<Select value={draft.reporting_manager_id || "none"} onValueChange={(value) => patch({ reporting_manager_id: value === "none" ? undefined : value })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{db.master.staff.filter((row) => row.id !== staffId).map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs"><ShieldCheck className="mb-1 h-4 w-4 text-primary"/><p className="font-semibold">Permissions are role-matrix driven</p><p className="mt-1 text-muted-foreground">The same role key drives UI visibility and server checks.</p></div>
            </TabsContent>

            <TabsContent value="attendance" className="grid gap-3 md:grid-cols-4">
              <div>{fieldLabel("Office name")}<Input value={policy.office_name || ""} onChange={(e) => patchPolicy({ office_name: e.target.value })} className="h-9"/></div>
              <div className="md:col-span-2">
                {fieldLabel("Office GPS")}
                <div className="flex gap-2">
                  <Input value={gpsValue} readOnly placeholder="Capture latitude, longitude" className="h-9 font-mono text-xs"/>
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={captureOfficeGps} disabled={gpsLoading}>
                    <MapPin className="mr-1 h-3.5 w-3.5"/>{gpsLoading ? "Capturing…" : "Capture GPS"}
                  </Button>
                </div>
              </div>
              <div>{fieldLabel("Geofence radius m")}<Input type="number" min={1} value={policy.geofence_radius_m} onChange={(e) => patchPolicy({ geofence_radius_m: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Check-in time")}<Input type="time" value={policy.standard_check_in_time} onChange={(e) => patchPolicy({ standard_check_in_time: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Late grace min")}<Input type="number" min={0} value={policy.late_grace_minutes} onChange={(e) => patchPolicy({ late_grace_minutes: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Half-day min")}<Input type="number" min={1} value={policy.minimum_half_day_minutes} onChange={(e) => patchPolicy({ minimum_half_day_minutes: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Auto absent after min")}<Input type="number" min={0} step={1} inputMode="numeric" value={policy.auto_absent_after_minutes} onChange={(e) => patchPolicy({ auto_absent_after_minutes: Math.max(0, Number(e.target.value || 0)) })} className="h-9"/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-in</span><Switch checked={policy.auto_check_in_enabled} onCheckedChange={(value) => patchPolicy({ auto_check_in_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-out</span><Switch checked={policy.auto_check_out_enabled} onCheckedChange={(value) => patchPolicy({ auto_check_out_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto absent</span><Switch checked={policy.auto_absent_enabled} onCheckedChange={(value) => patchPolicy({ auto_absent_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Salary deduction</span><Switch checked={policy.absent_deduction_enabled} onCheckedChange={(value) => patchPolicy({ absent_deduction_enabled: value })}/></div>
            </TabsContent>

            <TabsContent value="salary" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Salary type")}<Select value={draft.salary_type || "monthly"} onValueChange={(value) => patch({ salary_type: value as Staff["salary_type"] })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly salary</SelectItem><SelectItem value="daily_wage">Daily wage</SelectItem></SelectContent></Select></div>
              {draft.salary_type !== "daily_wage" ? (
                <div>{fieldLabel("Monthly salary ₹")}<Input type="number" min={0} value={draft.monthly_salary ?? ""} onChange={(e) => patch({ monthly_salary: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
              ) : (
                <div>{fieldLabel("Daily wage ₹")}<Input type="number" min={0} value={draft.daily_wage ?? ""} onChange={(e) => patch({ daily_wage: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
              )}
              <div className="md:col-span-3 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Monthly salary stays fixed for the payroll month. Daily-wage payroll uses daily wage × the actual number of calendar days in the selected month (28/29/30/31), then applies attendance and approved adjustments.
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-3">
              {isNew ? (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                  Save this Staff profile first. Documents are stored in the private Supabase Storage bucket and linked through canonical Staff Document records.
                </div>
              ) : (
                <>
                  <div className="grid gap-2 md:grid-cols-[180px_180px_minmax(0,1fr)_auto]">
                    <Select value={documentType} onValueChange={(value) => setDocumentType(value as StaffDocument["document_type"])}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{documentTypeOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder="Document / ID number" className="h-9"/>
                    <Input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} className="h-9"/>
                    <Button type="button" size="sm" className="h-9" onClick={uploadDocument} disabled={documentUploading || !documentFile}>
                      <FileUp className="mr-1 h-3.5 w-3.5"/>{documentUploading ? "Uploading…" : "Upload"}
                    </Button>
                  </div>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {documents.map((document) => {
                      const asset = document.file_asset_id ? assetsById.get(document.file_asset_id) : undefined;
                      return (
                        <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold">{documentTypeOptions.find(([value]) => value === document.document_type)?.[1] || document.document_type}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{document.document_no || "No document number"} · {asset?.file_name || "Missing file asset"}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-[10px] font-semibold uppercase ${documentStatusClass(document.status)}`}>{document.status}</span>
                            {asset?.web_view_link ? <a href={asset.web_view_link} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[10px] font-medium text-primary"><ExternalLink className="mr-1 h-3 w-3"/>Open</a> : null}
                            {document.status === "pending" ? <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => updateStaffDocument(document.id, { status: "verified" })}>Verify</Button> : null}
                            {document.status === "pending" ? <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => updateStaffDocument(document.id, { status: "rejected" })}>Reject</Button> : null}
                            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-destructive" onClick={() => void deleteDocument(document)}><Trash2 className="mr-1 h-3 w-3"/>Delete</Button>
                          </div>
                        </div>
                      );
                    })}
                    {!documents.length ? <div className="px-3 py-8 text-center text-xs text-muted-foreground">No documents uploaded for this Staff profile.</div> : null}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="status" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Lifecycle status")}<Select value={String(draft.status || "active")} onValueChange={(value) => patch({ status: value as Staff["status"] })} disabled={staff?.status === "pending"}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((value) => <SelectItem key={value} value={value} disabled={value === "pending"}>{value}</SelectItem>)}</SelectContent></Select></div>
              <div>{fieldLabel("Joining date")}<Input type="date" value={draft.joining_date || ""} onChange={(e) => patch({ joining_date: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Exit date")}<Input type="date" value={draft.exit_date || ""} onChange={(e) => patch({ exit_date: e.target.value })} className="h-9"/></div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={requestClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!draft.name?.trim()}>{isNew ? <UserPlus className="mr-1 h-3.5 w-3.5"/> : <Pencil className="mr-1 h-3.5 w-3.5"/>}{isNew ? "Create staff" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
