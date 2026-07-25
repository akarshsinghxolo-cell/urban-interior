/**
 * Visits slice — scheduling, GPS check-in/out, contractor visits,
 * reconciliation (auto-miss), and visit report filing.
 *
 * Phase 3l moved the 12 visits actions out of store.ts in 1 contiguous block:
 *   addVisit, markVisitEnRoute, recordVisitTrackingPoint,
 *   startContractorVisit, completeContractorVisit, cancelVisit,
 *   reassignVisit, rescheduleVisit, runVisitReconciliation,
 *   checkInVisit, checkOutVisit, fileVisitReport
 *
 * 10 module-scope helpers used only by visits actions were moved with the
 * slice: resolveVisitLocation, visitAssigneeType, activeStaffMember,
 * activeContractor, assertVisitOwnership, assertVisitTimeWindow,
 * visitAssigneeKey, assertVisitSchedulingAvailability,
 * normalizeVisitSchedule, upsertMissedVisitFollowup. The shared
 * `businessDate` / `today` / `assertRole` / `genId` / `nowIso` /
 * `isOwnerOrOperations` helpers were already in `../helpers`, and
 * `isOpenFollowup` / `findOpenLinkedFollowup` were already in
 * `../finance-helpers`.
 */
import type {
    RDashDatabase, Visit, VisitRoutePoint, AttendanceRecord, Followup,
} from "../../types";
import type { VisitsState } from "../types";
import { advanceWorkRequiredLifecycleStatus } from "../../work-required-lifecycle";
import type { StoreContext } from "../context";
import type { CurrentUserContext } from "../ui-types";
import {
    assertRole, genId, nowIso, today, businessDate, isOwnerOrOperations,
} from "../helpers";
import { assertCustomerExists, assertSiteExists, assertSiteBelongsToCustomer } from "../../business-rules";
import {
    verifyVisitGps, verifyVisitExitGps, minutesLate, dateFromIso,
} from "../../gps";
import { attendancePolicyForVisit } from "../../attendance-policy";
import { isOpenFollowup, findOpenLinkedFollowup } from "../finance-helpers";

function resolveVisitLocation(db: RDashDatabase, draft: Partial<Visit>) {
    const workOrder = draft.work_order_id
        ? db.workOrders.find((row: any) => row.id === draft.work_order_id)
        : undefined;
    const explicitSite = draft.site_id || workOrder?.site_id
        ? db.sites.find((row: any) => row.id === (draft.site_id || workOrder?.site_id))
        : undefined;
    const vendor = draft.location_target_type === "vendor" && draft.vendor_id
        ? db.master.vendors.find((row: any) => row.id === draft.vendor_id)
        : undefined;
    const customerId = draft.customer_id ||
        workOrder?.customer_id ||
        explicitSite?.customer_id;
    const customer = customerId
        ? db.customers.find((row: any) => row.id === customerId)
        : undefined;
    const site = explicitSite;
    const plannedLatitude = draft.planned_latitude ?? (vendor ? vendor.latitude : site?.latitude) ?? draft.latitude;
    const plannedLongitude = draft.planned_longitude ?? (vendor ? vendor.longitude : site?.longitude) ?? draft.longitude;
    const locationName = draft.location_name || (vendor ? (vendor.address || vendor.name) : (site?.address || site?.name)) || "Location pending";
    return {
        customer,
        site,
        vendor,
        workOrder,
        plannedLatitude,
        plannedLongitude,
        locationName,
    };
}

function visitAssigneeType(visit: Visit): "staff" | "contractor" {
    return visit.assignee_type || (visit.contractor_id ? "contractor" : "staff");
}
function activeStaffMember(db: RDashDatabase, staffId?: string) {
    return db.master.staff.find((staff: any) => staff.id === staffId && staff.status !== "inactive" && staff.status !== "blocked");
}
function activeContractor(db: RDashDatabase, contractorId?: string) {
    return db.master.contractors.find((contractor: any) => contractor.id === contractorId);
}
function assertVisitOwnership(actor: CurrentUserContext, visit: Visit, db?: RDashDatabase) {
    if (isOwnerOrOperations(actor))
        return;
    const type = visitAssigneeType(visit);
    if (type === "contractor") {
        if (db && activeStaffMember(db, actor.staffId))
            return;
        throw new Error("Only an active staff member, Owner, or Operations Manager may record a contractor Visit.");
    }
    if (actor.role !== "Field Staff" || actor.staffId !== visit.staff_id) {
        throw new Error("Only the assigned Field Staff member, Owner, or Operations Manager may act on this Visit.");
    }
}

