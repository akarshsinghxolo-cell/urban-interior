"use client";

import * as React from "react";
import { Navigation, Pencil, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { createDefaultAttendancePolicy } from "@/lib/rdash/attendance-policy";
import { coordinateInputError, formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { captureDeviceGps, deviceGpsErrorMessage } from "@/lib/rdash/device-gps";
import { currentPayrollYearMonth, resolvedStaffSalaryType, staffCompensationForMonth } from "@/lib/rdash/payroll";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import { STAFF_ROLE_KEYS, STAFF_ROLE_LABELS, normalizeRoleKey, roleLabel } from "@/lib/rdash/staff-operations";
import type { AttendancePolicy, Staff, StaffRoleKey } from "@/lib/rdash/types";
import { StaffDocumentsEditor } from "./StaffDocumentsEditor";

const statusOptions = ["pending", "active", "inactive", "blocked", "blacklisted", "exited"] as const;

function fieldLabel(text: string) {
  return <label className="text-[10px] font-semibold uppercase text-muted-foreground">{text}</label>;
}

const numberValue = (value: string, minimum = 0) => Math.max(minimum, Math.round(Number(value || 0)));

export function StaffEditDialog({ staffId, open, onClose }: { staffId?: string; open: boolean; onClose: () => void }) {
  const db = useRDashStore((state) => state.db);
  const addStaff = useRDashStore((state) => state.addStaff);
  const updateStaff = useRDashStore((state) => state.updateStaff);
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
  const initialDraft = React.useMemo<Partial<Staff>>(() => ({
    ...baseStaff,
    role_key: normalizeRoleKey(baseStaff.role_key || baseStaff.role),
    role: roleLabel(normalizeRoleKey(baseStaff.role_key || baseStaff.role)),
    login_email: baseStaff.login_email || baseStaff.email || "",
    salary_type: resolvedStaffSalaryType(baseStaff),
    attendance_policy: baseStaff.attendance_policy || createDefaultAttendancePolicy(),
  }), [baseStaff]);

  const [draft, setDraft] = React.useState<Partial<Staff>>(initialDraft);
  const [coordinateText, setCoordinateText] = React.useState("");
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const policy = (draft.attendance_policy || createDefaultAttendancePolicy()) as AttendancePolicy;
  const isNew = !staffId;
  const salaryType = resolvedStaffSalaryType({
    salary_type: draft.salary_type,
    monthly_salary: draft.monthly_salary,
    daily_wage: draft.daily_wage,
  } as Staff);
  const payrollMonth = currentPayrollYearMonth();
  const compensation = staffCompensationForMonth({
    salary_type: salaryType,
    monthly_salary: draft.monthly_salary,
    daily_wage: draft.daily_wage,
  } as Staff, payrollMonth);
  const coordinateError = coordinateInputError(coordinateText);

  React.useEffect(() => {
    if (!open) return;
    setDraft(initialDraft);
    setCoordinateText(formatCoordinatePair({
      latitude: initialDraft.attendance_policy?.office_latitude,
      longitude: initialDraft.attendance_policy?.office_longitude,
    }));
    setGpsLoading(false);
  }, [initialDraft, open]);

  const patch = (value: Partial<Staff>) => setDraft((current) => ({ ...current, ...value }));
  const patchPolicy = (value: Partial<AttendancePolicy>) => {
    setDraft((current) => ({
      ...current,
      attendance_policy: {
        ...(current.attendance_policy || createDefaultAttendancePolicy()),
        ...value,
      },
    }));
  };

  function updateCoordinates(value: string) {
    setCoordinateText(value);
    if (!value.trim()) {
      patchPolicy({ office_latitude: undefined, office_longitude: undefined });
      return;
    }
    const parsed = parseCoordinatePair(value);
    if (parsed) patchPolicy({ office_latitude: parsed.latitude, office_longitude: parsed.longitude });
  }

  async function captureOfficeGps() {
    setGpsLoading(true);
    try {
      const capture = await captureDeviceGps({ mode: "master-location" });
      const coordinates = { latitude: capture.latitude, longitude: capture.longitude };
      patchPolicy({ office_latitude: capture.latitude, office_longitude: capture.longitude });
      setCoordinateText(formatCoordinatePair(coordinates));
      toast.success(`Office GPS captured · ±${Math.round(capture.accuracy_m)} m`);
    } catch (error) {
      toast.error(`GPS error: ${deviceGpsErrorMessage(error)}`);
    } finally {
      setGpsLoading(false);
    }
  }

  const formId = `staff:${staffId || "new"}`;
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(initialDraft);

  const handleSave = (): boolean => {
    if (!draft.name?.trim()) {
      toast.error("Staff name is required.");
      return false;
    }
    if (coordinateError) {
      toast.error(coordinateError);
      return false;
    }

    const roleKey = normalizeRoleKey(draft.role_key || draft.role);
    const selectedSalaryType = resolvedStaffSalaryType({
      salary_type: draft.salary_type,
      monthly_salary: draft.monthly_salary,
      daily_wage: draft.daily_wage,
    } as Staff);
    const payload: Partial<Staff> = {
      ...draft,
      name: draft.name.trim(),
      phone: draft.phone?.trim() || undefined,
      email: staff?.auth_user_id ? staff.email : draft.email?.trim() || undefined,
      address: draft.address?.trim() || undefined,
      emergency_contact: draft.emergency_contact?.trim() || undefined,
      department: draft.department?.trim() || undefined,
      designation: draft.designation?.trim() || undefined,
      city: draft.city?.trim() || undefined,
      role_key: roleKey,
      role: roleLabel(roleKey),
      status: draft.status || "active",
      salary_type: selectedSalaryType,
      monthly_salary: selectedSalaryType === "monthly" ? Number(draft.monthly_salary || 0) || undefined : undefined,
      daily_wage: selectedSalaryType === "daily_wage" ? Number(draft.daily_wage || 0) || undefined : undefined,
      login_enabled: staff?.login_enabled,
      login_email: staff?.login_email || staff?.email,
      temporary_password: undefined,
      force_password_change: undefined,
      attendance_policy: policy,
    };

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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="max-h-[94dvh] gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isNew ? <UserPlus className="h-4 w-4 text-primary"/> : <Pencil className="h-4 w-4 text-primary"/>}
            {isNew ? "Add Staff Operations Profile" : "Edit Staff Operations Profile"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Staff identity, access, attendance policy, compensation, documents and lifecycle status share one canonical Staff profile.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[72dvh] overflow-y-auto px-5 py-4 rd-scroll">
          <Tabs defaultValue="basic" className="space-y-4">
            <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
              <TabsTrigger className="shrink-0" value="basic">Basic</TabsTrigger>
              <TabsTrigger className="shrink-0" value="login">Login</TabsTrigger>
              <TabsTrigger className="shrink-0" value="access">Access</TabsTrigger>
              <TabsTrigger className="shrink-0" value="attendance">Attendance</TabsTrigger>
              <TabsTrigger className="shrink-0" value="salary">Salary</TabsTrigger>
              <TabsTrigger className="shrink-0" value="documents">Docs</TabsTrigger>
              <TabsTrigger className="shrink-0" value="status">Status</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Name")}<Input value={draft.name || ""} onChange={(event) => patch({ name: event.target.value })} autoFocus className="h-9"/></div>
              <div>{fieldLabel("Phone")}<Input value={draft.phone || ""} onChange={(event) => patch({ phone: sanitizeIndianMobile(event.target.value) })} placeholder="9876543210" type="tel" inputMode="numeric" maxLength={10} className="h-9"/></div>
              <div>{fieldLabel(staff?.auth_user_id ? "Email (User Approvals)" : "Email")}<Input value={draft.email || ""} onChange={(event) => patch({ email: event.target.value })} disabled={Boolean(staff?.auth_user_id)} className="h-9"/></div>
              <div>{fieldLabel("Department")}<Input value={draft.department || ""} onChange={(event) => patch({ department: event.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Designation")}<Input value={draft.designation || ""} onChange={(event) => patch({ designation: event.target.value })} className="h-9"/></div>
              <div>{fieldLabel("City")}<Input value={draft.city || ""} onChange={(event) => patch({ city: event.target.value })} className="h-9"/></div>
              <div className="md:col-span-2">{fieldLabel("Address")}<Input value={draft.address || ""} onChange={(event) => patch({ address: event.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Emergency contact")}<Input value={draft.emergency_contact || ""} onChange={(event) => patch({ emergency_contact: event.target.value })} className="h-9"/></div>
            </TabsContent>

            <TabsContent value="login" className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 md:col-span-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
                  <div>
                    <p className="text-xs font-semibold">Login access is managed in User Approvals</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {staff?.auth_user_id
                        ? "This Staff profile is linked to Supabase Auth. Authentication access changes stay in System Settings → User Approvals."
                        : "Save the Staff profile first, then create or approve login access through System Settings → User Approvals. Passwords are never stored here."}
                    </p>
                  </div>
                </div>
              </div>
              {staff?.auth_user_id ? <div>{fieldLabel("Linked login email")}<Input value={staff.login_email || staff.email || ""} disabled className="h-9"/></div> : null}
            </TabsContent>

            <TabsContent value="access" className="grid gap-3 md:grid-cols-3">
              <div>
                {fieldLabel("Controlled role")}
                <Select value={normalizeRoleKey(draft.role_key || draft.role)} onValueChange={(value) => patch({ role_key: value as StaffRoleKey, role: roleLabel(value) })} disabled={staff?.status === "pending"}>
                  <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                  <SelectContent>{STAFF_ROLE_KEYS.map((key) => <SelectItem key={key} value={key}>{STAFF_ROLE_LABELS[key]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                {fieldLabel("Reporting manager")}
                <Select value={draft.reporting_manager_id || "none"} onValueChange={(value) => patch({ reporting_manager_id: value === "none" ? undefined : value })}>
                  <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{db.master.staff.filter((row) => row.id !== staffId).map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                <ShieldCheck className="mb-1 h-4 w-4 text-primary"/>
                <p className="font-semibold">Permissions are role-matrix driven</p>
                <p className="mt-1 text-muted-foreground">UI visibility and server mutation checks use the same canonical role key.</p>
              </div>
            </TabsContent>

            <TabsContent value="attendance" className="grid gap-3 md:grid-cols-4">
              <div>{fieldLabel("Office name")}<Input value={policy.office_name || ""} onChange={(event) => patchPolicy({ office_name: event.target.value })} className="h-9"/></div>
              <div className="md:col-span-2">
                {fieldLabel("Office coordinates")}
                <div className="flex gap-2">
                  <Input value={coordinateText} onChange={(event) => updateCoordinates(event.target.value)} placeholder="26.739800, 83.371200" aria-invalid={Boolean(coordinateError)} className="h-9"/>
                  <Button type="button" size="sm" variant="outline" onClick={() => void captureOfficeGps()} disabled={gpsLoading}>
                    <Navigation className="mr-1 h-3.5 w-3.5"/>{gpsLoading ? "Capturing…" : "Capture GPS"}
                  </Button>
                </div>
                {coordinateError ? <p className="mt-1 text-[10px] text-destructive">{coordinateError}</p> : <p className="mt-1 text-[10px] text-muted-foreground">Uses the same master-location GPS capture used elsewhere in Urban Castle.</p>}
              </div>
              <div>{fieldLabel("Geofence radius m")}<Input type="number" min={1} value={policy.geofence_radius_m} onChange={(event) => patchPolicy({ geofence_radius_m: numberValue(event.target.value, 1) })} className="h-9"/></div>
              <div>{fieldLabel("Check-in time")}<Input type="time" value={policy.standard_check_in_time} onChange={(event) => patchPolicy({ standard_check_in_time: event.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Late grace min")}<Input type="number" min={0} value={policy.late_grace_minutes} onChange={(event) => patchPolicy({ late_grace_minutes: numberValue(event.target.value) })} className="h-9"/></div>
              <div>{fieldLabel("Half-day min")}<Input type="number" min={0} value={policy.minimum_half_day_minutes} onChange={(event) => patchPolicy({ minimum_half_day_minutes: numberValue(event.target.value) })} className="h-9"/></div>
              <div>{fieldLabel("Auto absent after check-in (min)")}<Input type="number" min={0} step={1} value={policy.auto_absent_after_minutes} onChange={(event) => patchPolicy({ auto_absent_after_minutes: numberValue(event.target.value) })} className="h-9"/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-in</span><Switch checked={policy.auto_check_in_enabled} onCheckedChange={(value) => patchPolicy({ auto_check_in_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-out</span><Switch checked={policy.auto_check_out_enabled} onCheckedChange={(value) => patchPolicy({ auto_check_out_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto absent</span><Switch checked={policy.auto_absent_enabled} onCheckedChange={(value) => patchPolicy({ auto_absent_enabled: value })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Salary deduction</span><Switch checked={policy.absent_deduction_enabled} onCheckedChange={(value) => patchPolicy({ absent_deduction_enabled: value })}/></div>
            </TabsContent>

            <TabsContent value="salary" className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  {fieldLabel("Salary type")}
                  <Select value={salaryType} onValueChange={(value) => patch({ salary_type: value as Staff["salary_type"] })}>
                    <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="monthly">Monthly salary</SelectItem><SelectItem value="daily_wage">Daily wage</SelectItem></SelectContent>
                  </Select>
                </div>
                {salaryType === "monthly" ? (
                  <div>{fieldLabel("Monthly salary ₹")}<Input type="number" min={0} value={draft.monthly_salary ?? ""} onChange={(event) => patch({ monthly_salary: event.target.value ? Number(event.target.value) : undefined })} className="h-9"/></div>
                ) : (
                  <div>{fieldLabel("Daily wage ₹")}<Input type="number" min={0} value={draft.daily_wage ?? ""} onChange={(event) => patch({ daily_wage: event.target.value ? Number(event.target.value) : undefined })} className="h-9"/></div>
                )}
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{salaryType === "monthly" ? "Derived daily rate" : "Month base at daily wage"}</p>
                  <p className="mt-1 text-sm font-bold">₹{salaryType === "monthly" ? compensation.dailyRate.toLocaleString("en-IN") : compensation.baseSalary.toLocaleString("en-IN")}</p>
                  <p className="text-[10px] text-muted-foreground">{compensation.daysInMonth} calendar days in {payrollMonth}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Monthly staff use salary ÷ the actual 28/29/30/31 calendar days for that payroll month. Daily-wage staff use daily wage × that month&apos;s calendar days before attendance deductions and approved adjustments.
              </div>
            </TabsContent>

            <TabsContent value="documents">
              {staffId ? (
                <StaffDocumentsEditor staffId={staffId}/>
              ) : (
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground">Save this Staff profile first. Documents can then be uploaded directly to private Supabase Storage and linked to this profile.</div>
              )}
            </TabsContent>

            <TabsContent value="status" className="grid gap-3 md:grid-cols-3">
              <div>
                {fieldLabel("Lifecycle status")}
                <Select value={String(draft.status || "active")} onValueChange={(value) => patch({ status: value as Staff["status"] })} disabled={staff?.status === "pending"}>
                  <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                  <SelectContent>{statusOptions.map((value) => <SelectItem key={value} value={value} disabled={value === "pending"}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>{fieldLabel("Joining date")}<Input type="date" value={draft.joining_date || ""} onChange={(event) => patch({ joining_date: event.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Exit date")}<Input type="date" value={draft.exit_date || ""} onChange={(event) => patch({ exit_date: event.target.value })} className="h-9"/></div>
              <div className="md:col-span-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">Inactive or exited staff cannot receive new operational assignments or attendance check-ins. Payroll remains an explicit HR/Finance action.</div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={requestClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!draft.name?.trim()}>
            {isNew ? <UserPlus className="mr-1 h-3.5 w-3.5"/> : <Pencil className="mr-1 h-3.5 w-3.5"/>}
            {isNew ? "Create staff" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
