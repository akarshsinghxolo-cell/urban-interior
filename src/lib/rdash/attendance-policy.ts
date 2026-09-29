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
    const defaults = createDefaultAttendancePolicy();
    const source = policy || {};
    const finite = (value: unknown, fallback: number) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const optionalCoordinate = (value: unknown) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };
    return {
        office_name: String(source.office_name || defaults.office_name),
        office_latitude: optionalCoordinate(source.office_latitude),
        office_longitude: optionalCoordinate(source.office_longitude),
        geofence_radius_m: Math.max(1, finite(source.geofence_radius_m, defaults.geofence_radius_m)),
        visit_geofence_radius_m: Math.max(1, finite(source.visit_geofence_radius_m, defaults.visit_geofence_radius_m)),
        max_gps_accuracy_m: Math.max(1, finite(source.max_gps_accuracy_m, defaults.max_gps_accuracy_m)),
        standard_check_in_time: String(source.standard_check_in_time || defaults.standard_check_in_time),
        minimum_half_day_minutes: Math.max(1, Math.round(finite(source.minimum_half_day_minutes, defaults.minimum_half_day_minutes))),
        auto_present_from_gps: source.auto_present_from_gps ?? defaults.auto_present_from_gps,
        auto_geofence_enabled: source.auto_geofence_enabled ?? defaults.auto_geofence_enabled,
        auto_check_in_enabled: source.auto_check_in_enabled ?? defaults.auto_check_in_enabled,
        auto_check_out_enabled: source.auto_check_out_enabled ?? defaults.auto_check_out_enabled,
        auto_entry_dwell_seconds: Math.max(0, Math.round(finite(source.auto_entry_dwell_seconds, defaults.auto_entry_dwell_seconds))),
        auto_exit_dwell_seconds: Math.max(0, Math.round(finite(source.auto_exit_dwell_seconds, defaults.auto_exit_dwell_seconds))),
        auto_exit_buffer_m: Math.max(0, finite(source.auto_exit_buffer_m, defaults.auto_exit_buffer_m)),
        auto_absent_enabled: source.auto_absent_enabled ?? defaults.auto_absent_enabled,
        auto_absent_after_minutes: Math.max(0, Math.round(finite(source.auto_absent_after_minutes, defaults.auto_absent_after_minutes))),
        late_grace_minutes: Math.max(0, Math.round(finite(source.late_grace_minutes, defaults.late_grace_minutes))),
        absent_deduction_enabled: source.absent_deduction_enabled ?? defaults.absent_deduction_enabled,
        absent_deduction_days: Math.max(0, finite(source.absent_deduction_days, defaults.absent_deduction_days)),
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