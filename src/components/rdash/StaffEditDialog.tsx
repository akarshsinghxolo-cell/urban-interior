"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, UserPlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { createDefaultAttendancePolicy } from "@/lib/rdash/attendance-policy";
import { STAFF_ROLE_KEYS, STAFF_ROLE_LABELS, normalizeRoleKey, roleLabel } from "@/lib/rdash/staff-operations";
import type { AttendancePolicy, Staff, StaffRoleKey } from "@/lib/rdash/types";

const statusOptions = ["active", "inactive", "blocked", "blacklisted", "exited"] as const;

function fieldLabel(text: string) {
  return <label className="text-[10px] font-semibold uppercase text-muted-foreground">{text}</label>;
}

export function StaffEditDialog({ staffId, open, onClose }: { staffId?: string; open: boolean; onClose: () => void }) {
  const db = useRDashStore((s) => s.db);
  const addStaff = useRDashStore((s) => s.addStaff);
  const updateStaff = useRDashStore((s) => s.updateStaff);
  const staff = staffId ? db.master.staff.find((s) => s.id === staffId) : undefined;
  const [draft, setDraft] = React.useState<Partial<Staff>>({});
  const [createLogin, setCreateLogin] = React.useState(false);
  const policy = (draft.attendance_policy || createDefaultAttendancePolicy()) as AttendancePolicy;
  const isNew = !staffId;

  React.useEffect(() => {
    if (!open) return;
    const base = staff || ({ id: "", name: "", role: "Field Staff", role_key: "FIELD_STAFF", status: "active", attendance_policy: createDefaultAttendancePolicy(), salary_type: "monthly", gps_tracking_enabled: true } as Staff);
    setDraft({
      ...base,
      role_key: normalizeRoleKey(base.role_key || base.role),
      role: roleLabel(normalizeRoleKey(base.role_key || base.role)),
      login_email: base.login_email || base.email || "",
      attendance_policy: base.attendance_policy || createDefaultAttendancePolicy(),
    });
    setCreateLogin(Boolean(base.login_enabled || base.login_email));
  }, [open, staff]);

  const patch = (value: Partial<Staff>) => setDraft((current) => ({ ...current, ...value }));
  const patchPolicy = (value: Partial<AttendancePolicy>) => patch({ attendance_policy: { ...policy, ...value } });

  const handleSave = () => {
    if (!draft.name?.trim()) return toast.error("Staff name is required");
    const roleKey = normalizeRoleKey(draft.role_key || draft.role);
    const payload: Partial<Staff> = {
      ...draft,
      name: draft.name.trim(),
      phone: draft.phone?.trim() || undefined,
      email: draft.email?.trim() || undefined,
      role_key: roleKey,
      role: roleLabel(roleKey),
      status: draft.status || "active",
      login_enabled: createLogin,
      login_email: createLogin ? (draft.login_email || draft.email)?.trim() : undefined,
      temporary_password: createLogin ? draft.temporary_password || "ChangeMe_UrbanCastle_2026!" : undefined,
      force_password_change: createLogin ? draft.force_password_change !== false : false,
      attendance_policy: policy,
    };
    if (isNew) {
      addStaff(payload);
      toast.success(`Staff "${payload.name}" created`);
    } else if (staff) {
      updateStaff(staff.id, payload);
      toast.success(`Staff "${payload.name}" updated`);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-5xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isNew ? <UserPlus className="h-4 w-4 text-primary"/> : <Pencil className="h-4 w-4 text-primary"/>}
            {isNew ? "Add Staff Operations Profile" : "Edit Staff Operations Profile"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Staff profile, login identity, role permissions, attendance policy, salary, documents and lifecycle status stay connected.
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
              <div>{fieldLabel("Phone")}<Input value={draft.phone || ""} onChange={(e) => patch({ phone: sanitizeIndianMobile(e.target.value) })} placeholder="9876543210" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} className="h-9"/></div>
              <div>{fieldLabel("Email")}<Input value={draft.email || ""} onChange={(e) => patch({ email: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Department")}<Input value={draft.department || ""} onChange={(e) => patch({ department: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Designation")}<Input value={draft.designation || ""} onChange={(e) => patch({ designation: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("City")}<Input value={draft.city || ""} onChange={(e) => patch({ city: e.target.value })} className="h-9"/></div>
              <div className="md:col-span-2">{fieldLabel("Address")}<Input value={draft.address || ""} onChange={(e) => patch({ address: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Emergency contact")}<Input value={draft.emergency_contact || ""} onChange={(e) => patch({ emergency_contact: e.target.value })} className="h-9"/></div>
            </TabsContent>

            <TabsContent value="login" className="grid gap-3 md:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3 md:col-span-3"><div><p className="text-xs font-semibold">Create staff + login access</p><p className="text-[10px] text-muted-foreground">Turn on when the staff member should sign in and receive role-scoped server permissions.</p></div><Switch checked={createLogin} onCheckedChange={setCreateLogin}/></div>
              <div>{fieldLabel("Login email")}<Input value={draft.login_email || ""} onChange={(e) => patch({ login_email: e.target.value })} disabled={!createLogin} className="h-9"/></div>
              <div>{fieldLabel("Temporary password")}<Input value={draft.temporary_password || ""} onChange={(e) => patch({ temporary_password: e.target.value })} disabled={!createLogin} placeholder="ChangeMe_UrbanCastle_2026!" className="h-9"/></div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3"><div><p className="text-xs font-semibold">Force password change</p><p className="text-[10px] text-muted-foreground">Required before live deployment.</p></div><Switch checked={draft.force_password_change !== false} onCheckedChange={(v) => patch({ force_password_change: v })} disabled={!createLogin}/></div>
            </TabsContent>

            <TabsContent value="access" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Controlled role")}
                <Select value={normalizeRoleKey(draft.role_key || draft.role)} onValueChange={(value) => patch({ role_key: value as StaffRoleKey, role: roleLabel(value) })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAFF_ROLE_KEYS.map((key) => <SelectItem key={key} value={key}>{STAFF_ROLE_LABELS[key]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>{fieldLabel("Reporting manager")}<Select value={draft.reporting_manager_id || "none"} onValueChange={(value) => patch({ reporting_manager_id: value === "none" ? undefined : value })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{db.master.staff.filter((s) => s.id !== staffId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs"><ShieldCheck className="mb-1 h-4 w-4 text-primary"/><p className="font-semibold">Permissions are role-matrix driven</p><p className="mt-1 text-muted-foreground">UI visibility and server mutation checks use the same role key, not free text labels.</p></div>
            </TabsContent>

            <TabsContent value="attendance" className="grid gap-3 md:grid-cols-4">
              <div>{fieldLabel("Office name")}<Input value={policy.office_name || ""} onChange={(e) => patchPolicy({ office_name: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Office latitude")}<Input type="number" value={policy.office_latitude ?? ""} onChange={(e) => patchPolicy({ office_latitude: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
              <div>{fieldLabel("Office longitude")}<Input type="number" value={policy.office_longitude ?? ""} onChange={(e) => patchPolicy({ office_longitude: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
              <div>{fieldLabel("Geofence radius m")}<Input type="number" value={policy.geofence_radius_m} onChange={(e) => patchPolicy({ geofence_radius_m: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Check-in time")}<Input value={policy.standard_check_in_time} onChange={(e) => patchPolicy({ standard_check_in_time: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Late grace min")}<Input type="number" value={policy.late_grace_minutes} onChange={(e) => patchPolicy({ late_grace_minutes: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Half-day min")}<Input type="number" value={policy.minimum_half_day_minutes} onChange={(e) => patchPolicy({ minimum_half_day_minutes: Number(e.target.value || 0) })} className="h-9"/></div>
              <div>{fieldLabel("Auto absent after")}<Input value={policy.auto_absent_after} onChange={(e) => patchPolicy({ auto_absent_after: e.target.value })} className="h-9"/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-in</span><Switch checked={policy.auto_check_in_enabled} onCheckedChange={(v) => patchPolicy({ auto_check_in_enabled: v })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto check-out</span><Switch checked={policy.auto_check_out_enabled} onCheckedChange={(v) => patchPolicy({ auto_check_out_enabled: v })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Auto absent</span><Switch checked={policy.auto_absent_enabled} onCheckedChange={(v) => patchPolicy({ auto_absent_enabled: v })}/></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs font-semibold">Salary deduction</span><Switch checked={policy.absent_deduction_enabled} onCheckedChange={(v) => patchPolicy({ absent_deduction_enabled: v })}/></div>
            </TabsContent>

            <TabsContent value="salary" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Salary type")}<Select value={draft.salary_type || "monthly"} onValueChange={(value) => patch({ salary_type: value as Staff["salary_type"] })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly salary</SelectItem><SelectItem value="daily_wage">Daily wage</SelectItem><SelectItem value="contract">Contract</SelectItem></SelectContent></Select></div>
              <div>{fieldLabel("Monthly salary ₹")}<Input type="number" value={draft.monthly_salary ?? ""} onChange={(e) => patch({ monthly_salary: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
              <div>{fieldLabel("Daily wage ₹")}<Input type="number" value={draft.daily_wage ?? ""} onChange={(e) => patch({ daily_wage: e.target.value ? Number(e.target.value) : undefined })} className="h-9"/></div>
              <div className="md:col-span-3 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">Payroll is generated from attendance, leave, overtime, advances and salary adjustments. Staff can see deduction reasons on the salary calendar.</div>
            </TabsContent>

            <TabsContent value="documents" className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs"><p className="font-semibold">Document placeholders</p><p className="mt-1 text-muted-foreground">Photo, Aadhaar/PAN, address proof, bank proof and ID files are stored as staff document records linked to file assets.</p></div>
              <div>{fieldLabel("Known document IDs")}<Input value={(draft.document_ids || []).join(", ")} onChange={(e) => patch({ document_ids: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} className="h-9"/></div>
            </TabsContent>

            <TabsContent value="status" className="grid gap-3 md:grid-cols-3">
              <div>{fieldLabel("Lifecycle status")}<Select value={String(draft.status || "active")} onValueChange={(value) => patch({ status: value as Staff["status"] })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
              <div>{fieldLabel("Joining date")}<Input value={draft.joining_date || ""} onChange={(e) => patch({ joining_date: e.target.value })} className="h-9"/></div>
              <div>{fieldLabel("Exit date")}<Input value={draft.exit_date || ""} onChange={(e) => patch({ exit_date: e.target.value })} className="h-9"/></div>
              <div className="md:col-span-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">Inactive/exited staff cannot receive new tasks, visits, attendance check-ins or new payroll unless explicitly marked payable by Finance/Owner.</div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!draft.name?.trim()}>{isNew ? <UserPlus className="mr-1 h-3.5 w-3.5"/> : <Pencil className="mr-1 h-3.5 w-3.5"/>}{isNew ? "Create staff" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
