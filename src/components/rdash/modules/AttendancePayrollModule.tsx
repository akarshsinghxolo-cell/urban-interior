"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { Avatar, MetricCard } from "../primitives";
import { formatDateTime, formatINR, formatINRShort, formatDate, relativeDay } from "@/lib/rdash/format";
import { AlertTriangle, Calendar as CalendarIcon, CheckCircle2, Clock, DollarSign, MapPin, Navigation, ShieldCheck, Users, Plus, Wallet, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { coordinateInputError, formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { normalizeAttendancePolicy } from "@/lib/rdash/attendance-policy";
import { MapView } from "../MapView";
import type { SalaryAdjustment } from "@/lib/rdash/types";
function ymd(value: Date) {
    return value.toISOString().slice(0, 10);
}
function currentMonthKey(value = new Date()) {
    return ymd(value).slice(0, 7);
}
const STATUS_META: Record<string, {
    label: string;
    color: string;
}> = {
    present: { label: "Present", color: "bg-success/10 text-success border-success/20" },
    half_day: { label: "Half day", color: "bg-warning/10 text-warning border-warning/20" },
    absent: { label: "Absent", color: "bg-destructive/10 text-destructive border-destructive/20" },
    leave: { label: "On leave", color: "bg-primary/10 text-primary border-primary/20" },
    holiday: { label: "Holiday", color: "bg-muted text-muted-foreground border-border" },
};
export function AttendancePayrollModule() {
    const db = useRDashStore((s) => s.db);
    const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
    const currentUser = useRDashStore((s) => s.currentUser);
    const updateAttendancePolicy = useRDashStore((s) => s.updateAttendancePolicy);
    const checkInAttendance = useRDashStore((s) => s.checkInAttendance);
    const checkOutAttendance = useRDashStore((s) => s.checkOutAttendance);
    const runAttendanceReconciliation = useRDashStore((s) => s.runAttendanceReconciliation);
    const regularizeAttendance = useRDashStore((s) => s.regularizeAttendance);
    const computeStaffSalary = useRDashStore((s) => s.computeStaffSalary);
    // F: payroll lifecycle actions.
    const createPayrollPeriod = useRDashStore((s) => s.createPayrollPeriod);
    const approvePayrollPeriod = useRDashStore((s) => s.approvePayrollPeriod);
    const payPayrollPeriod = useRDashStore((s) => s.payPayrollPeriod);
    const reopenPayrollPeriod = useRDashStore((s) => s.reopenPayrollPeriod);
    const addSalaryAdjustment = useRDashStore((s) => s.addSalaryAdjustment);
    const user = currentUser();
    const isPolicyManager = role === "Owner" || role === "Operations Manager";
    const isPayrollManager = role === "Owner" || role === "Operations Manager" || role === "Accounts / Admin";
    const isOwner = role === "Owner";
    const activeStaff = React.useMemo(() => db.master.staff.filter((staff) => staff.status === "active"), [db.master.staff]);
    const defaultPolicyStaff = activeStaff.find((staff) => staff.id === user.staffId) || activeStaff[0] || db.master.staff[0];
    const disposedRef = React.useRef(false);
    React.useEffect(() => { disposedRef.current = false; /* StrictMode dev remount */ return () => { disposedRef.current = true; }; }, []);  // STAGE-4-FIX: unmount guard
    const [weekOffset, setWeekOffset] = React.useState(0);
    const [attendanceMode, setAttendanceMode] = React.useState<"office" | "field_visit">("office");
    const [selectedVisitId, setSelectedVisitId] = React.useState("");
    const [capturing, setCapturing] = React.useState<"check-in" | "check-out" | "office" | null>(null);
    const [selectedPolicyStaffId, setSelectedPolicyStaffId] = React.useState(defaultPolicyStaff?.id || "");
    const [officeName, setOfficeName] = React.useState(defaultPolicyStaff?.attendance_policy?.office_name || "");
    const [officeCoordinateInput, setOfficeCoordinateInput] = React.useState("");
    // Regularize attendance dialog state — for reversing wrongly auto-marked absences.
    const [regularizeRecordId, setRegularizeRecordId] = React.useState<string | null>(null);
    const [regularizeStatus, setRegularizeStatus] = React.useState<"present" | "half_day" | "leave">("present");
    const [regularizeReason, setRegularizeReason] = React.useState("");
    const reconciledRef = React.useRef(false);
    const policyStaff = (db.master.staff.find((staff) => staff.id === selectedPolicyStaffId) || defaultPolicyStaff);
    // MOBILE-QA FIX: the previous inline fallback used stale/wrong keys (geofence_radius_meters,
    // grace_minutes, half_day_hours...) so every "Verification rules" sentence and the policy form
    // rendered with empty numbers whenever a staff row had no attendance_policy yet.
    const policy = React.useMemo(() => normalizeAttendancePolicy(policyStaff?.attendance_policy), [policyStaff?.attendance_policy]);
    React.useEffect(() => {
        if (activeStaff.some((staff) => staff.id === selectedPolicyStaffId))
            return;
        setSelectedPolicyStaffId(defaultPolicyStaff?.id || "");
    }, [activeStaff, defaultPolicyStaff?.id, selectedPolicyStaffId]);
    const updateSelectedPolicy = (patch: Partial<typeof policy>) => {
        if (policyStaff) updateAttendancePolicy(policyStaff.id, patch);
    };
    const openRegularize = (recordId: string) => {
        setRegularizeRecordId(recordId);
        setRegularizeStatus("present");
        setRegularizeReason("");
    };
    const saveRegularize = () => {
        if (!regularizeRecordId) return;
        if (!regularizeReason.trim()) {
            toast.error("A regularization reason is required (audit trail).");
            return;
        }
        try {
            regularizeAttendance(regularizeRecordId, {
                status: regularizeStatus,
                reason: regularizeReason.trim(),
            });
            toast.success("Attendance regularized — original auto-absent record preserved for audit.");
            setRegularizeRecordId(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Regularization failed.");
        }
    };
    React.useEffect(() => {
        setOfficeName(policy.office_name || "");
        setOfficeCoordinateInput(formatCoordinatePair({ latitude: policy.office_latitude, longitude: policy.office_longitude }));
    }, [policy.office_name, policy.office_latitude, policy.office_longitude, policyStaff?.id]);
    React.useEffect(() => {
        if (!isPolicyManager || reconciledRef.current)
            return;
        reconciledRef.current = true;
        runAttendanceReconciliation();
    }, [isPolicyManager, runAttendanceReconciliation]);
    const weekDays = React.useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            return date;
        });
    }, [weekOffset]);
    const assignedVisits = React.useMemo(() => db.visits.filter((visit) => visit.staff_id === user.staffId && ["scheduled", "en_route", "checked_in"].includes(visit.status)), [db.visits, user.staffId]);
    const todayRecord = React.useMemo(() => db.attendance.find((record) => record.staff_id === user.staffId && record.date === ymd(new Date())), [db.attendance, user.staffId]);
    const staffWithAttendance = React.useMemo(() => {
        const month = currentMonthKey();
        return db.master.staff.map((staff) => {
            const records = db.attendance.filter((record) => record.staff_id === staff.id);
            const monthRecords = records.filter((record) => record.date.startsWith(month));
            const weekRecords = weekDays.map((date) => records.find((record) => record.date === ymd(date)));
            const presentDays = monthRecords.filter((record) => record.status === "present").length;
            const halfDays = monthRecords.filter((record) => record.status === "half_day").length;
            const absentDays = monthRecords.filter((record) => record.status === "absent").length;
            const totalMinutes = monthRecords.reduce((sum, record) => sum + (record.work_minutes || 0), 0);
            const monthlySalary = staff.monthly_salary || 0;
            // G: Use computeStaffSalary as the single source of truth. This
            //    includes late-minute deductions + absent-day deductions per
            //    the staff's attendance policy — matching StaffSalaryModule.
            let earnedThisMonth = monthlySalary;
            try {
                const computation = computeStaffSalary(staff.id, month);
                earnedThisMonth = computation.net_salary;
            }
            catch {
                earnedThisMonth = monthlySalary;
            }
            return { ...staff, records, weekRecords, presentDays, halfDays, absentDays, totalMinutes, monthlySalary, earnedThisMonth };
        });
    }, [db.master.staff, db.attendance, weekDays, computeStaffSalary]);
    const totalPresent = db.attendance.filter((record) => record.status === "present" && record.date === ymd(new Date())).length;
    const totalAbsent = db.attendance.filter((record) => record.status === "absent" && record.date === ymd(new Date())).length;
    const totalPayroll = staffWithAttendance.reduce((sum, staff) => sum + staff.monthlySalary, 0);
    const totalEarned = staffWithAttendance.reduce((sum, staff) => sum + staff.earnedThisMonth, 0);
    const capturePosition = (action: "check-in" | "check-out" | "office", callback: (position: GeolocationPosition) => void) => {
        if (!navigator.geolocation) {
            toast.error("Device GPS is required for this attendance action.");
            return;
        }
        setCapturing(action);
        navigator.geolocation.getCurrentPosition((position) => {
        if (disposedRef.current) return;  // STAGE-4-FIX: unmount guard
            try {
                callback(position);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Attendance could not be verified.");
            }
            finally {
                setCapturing(null);
            }
        }, (error) => {
            setCapturing(null);
            toast.error(`Device GPS is required: ${error.message}`);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };
    const startAttendance = () => {
        if (attendanceMode === "field_visit" && !selectedVisitId) {
            toast.error("Select the assigned Visit used for field attendance.");
            return;
        }
        capturePosition("check-in", (position) => {
            const recordId = checkInAttendance({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy_m: position.coords.accuracy,
                captured_at: new Date().toISOString(),
                visit_id: attendanceMode === "field_visit" ? selectedVisitId : undefined,
                action_source: "manual",
            });
            toast.success(`Verified attendance check-in recorded (${recordId})`);
        });
    };
    const endAttendance = () => {
        capturePosition("check-out", (position) => {
            checkOutAttendance({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy_m: position.coords.accuracy,
                captured_at: new Date().toISOString(),
                action_source: "manual",
            });
            toast.success("Verified attendance check-out recorded");
        });
    };
    const captureOffice = () => {
        if (!isPolicyManager) {
            toast.error("Only Owner or Operations Manager can configure the office geofence.");
            return;
        }
        capturePosition("office", (position) => {
            updateSelectedPolicy({
                office_name: officeName.trim() || "Office",
                office_latitude: position.coords.latitude,
                office_longitude: position.coords.longitude,
            });
            toast.success(`Office GPS geofence configured for ${policyStaff.name}`);
        });
    };
    const saveOfficeName = () => {
        try {
            updateSelectedPolicy({ office_name: officeName.trim() || "Office" });
            toast.success(`Office name updated for ${policyStaff.name}`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Office name could not be updated.");
        }
    };
    const saveOfficeCoordinates = () => {
        const coordinates = parseCoordinatePair(officeCoordinateInput);
        if (!coordinates) {
            toast.error(coordinateInputError(officeCoordinateInput) || "Office coordinates are required.");
            return;
        }
        try {
            updateSelectedPolicy({ office_latitude: coordinates.latitude, office_longitude: coordinates.longitude });
            setOfficeCoordinateInput(formatCoordinatePair(coordinates));
            toast.success(`Office geofence coordinates updated for ${policyStaff.name}`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Office coordinates could not be updated.");
        }
    };
    const reconcileNow = () => {
        try {
            const created = runAttendanceReconciliation();
            toast.success(created ? `${created} missing attendance record(s) marked absent` : "Attendance is already reconciled for the current cutoff");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Attendance reconciliation could not run.");
        }
    };
    if (!policyStaff) {
        return (<div className="flex flex-col gap-5">
            <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Clock className="h-5 w-5"/></span>
                <div>
                    <h2 className="text-lg font-bold tracking-tight">Attendance & Payroll</h2>
                    <p className="text-xs text-muted-foreground">Staff attendance, office geofence, salary and payroll</p>
                </div>
            </div>
            <div className="rd-dot-bg flex flex-col items-center justify-center gap-3 rounded-[var(--panel-radius)] border border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent px-6 py-12 text-center">
                <div className="flex h-14 w-14 animate-scale-in items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-card ring-1 ring-inset ring-border">
                    <Clock className="h-6 w-6"/>
                </div>
                <div>
                    <p className="text-sm font-semibold text-foreground">No staff set up yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Add staff members in Master Setup to configure attendance policies, office geofence, and payroll tracking.</p>
                </div>
            </div>
        </div>);
    }
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Clock className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Attendance & Payroll</h2>
            <p className="text-xs text-muted-foreground">Verified GPS attendance, hours, absence reconciliation and salary view</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setWeekOffset((week) => week - 1)}>← Prev week</Button>
          <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>This week</Button>
          <Button size="sm" variant="outline" onClick={() => setWeekOffset((week) => week + 1)}>Next week →</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Staff" value={db.master.staff.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Present today" value={totalPresent} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Absent today" value={totalAbsent} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Monthly payroll" value={formatINRShort(totalPayroll)} tone="warning" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>

      <section className="rounded-[var(--panel-radius)] border border-primary/25 bg-primary/[0.035] shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/15 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary"/> My verified attendance</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{user.name} · {user.role}. Planned Site coordinates are never accepted as device GPS.</p>
            <p className="mt-1 text-[11px] text-primary">Automatic geofence runs while the app is open. If GPS permission, accuracy, or background access fails, use Manual Check-in / Check-out below.</p>
          </div>
          {todayRecord && <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", STATUS_META[todayRecord.status]?.color)}>{STATUS_META[todayRecord.status]?.label || todayRecord.status}</span>}
        </div>
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            {!todayRecord?.check_in ? (<>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1"><span className="text-[10px] font-semibold uppercase text-muted-foreground">Attendance location</span><select value={attendanceMode} onChange={(event) => setAttendanceMode(event.target.value as "office" | "field_visit")} className="h-9 rounded-md border border-input bg-card px-2 text-sm"><option value="office">Office geofence</option><option value="field_visit">Assigned field Visit</option></select></label>
                  {attendanceMode === "field_visit" && <label className="grid gap-1"><span className="text-[10px] font-semibold uppercase text-muted-foreground">Assigned Visit</span><select value={selectedVisitId} onChange={(event) => setSelectedVisitId(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm"><option value="">Select Visit</option>{assignedVisits.map((visit) => <option key={visit.id} value={visit.id}>{visit.location_name} · {visit.visit_type}</option>)}</select></label>}
                </div>
                <Button size="sm" onClick={startAttendance} disabled={capturing !== null}><Navigation className={cn("mr-1.5 h-3.5 w-3.5", capturing === "check-in" && "animate-spin")}/>{capturing === "check-in" ? "Verifying GPS…" : "Manual Check-in"}</Button>
              </>) : !todayRecord.check_out ? (<Button size="sm" onClick={endAttendance} disabled={capturing !== null}><Navigation className={cn("mr-1.5 h-3.5 w-3.5", capturing === "check-out" && "animate-spin")}/>{capturing === "check-out" ? "Verifying GPS…" : "Manual Check-out"}</Button>) : <p className="text-sm font-semibold text-success">Attendance is complete for today.</p>}
            {todayRecord && <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-3 text-xs"><div><p className="text-[10px] uppercase text-muted-foreground">Check-in</p><p className="mt-0.5 font-medium">{todayRecord.check_in ? formatDateTime(todayRecord.check_in) : "—"}</p></div><div><p className="text-[10px] uppercase text-muted-foreground">Check-out</p><p className="mt-0.5 font-medium">{todayRecord.check_out ? formatDateTime(todayRecord.check_out) : "—"}</p></div><div><p className="text-[10px] uppercase text-muted-foreground">Mode</p><p className="mt-0.5 font-medium">{todayRecord.attendance_mode === "field_visit" ? "Field Visit" : todayRecord.attendance_mode === "office" ? "Office" : todayRecord.attendance_mode}</p></div><div><p className="text-[10px] uppercase text-muted-foreground">Verification</p><p className="mt-0.5 font-medium">{todayRecord.check_in_verification === "verified" ? `Verified · ${todayRecord.check_in_distance_m ?? "—"} m` : "Pending"}</p></div>{todayRecord.late && <p className="col-span-2 text-warning">Late by {todayRecord.late_minutes} minute(s) after the configured grace period.</p>}{todayRecord.review_required && <p className="col-span-2 text-warning">Review required: {todayRecord.review_note}</p>}</div>}
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-xs"><p className="font-semibold">Verification rules</p><div className="mt-2 space-y-1.5 text-muted-foreground"><p>Office: within {policy.geofence_radius_m} m of {policy.office_name || "configured office"}.</p><p>Field Visit: within {policy.visit_geofence_radius_m} m of the planned Site.</p><p>GPS accuracy: {policy.max_gps_accuracy_m} m or better.</p><p>Half day: below {policy.minimum_half_day_minutes} verified working minutes.</p><p>Late grace: {policy.late_grace_minutes} minutes after {policy.standard_check_in_time}.</p></div></div>
        </div>
      </section>

      <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Attendance policy & office geofence</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Each staff member has an independent attendance policy, office geofence, GPS tolerance, dwell time, cutoff and salary-deduction rule.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Policy for staff</span>
              <select value={policyStaff.id} disabled={!isPolicyManager} onChange={(event) => setSelectedPolicyStaffId(event.target.value)} className="h-8 min-w-48 rounded-md border border-input bg-card px-2 text-xs outline-none ring-ring focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70">
                {activeStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} · {staff.role}</option>)}
              </select>
            </label>
            {isPolicyManager && <Button size="sm" variant="outline" onClick={reconcileNow}>Run due reconciliation</Button>}
          </div>
        </div>
        <div className="border-b border-border/70 bg-primary/[0.035] px-4 py-2 text-[11px] text-muted-foreground">
          Editing <span className="font-semibold text-foreground">{policyStaff.name}</span>’s policy. Changes do not alter any other staff member.
        </div>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/10 p-3"><p className="mb-2 text-xs font-semibold">Office location · {policyStaff.name}</p><div className="flex gap-2"><Input value={officeName} disabled={!isPolicyManager} onChange={(event) => setOfficeName(event.target.value)} placeholder="Office / shop name" className="h-8 text-xs"/><Button size="sm" variant="outline" disabled={!isPolicyManager} onClick={saveOfficeName}>Save</Button></div><div className="mt-2 flex gap-2"><Input value={officeCoordinateInput} disabled={!isPolicyManager} onChange={(event) => setOfficeCoordinateInput(event.target.value)} placeholder="GPS coordinates: 26.739800, 83.371200" className="h-8 text-xs"/><Button size="sm" variant="outline" disabled={!isPolicyManager} onClick={saveOfficeCoordinates}>Save GPS</Button></div><Button size="sm" className="mt-2 w-full" disabled={!isPolicyManager || capturing !== null} onClick={captureOffice}><MapPin className={cn("mr-1.5 h-3.5 w-3.5", capturing === "office" && "animate-spin")}/>{policy.office_latitude != null ? "Recapture Office GPS" : "Capture Office GPS"}</Button>{policy.office_latitude != null && policy.office_longitude != null ? <MapView title="Office geofence" points={[{ id: "office-geofence", label: policy.office_name || "Office", latitude: policy.office_latitude, longitude: policy.office_longitude, status: "scheduled" }]} geofenceRadiusM={policy.geofence_radius_m} className="mt-2 h-40 min-h-40"/> : <p className="mt-2 text-[10px] text-muted-foreground">No office GPS configured — office check-in is blocked.</p>}</div>
          <PolicyToggle label="Auto-present from verified GPS" hint="A verified field Visit check-in can create attendance for the assigned Field Staff." checked={policy.auto_present_from_gps} disabled={!isPolicyManager} onCheckedChange={(checked) => updateSelectedPolicy({ auto_present_from_gps: checked })}/>
          <PolicyToggle label="Automatic geofence" hint="Automatically records verified office attendance and assigned Site/Vendor Visit entry/exit while the app remains open." checked={policy.auto_geofence_enabled} disabled={!isPolicyManager} onCheckedChange={(checked) => updateSelectedPolicy({ auto_geofence_enabled: checked })}/>
          <PolicyToggle label="Automatic check-in" hint="After the device remains inside a registered geofence for the configured dwell period." checked={policy.auto_check_in_enabled} disabled={!isPolicyManager || !policy.auto_geofence_enabled} onCheckedChange={(checked) => updateSelectedPolicy({ auto_check_in_enabled: checked })}/>
          <PolicyToggle label="Automatic check-out" hint="After the device remains outside the wider exit boundary; manual checkout always remains available." checked={policy.auto_check_out_enabled} disabled={!isPolicyManager || !policy.auto_geofence_enabled} onCheckedChange={(checked) => updateSelectedPolicy({ auto_check_out_enabled: checked })}/>
          <PolicyToggle label="Auto-absent cutoff" hint="At the cutoff, missing active staff are marked absent and flagged for review." checked={policy.auto_absent_enabled} disabled={!isPolicyManager} onCheckedChange={(checked) => updateSelectedPolicy({ auto_absent_enabled: checked })}/>
          <PolicyToggle label="Absence salary deduction" hint={`${policy.absent_deduction_days} day of pay is deducted for each confirmed absence.`} checked={policy.absent_deduction_enabled} disabled={!isPolicyManager} onCheckedChange={(checked) => updateSelectedPolicy({ absent_deduction_enabled: checked })}/>
          <PolicyNumber label="Office geofence radius" suffix="m" value={policy.geofence_radius_m} min={20} disabled={!isPolicyManager} onChange={(value) => updateSelectedPolicy({ geofence_radius_m: value })}/>
          <PolicyNumber label="Field Visit geofence radius" suffix="m" value={policy.visit_geofence_radius_m} min={20} disabled={!isPolicyManager} onChange={(value) => updateSelectedPolicy({ visit_geofence_radius_m: value })}/>
          <PolicyNumber label="Maximum GPS accuracy" suffix="m" value={policy.max_gps_accuracy_m} min={5} disabled={!isPolicyManager} onChange={(value) => updateSelectedPolicy({ max_gps_accuracy_m: value })}/>
          <PolicyNumber label="Automatic entry dwell" suffix="sec" value={policy.auto_entry_dwell_seconds} min={15} disabled={!isPolicyManager || !policy.auto_geofence_enabled} onChange={(value) => updateSelectedPolicy({ auto_entry_dwell_seconds: value })}/>
          <PolicyNumber label="Automatic exit dwell" suffix="sec" value={policy.auto_exit_dwell_seconds} min={30} disabled={!isPolicyManager || !policy.auto_geofence_enabled} onChange={(value) => updateSelectedPolicy({ auto_exit_dwell_seconds: value })}/>
          <PolicyNumber label="Automatic exit buffer" suffix="m" value={policy.auto_exit_buffer_m} min={10} disabled={!isPolicyManager || !policy.auto_geofence_enabled} onChange={(value) => updateSelectedPolicy({ auto_exit_buffer_m: value })}/>
          <PolicyNumber label="Late grace period" suffix="min" value={policy.late_grace_minutes} min={0} disabled={!isPolicyManager} onChange={(value) => updateSelectedPolicy({ late_grace_minutes: value })}/>
          <PolicyNumber label="Half-day threshold" suffix="min" value={policy.minimum_half_day_minutes} min={1} disabled={!isPolicyManager} onChange={(value) => updateSelectedPolicy({ minimum_half_day_minutes: value })}/>
          <label className="grid gap-1.5"><span className="text-xs font-medium text-foreground">Scheduled check-in time</span><Input type="time" value={policy.standard_check_in_time} disabled={!isPolicyManager} onChange={(event) => updateSelectedPolicy({ standard_check_in_time: event.target.value })}/></label>
          <label className="grid gap-1.5"><span className="text-xs font-medium text-foreground">Auto-absent after</span><Input type="time" value={policy.auto_absent_after} disabled={!isPolicyManager || !policy.auto_absent_enabled} onChange={(event) => updateSelectedPolicy({ auto_absent_after: event.target.value })}/><span className="text-[10px] text-muted-foreground">Runs when this operational workspace opens or when Operations runs reconciliation.</span></label>
        </div>
      </section>

      <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2"><h3 className="text-sm font-semibold">Week attendance</h3><span className="text-[11px] text-muted-foreground">{weekDays[0].toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – {weekDays[6].toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span></div>
        <div className="overflow-x-auto rd-scroll"><table className="w-full text-xs"><thead><tr className="border-b border-border bg-muted/20"><th className="sticky left-0 z-10 bg-muted/20 px-3 py-2 text-left font-semibold text-muted-foreground">Staff</th>{weekDays.map((date) => <th key={ymd(date)} className={cn("px-2 py-2 text-center font-semibold", ymd(date) === ymd(new Date()) ? "bg-primary/10 text-primary" : "text-muted-foreground")}><div>{date.toLocaleDateString("en-IN", { weekday: "short" })}</div><div className="text-[10px] font-normal">{date.getDate()}</div></th>)}</tr></thead><tbody>{staffWithAttendance.map((staff) => <tr key={staff.id} className="border-b border-border last:border-0 hover:bg-accent/20"><td className="sticky left-0 z-10 bg-card px-3 py-2"><div className="flex items-center gap-2"><Avatar name={staff.name} size={28}/><div><p className="font-medium text-foreground">{staff.name}</p><p className="text-[10px] text-muted-foreground">{staff.role}</p></div></div></td>{staff.weekRecords.map((record, index) => <td key={index} className="px-2 py-2 text-center">{record ? (record.review_required || record.auto_generated) && isPolicyManager ? <button type="button" title={record.review_note || "Auto-marked — click to regularize"} onClick={() => openRegularize(record.id)} className={cn("inline-flex items-center justify-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-all hover:ring-2 hover:ring-warning/30", STATUS_META[record.status]?.color, "ring-1 ring-warning/40")}>{record.status === "present" ? "P" : record.status === "half_day" ? "½" : record.status === "absent" ? "A" : record.status === "leave" ? "L" : "H"}<span className="text-[8px]">⚠</span></button> : <span title={record.review_note || record.location} className={cn("inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", STATUS_META[record.status]?.color)}>{record.status === "present" ? "P" : record.status === "half_day" ? "½" : record.status === "absent" ? "A" : record.status === "leave" ? "L" : "H"}</span> : <span className="text-[10px] text-muted-foreground/40">—</span>}</td>)}</tr>)}</tbody></table></div>
      </div>

      <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card"><div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2"><h3 className="text-sm font-semibold">Payroll summary (this month)</h3><span className="text-[11px] text-muted-foreground">Verified attendance only</span></div><div className="divide-y divide-border">{staffWithAttendance.map((staff) => { const earnedPct = staff.monthlySalary > 0 ? Math.round((staff.earnedThisMonth / staff.monthlySalary) * 100) : 0; return <div key={staff.id} className="flex items-center gap-3 px-4 py-2.5"><Avatar name={staff.name} size={36}/><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between"><p className="truncate text-sm font-semibold">{staff.name}</p><span className="text-xs text-muted-foreground">{staff.role} · {staff.city}</span></div><div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground"><span>{staff.presentDays} present · {staff.halfDays} half · {staff.absentDays} absent</span><span>· {Math.round(staff.totalMinutes / 60)}h verified</span></div><div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", earnedPct >= 80 ? "bg-success" : earnedPct >= 50 ? "bg-primary" : "bg-warning")} style={{ width: `${Math.min(100, earnedPct)}%` }}/></div><span className="text-[10px] font-mono text-muted-foreground">{earnedPct}%</span></div></div><div className="text-right"><p className="text-xs font-mono font-semibold text-foreground">{formatINR(Math.round(staff.earnedThisMonth))}</p><p className="text-[10px] text-muted-foreground">of {formatINR(staff.monthlySalary)}</p></div></div>; })}</div><div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5"><span className="text-xs font-semibold">Total earned this month</span><div className="text-right"><p className="text-sm font-mono font-bold text-foreground">{formatINR(Math.round(totalEarned))}</p><p className="text-[10px] text-muted-foreground">of {formatINR(totalPayroll)} payroll</p></div></div></div>

      {/* F: Payroll period lifecycle — generate, approve, pay, reopen. */}
      {isPayrollManager && <PayrollPeriodsSection
        db={db}
        isOwner={isOwner}
        onGenerate={() => {
            const now = new Date();
            try {
                const id = createPayrollPeriod(now.getMonth() + 1, now.getFullYear());
                toast.success(`Payroll generated (${id})`);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not generate payroll");
            }
        }}
        onApprove={(id) => {
            try { approvePayrollPeriod(id); toast.success("Payroll approved"); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Approval blocked"); }
        }}
        onPay={(id) => {
            try { payPayrollPeriod(id); toast.success("Payroll marked paid"); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Mark-paid blocked"); }
        }}
        onReopen={(id) => {
            try { reopenPayrollPeriod(id); toast.success("Payroll reopened"); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Reopen blocked"); }
        }}
      />}

      {/* F: Salary adjustments — overtime / advance / deduction / bonus / hold. */}
      {isPayrollManager && <SalaryAdjustmentsSection
        db={db}
        onAdd={(staffId, type, amount, reason) => {
            try { addSalaryAdjustment(staffId, type, amount, reason); toast.success("Adjustment recorded"); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Could not add adjustment"); }
        }}
      />}

      {/* Regularize Attendance Dialog — reverses wrongly auto-marked absences */}
      {regularizeRecordId && (() => {
        const record = db.attendance.find((r) => r.id === regularizeRecordId);
        const staffName = record?.staff_name || "Staff";
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-bold"><AlertTriangle className="h-4 w-4 text-warning"/>Regularize Attendance</h2>
                <Button size="sm" variant="ghost" onClick={() => setRegularizeRecordId(null)}>Close</Button>
              </div>
              <div className="space-y-3">
                <div className="rounded-md border border-warning/40 bg-warning/[0.06] p-3">
                  <p className="text-xs font-semibold text-warning">{staffName} · {record?.date}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Current status: <strong>{record?.status}</strong> (auto-generated: {record?.auto_generated ? "yes" : "no"})</p>
                  {record?.review_note && <p className="mt-1 text-[11px] text-muted-foreground">Review note: {record.review_note}</p>}
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Corrected status *</span>
                  <select value={regularizeStatus} onChange={(e) => setRegularizeStatus(e.target.value as "present" | "half_day" | "leave")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="present">Present</option>
                    <option value="half_day">Half day</option>
                    <option value="leave">On leave</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-warning">Reason (required for audit trail) *</span>
                  <Textarea value={regularizeReason} onChange={(e) => setRegularizeReason(e.target.value)} placeholder="e.g. Staff was on an off-geofence site visit; phone battery died; bad GPS signal in basement." rows={3}/>
                </label>
                <p className="text-[11px] text-muted-foreground">The original auto-absent record is preserved (auto_generated stays true) so the correction trail is visible in the audit log.</p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setRegularizeRecordId(null)}>Cancel</Button>
                  <Button onClick={saveRegularize} disabled={!regularizeReason.trim()}>Regularize</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>);
}
function PolicyToggle({ label, hint, checked, disabled, onCheckedChange }: {
    label: string;
    hint: string;
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
}) {
    return <div className="flex items-start justify-between gap-3 rounded-lg border border-border/80 bg-muted/10 px-3 py-3"><div className="min-w-0"><p className="text-xs font-semibold text-foreground">{label}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{hint}</p></div><Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label}/></div>;
}
function PolicyNumber({ label, suffix, value, min, max, step = 1, disabled = false, onChange }: {
    label: string;
    suffix: string;
    value: number;
    min: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    onChange: (value: number) => void;
}) {
    return <label className="grid gap-1.5"><span className="text-xs font-medium text-foreground">{label}</span><div className="flex items-center gap-2"><Input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next))
        onChange(Math.max(min, max === undefined ? next : Math.min(max, next))); }}/><span className="whitespace-nowrap text-[10px] text-muted-foreground">{suffix}</span></div></label>;
}

// F: Payroll periods section — list existing periods + Generate / Approve / Pay / Reopen buttons.
function PayrollPeriodsSection({ db, isOwner, onGenerate, onApprove, onPay, onReopen }: {
    db: import("@/lib/rdash/types").RDashDatabase;
    isOwner: boolean;
    onGenerate: () => void;
    onApprove: (id: string) => void;
    onPay: (id: string) => void;
    onReopen: (id: string) => void;
}) {
    const periods = (db.payrollPeriods || []).slice().sort((a, b) => (b.year - a.year) || (b.month - a.month));
    const lines = db.payrollLines || [];
    const statusTone: Record<string, string> = {
        generated: "bg-warning/10 text-warning border-warning/20",
        approved: "bg-primary/10 text-primary border-primary/20",
        paid: "bg-success/10 text-success border-success/20",
        cancelled: "bg-muted text-muted-foreground border-border",
        draft: "bg-muted text-muted-foreground border-border",
    };
    return (<div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary"/> Payroll periods</h3>
          <p className="text-[11px] text-muted-foreground">Generate, approve, and pay monthly payroll. Lines auto-created from computeStaffSalary.</p>
        </div>
        <Button size="sm" onClick={onGenerate}><Plus className="mr-1 h-3.5 w-3.5"/> Generate payroll (this month)</Button>
      </div>
      {periods.length === 0 ? (<p className="px-4 py-6 text-center text-xs text-muted-foreground">No payroll periods yet. Click "Generate payroll" to create one for the current month.</p>) : (<div className="divide-y divide-border">
        {periods.map((p) => {
            const periodLines = lines.filter((l) => l.payroll_period_id === p.id);
            const totalNet = periodLines.reduce((n, l) => n + l.net_payable, 0);
            return (<div key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{p.month}/{p.year}</p>
                  <p className="text-[11px] text-muted-foreground">{periodLines.length} staff · net payable {formatINR(Math.round(totalNet))}</p>
                  {p.approved_at && <p className="text-[10px] text-muted-foreground">Approved {formatDate(p.approved_at)}</p>}
                  {p.paid_at && <p className="text-[10px] text-success">Paid {formatDate(p.paid_at)}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", statusTone[p.status] || statusTone.draft)}>{p.status}</span>
                  {p.status === "generated" && isOwner && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onApprove(p.id)}><CheckCircle2 className="mr-1 h-3 w-3"/> Approve</Button>}
                  {p.status === "approved" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPay(p.id)}><DollarSign className="mr-1 h-3 w-3"/> Mark paid</Button>}
                  {(p.status === "approved" || p.status === "paid") && isOwner && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onReopen(p.id)}>Reopen</Button>}
                </div>
              </div>
            </div>);
        })}
      </div>)}
    </div>);
}

// F: Salary adjustments panel — add overtime / advance / deduction / bonus / hold.
function SalaryAdjustmentsSection({ db, onAdd }: {
    db: import("@/lib/rdash/types").RDashDatabase;
    onAdd: (staffId: string, type: SalaryAdjustment["type"], amount: number, reason: string) => void;
}) {
    const [staffId, setStaffId] = React.useState<string>(db.master.staff[0]?.id || "");
    const [type, setType] = React.useState<SalaryAdjustment["type"]>("overtime");
    const [amount, setAmount] = React.useState<string>("");
    const [reason, setReason] = React.useState("");
    const adjustments = (db.salaryAdjustments || []).slice().slice(0, 10);
    const typeTone: Record<string, string> = {
        overtime: "bg-success/10 text-success border-success/20",
        bonus: "bg-success/10 text-success border-success/20",
        advance: "bg-warning/10 text-warning border-warning/20",
        deduction: "bg-destructive/10 text-destructive border-destructive/20",
        hold: "bg-muted text-muted-foreground border-border",
    };
    const submit = () => {
        const amt = parseFloat(amount);
        if (!staffId) { toast.error("Select a staff member."); return; }
        if (!Number.isFinite(amt) || amt <= 0) { toast.error("Amount must be a positive number."); return; }
        if (!reason.trim()) { toast.error("Reason is required (audit trail)."); return; }
        onAdd(staffId, type, amt, reason.trim());
        setAmount("");
        setReason("");
    };
    return (<div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="border-b border-border bg-muted/30 px-4 py-2">
        <h3 className="text-sm font-semibold">Salary adjustments</h3>
        <p className="text-[11px] text-muted-foreground">Overtime / bonus / advance / deduction / hold — used by the next payroll run.</p>
      </div>
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_1fr_1fr_2fr_auto]">
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          {db.master.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as SalaryAdjustment["type"])} className="h-9 rounded-md border border-input bg-card px-2 text-sm capitalize">
            <option value="overtime">Overtime (+)</option>
            <option value="bonus">Bonus (+)</option>
            <option value="advance">Advance (−)</option>
            <option value="deduction">Deduction (−)</option>
            <option value="hold">Hold (−)</option>
        </select>
        <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ amount" className="h-9 text-sm"/>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit trail)" className="h-9 text-sm"/>
        <Button size="sm" onClick={submit}><Plus className="mr-1 h-3.5 w-3.5"/> Add</Button>
      </div>
      {adjustments.length > 0 && (<div className="border-t border-border px-4 py-2">
        <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Recent adjustments</p>
        <div className="max-h-40 overflow-y-auto rd-scroll space-y-1">
          {adjustments.map((a) => {
              const staff = db.master.staff.find((s) => s.id === a.staff_id);
              return (<div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{staff?.name || "Unknown"} · <span className="capitalize">{a.type}</span></p>
                  <p className="truncate text-[10px] text-muted-foreground">{a.reason}</p>
                </div>
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", typeTone[a.type] || typeTone.hold)}>
                  {formatINR(a.amount)} · {a.status}
                </span>
              </div>);
          })}
        </div>
      </div>)}
    </div>);
}
