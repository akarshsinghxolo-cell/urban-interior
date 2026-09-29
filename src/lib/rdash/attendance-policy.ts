import type { AttendancePolicy, RDashDatabase } from "./types";
export function createDefaultAttendancePolicy(): AttendancePolicy {
    return {
        office_name: "Office location not configured",
        geofence_radius_m: 120,
        visit_geofence_radius_m: 120,
        max_gps_accuracy_m: 75,
        standard_check_in_time: "09:30",
        minimum_half_day_minutes: 240,
        auto_present_from_gps: true,
        auto_geofence_enabled: true,
        auto_check_in_enabled: true,
        auto_check_out_enabled: true,
        auto_entry_dwell_seconds: 60,
        auto_exit_dwell_seconds: 180,
        auto_exit_buffer_m: 60,
        auto_absent_enabled: true,
        auto_absent_after_minutes: 90,
        late_grace_minutes: 20,
        absent_deduction_enabled: true,
        absent_deduction_days: 1,
    };
}
export function normalizeAttendancePolicy(policy: Partial<AttendancePolicy> | null | undefined): AttendancePolicy {
    const merged = { ...createDefaultAttendancePolicy(), ...(policy || {}) };
    const autoAbsentMinutes = Number(merged.auto_absent_after_minutes);
    return {
        ...merged,
        auto_absent_after_minutes: Number.isFinite(autoAbsentMinutes) && autoAbsentMinutes >= 0
            ? Math.round(autoAbsentMinutes)
            : createDefaultAttendancePolicy().auto_absent_after_minutes,
    };
}
export function attendancePolicyForStaff(db: Pick<RDashDatabase, "master">, staffId: string): AttendancePolicy {
    const staff = db.master.staff.find((row) => row.id === staffId);
    if (!staff)
        throw new Error("Attendance policy requires an active staff record.");
    return normalizeAttendancePolicy(staff.attendance_policy);
}
export function attendancePolicyForVisit(db: Pick<RDashDatabase, "master">, visit: Pick<import("./types").Visit, "assigned_staff_id">): AttendancePolicy {
    if (!visit.assigned_staff_id)
        throw new Error("Attendance policy requires a staff-assigned Visit.");
    return attendancePolicyForStaff(db, visit.assigned_staff_id);
}