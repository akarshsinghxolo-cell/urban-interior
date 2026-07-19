"use client";
import * as React from "react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { distanceMeters, type GpsCapture } from "@/lib/rdash/gps";
import { updateGeofenceDwell, type GeofenceDwellState } from "@/lib/rdash/auto-geofence";
import { indiaDate } from "@/lib/rdash/date";
import type { Visit } from "@/lib/rdash/types";
function isStaffVisit(visit: Visit) {
    return visit.assignee_type !== "contractor" && !visit.contractor_id;
}
function isWithinVisitCheckInWindow(visit: Visit, nowMs: number) {
    const scheduled = new Date(visit.scheduled_at).getTime();
    if (!Number.isFinite(scheduled))
        return false;
    const before = Math.max(0, visit.check_in_window_before_minutes ?? 30) * 60000;
    const after = Math.max(0, visit.check_in_window_after_minutes ?? 180) * 60000;
    return nowMs >= scheduled - before && nowMs <= scheduled + after;
}
export function AutoGeofenceMonitor() {
    const dwellRef = React.useRef(new Map<string, GeofenceDwellState>());
    const cooldownRef = React.useRef(new Map<string, number>());
    const permissionNoticeShown = React.useRef(false);
    React.useEffect(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation)
            return;
        const resetKey = (key: string) => dwellRef.current.delete(key);
        const canAttempt = (key: string, now: number) => {
            const until = cooldownRef.current.get(key) || 0;
            return now >= until;
        };
        const cool = (key: string, now: number, ms = 45000) => cooldownRef.current.set(key, now + ms);
        const onPosition = (position: GeolocationPosition) => {
            const state = useRDashStore.getState();
            const actor = state.currentUser();
            const now = Date.now();
            const timestamp = new Date(now).toISOString();
            const staffId = actor.staffId;
            if (!staffId)
                return;
            const staff = state.db.master.staff.find((row) => row.id === staffId && row.status === "active");
            if (!staff)
                return;
            const policy = staff.attendance_policy;
            if (!policy.auto_geofence_enabled)
                return;
            if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy <= 0 || position.coords.accuracy > policy.max_gps_accuracy_m)
                return;
            const capture: GpsCapture = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy_m: position.coords.accuracy,
                captured_at: timestamp,
                action_source: "auto_geofence",
            };
            const updateDwell = (key: string, distance: number, radius: number) => {
                const result = updateGeofenceDwell(dwellRef.current.get(key) || {}, distance, {
                    radius_m: radius,
                    exit_buffer_m: policy.auto_exit_buffer_m,
                    entry_dwell_seconds: policy.auto_entry_dwell_seconds,
                    exit_dwell_seconds: policy.auto_exit_dwell_seconds,
                    now_ms: now,
                });
                dwellRef.current.set(key, result.state);
                return result.decision;
            };
            const activeVisit = state.db.visits.find((visit) => isStaffVisit(visit) && visit.staff_id === staffId && visit.status === "checked_in");
            if (activeVisit && activeVisit.planned_latitude != null && activeVisit.planned_longitude != null) {
                const distance = distanceMeters(capture.latitude, capture.longitude, activeVisit.planned_latitude, activeVisit.planned_longitude);
                const key = `visit-exit:${activeVisit.id}`;
                const decision = updateDwell(key, distance, policy.visit_geofence_radius_m);
                if (decision === "exit_ready" && policy.auto_check_out_enabled && canAttempt(key, now)) {
                    try {
                        state.checkOutVisit(activeVisit.id, capture);
                        toast.success(`Automatic check-out recorded · ${activeVisit.location_name}`);
                        resetKey(key);
                        cool(key, now);
                    }
                    catch {
                        cool(key, now);
                    }
                }
                return;
            }
            const candidates = state.db.visits
                .filter((visit) => isStaffVisit(visit)
                && visit.staff_id === staffId
                && (visit.status === "scheduled" || visit.status === "en_route")
                && visit.planned_latitude != null
                && visit.planned_longitude != null
                && isWithinVisitCheckInWindow(visit, now))
                .map((visit) => ({
                visit,
                distance: distanceMeters(capture.latitude, capture.longitude, visit.planned_latitude!, visit.planned_longitude!),
            }))
                .filter((item) => item.distance <= policy.visit_geofence_radius_m)
                .sort((a, b) => a.distance - b.distance || a.visit.scheduled_at.localeCompare(b.visit.scheduled_at));
            const candidate = candidates[0];
            if (candidate) {
                const key = `visit-enter:${candidate.visit.id}`;
                const decision = updateDwell(key, candidate.distance, policy.visit_geofence_radius_m);
                if (decision === "enter_ready" && policy.auto_check_in_enabled && canAttempt(key, now)) {
                    try {
                        state.checkInVisit(candidate.visit.id, capture);
                        toast.success(`Automatic check-in recorded · ${candidate.visit.location_name}`);
                        resetKey(key);
                        cool(key, now);
                    }
                    catch {
                        cool(key, now);
                    }
                }
                return;
            }
            if (policy.office_latitude == null || policy.office_longitude == null)
                return;
            const officeDistance = distanceMeters(capture.latitude, capture.longitude, policy.office_latitude, policy.office_longitude);
            const today = indiaDate(timestamp);
            const record = state.db.attendance.find((row) => row.staff_id === staffId && row.date === today);
            if (!record?.check_in) {
                const key = `office-enter:${staffId}:${today}`;
                const decision = updateDwell(key, officeDistance, policy.geofence_radius_m);
                if (decision === "enter_ready" && policy.auto_check_in_enabled && canAttempt(key, now)) {
                    try {
                        state.checkInAttendance({ ...capture, staff_id: staffId });
                        toast.success("Automatic office attendance check-in recorded");
                        resetKey(key);
                        cool(key, now);
                    }
                    catch {
                        cool(key, now);
                    }
                }
                return;
            }
            if (record.attendance_mode !== "office" || record.check_out)
                return;
            const key = `office-exit:${staffId}:${today}`;
            const decision = updateDwell(key, officeDistance, policy.geofence_radius_m);
            if (decision === "exit_ready" && policy.auto_check_out_enabled && canAttempt(key, now)) {
                try {
                    state.checkOutAttendance({ ...capture, staff_id: staffId });
                    toast.success("Automatic office attendance check-out recorded");
                    resetKey(key);
                    cool(key, now);
                }
                catch {
                    cool(key, now);
                }
            }
        };
        const watchId = navigator.geolocation.watchPosition(onPosition, () => {
            if (!permissionNoticeShown.current) {
                permissionNoticeShown.current = true;
                toast.info("Automatic geofence is unavailable. Use Manual Check-in / Check-out with live GPS.");
            }
        }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);
    return null;
}
