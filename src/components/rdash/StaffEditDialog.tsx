"use client";

import * as React from "react";
import { ExternalLink, FileUp, MapPin, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { createDefaultAttendancePolicy, normalizeAttendancePolicy } from "@/lib/rdash/attendance-policy";
import { captureDeviceGps, deviceGpsErrorMessage } from "@/lib/rdash/device-gps";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { indianMobileForWrite, isValidIndianMobile } from "@/lib/rdash/phone-validation";
import { STAFF_ROLE_KEYS, STAFF_ROLE_LABELS, normalizeRoleKey, roleLabel } from "@/lib/rdash/staff-operations";
import type { AttendancePolicy, Staff, StaffDocument, StaffRoleKey } from "@/lib/rdash/types";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import { Button } from "@/components/ui/button";
import { IndianMobileInput } from "./IndianMobileInput";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusOptions = ["pending", "active", "inactive", "blocked", "blacklisted", "exited"] as const;
const staffSections = [
  { value: "basic", label: "Basic" }, { value: "login", label: "Login" },
  { value: "access", label: "Access" }, { value: "attendance", label: "Attendance" },
  { value: "salary", label: "Salary" }, { value: "documents", label: "Documents" },
  { value: "status", label: "Status" },
] as const;
type StaffSection = (typeof staffSections)[number]["value"];
type UploadedStaffDocument = {
  assetId: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  storageBucket: string;
  storagePath: string;
  staffId: string;
  documentType: StaffDocument["document_type"];
  documentNo: string;
};
const documentTypeOptions: Array<[StaffDocument["document_type"], string]> = [
  ["photo", "Photo"],
  ["aadhaar", "Aadhaar"],
  ["pan", "PAN"],
  ["id_proof", "ID proof"],
  ["address_proof", "Address proof"],
  ["bank", "Bank proof"],
  ["other", "Other"],
];

function fieldLabel(text: string, htmlFor: string) {
  return <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-foreground">{text}</label>;
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
  const labelPrefix = React.useId();
  const fieldId = (key: string) => `${labelPrefix}-${key}`;
  const [activeSection, setActiveSection] = React.useState<StaffSection>("basic");
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [documentType, setDocumentType] = React.useState<StaffDocument["document_type"]>("photo");
  const [documentNo, setDocumentNo] = React.useState("");
  const [documentFile, setDocumentFile] = React.useState<File | null>(null);
  const [documentStage, setDocumentStage] = React.useState<"idle" | "uploading" | "linking" | "discarding" | "queued" | "error">("idle");
  const documentUploading = ["uploading", "linking", "discarding"].includes(documentStage);
  const documentOperationRef = React.useRef(false);
  const documentFileInputRef = React.useRef<HTMLInputElement>(null);
  const documentUploadIdRef = React.useRef<string | null>(null);
  const [pendingDocumentLink, setPendingDocumentLink] = React.useState<UploadedStaffDocument | null>(null);
  const [documentToDelete, setDocumentToDelete] = React.useState<StaffDocument | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = React.useState<string | null>(null);
  const [documentError, setDocumentError] = React.useState("");
  const policy = normalizeAttendancePolicy(draft.attendance_policy);
  const isNew = !staffId;

  React.useEffect(() => {
    if (open) setDraft(initialDraft);
  }, [initialDraft, open]);
  // A background Staff projection refresh must not reset an in-progress upload.
  React.useEffect(() => {
    if (!open) return;
    setActiveSection("basic");
    setDocumentType("photo");
    setDocumentNo("");
    setDocumentFile(null);
    documentUploadIdRef.current = null;
    setDocumentStage("idle");
    setPendingDocumentLink(null);
    setDocumentError("");
    setDocumentToDelete(null);
  }, [open, staffId]);

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
    if (documentOperationRef.current || pendingDocumentLink) {
      setActiveSection("documents");
      toast.error(pendingDocumentLink
        ? "Finish linking or discard the uploaded document before saving the profile."
        : "Wait until the document operation finishes.");
      return false;
    }
    if (!draft.name?.trim()) {
      toast.error("Staff name is required");
      return false;
    }
    if (!isValidIndianMobile(draft.phone)) {
      toast.error("Staff phone must be a valid 10-digit Indian mobile number.");
      return false;
    }
    if (!isValidIndianMobile(draft.emergency_contact)) {
      toast.error("Emergency contact must be a valid 10-digit Indian mobile number.");
      return false;
    }
    const roleKey = normalizeRoleKey(draft.role_key || draft.role);
    const salaryType = draft.salary_type || "monthly";
    const payload: Partial<Staff> = {
      ...draft,
      name: draft.name.trim(),
      phone: indianMobileForWrite(draft.phone, { label: "Staff phone" }),
      email: staff?.auth_user_id ? staff.email : draft.email?.trim() || undefined,
      address: draft.address?.trim() || undefined,
      emergency_contact: indianMobileForWrite(draft.emergency_contact, { label: "Emergency contact" }),
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
    if (documentOperationRef.current || pendingDocumentLink) {
      toast.error(pendingDocumentLink
        ? "Finish linking the uploaded document before leaving this profile."
        : "Wait for the document operation to finish.");
      return;
    }
    dirtyFormRegistry.requestNavigation(onClose, { reason: "close this Staff profile form" });
  }, [onClose, pendingDocumentLink]);

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
    if (documentOperationRef.current) return;
    if (!staffId || dirty) {
      toast.error("Save the Staff profile changes before uploading documents.");
      return;
    }
    if (!documentFile && !pendingDocumentLink) {
      toast.error("Choose a document file.");
      return;
    }
    documentOperationRef.current = true;
    setDocumentError("");
    try {
      let uploaded = pendingDocumentLink;
      if (!uploaded) {
        setDocumentStage("uploading");
        const body = new FormData();
        body.set("staffId", staffId);
        if (!documentUploadIdRef.current) documentUploadIdRef.current = crypto.randomUUID();
        body.set("uploadId", documentUploadIdRef.current);
        body.set("file", documentFile!);
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
        uploaded = {
          assetId: result.assetId,
          fileName: result.fileName || documentFile!.name,
          mimeType: result.mimeType || documentFile!.type,
          fileSizeBytes: result.fileSizeBytes ?? documentFile!.size,
          storageBucket: result.storageBucket,
          storagePath: result.storagePath,
          staffId,
          documentType,
          documentNo,
        };
        // A metadata retry must reuse the uploaded asset, not upload another copy.
        setPendingDocumentLink(uploaded);
      }
      setDocumentStage("linking");
      registerStaffDocument(uploaded);
      setPendingDocumentLink(null);
      documentUploadIdRef.current = null;
      setDocumentNo("");
      setDocumentFile(null);
      if (documentFileInputRef.current) documentFileInputRef.current.value = "";
      setDocumentStage("queued");
      toast.info("Document uploaded. Its record is queued for workspace sync.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document upload failed.";
      setDocumentStage("error");
      setDocumentError(message);
      toast.error(message);
    } finally {
      documentOperationRef.current = false;
    }
  };

  const discardPendingUpload = async () => {
    if (documentOperationRef.current || !pendingDocumentLink) return;
    documentOperationRef.current = true;
    setDocumentStage("discarding");
    setDocumentError("");
    try {
      const params = new URLSearchParams({
        discardPending: "true",
        assetId: pendingDocumentLink.assetId,
        staffId: pendingDocumentLink.staffId,
        fileName: pendingDocumentLink.fileName || "",
      });
      const response = await fetch(`/api/staff-documents?${params.toString()}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Pending upload could not be discarded.");
      setPendingDocumentLink(null);
      documentUploadIdRef.current = null;
      setDocumentFile(null);
      setDocumentNo("");
      if (documentFileInputRef.current) documentFileInputRef.current.value = "";
      setDocumentStage("idle");
      toast.info("Unlinked upload discarded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pending upload could not be discarded.";
      setDocumentStage("error");
      setDocumentError(message);
      toast.error(message);
    } finally {
      documentOperationRef.current = false;
    }
  };

  const deleteDocument = async (document: StaffDocument) => {
    if (documentOperationRef.current) return;
    const asset = document.file_asset_id ? assetsById.get(document.file_asset_id) : undefined;
    if (!asset?.id) {
      setDocumentError("Cannot delete a document without its saved file record. Refresh and try again.");
      return;
    }
    documentOperationRef.current = true;
    setDeletingDocumentId(document.id);
    setDocumentError("");
    try {
      const response = await fetch(`/api/staff-documents?assetId=${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Stored file could not be deleted.");
      removeStaffDocument(document.id);
      setDocumentToDelete(null);
      toast.info("File deleted. Document record removal is queued for workspace sync.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Staff document could not be removed.";
      setDocumentError(message);
      toast.error(message);
    } finally {
      documentOperationRef.current = false;
      setDeletingDocumentId(null);
    }
  };

  const gpsValue = policy.office_latitude != null && policy.office_longitude != null
    ? `${policy.office_latitude.toFixed(6)}, ${policy.office_longitude.toFixed(6)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && requestClose()}>
      <DialogContent className="max-h-[94dvh] w-full max-w-5xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isNew ? <UserPlus className="h-4 w-4 text-primary"/> : <Pencil className="h-4 w-4 text-primary"/>}
            {isNew ? "Add Staff Operations Profile" : "Edit Staff Operations Profile"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            One canonical Staff profile owns HR details, attendance policy and compensation. Login identity stays in User Approvals.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(72dvh,calc(94dvh-10rem))] overflow-y-auto px-5 py-4 rd-scroll">
          <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as StaffSection)} className="space-y-4">
            <div className="md:hidden">
              <label htmlFor={fieldId("section")} className="mb-1 block text-xs font-semibold">Profile section</label>
              <select id={fieldId("section")} value={activeSection} onChange={(event) => setActiveSection(event.target.value as StaffSection)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                {staffSections.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
              </select>
            </div>
            <TabsList aria-label="Staff profile sections" className="hidden h-auto w-full gap-1 p-1 md:grid md:grid-cols-7">
              {staffSections.map((section) => <TabsTrigger key={section.value} value={section.value} className="min-w-0 px-1 py-2 text-xs lg:text-sm">{section.label}</TabsTrigger>)}
            </TabsList>

            <TabsContent value="basic" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Name", fieldId("name"))}<Input id={fieldId("name")} value={draft.name || ""} onChange={(e) => patch({ name: e.target.value })} autoFocus className="h-9"/></div>
              <div>{fieldLabel("Phone", fieldId("phone"))}<IndianMobileInput id={fieldId("phone")} value={draft.phone || ""} onChange={(phone) => patch({ phone })} className="h-9"/></div>
              <div>{fieldLabel(staff?.auth_user_id ? "Email (managed in User Approvals)" : "Email", fieldId("email"))}<Input id={fieldId("email")} value={draft.email || ""} onChange={(e) => patch({ email: e.target.value })} disabled={Boolean(staff?.auth_user_id)} className="h-9"/></div>
              <div>{fieldLabel("Department", fieldId("department"))}<Input id={fieldId("department")} value={draft.department || ""} onChange={(e) => patch({ department: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Designation", fieldId("designation"))}<Input id={fieldId("designation")} value={draft.designation || ""} onChange={(e) => patch({ designation: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("City", fieldId("city"))}<Input id={fieldId("city")} value={draft.city || ""} onChange={(e) => patch({ city: e.target.value })} className="h-9"/></div>
              <div className="md:col-span-2">{fieldLabel("Address", fieldId("address"))}<Input id={fieldId("address")} value={draft.address || ""} onChange={(e) => patch({ address: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Emergency contact", fieldId("emergency"))}<IndianMobileInput id={fieldId("emergency")} value={draft.emergency_contact || ""} onChange={(emergency_contact) => patch({ emergency_contact })} className="h-9"/></div>
            </TabsContent>

            <TabsContent value="login" className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 md:col-span-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
                  <div>
                    <p className="text-xs font-semibold">Login access is managed in User Approvals</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Authentication remains in Supabase Auth and User Approvals; this form only edits the operational Staff record. Passwords are never stored in Staff workspace data.
                    </p>
                  </div>
                </div>
              </div>
              {staff?.auth_user_id ? <div>{fieldLabel("Linked login email", fieldId("login-email"))}<Input id={fieldId("login-email")} value={staff.login_email || staff.email || ""} disabled className="h-9"/></div> : null}
            </TabsContent>

            <TabsContent value="access" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Controlled role", fieldId("role"))}
                <Select value={normalizeRoleKey(draft.role_key || draft.role)} onValueChange={(value) => patch({ role_key: value as StaffRoleKey, role: roleLabel(value) })} disabled={staff?.status === "pending"}>
                  <SelectTrigger id={fieldId("role")} className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAFF_ROLE_KEYS.map((key) => <SelectItem key={key} value={key}>{STAFF_ROLE_LABELS[key]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>{fieldLabel("Reporting manager", fieldId("reporting-manager"))}<Select value={draft.reporting_manager_id || "none"} onValueChange={(value) => patch({ reporting_manager_id: value === "none" ? undefined : value })}><SelectTrigger id={fieldId("reporting-manager")} className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{db.master.staff.filter((row) => row.id !== staffId).map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs"><ShieldCheck className="mb-1 h-4 w-4 text-primary"/><p className="font-semibold">Permissions are role-matrix driven</p><p className="mt-1 text-muted-foreground">The same role key drives UI visibility and server checks.</p></div>
            </TabsContent>

            <TabsContent value="attendance" className="grid gap-3 md:grid-cols-4">
              <div>{fieldLabel("Office name", fieldId("office-name"))}<Input id={fieldId("office-name")} value={policy.office_name || ""} onChange={(e) => patchPolicy({ office_name: e.target.value })} className="h-9"/></div>
              <div className="md:col-span-2">
                {fieldLabel("Office GPS", fieldId("office-gps"))}
                <div className="flex gap-2">
                  <Input id={fieldId("office-gps")} value={gpsValue} readOnly placeholder="Capture latitude, longitude" className="h-9 font-mono text-xs"/>
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={captureOfficeGps} disabled={gpsLoading}>
                    <MapPin className="mr-1 h-3.5 w-3.5"/>{gpsLoading ? "Capturing…" : "Capture GPS"}
                  </Button>
                </div>
              </div>
              <div>{fieldLabel("Geofence radius m", fieldId("geofence"))}<Input id={fieldId("geofence")} type="number" min={1} value={policy.geofence_radius_m} onChange={(e) => patchPolicy({ geofence_radius_m: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Check-in time", fieldId("check-in"))}<Input id={fieldId("check-in")} type="time" value={policy.standard_check_in_time} onChange={(e) => patchPolicy({ standard_check_in_time: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Late grace min", fieldId("late-grace"))}<Input id={fieldId("late-grace")} type="number" min={0} value={policy.late_grace_minutes} onChange={(e) => patchPolicy({ late_grace_minutes: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Half-day min", fieldId("half-day"))}<Input id={fieldId("half-day")} type="number" min={1} value={policy.minimum_half_day_minutes} onChange={(e) => patchPolicy({ minimum_half_day_minutes: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Auto absent after min", fieldId("auto-absent"))}<Input id={fieldId("auto-absent")} type="number" min={0} step={1} inputMode="numeric" value={policy.auto_absent_after_minutes} onChange={(e) => patchPolicy({ auto_absent_after_minutes: Math.max(0, Number(e.target.value || 0)) })} className="h-9"/></div>
              <div>{fieldLabel("Absent deduction days", fieldId("deduction-days"))}<Input id={fieldId("deduction-days")} type="number" min={0} step={0.5} value={policy.absent_deduction_days} disabled={!policy.absent_deduction_enabled} onChange={(e) => patchPolicy({ absent_deduction_days: Math.max(0, Number(e.target.value || 0)) })} className="h-9"/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-in</span><Switch checked={policy.auto_check_in_enabled} onCheckedChange={(value) => patchPolicy({ auto_check_in_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-out</span><Switch checked={policy.auto_check_out_enabled} onCheckedChange={(value) => patchPolicy({ auto_check_out_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto absent</span><Switch checked={policy.auto_absent_enabled} onCheckedChange={(value) => patchPolicy({ auto_absent_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Salary deduction</span><Switch checked={policy.absent_deduction_enabled} onCheckedChange={(value) => patchPolicy({ absent_deduction_enabled: value })}/></div>
            </TabsContent>

            <TabsContent value="salary" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Salary type", fieldId("salary-type"))}<Select value={draft.salary_type || "monthly"} onValueChange={(value) => patch({ salary_type: value as Staff["salary_type"] })}><SelectTrigger id={fieldId("salary-type")} className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly salary</SelectItem><SelectItem value="daily_wage">Daily wage</SelectItem></SelectContent></Select></div>
              {draft.salary_type !== "daily_wage" ? (
                <div>{fieldLabel("Monthly salary ₹", fieldId("monthly-salary"))}<Input id={fieldId("monthly-salary")} type="number" min={0} value={draft.monthly_salary ?? ""} onChange={(e) => patch({ monthly_salary: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
              ) : (
                <div>{fieldLabel("Daily wage ₹", fieldId("daily-wage"))}<Input id={fieldId("daily-wage")} type="number" min={0} value={draft.daily_wage ?? ""} onChange={(e) => patch({ daily_wage: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
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
                    <Select value={documentType} disabled={documentUploading || Boolean(pendingDocumentLink)} onValueChange={(value) => setDocumentType(value as StaffDocument["document_type"])}>
                      <SelectTrigger aria-label="Document type" className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{documentTypeOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={documentNo} aria-label="Document or ID number" disabled={documentUploading || Boolean(pendingDocumentLink)} onChange={(e) => setDocumentNo(e.target.value)} placeholder="Document / ID number" className="h-9"/>
                    <Input ref={documentFileInputRef} type="file" aria-label="Document file" disabled={documentUploading || Boolean(pendingDocumentLink)} accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => { setDocumentFile(e.target.files?.[0] || null); documentUploadIdRef.current = null; setDocumentStage("idle"); setDocumentError(""); }} className="h-9"/>
                    <Button type="button" size="sm" className="h-9" onClick={uploadDocument} disabled={documentUploading || Boolean(deletingDocumentId) || dirty || (!documentFile && !pendingDocumentLink)}>
                      <FileUp className="mr-1 h-3.5 w-3.5"/>{documentUploading ? (documentStage === "linking" ? "Linking…" : "Uploading…") : pendingDocumentLink ? "Retry linking" : "Upload"}
                    </Button>
                  </div>
                  {pendingDocumentLink && !documentUploading ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void discardPendingUpload()}>
                      Discard uploaded file
                    </Button>
                  ) : null}
                  {dirty ? <p role="status" className="text-xs text-warning">Save profile changes before uploading documents.</p> : null}
                  {documentUploading ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                    {documentStage === "uploading" ? "Uploading file securely…" : documentStage === "discarding" ? "Discarding unlinked upload…" : "Linking the uploaded file to this Staff profile…"}
                  </p> : null}
                  {documentStage === "queued" ? <p role="status" className="text-xs text-muted-foreground">Document uploaded and queued for workspace sync. Verify it after refreshing.</p> : null}
                  {documentError ? <p role="alert" className="text-xs text-destructive">{documentError}{pendingDocumentLink ? " Your file is already uploaded; retry linking instead of uploading again." : ""}</p> : null}
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {documents.map((document) => {
                      const asset = document.file_asset_id ? assetsById.get(document.file_asset_id) : undefined;
                      return (
                        <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold">{documentTypeOptions.find(([value]) => value === document.document_type)?.[1] || document.document_type}</p>
                            <p className="truncate text-xs text-muted-foreground">{document.document_no || "No document number"} · {asset?.file_name || "Missing file asset"}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-xs font-semibold uppercase ${documentStatusClass(document.status)}`}>{document.status}</span>
                            {asset?.web_view_link ? <a href={asset.web_view_link} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-md border border-border px-2 text-xs font-medium text-primary"><ExternalLink className="mr-1 h-3 w-3"/>Open</a> : null}
                            {document.status === "pending" ? <Button type="button" size="sm" variant="ghost" className="min-h-9 px-2 text-xs" disabled={documentUploading || Boolean(deletingDocumentId)} onClick={() => updateStaffDocument(document.id, { status: "verified" })}>Verify</Button> : null}
                            {document.status === "pending" ? <Button type="button" size="sm" variant="ghost" className="min-h-9 px-2 text-xs" disabled={documentUploading || Boolean(deletingDocumentId)} onClick={() => updateStaffDocument(document.id, { status: "rejected" })}>Reject</Button> : null}
                            <Button type="button" size="sm" variant="ghost" className="min-h-9 px-2 text-xs text-destructive" disabled={Boolean(deletingDocumentId) || documentUploading} onClick={() => setDocumentToDelete(document)}><Trash2 className="mr-1 h-3 w-3"/>Delete</Button>
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
              <div>{fieldLabel("Lifecycle status", fieldId("lifecycle-status"))}<Select value={String(draft.status || "active")} onValueChange={(value) => patch({ status: value as Staff["status"] })} disabled={staff?.status === "pending"}><SelectTrigger id={fieldId("lifecycle-status")} className="h-9"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((value) => <SelectItem key={value} value={value} disabled={value === "pending"}>{value}</SelectItem>)}</SelectContent></Select></div>
              <div>{fieldLabel("Joining date", fieldId("joining-date"))}<Input id={fieldId("joining-date")} type="date" value={draft.joining_date || ""} onChange={(e) => patch({ joining_date: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Exit date", fieldId("exit-date"))}<Input id={fieldId("exit-date")} type="date" value={draft.exit_date || ""} onChange={(e) => patch({ exit_date: e.target.value })} className="h-9"/></div>
            </TabsContent>
          </Tabs>
        </div>

        <AlertDialog open={Boolean(documentToDelete)} onOpenChange={(nextOpen) => { if (!nextOpen && !deletingDocumentId) setDocumentToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Staff document?</AlertDialogTitle>
              <AlertDialogDescription>This deletes the stored file and removes its link from the Staff profile. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            {documentError ? <p role="alert" className="text-sm text-destructive">{documentError}</p> : null}
            <AlertDialogFooter>
              <Button type="button" variant="outline" disabled={Boolean(deletingDocumentId)} onClick={() => setDocumentToDelete(null)}>Cancel</Button>
              <Button type="button" variant="destructive" disabled={Boolean(deletingDocumentId)} onClick={() => { if (documentToDelete) void deleteDocument(documentToDelete); }}>
                {deletingDocumentId ? "Deleting…" : "Delete document"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={requestClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!draft.name?.trim() || documentUploading || Boolean(pendingDocumentLink) || Boolean(deletingDocumentId)}>{isNew ? <UserPlus className="mr-1 h-3.5 w-3.5"/> : <Pencil className="mr-1 h-3.5 w-3.5"/>}{isNew ? "Create staff" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