function assertVisitTimeWindow(visit: Visit, capturedAt: string) {
    const scheduled = new Date(visit.scheduled_at).getTime();
    const actual = new Date(capturedAt).getTime();
    if (!Number.isFinite(scheduled) || !Number.isFinite(actual)) {
        throw new Error("A valid scheduled time and GPS capture time are required.");
    }
    const before = Math.max(0, visit.check_in_window_before_minutes ?? 30);
    const after = Math.max(0, visit.check_in_window_after_minutes ?? 180);
    const earliest = scheduled - before * 60000;
    const latest = scheduled + after * 60000;
    if (actual < earliest || actual > latest) {
        throw new Error(`Field check-in is allowed from ${before} minutes before until ${after} minutes after the scheduled start. Reschedule the Visit or record a manager-approved exception.`);
    }
}
function visitAssigneeKey(visit: Pick<Visit, "staff_id" | "contractor_id" | "assignee_type">) {
    return visit.assignee_type === "contractor" || visit.contractor_id
        ? `contractor:${visit.contractor_id || ""}`
        : `staff:${visit.staff_id || ""}`;
}
function assertVisitSchedulingAvailability(db: RDashDatabase, candidate: Pick<Visit, "staff_id" | "scheduled_at"> & Partial<Visit>, ignoreVisitId?: string) {
    if (!candidate.scheduled_at)
        return;
    const key = visitAssigneeKey(candidate);
    // Flexibility: skip the assignee + collision check for unassigned visits (no staff/contractor yet).
    // An unassigned visit has no assignee to conflict with; the owner can assign later and re-check.
    if (key.endsWith(":"))
        return;
    const start = new Date(candidate.scheduled_at).getTime();
    if (!Number.isFinite(start))
        throw new Error("A valid Visit date and time are required.");
    const duration = Math.max(15, candidate.scheduled_duration_minutes ?? 60);
    const travelBuffer = 30 * 60000;
    const end = start + duration * 60000;
    const collision = db.visits.find((visit: any) => {
        if (visit.id === ignoreVisitId || visitAssigneeKey(visit) !== key || ["cancelled", "completed", "missed"].includes(visit.status))
            return false;
        const otherStart = new Date(visit.scheduled_at).getTime();
        const otherEnd = otherStart + Math.max(15, visit.scheduled_duration_minutes ?? 60) * 60000;
        return start < otherEnd + travelBuffer && otherStart < end + travelBuffer;
    });
    if (collision) {
        throw new Error(`Scheduling conflict and travel-time buffer: ${collision.location_name} needs a 30-minute travel buffer before or after this Visit.`);
    }
}

function normalizeVisitSchedule(value?: string) {
    if (!value)
        return nowIso();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
        return `${value}T10:00:00+05:30`;
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+05:30` : value;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime()))
        throw new Error("A valid Visit date and time are required.");
    return parsed.toISOString();
}

function upsertMissedVisitFollowup(state: any, visit: Visit) {
    const existing = findOpenLinkedFollowup(state.db, {
        visit_id: visit.id,
        customer_id: visit.customer_id,
        work_required_id: visit.work_required_id,
        followup_type: "call",
    });
    const dueDate = today();
    const patch: Partial<Followup> = {
        customer_id: visit.customer_id,
        work_required_id: visit.work_required_id,
        visit_id: visit.id,
        title: `Reschedule missed visit · ${visit.location_name || visit.id}`,
        notes: `Auto-created because the scheduled visit was missed.`,
        status: "pending",
        priority: "high",
        due_date: dueDate,
        due_at: new Date(`${dueDate}T09:00:00`).toISOString(),
        assigned_to: visit.staff_name || "Owner",
        assigned_role: "Field Staff",
        followup_type: "call",
    };
    if (existing) {
        state.updateFollowup(existing.id, patch);
        return existing.id;
    }
    return state.addFollowup({ ...patch, notes_history: [] });
}

/**
 * H4: Haversine distance between two lat/lon points, in meters.
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * H4: Compute total route distance (meters) from a visit's route_points,
 * optionally bounded by [checkInAt, checkOutAt]. Includes the check-out
 * capture as the final point so the just-recorded GPS counts toward the
 * total. Points without valid lat/lon are skipped (no NaN propagation).
 */
function computeRouteDistanceMeters(
    routePoints: VisitRoutePoint[],
    checkOutCapture: { latitude: number; longitude: number },
    checkInAt?: string,
    checkOutAt?: string,
): number {
    const inWindow = routePoints.filter((p) => {
        if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return false;
        if (checkInAt && p.captured_at < checkInAt) return false;
        if (checkOutAt && p.captured_at > checkOutAt) return false;
        return true;
    });
    const seq = [...inWindow, {
        latitude: checkOutCapture.latitude,
        longitude: checkOutCapture.longitude,
        captured_at: checkOutAt || "",
    } as VisitRoutePoint];
    let total = 0;
    for (let i = 1; i < seq.length; i++) {
        total += haversineMeters(seq[i - 1].latitude, seq[i - 1].longitude, seq[i].latitude, seq[i].longitude);
    }
    return Math.round(total);
}

export function createVisitsSlice(ctx: StoreContext): VisitsState {
    const { commitState, get } = ctx;

    return {
        addVisit: (v) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "schedule Visits");
            const state = get();
            const scheduledAt = normalizeVisitSchedule(v.scheduled_at);
            const plannedDuration = Math.max(15, v.scheduled_duration_minutes ?? 60);
            const customerId = v.customer_id || "";
            const siteId = v.site_id || "";
            assertCustomerExists(state.db, customerId, "Schedule Visit");
            assertSiteExists(state.db, siteId, "Schedule Visit");
            assertSiteBelongsToCustomer(state.db, siteId, customerId, "Schedule Visit");
            const locationTargetType = v.location_target_type || "site";
            const targetVendor = locationTargetType === "vendor"
                ? state.db.master.vendors.find((vendor: any) => vendor.id === v.vendor_id)
                : undefined;
            if (locationTargetType === "vendor") {
                if (!targetVendor)
                    throw new Error("Select a registered Vendor for this Visit.");
                if (!Number.isFinite(targetVendor.latitude) || !Number.isFinite(targetVendor.longitude)) {
                    throw new Error(`Vendor ${targetVendor.name} needs verified GPS coordinates before a geofenced Visit can be scheduled.`);
                }
            }
            if (v.visit_type === "measurement" && !v.work_required_id) {
                throw new Error("A Measurement Visit must be linked to the Work Required being measured.");
            }
            if (v.work_required_id) {
                const work = state.db.workRequired.find((row: any) => row.id === v.work_required_id);
                if (!work || work.customer_id !== customerId || work.site_id !== siteId)
                    throw new Error("The selected Work Required must belong to the same Customer and Site as the Visit.");
            }
            // A Work Required can have one active measurement lifecycle at a time.
            if (v.visit_type === "measurement" && v.work_required_id) {
                const activeMeasurementVisit = state.db.visits.find((visit: any) =>
                    visit.visit_type === "measurement" &&
                    visit.site_id === siteId &&
                    visit.work_required_id === v.work_required_id &&
                    !visit.report_filed &&
                    !["cancelled", "completed", "missed"].includes(visit.status)
                );
                if (activeMeasurementVisit) {
                    throw new Error(`An active Measurement Visit already exists for this Work Required (${activeMeasurementVisit.status.replaceAll("_", " ")}). Open Measurements instead of scheduling a duplicate.`);
                }
            }
            if (v.work_order_id) {
                const workOrder = state.db.workOrders.find((row: any) => row.id === v.work_order_id);
                if (!workOrder || workOrder.customer_id !== customerId || workOrder.site_id !== siteId)
                    throw new Error("The selected Work Order must belong to the same Customer and Site as the Visit.");
            }
            const assigneeType = v.assignee_type || (v.contractor_id ? "contractor" : "staff");
            const fallbackStaff = state.db.master.staff.find((staff: any) => staff.status === "active");
            const staff = assigneeType === "staff" ? activeStaffMember(state.db, v.staff_id || fallbackStaff?.id) : undefined;
            const contractor = assigneeType === "contractor" ? activeContractor(state.db, v.contractor_id || v.staff_id) : undefined;
            // Flexibility: allow unassigned visits (empty staff_id + "Unassigned" name) so a business
            // with no staff set up yet can still schedule visits. Owner can assign later.
            const isUnassignedStaff = assigneeType === "staff" && !v.staff_id && !staff && (v.staff_name === "Unassigned" || v.staff_name === "");
            if (assigneeType === "staff" && !staff && !isUnassignedStaff)
                throw new Error("Select an active staff member from the Visit assignee list.");
            if (assigneeType === "contractor" && !contractor)
                throw new Error("Select an active contractor from the Visit assignee list.");
            const draft: Partial<Visit> = {
                ...v,
                customer_id: customerId,
                site_id: siteId,
                location_target_type: locationTargetType,
                vendor_id: targetVendor?.id,
                vendor_name: targetVendor?.name,
                scheduled_at: scheduledAt,
                scheduled_duration_minutes: plannedDuration,
                assignee_type: assigneeType,
                staff_id: staff?.id || "",
                contractor_id: contractor?.id,
            };
            assertVisitSchedulingAvailability(state.db, draft as Visit);
            const resolved = resolveVisitLocation(state.db, draft);
            const id = genId("visit");
            const routePoints: VisitRoutePoint[] = [];
            if (resolved.plannedLatitude != null && resolved.plannedLongitude != null) {
                routePoints.push({ id: genId("route-planned"), kind: "planned", latitude: resolved.plannedLatitude, longitude: resolved.plannedLongitude, captured_at: scheduledAt, source: "planned_site", note: `Planned site: ${resolved.locationName}` });
            }
            const assigneeName = staff?.name || contractor?.name || "";
            const threadId = get().openThreadFor("visit", id, `${v.visit_type || "Visit"} · ${resolved.locationName}`, [assigneeName].filter(Boolean));
            const now = nowIso();
            const visit: Visit = {
                id,
                customer_id: customerId,
                site_id: siteId,
                location_target_type: locationTargetType,
                vendor_id: targetVendor?.id,
                vendor_name: targetVendor?.name,
                work_required_id: v.work_required_id,
                work_order_id: v.work_order_id,
                assignee_type: assigneeType,
                staff_id: staff?.id || "",
                staff_name: staff?.name || v.staff_name || (isUnassignedStaff ? "Unassigned" : ""),
                contractor_id: contractor?.id,
                contractor_name: contractor?.name,
                visit_type: v.visit_type || "site_visit",
                location_name: resolved.locationName,
                status: "scheduled",
                scheduled_at: scheduledAt,
                scheduled_duration_minutes: plannedDuration,
                check_in_window_before_minutes: v.check_in_window_before_minutes ?? 30,
                check_in_window_after_minutes: v.check_in_window_after_minutes ?? 180,
                planned_latitude: resolved.plannedLatitude,
                planned_longitude: resolved.plannedLongitude,
                route_points: routePoints,
                notes: v.notes || "",
                proof_attachment_ids: [],
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    visits: [visit, ...snapshot.db.visits],
                    workRequired: visit.work_required_id && (visit.visit_type === "measurement" || visit.visit_type === "site_visit")
                        ? snapshot.db.workRequired.map((work: any) => work.id === visit.work_required_id ? { ...work, status: advanceWorkRequiredLifecycleStatus(work.status, "visit_scheduled"), updated_at: now } : work)
                        : snapshot.db.workRequired,
                },
            }));
            get().addThreadReply(threadId, { author: get().currentUser().name, role: get().currentUser().role, body: `Visit scheduled for ${new Date(scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. Assigned to ${assigneeName || "unassigned"}${assigneeType === "contractor" ? " (contractor; staff report, no contractor GPS)" : ""}.`, kind: "decision" });
            get().logAudit({ actor: get().currentUser().name, actor_role: get().currentUser().role, action: `Scheduled ${visit.visit_type} at ${visit.location_name}`, entity_type: "visit", entity_id: id, entity_label: visit.location_name, kind: "create", cross_post: [
                ...(visit.work_order_id ? [{ entity_type: "workOrder", entity_id: visit.work_order_id }] : []),
                ...(visit.site_id ? [{ entity_type: "site", entity_id: visit.site_id }] : []),
                ...(visit.customer_id ? [{ entity_type: "customer", entity_id: visit.customer_id }] : []),
                ...(visit.vendor_id ? [{ entity_type: "vendor", entity_id: visit.vendor_id, entity_label: visit.vendor_name }] : []),
                ...(visit.contractor_id ? [{ entity_type: "contractor", entity_id: visit.contractor_id, entity_label: visit.contractor_name }] : []),
                ...(visit.work_required_id ? [{ entity_type: "workRequired", entity_id: visit.work_required_id }] : []),
            ] });
            return id;
        },
        markVisitEnRoute: (id) => {
            const state = get();
            const visit = state.db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            assertVisitOwnership(state.currentUser(), visit, state.db);
            if (visit.status !== "scheduled")
                throw new Error("Only a scheduled Visit can be marked en route.");
            const now = nowIso();
            commitState((snapshot: any) => ({ db: { ...snapshot.db, visits: snapshot.db.visits.map((row: any) => row.id === id ? { ...row, status: "en_route" as const, updated_at: now } : row) } }));
            get().addThreadReply(visit.thread_id || get().openThreadFor("visit", id, `${visit.visit_type} · ${visit.location_name}`, [visit.staff_name || visit.contractor_name || ""].filter(Boolean)), { author: state.currentUser().name, role: state.currentUser().role, body: "Visit marked en route.", kind: "decision" });
        },
        recordVisitTrackingPoint: (id, capture) => {
            const state = get();
            const visit = state.db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            if (visitAssigneeType(visit) !== "staff" || visit.status !== "checked_in")
                throw new Error("Live tracking is available only while an assigned staff Visit is checked in.");
            assertVisitOwnership(state.currentUser(), visit, state.db);
            const policy = attendancePolicyForVisit(state.db, visit);
            if (!Number.isFinite(capture.latitude) || !Number.isFinite(capture.longitude) || !Number.isFinite(capture.accuracy_m) || capture.accuracy_m > policy.max_gps_accuracy_m) {
                throw new Error("A sufficiently accurate live device GPS point is required.");
            }
            const now = capture.captured_at || nowIso();
            commitState((snapshot: any) => ({ db: { ...snapshot.db, visits: snapshot.db.visits.map((row: any) => row.id === id ? { ...row, latitude: capture.latitude, longitude: capture.longitude, route_points: [...(row.route_points || []), { id: genId("route-tracking"), kind: "tracking" as const, latitude: capture.latitude, longitude: capture.longitude, captured_at: now, source: "device_gps" as const, accuracy_m: capture.accuracy_m, note: "Foreground live GPS ping" }], updated_at: now } : row) } }));
        },
        startContractorVisit: (id) => {
            const state = get();
            const visit = state.db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            if (visitAssigneeType(visit) !== "contractor")
                throw new Error("This action is only for contractor-assigned Visits.");
            assertVisitOwnership(state.currentUser(), visit, state.db);
            if (!(visit.status === "scheduled" || visit.status === "en_route"))
                throw new Error("Only a scheduled or en-route contractor Visit can be started.");
            const now = nowIso();
            commitState((snapshot: any) => ({ db: { ...snapshot.db, visits: snapshot.db.visits.map((row: any) => row.id === id ? { ...row, status: "checked_in" as const, check_in_at: now, check_in_verified: false, updated_at: now } : row) } }));
            get().addThreadReply(visit.thread_id || get().openThreadFor("visit", id, `${visit.visit_type} · ${visit.location_name}`, [visit.contractor_name || ""].filter(Boolean)), { author: state.currentUser().name, role: state.currentUser().role, body: `Contractor arrival recorded for ${visit.contractor_name || "contractor"}. GPS is not required for contractor work.`, kind: "decision" });
        },
        completeContractorVisit: (id) => {
            const state = get();
            const visit = state.db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            if (visitAssigneeType(visit) !== "contractor")
                throw new Error("This action is only for contractor-assigned Visits.");
            assertVisitOwnership(state.currentUser(), visit, state.db);
            if (visit.status !== "checked_in" || !visit.check_in_at)
                throw new Error("Start the contractor Visit before recording completion.");
            const now = nowIso();
            const dwell = Math.max(0, Math.round((new Date(now).getTime() - new Date(visit.check_in_at).getTime()) / 60000));
            const reportTaskId = get().addTask({ title: `File contractor visit report · ${visit.location_name}`, task_scope: "site", task_type: "visit_report", customer_id: visit.customer_id, visit_id: id, site_id: visit.site_id, assignee_name: state.currentUser().name, due_date: businessDate(new Date(Date.now() + 2 * 60 * 60 * 1000)), auto_generated: true });
            commitState((snapshot: any) => ({ db: { ...snapshot.db, visits: snapshot.db.visits.map((row: any) => row.id === id ? { ...row, status: "report_pending" as const, check_out_at: now, dwell_minutes: dwell, report_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), report_task_id: reportTaskId, updated_at: now } : row) } }));
        },
        cancelVisit: (id, reason) => {
            const state = get();
            assertRole(state.currentUser().role, ["Owner", "Operations Manager"], "cancel Visits");
            const visit = state.db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            if (!(visit.status === "scheduled" || visit.status === "en_route" || visit.status === "missed"))
                throw new Error("Only unstarted or missed Visits can be cancelled.");
            if (!reason.trim())
                throw new Error("A cancellation reason is required.");
            const now = nowIso();
            commitState((snapshot: any) => ({ db: { ...snapshot.db, visits: snapshot.db.visits.map((row: any) => row.id === id ? { ...row, status: "cancelled" as const, cancelled_at: now, cancelled_by: state.currentUser().name, cancelled_reason: reason.trim(), updated_at: now } : row), followups: snapshot.db.followups.map((followup: any) => followup.visit_id === id && isOpenFollowup(followup.status) ? { ...followup, status: "closed" as const, updated_at: now, notes: `${followup.notes || ""}\nVisit cancelled: ${reason.trim()}`.trim() } : followup) } }));
            get().addThreadReply(visit.thread_id || get().openThreadFor("visit", id, `${visit.visit_type} · ${visit.location_name}`, []), { author: state.currentUser().name, role: state.currentUser().role, body: `Visit cancelled: ${reason.trim()}`, kind: "decision" });
        },
        reassignVisit: (id, assignee) => {
            const state = get();
            assertRole(state.currentUser().role, ["Owner", "Operations Manager"], "reassign Visits");
            const visit = state.db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            if (!(visit.status === "scheduled" || visit.status === "missed"))
                throw new Error("Only scheduled or missed Visits can be reassigned. Cancel and create a new Visit after field work begins.");
            const staff = assignee.type === "staff" ? activeStaffMember(state.db, assignee.id) : undefined;
            const contractor = assignee.type === "contractor" ? activeContractor(state.db, assignee.id) : undefined;
            if (!staff && !contractor)
                throw new Error("Choose an active staff member or contractor.");
            const next = { ...visit, assignee_type: assignee.type, staff_id: staff?.id || "", staff_name: staff?.name || "", contractor_id: contractor?.id, contractor_name: contractor?.name } as Visit;
            assertVisitSchedulingAvailability(state.db, next, id);
            const now = nowIso();
            commitState((snapshot: any) => ({ db: { ...snapshot.db, visits: snapshot.db.visits.map((row: any) => row.id === id ? { ...next, status: "scheduled" as const, missed_at: undefined, missed_reason: undefined, updated_at: now } : row), followups: snapshot.db.followups.map((followup: any) => followup.visit_id === id && isOpenFollowup(followup.status) ? { ...followup, status: "closed" as const, notes: `${followup.notes || ""}\nVisit reassigned.`.trim(), updated_at: now } : followup) } }));
            get().addThreadReply(visit.thread_id || get().openThreadFor("visit", id, `${visit.visit_type} · ${visit.location_name}`, []), { author: state.currentUser().name, role: state.currentUser().role, body: `Visit reassigned to ${staff?.name || contractor?.name}.`, kind: "decision" });
        },
        rescheduleVisit: (id, scheduledAt) => {
            const state = get();
            const actor = state.currentUser();
            assertRole(actor.role, ["Owner", "Operations Manager"], "reschedule Visits");
            const visit = state.db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            if (!(visit.status === "scheduled" || visit.status === "missed")) {
                throw new Error("Only scheduled or missed Visits can be rescheduled. An en-route or active Visit must be cancelled or completed first.");
            }
            const nextAt = normalizeVisitSchedule(scheduledAt);
            assertVisitSchedulingAvailability(state.db, { ...visit, scheduled_at: nextAt }, id);
            const now = nowIso();
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    visits: snapshot.db.visits.map((row: any) => row.id === id ? { ...row, scheduled_at: nextAt, status: "scheduled" as const, missed_at: undefined, missed_reason: undefined, recovery_followup_id: undefined, rescheduled_at: now, rescheduled_by: actor.name, updated_at: now } : row),
                    followups: snapshot.db.followups.map((followup: any) => followup.visit_id === id && isOpenFollowup(followup.status) ? { ...followup, status: "closed" as const, notes: `${followup.notes || ""}\nVisit rescheduled to ${new Date(nextAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`.trim(), updated_at: now } : followup),
                },
            }));
            get().addThreadReply(visit.thread_id || get().openThreadFor("visit", id, `${visit.visit_type} · ${visit.location_name}`, []), { author: actor.name, role: actor.role, body: `Visit rescheduled to ${new Date(nextAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. Any missed-visit recovery Follow-up was closed.`, kind: "decision" });
        },
        runVisitReconciliation: (at = nowIso()) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "run visit reconciliation");
            const now = new Date(at);
            if (Number.isNaN(now.getTime()))
                throw new Error("Invalid reconciliation time.");
            const overdue = get().db.visits.filter((visit: any) => {
                if (!(visit.status === "scheduled" || visit.status === "en_route"))
                    return false;
                const cutoff = new Date(visit.scheduled_at).getTime() +
                    Math.max(0, visit.check_in_window_after_minutes ?? 180) * 60000;
                return Number.isFinite(cutoff) && cutoff < now.getTime();
            });
            if (!overdue.length)
                return 0;
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    visits: snapshot.db.visits.map((row: any) => overdue.some((visit: any) => visit.id === row.id)
                        ? {
                            ...row,
                            status: "missed" as const,
                            missed_at: at,
                            missed_reason: "No verified field check-in within the allowed window.",
                            updated_at: at,
                        }
                        : row),
                },
            }));
            overdue.forEach((visit: any) => {
                const saved = get().db.visits.find((row: any) => row.id === visit.id)!;
                upsertMissedVisitFollowup(get(), saved);
                get().addThreadReply(saved.thread_id ||
                    get().openThreadFor("visit", saved.id, `${saved.visit_type} · ${saved.location_name}`, [saved.staff_name]), {
                    author: "System",
                    role: "System",
                    body: "Visit marked missed because no verified check-in was recorded within the allowed time window. A rescheduling follow-up was created.",
                    kind: "decision",
                });
            });
            return overdue.length;
        },
        checkInVisit: (id, capture) => {
            const state = get();
            const actor = state.currentUser();
            const visitBefore = state.db.visits.find((visit: any) => visit.id === id);
            if (!visitBefore)
                throw new Error("Visit not found.");
            if (visitAssigneeType(visitBefore) !== "staff")
                throw new Error("Contractor-assigned Visits do not use GPS check-in. Record contractor arrival instead.");
            assertVisitOwnership(actor, visitBefore, state.db);
            if (visitBefore.status !== "scheduled" &&
                visitBefore.status !== "en_route")
                throw new Error("Only a scheduled Visit can be checked in.");
            const timestamp = capture.captured_at || nowIso();
            const policy = attendancePolicyForVisit(state.db, visitBefore);
            const actionSource = capture.action_source === "auto_geofence" ? "auto_geofence" : "manual";
            if (actionSource === "auto_geofence" && (!policy.auto_geofence_enabled || !policy.auto_check_in_enabled)) {
                throw new Error("Automatic geofence check-in is disabled by attendance policy. Use manual check-in.");
            }
            assertVisitTimeWindow(visitBefore, timestamp);
            const verification = verifyVisitGps(capture, visitBefore, policy);
            const threadId = visitBefore.thread_id ||
                get().openThreadFor("visit", id, `${visitBefore.visit_type || "Visit"} · ${visitBefore.location_name || id}`, [visitBefore.staff_name || actor.name]);
            commitState((s: any) => {
                const existingAttendance = s.db.attendance.find((row: any) => row.staff_id === visitBefore.staff_id &&
                    row.date === dateFromIso(timestamp));
                const staffPolicy = attendancePolicyForVisit(s.db, visitBefore);
                const shouldAutoPresent = staffPolicy.auto_present_from_gps &&
                    actor.staffId === visitBefore.staff_id &&
                    !existingAttendance;
                const lateMinutes = minutesLate(timestamp, staffPolicy.standard_check_in_time, staffPolicy.late_grace_minutes);
                const attendance: AttendanceRecord | null = shouldAutoPresent
                    ? {
                        id: genId("att"),
                        staff_id: visitBefore.staff_id,
                        staff_name: visitBefore.staff_name,
                        date: dateFromIso(timestamp),
                        attendance_mode: "field_visit",
                        visit_id: visitBefore.id,
                        check_in: timestamp,
                        check_in_latitude: capture.latitude,
                        check_in_longitude: capture.longitude,
                        check_in_accuracy_m: capture.accuracy_m,
                        check_in_distance_m: verification.distance_m,
                        check_in_verification: "verified",
                        check_in_source: actionSource,
                        late_minutes: lateMinutes,
                        late: lateMinutes > 0,
                        status: "present",
                        location: visitBefore.location_name,
                        created_at: timestamp,
                        updated_at: timestamp,
                    }
                    : null;
                return {
                    db: {
                        ...s.db,
                        visits: s.db.visits.map((v: any) => v.id === id
                            ? {
                                ...v,
                                status: "checked_in",
                                check_in_at: timestamp,
                                check_in_accuracy_m: capture.accuracy_m,
                                check_in_distance_m: verification.distance_m,
                                check_in_verified: true,
                                check_in_source: actionSource,
                                auto_check_in_at: actionSource === "auto_geofence" ? timestamp : v.auto_check_in_at,
                                latitude: capture.latitude,
                                longitude: capture.longitude,
                                route_points: [
                                    ...(v.route_points || []),
                                    {
                                        id: genId("route-check-in"),
                                        kind: "check_in",
                                        latitude: capture.latitude,
                                        longitude: capture.longitude,
                                        captured_at: timestamp,
                                        source: "device_gps",
                                        accuracy_m: capture.accuracy_m,
                                        note: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} field check-in · ${verification.distance_m} m from location`,
                                    },
                                ],
                                updated_at: timestamp,
                            }
                            : v),
                        attendance: attendance
                            ? [attendance, ...s.db.attendance]
                            : s.db.attendance,
                    },
                };
            });
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} field check-in at ${capture.latitude.toFixed(5)}, ${capture.longitude.toFixed(5)} · ${verification.distance_m} m from the planned location · GPS accuracy ${Math.round(capture.accuracy_m)} m.`,
                kind: "comment",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} field check-in for ${visitBefore.location_name} (${verification.distance_m} m from location)`,
                entity_type: "visit",
                entity_id: id,
                entity_label: visitBefore.location_name,
                kind: "update",
                cross_post: [
                    ...(visitBefore.work_order_id ? [{ entity_type: "workOrder", entity_id: visitBefore.work_order_id }] : []),
                    ...(visitBefore.site_id ? [{ entity_type: "site", entity_id: visitBefore.site_id }] : []),
                    ...(visitBefore.customer_id ? [{ entity_type: "customer", entity_id: visitBefore.customer_id }] : []),
                    ...(visitBefore.contractor_id ? [{ entity_type: "contractor", entity_id: visitBefore.contractor_id, entity_label: visitBefore.contractor_name }] : []),
                ],
            });
        },
        checkOutVisit: (id, capture) => {
            const state = get();
            const actor = state.currentUser();
            const before = state.db.visits.find((visit: any) => visit.id === id);
            if (!before)
                throw new Error("Visit not found.");
            if (visitAssigneeType(before) !== "staff")
                throw new Error("Contractor-assigned Visits do not use GPS check-out. Record contractor completion instead.");
            assertVisitOwnership(actor, before, state.db);
            if (before.status !== "checked_in" ||
                !before.check_in_verified ||
                !before.check_in_at)
                throw new Error("A verified field check-in is required before check-out.");
            const timestamp = capture.captured_at || nowIso();
            const policy = attendancePolicyForVisit(state.db, before);
            const actionSource = capture.action_source === "auto_geofence" ? "auto_geofence" : "manual";
            if (actionSource === "auto_geofence" && (!policy.auto_geofence_enabled || !policy.auto_check_out_enabled)) {
                throw new Error("Automatic geofence check-out is disabled by attendance policy. Use manual check-out.");
            }
            if (new Date(timestamp).getTime() < new Date(before.check_in_at).getTime())
                throw new Error("Field check-out time cannot be earlier than the verified check-in time.");
            const verification = actionSource === "auto_geofence"
                ? verifyVisitExitGps(capture, before, policy)
                : verifyVisitGps(capture, before, policy);
            const reportDueAt = new Date(new Date(timestamp).getTime() + 2 * 60 * 60 * 1000).toISOString();
            const threadId = before.thread_id ||
                get().openThreadFor("visit", id, `${before.visit_type || "Visit"} · ${before.location_name || id}`, [before.staff_name || actor.name]);
            // H4: Auto-compute distance traveled from the route_points collected
            // between check-in and check-out. Sum the haversine distance between
            // consecutive points (check-in → tracking → check-out). Stored on
            // the visit so Visit Proofs can show "X m traveled" without
            // re-computing.
            const routePoints = (before.route_points || []) as VisitRoutePoint[];
            const distanceMeters = computeRouteDistanceMeters(routePoints, capture, before.check_in_at, timestamp);
            commitState((s: any) => {
                const visit = s.db.visits.find((v: any) => v.id === id);
                const dwell = visit?.check_in_at
                    ? Math.max(0, Math.round((new Date(timestamp).getTime() -
                        new Date(visit.check_in_at).getTime()) /
                        60000))
                    : 0;
                return {
                    db: {
                        ...s.db,
                        visits: s.db.visits.map((v: any) => v.id === id
                            ? {
                                ...v,
                                status: "report_pending",
                                check_out_at: timestamp,
                                check_out_accuracy_m: capture.accuracy_m,
                                check_out_distance_m: verification.distance_m,
                                check_out_verified: true,
                                check_out_source: actionSource,
                                auto_check_out_at: actionSource === "auto_geofence" ? timestamp : v.auto_check_out_at,
                                dwell_minutes: dwell,
                                distance_traveled_m: distanceMeters,
                                report_due_at: reportDueAt,
                                latitude: capture.latitude,
                                longitude: capture.longitude,
                                route_points: [
                                    ...(v.route_points || []),
                                    {
                                        id: genId("route-check-out"),
                                        kind: "check_out",
                                        latitude: capture.latitude,
                                        longitude: capture.longitude,
                                        captured_at: timestamp,
                                        source: "device_gps",
                                        accuracy_m: capture.accuracy_m,
                                        note: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} field check-out · ${verification.distance_m} m from location`,
                                    },
                                ],
                                updated_at: timestamp,
                            }
                            : v),
                        attendance: s.db.attendance.map((attendance: any) => {
                            if (attendance.visit_id !== id || attendance.staff_id !== before.staff_id || attendance.check_out)
                                return attendance;
                            const workMinutes = Math.max(0, Math.round((new Date(timestamp).getTime() - new Date(attendance.check_in || before.check_in_at || timestamp).getTime()) / 60000));
                            return {
                                ...attendance,
                                check_out: timestamp,
                                check_out_latitude: capture.latitude,
                                check_out_longitude: capture.longitude,
                                check_out_accuracy_m: capture.accuracy_m,
                                check_out_distance_m: verification.distance_m,
                                check_out_verification: "verified" as const,
                                check_out_source: actionSource,
                                work_minutes: workMinutes,
                                status: workMinutes < attendancePolicyForVisit(s.db, before).minimum_half_day_minutes ? "half_day" as const : "present" as const,
                                updated_at: timestamp,
                            };
                        }),
                    },
                };
            });
            const visit = get().db.visits.find((v: any) => v.id === id);
            const reportTaskId = get().addTask({
                title: `File visit report · ${visit?.location_name || id}`,
                task_scope: "site",
                task_type: "visit_report",
                customer_id: visit?.customer_id,
                visit_id: id,
                work_order_id: visit?.work_order_id,
                site_id: visit?.site_id,
                assignee_id: visit?.staff_id || undefined,
                assignee_name: visit?.staff_name || actor.name,
                description: `Report due by ${new Date(reportDueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`,
                due_date: businessDate(new Date(reportDueAt)),
                auto_generated: true,
            });
            const checkoutMessageId = get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} field check-out at ${capture.latitude.toFixed(5)}, ${capture.longitude.toFixed(5)} · ${verification.distance_m} m from the planned location. Report is pending until filed; report task created.`,
                kind: "decision",
            });
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    visits: snapshot.db.visits.map((row: any) => row.id === id
                        ? {
                            ...row,
                            report_task_id: reportTaskId,
                            checkout_thread_message_id: checkoutMessageId,
                            thread_id: row.thread_id || threadId,
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} field check-out for ${visit?.location_name || id} (${verification.distance_m} m from location); report task linked.`,
                entity_type: "visit",
                entity_id: id,
                entity_label: visit?.location_name,
                kind: "update",
                cross_post: [
                    ...(visit?.work_order_id ? [{ entity_type: "workOrder", entity_id: visit.work_order_id }] : []),
                    ...(visit?.site_id ? [{ entity_type: "site", entity_id: visit.site_id }] : []),
                    ...(visit?.customer_id ? [{ entity_type: "customer", entity_id: visit.customer_id }] : []),
                    ...(visit?.contractor_id ? [{ entity_type: "contractor", entity_id: visit.contractor_id, entity_label: visit.contractor_name }] : []),
                ],
            });
        },
        fileVisitReport: (id, notes, proofs) => {
            const actor = get().currentUser();
            const visit = get().db.visits.find((row: any) => row.id === id);
            if (!visit)
                throw new Error("Visit not found.");
            assertVisitOwnership(actor, visit, get().db);
            if (visit.report_filed)
                throw new Error("This Visit report has already been filed. Add a nested thread reply for an amendment instead of creating duplicate proof records.");
            const contractorVisit = visitAssigneeType(visit) === "contractor";
            if (visit.status !== "report_pending" || (!contractorVisit && !visit.check_out_verified))
                throw new Error(contractorVisit ? "Record contractor completion before filing the Visit report." : "A verified field check-out is required before filing a Visit report.");
            const invalidProof = (proofs || []).find((proof: any) => !proof.attachment_id);
            if (invalidProof)
                throw new Error(`Proof ${invalidProof.file_name} must be queued before filing the Visit report.`);
            const threadId = visit.thread_id ||
                get().openThreadFor("visit", id, `${visit.visit_type || "Visit"} · ${visit.location_name || id}`, [visit.staff_name || actor.name]);
            const reportMessageId = get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Visit report filed${notes ? `: ${notes}` : "."}`,
                kind: "decision",
                parent_message_id: visit.checkout_thread_message_id,
            });
            const proofAttachmentIds = (proofs || []).map((proof: any) => proof.attachment_id);
            (proofs || []).forEach((proof: any, index: any) => {
                get().addThreadReply(threadId, {
                    author: actor.name,
                    role: actor.role,
                    body: `Evidence attached: ${proof.file_name}`,
                    kind: "proof",
                    proof_attachment_id: proofAttachmentIds[index],
                    parent_message_id: reportMessageId,
                });
            });
            const reportTaskIds = [
                visit.report_task_id,
                ...get()
                    .db.tasks.filter((task: any) => task.visit_id === id &&
                    task.task_type === "visit_report" &&
                    task.status !== "completed" &&
                    task.status !== "cancelled")
                    .map((task: any) => task.id),
            ].filter((value): value is string => Boolean(value));
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    visits: snapshot.db.visits.map((row: any) => row.id === id
                        ? {
                            ...row,
                            notes,
                            status: "completed" as const,
                            report_filed: true,
                            report_due_at: undefined,
                            photo_reminder_acknowledged: !(proofs || []).length,
                            report_thread_message_id: reportMessageId,
                            thread_id: row.thread_id || threadId,
                            proof_attachment_ids: [...new Set([...(row.proof_attachment_ids || []), ...proofAttachmentIds])],
                            updated_at: nowIso(),
                        }
                        : row),
                    tasks: snapshot.db.tasks.map((task: any) => reportTaskIds.includes(task.id)
                        ? { ...task, status: "completed" as const, completed_at: nowIso(), completed_by: actor.name, completion_note: `Visit report filed for ${visit.location_name}.`, updated_at: nowIso() }
                        : task),
                },
            }));
            reportTaskIds.forEach((taskId: any) => {
                const task = get().db.tasks.find((row: any) => row.id === taskId);
                if (task?.thread_id)
                    get().addThreadReply(task.thread_id, {
                        author: actor.name,
                        role: actor.role,
                        body: `Visit report filed and task completed for ${visit.location_name}.`,
                        kind: "decision",
                        related_thread_id: threadId,
                    });
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Filed visit report for ${visit.location_name}; ${reportTaskIds.length} linked report task(s) completed.`,
                entity_type: "visit",
                entity_id: id,
                entity_label: visit.location_name,
                kind: "update",
                cross_post: [
                    ...(visit.work_order_id ? [{ entity_type: "workOrder", entity_id: visit.work_order_id }] : []),
                    ...(visit.site_id ? [{ entity_type: "site", entity_id: visit.site_id }] : []),
                    ...(visit.customer_id ? [{ entity_type: "customer", entity_id: visit.customer_id }] : []),
                    ...(visit.contractor_id ? [{ entity_type: "contractor", entity_id: visit.contractor_id, entity_label: visit.contractor_name }] : []),
                ],
            });
        },
    };
}
