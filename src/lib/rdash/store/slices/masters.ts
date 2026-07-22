import type { AttendancePolicy, AttendanceRecord, RDashDatabase, CommissionRule, ContractorRate, SourcePartner, PayrollPeriod, PayrollLine, SalaryAdjustment, AutomationRule, AutomationAction, ApprovalPolicy } from "../../types";
import type { MastersState } from "../types";
import type { StoreContext } from "../context";
import { attendancePolicyForStaff } from "../../attendance-policy";
import { dateFromIso, isAtOrAfterTime, minutesLate, verifyOfficeExitGps, verifyOfficeGps, verifyVisitGps } from "../../gps";
import { genId, nowIso, assertRole, businessDate } from "../helpers";

/**
 * B: Find the best-matching commission rule for a (sourcePartnerId, workCategoryId) pair.
 *
 * Match priority (highest first):
 *   1. Rule with `source_partner_id` AND `applies_to="category"` AND `category_id` matches.
 *   2. Rule with `source_partner_id` AND `applies_to="workOrder"` (applies to any workOrder for this partner).
 *   3. Rule with `source_partner_id` AND `applies_to="all"` (partner-specific catch-all).
 *   4. First rule with `applies_to="all"` and no partner filter (global fallback).
 *
 * Returns the winning rule, or `undefined` if no rule matches. The caller is
 * expected to fall back to `partner.commission_pct || 5` if this returns
 * undefined — so this selector only governs the master-driven path.
 *
 * Pure function — safe to import from any slice. Used by `accrueCommission`
 * (contractors.ts, owned by Agent B) and the commissions UI.
 */
export function findCommissionRule(
    db: RDashDatabase,
    sourcePartnerId: string,
    workCategoryId?: string,
): CommissionRule | undefined {
    const rules = db.master.commissionRules || [];
    if (!rules.length)
        return undefined;
    const forPartner = rules.filter((r) => r.source_partner_id === sourcePartnerId);
    if (workCategoryId) {
        const exact = forPartner.find((r) => r.applies_to === "category" && r.category_id === workCategoryId);
        if (exact)
            return exact;
    }
    const workOrderRule = forPartner.find((r) => r.applies_to === "workOrder");
    if (workOrderRule)
        return workOrderRule;
    const partnerAll = forPartner.find((r) => r.applies_to === "all");
    if (partnerAll)
        return partnerAll;
    return rules.find((r) => r.applies_to === "all" && !r.source_partner_id);
}

/**
 * E: Evaluate a rule's `condition` (a flat object of dotted-path → expected
 * value pairs) against the fireAutomation `context` payload. Empty / missing
 * condition matches everything. Unknown paths do not match.
 *
 * Example: condition `{ "amount": 50000, "customerId": "cust-1" }` matches
 * when context.amount === 50000 AND context.customerId === "cust-1".
 */
function automationConditionMatches(rule: AutomationRule, context: Record<string, unknown>): boolean {
    if (!rule.condition)
        return true;
    const entries = Object.entries(rule.condition);
    if (!entries.length)
        return true;
    return entries.every(([key, expected]) => {
        const actual = context[key];
        if (typeof expected === "object" && expected !== null && typeof actual === "object" && actual !== null) {
            return JSON.stringify(actual) === JSON.stringify(expected);
        }
        return actual === expected;
    });
}

/**
 * E: Dispatch a single AutomationAction. Reads `state` (a snapshot of the
 * store at the time of fire) so it can resolve IDs/names. Side effects:
 * creates tasks, comms, or updates the referenced entity. Wrapped in
 * try/catch by the caller — exceptions are surfaced as audit alerts.
 */
function dispatchAutomationAction(
    state: any,
    action: AutomationAction,
    context: Record<string, unknown>,
    rule: AutomationRule,
): void {
    const label = action.label || action.type;
    switch (action.type) {
        case "create_task": {
            // Pull task fields from the action.payload (optional JSON string) or
            // fall back to context-derived defaults.
            let payload: Record<string, unknown> = {};
            if (action.payload) {
                try {
                    payload = typeof action.payload === "string"
                        ? JSON.parse(action.payload)
                        : action.payload;
                }
                catch {
                    payload = {};
                }
            }
            const title = String(payload.title || `Automation task: ${label}`);
            const dueDate = payload.due_date
                ? String(payload.due_date)
                : new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
            state.addTask({
                title,
                description: String(payload.description || `Auto-created by rule "${rule.name}". Trigger: ${rule.trigger}.`),
                status: "todo",
                priority: (payload.priority as any) || "medium",
                task_scope: (payload.task_scope as any) || "general",
                task_type: `automation:${rule.id}`,
                due_date: dueDate,
                assignee_name: (payload.assignee_name as string) || undefined,
                customer_id: (context.customerId as string) || (payload.customer_id as string) || undefined,
                quotation_id: (context.quotationId as string) || (payload.quotation_id as string) || undefined,
                work_order_id: (context.workOrderId as string) || (payload.work_order_id as string) || undefined,
                site_id: (context.siteId as string) || (payload.site_id as string) || undefined,
                auto_generated: true,
            });
            return;
        }
        case "send_alert": {
            // Notify via an audit log entry. If a customer_id is present in
            // context, also log a comm send so the alert shows up in the
            // Communication Centre's history feed.
            const message = action.payload
                ? (typeof action.payload === "string" ? action.payload : JSON.stringify(action.payload))
                : `Automation "${rule.name}" fired for trigger ${rule.trigger}.`;
            const customerId = context.customerId as string | undefined;
            if (customerId) {
                try {
                    state.sendComm({
                        channel: "email",
                        customer_id: customerId,
                        staff_name: "Control Brain",
                        subject: `Alert: ${rule.name}`,
                        body: message,
                        status: "sent",
                    });
                }
                catch {
                    // sendComm may throw if no customer is resolvable — fall
                    // back to a pure audit-log alert.
                    state.logAudit({
                        actor: "Control Brain",
                        actor_role: "Automation",
                        action: `Alert from rule "${rule.name}": ${message}`,
                        entity_type: "automation_rule",
                        entity_id: rule.id,
                        entity_label: rule.name,
                        kind: "alert",
                    });
                }
            }
            else {
                state.logAudit({
                    actor: "Control Brain",
                    actor_role: "Automation",
                    action: `Alert from rule "${rule.name}": ${message}`,
                    entity_type: "automation_rule",
                    entity_id: rule.id,
                    entity_label: rule.name,
                    kind: "alert",
                });
            }
            return;
        }
        case "update_status": {
            // Update the referenced entity's status. context must include
            // entityType + entityId. payload is the new status string.
            const entityType = (context.entityType as string) || (context.kind as string);
            const entityId = (context.entityId as string) || (context.quotationId as string) || (context.workOrderId as string);
            const newStatus = action.payload
                ? (typeof action.payload === "string" ? action.payload : String((action.payload as any).status || ""))
                : "";
            if (!entityType || !entityId || !newStatus)
                return;
            if (entityType === "quotation" && state.updateQuotation) {
                state.updateQuotation(entityId, { status: newStatus as any });
            }
            else if (entityType === "workOrder" && state.updateJob) {
                state.updateJob(entityId, { status: newStatus as any });
            }
            // Other entity types are not owned by this agent — log only.
            else {
                state.logAudit({
                    actor: "Control Brain",
                    actor_role: "Automation",
                    action: `update_status action could not be applied to ${entityType}/${entityId} (no handler).`,
                    entity_type: "automation_rule",
                    entity_id: rule.id,
                    entity_label: rule.name,
                    kind: "alert",
                });
            }
            return;
        }
        // create_approval / create_obstacle / create_payment / create_job /
        // create_boq / create_commission are owned by other slices (procurement,
        // risks, finance, execution, contractors). For those, we log a structured
        // audit entry so the rule's intent is visible — the actual creation is
        // deferred to a follow-up hook in the owning slice (cross-agent contract).
        default: {
            state.logAudit({
                actor: "Control Brain",
                actor_role: "Automation",
                action: `Automation rule "${rule.name}" requested ${action.type} (${label}) — recorded for the owning module to act on.`,
                entity_type: "automation_rule",
                entity_id: rule.id,
                entity_label: rule.name,
                kind: "system",
                reason: `Context: ${JSON.stringify(context).slice(0, 200)}`,
            });
        }
    }
}

export function createMastersSlice(ctx: StoreContext): MastersState {
    const { commitState, get } = ctx;

    return {
        addApprovalPolicy: (p) => {
            const actor = get().currentUser();
            const created = commitState((s: any) => {
                const now = nowIso();
                const pol: ApprovalPolicy = {
                    id: genId("pol"),
                    name: p.name || "New policy",
                    trigger: p.trigger || "po_amount",
                    threshold: p.threshold || 0,
                    operator: p.operator || ">",
                    approver_role: p.approver_role || "Owner",
                    approver_id: p.approver_id,
                    approver_name: p.approver_name || "Owner",
                    auto_escalate_hours: p.auto_escalate_hours,
                    escalate_to: p.escalate_to,
                    enabled: p.enabled ?? true,
                    description: p.description,
                    created_at: now,
                    updated_at: now,
                };
                return {
                    db: { ...s.db, approvalPolicies: [pol, ...s.db.approvalPolicies] },
                };
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Created approval policy "${p.name || "New policy"}" (trigger: ${p.trigger || "po_amount"})`,
                entity_type: "approval_policy",
                entity_label: p.name || "New policy",
                kind: "create",
            });
            return created;
        },

        updateApprovalPolicy: (id, patch) => {
            const actor = get().currentUser();
            const before = get().db.approvalPolicies.find((p: any) => p.id === id);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    approvalPolicies: s.db.approvalPolicies.map((p: any) => p.id === id ? { ...p, ...patch, updated_at: nowIso() } : p),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Updated approval policy "${before?.name || id}"`,
                entity_type: "approval_policy",
                entity_id: id,
                entity_label: before?.name,
                kind: "update",
            });
        },

        toggleApprovalPolicy: (id) => {
            const actor = get().currentUser();
            const before = get().db.approvalPolicies.find((p: any) => p.id === id);
            const nowEnabled = before ? !before.enabled : false;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    approvalPolicies: s.db.approvalPolicies.map((p: any) => p.id === id
                        ? { ...p, enabled: !p.enabled, updated_at: nowIso() }
                        : p),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${nowEnabled ? "Enabled" : "Disabled"} approval policy "${before?.name || id}"`,
                entity_type: "approval_policy",
                entity_id: id,
                entity_label: before?.name,
                kind: "update",
            });
        },

        deleteApprovalPolicy: (id) => {
            const actor = get().currentUser();
            const before = get().db.approvalPolicies.find((p: any) => p.id === id);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    approvalPolicies: s.db.approvalPolicies.filter((p: any) => p.id !== id),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Deleted approval policy "${before?.name || id}"`,
                entity_type: "approval_policy",
                entity_id: id,
                entity_label: before?.name,
                kind: "delete",
            });
        },

        requiresApproval: (trigger, amount) => {
            const policies = get().db.approvalPolicies.filter((p: any) => p.enabled && p.trigger === trigger);
            for (const p of policies) {
                const matches = p.operator === ">"
                    ? amount > p.threshold
                    : p.operator === ">="
                        ? amount >= p.threshold
                        : amount === p.threshold;
                if (matches)
                    return p;
            }
            return null;
        },

        toggleAutomationRule: (id) => {
            const actor = get().currentUser();
            const before = get().db.automationRules.find((r: any) => r.id === id);
            const nowEnabled = before ? !before.enabled : false;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    automationRules: s.db.automationRules.map((r: any) => r.id === id
                        ? { ...r, enabled: !r.enabled, updated_at: nowIso() }
                        : r),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${nowEnabled ? "Enabled" : "Disabled"} automation rule "${before?.name || id}"`,
                entity_type: "automation_rule",
                entity_id: id,
                entity_label: before?.name,
                kind: "update",
            });
        },

        updateAutomationRule: (id, patch) => {
            const actor = get().currentUser();
            const before = get().db.automationRules.find((r: any) => r.id === id);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    automationRules: s.db.automationRules.map((r: any) => r.id === id ? { ...r, ...patch, updated_at: nowIso() } : r),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Updated automation rule "${before?.name || id}"`,
                entity_type: "automation_rule",
                entity_id: id,
                entity_label: before?.name,
                kind: "update",
            });
        },

        addAutomationRule: (r) => {
            const actor = get().currentUser();
            commitState((s: any) => {
                const now = nowIso();
                const rule: AutomationRule = {
                    id: genId("auto"),
                    name: r.name || "New automation",
                    trigger: r.trigger || "po_created",
                    trigger_label: r.trigger_label || "When triggered",
                    actions: r.actions || [],
                    enabled: r.enabled ?? true,
                    fires_count: 0,
                    condition: r.condition,
                    description: r.description,
                    created_at: now,
                    updated_at: now,
                };
                return {
                    db: { ...s.db, automationRules: [...s.db.automationRules, rule] },
                };
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Created automation rule "${r.name || "New automation"}" (trigger: ${r.trigger || "po_created"})`,
                entity_type: "automation_rule",
                entity_label: r.name || "New automation",
                kind: "create",
            });
        },

        fireAutomation: (trigger, context) => {
            const state = get();
            const actor = state.currentUser();
            const rules = state.db.automationRules.filter((r: AutomationRule) => r.enabled && r.trigger === trigger);
            if (!rules.length)
                return;
            const firedAt = nowIso();
            const matchedRuleIds = new Set<string>();
            for (const rule of rules) {
                if (!automationConditionMatches(rule, context))
                    continue;
                matchedRuleIds.add(rule.id);
                // Dispatch every action declared on the rule.
                for (const action of rule.actions) {
                    try {
                        dispatchAutomationAction(state, action, context, rule);
                    }
                    catch (err) {
                        // Log the failure as an alert audit entry — do not throw,
                        // because fireAutomation is called from inside other
                        // mutations and must not break the parent flow.
                        get().logAudit({
                            actor: "Control Brain",
                            actor_role: "Automation",
                            action: `Automation rule "${rule.name}" action "${action.type}" failed: ${err instanceof Error ? err.message : String(err)}`,
                            entity_type: "automation_rule",
                            entity_id: rule.id,
                            entity_label: rule.name,
                            kind: "alert",
                        });
                    }
                }
            }
            if (!matchedRuleIds.size)
                return;
            // Increment fires_count + set last_fired_at on every matched rule.
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    automationRules: s.db.automationRules.map((r: AutomationRule) => matchedRuleIds.has(r.id)
                        ? {
                            ...r,
                            fires_count: (r.fires_count || 0) + 1,
                            last_fired_at: firedAt,
                            updated_at: firedAt,
                        }
                        : r),
                },
            }));
            // One audit log entry per fire batch — easy to scan in the Audit Log.
            const ruleLabels = rules.filter((r) => matchedRuleIds.has(r.id)).map((r) => r.name).join(", ");
            get().logAudit({
                actor: "Control Brain",
                actor_role: "Automation",
                action: `Automation fired: trigger "${trigger}" matched ${matchedRuleIds.size} rule(s) — ${ruleLabels}`,
                entity_type: "automation_rule",
                entity_label: ruleLabels,
                kind: "system",
                reason: `Context: ${JSON.stringify(context).slice(0, 200)}`,
            });
            // Note: actor is not used inside fireAutomation beyond logging context —
            // we keep the reference for future "actor-aware" actions.
            void actor;
        },

        updateAttendancePolicy: (staffId, patch) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "update attendance policy");
            const staff = get().db.master.staff.find((row: any) => row.id === staffId);
            if (!staff)
                throw new Error("Select an active staff member before updating attendance policy.");
            const next = { ...staff.attendance_policy, ...patch };
            if (!Number.isFinite(next.geofence_radius_m) || next.geofence_radius_m < 20) {
                throw new Error("Office geofence radius must be at least 20 m.");
            }
            if (!Number.isFinite(next.visit_geofence_radius_m) || next.visit_geofence_radius_m < 20) {
                throw new Error("Visit geofence radius must be at least 20 m.");
            }
            if (!Number.isFinite(next.max_gps_accuracy_m) || next.max_gps_accuracy_m < 5) {
                throw new Error("Maximum GPS accuracy must be at least 5 m.");
            }
            if (!Number.isFinite(next.auto_entry_dwell_seconds) || next.auto_entry_dwell_seconds < 15) {
                throw new Error("Automatic check-in dwell must be at least 15 seconds.");
            }
            if (!Number.isFinite(next.auto_exit_dwell_seconds) || next.auto_exit_dwell_seconds < 30) {
                throw new Error("Automatic check-out dwell must be at least 30 seconds.");
            }
            if (!Number.isFinite(next.auto_exit_buffer_m) || next.auto_exit_buffer_m < 10) {
                throw new Error("Automatic check-out buffer must be at least 10 m.");
            }
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    master: {
                        ...state.db.master,
                        staff: state.db.master.staff.map((row: any) => row.id === staffId ? { ...row, attendance_policy: next } : row),
                    },
                },
            }));
            const actor = get().currentUser();
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Updated attendance policy for ${staff.name}`,
                entity_type: "attendance_policy",
                entity_id: staffId,
                entity_label: staff.name,
                kind: "update",
            });
        },

        checkInAttendance: (input) => {
            const state = get();
            const actor = state.currentUser();
            const targetStaffId = input.staff_id || actor.staffId;
            if (!targetStaffId)
                throw new Error("An active staff record is required to record attendance.");
            if (input.staff_id && input.staff_id !== actor.staffId)
                assertRole(state.currentUser().role, ["Owner", "Operations Manager"], "record attendance for another staff member");
            const staff = state.db.master.staff.find((row: any) => row.id === targetStaffId && row.status === "active");
            if (!staff)
                throw new Error("Active staff record not found.");
            const policy = attendancePolicyForStaff(state.db, staff.id);
            const timestamp = input.captured_at || nowIso();
            const actionSource = input.action_source === "auto_geofence" ? "auto_geofence" : "manual";
            if (actionSource === "auto_geofence" && (!policy.auto_geofence_enabled || !policy.auto_check_in_enabled)) {
                throw new Error("Automatic attendance check-in is disabled by policy. Use the manual button.");
            }
            const date = dateFromIso(timestamp);
            const existing = state.db.attendance.find((row: AttendanceRecord) => row.staff_id === staff.id && row.date === date);
            if (existing?.check_in)
                throw new Error("Attendance check-in is already recorded for this staff member today.");
            if (existing?.auto_generated && existing.status === "absent")
                throw new Error("This staff member was automatically marked absent. Owner or Operations must correct the record after review.");
            let verification: any;
            let mode: AttendanceRecord["attendance_mode"] = "office";
            let location = policy.office_name || "Office";
            if (input.visit_id) {
                const visit = state.db.visits.find((row: any) => row.id === input.visit_id);
                if (!visit)
                    throw new Error("Visit not found for field attendance.");
                if (visit.staff_id !== staff.id)
                    throw new Error("Field attendance can only use a Visit assigned to the same staff member.");
                verification = verifyVisitGps(input, visit, policy);
                mode = "field_visit";
                location = visit.location_name;
            }
            else {
                verification = verifyOfficeGps(input, policy);
            }
            const lateMinutes = minutesLate(timestamp, policy.standard_check_in_time, policy.late_grace_minutes);
            const record: AttendanceRecord = {
                id: existing?.id || genId("att"),
                staff_id: staff.id,
                staff_name: staff.name,
                date,
                attendance_mode: mode,
                visit_id: input.visit_id,
                check_in: timestamp,
                check_in_latitude: input.latitude,
                check_in_longitude: input.longitude,
                check_in_accuracy_m: input.accuracy_m,
                check_in_distance_m: verification.distance_m,
                check_in_verification: "verified",
                check_in_source: actionSource,
                late_minutes: lateMinutes,
                late: lateMinutes > 0,
                status: "present",
                location,
                created_at: existing?.created_at || timestamp,
                updated_at: timestamp,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    attendance: existing
                        ? s.db.attendance.map((row: AttendanceRecord) => row.id === existing.id ? record : row)
                        : [record, ...s.db.attendance],
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} attendance check-in for ${staff.name} at ${location}`,
                entity_type: "attendance",
                entity_id: record.id,
                entity_label: staff.name,
                kind: "update",
            });
            return record.id;
        },

        checkOutAttendance: (input) => {
            const state = get();
            const actor = state.currentUser();
            const targetStaffId = input.staff_id || actor.staffId;
            if (!targetStaffId)
                throw new Error("An active staff record is required to record attendance.");
            if (input.staff_id && input.staff_id !== actor.staffId)
                assertRole(state.currentUser().role, ["Owner", "Operations Manager"], "record attendance for another staff member");
            const timestamp = input.captured_at || nowIso();
            const policy = attendancePolicyForStaff(state.db, targetStaffId);
            const actionSource = input.action_source === "auto_geofence" ? "auto_geofence" : "manual";
            if (actionSource === "auto_geofence" && (!policy.auto_geofence_enabled || !policy.auto_check_out_enabled)) {
                throw new Error("Automatic attendance check-out is disabled by policy. Use the manual button.");
            }
            const record = state.db.attendance.find((row: AttendanceRecord) => row.staff_id === targetStaffId && row.date === dateFromIso(timestamp));
            if (!record?.check_in || record.status === "absent")
                throw new Error("A verified attendance check-in is required before check-out.");
            if (record.check_out)
                throw new Error("Attendance check-out is already recorded for today.");
            let verification: any;
            if (record.attendance_mode === "field_visit") {
                const visit = record.visit_id
                    ? state.db.visits.find((row: any) => row.id === record.visit_id)
                    : undefined;
                if (!visit)
                    throw new Error("The linked Visit is missing; attendance check-out requires Operations review.");
                verification = verifyVisitGps(input, visit, policy);
            }
            else {
                verification = actionSource === "auto_geofence"
                    ? verifyOfficeExitGps(input, policy)
                    : verifyOfficeGps(input, policy);
            }
            const workMinutes = Math.max(0, Math.round((new Date(timestamp).getTime() -
                new Date(record.check_in).getTime()) /
                60000));
            const status: AttendanceRecord["status"] = workMinutes < policy.minimum_half_day_minutes
                ? "half_day"
                : "present";
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    attendance: s.db.attendance.map((row: AttendanceRecord) => row.id === record.id
                        ? {
                            ...row,
                            check_out: timestamp,
                            check_out_latitude: input.latitude,
                            check_out_longitude: input.longitude,
                            check_out_accuracy_m: input.accuracy_m,
                            check_out_distance_m: verification.distance_m,
                            check_out_verification: "verified",
                            check_out_source: actionSource,
                            work_minutes: workMinutes,
                            status,
                            updated_at: timestamp,
                        }
                        : row),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${actionSource === "auto_geofence" ? "Automatic geofence" : "Manual"} attendance check-out (${workMinutes} minutes)`,
                entity_type: "attendance",
                entity_id: record.id,
                entity_label: record.staff_name,
                kind: "update",
            });
        },

        runAttendanceReconciliation: (at) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "run attendance reconciliation");
            const state = get();
            const now = at ? new Date(at) : new Date();
            if (Number.isNaN(now.getTime()))
                return 0;
            const date = dateFromIso(now.toISOString());
            const missing = state.db.master.staff.filter((staff: any) => {
                const policy = attendancePolicyForStaff(state.db, staff.id);
                return staff.status === "active"
                    && policy.auto_absent_enabled
                    && isAtOrAfterTime(now, policy.auto_absent_after)
                    && !state.db.attendance.some((record: AttendanceRecord) => record.staff_id === staff.id && record.date === date);
            });
            if (!missing.length)
                return 0;
            const timestamp = now.toISOString();
            const records: AttendanceRecord[] = missing.map((staff: any) => ({
                id: genId("att"),
                staff_id: staff.id,
                staff_name: staff.name,
                date,
                attendance_mode: "auto_absent",
                status: "absent",
                auto_generated: true,
                review_required: true,
                review_note: `No verified GPS attendance check-in by ${attendancePolicyForStaff(state.db, staff.id).auto_absent_after}.`,
                created_at: timestamp,
                updated_at: timestamp,
            }));
            commitState((s: any) => ({
                db: { ...s.db, attendance: [...records, ...s.db.attendance] },
            }));
            const actor = state.currentUser();
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Attendance reconciliation marked ${records.length} staff absent for ${date}`,
                entity_type: "attendance",
                entity_label: date,
                kind: "system",
            });
            return records.length;
        },

        regularizeAttendance: (recordId, input) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager", "Accounts / Admin"], "regularize attendance");
            const state = get();
            const actor = state.currentUser();
            const record = state.db.attendance.find((r: any) => r.id === recordId);
            if (!record)
                throw new Error("Attendance record not found.");
            if (!input.reason.trim())
                throw new Error("A regularization reason is required (audit trail).");
            const now = nowIso();
            const wasAutoAbsent = record.attendance_mode === "auto_absent" || record.auto_generated;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    attendance: s.db.attendance.map((r: any) => r.id === recordId
                        ? {
                            ...r,
                            status: input.status,
                            attendance_mode: wasAutoAbsent ? "manual_adjustment" : r.attendance_mode,
                            // Preserve auto_generated so the correction trail is visible.
                            auto_generated: r.auto_generated,
                            review_required: false,
                            review_note: `Regularized by ${actor.name}: ${input.reason}`,
                            check_in: input.check_in || r.check_in,
                            check_out: input.check_out || r.check_out,
                            updated_at: now,
                        }
                        : r),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Regularized attendance for ${record.staff_name} on ${record.date}: ${record.status} → ${input.status}. Reason: "${input.reason}"`,
                entity_type: "attendance",
                entity_id: recordId,
                entity_label: `${record.staff_name} · ${record.date}`,
                kind: "decision",
            });
        },

        computeStaffSalary: (staffId, yearMonth) => {
            const state = get();
            const staff = state.db.master.staff.find((s: any) => s.id === staffId);
            if (!staff)
                throw new Error("Staff not found.");
            const baseSalary = staff.monthly_salary || (staff.daily_wage ? staff.daily_wage * 30 : 0);
            const perDayRate = baseSalary > 0 ? Math.round((baseSalary / 30) * 100) / 100 : 0;
            // Filter attendance records for this staff + month (yearMonth = "YYYY-MM").
            const records = state.db.attendance.filter((r: any) =>
                r.staff_id === staffId && r.date.startsWith(yearMonth));
            const policy = staff.attendance_policy;
            const lateGrace = policy?.late_grace_minutes || 0;
            const absentDeductionEnabled = policy?.absent_deduction_enabled ?? true;
            const absentDeductionDays = policy?.absent_deduction_days ?? 1;
            const violations: Array<{ date: string; type: "late" | "absent" | "half_day"; late_minutes?: number; rule: string; deduction: number; }> = [];
            let presentDays = 0;
            let absentDays = 0;
            let halfDays = 0;
            let lateDays = 0;
            let lateDeductionTotal = 0;
            let absenceDeductionTotal = 0;
            for (const record of records) {
                if (record.status === "present") {
                    presentDays++;
                    // Check lateness.
                    if (record.late && record.late_minutes && record.late_minutes > lateGrace) {
                        const excessMinutes = record.late_minutes - lateGrace;
                        // Deduct proportional to excess late minutes: 1 day's wage per 240 minutes (4 hours) of cumulative lateness.
                        const lateDeduction = Math.round(perDayRate * (excessMinutes / 240) * 100) / 100;
                        lateDays++;
                        lateDeductionTotal += lateDeduction;
                        violations.push({
                            date: record.date,
                            type: "late",
                            late_minutes: record.late_minutes,
                            rule: `Late by ${record.late_minutes} min (grace: ${lateGrace} min). Deduction: ${perDayRate} × (${excessMinutes}/240 min) = ₹${lateDeduction}`,
                            deduction: lateDeduction,
                        });
                    }
                }
                else if (record.status === "absent") {
                    absentDays++;
                    if (absentDeductionEnabled) {
                        const deduction = Math.round(perDayRate * absentDeductionDays * 100) / 100;
                        absenceDeductionTotal += deduction;
                        violations.push({
                            date: record.date,
                            type: "absent",
                            rule: `Absent. Deduction: ${perDayRate} × ${absentDeductionDays} day(s) = ₹${deduction}`,
                            deduction,
                        });
                    }
                }
                else if (record.status === "half_day") {
                    halfDays++;
                    const deduction = Math.round(perDayRate * 0.5 * 100) / 100;
                    absenceDeductionTotal += deduction;
                    violations.push({
                        date: record.date,
                        type: "half_day",
                        rule: `Half day. Deduction: ${perDayRate} × 0.5 = ₹${deduction}`,
                        deduction,
                    });
                }
            }
            const totalDeductions = Math.round((lateDeductionTotal + absenceDeductionTotal) * 100) / 100;
            const netSalary = Math.round((baseSalary - totalDeductions) * 100) / 100;
            return {
                staff_id: staffId,
                staff_name: staff.name,
                year_month: yearMonth,
                base_salary: baseSalary,
                per_day_rate: perDayRate,
                present_days: presentDays,
                absent_days: absentDays,
                half_days: halfDays,
                late_days: lateDays,
                late_deduction_total: lateDeductionTotal,
                absence_deduction_total: absenceDeductionTotal,
                total_deductions: totalDeductions,
                net_salary: netSalary,
                violations,
            };
        },

        createPayrollPeriod: (month, year) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager", "Accounts / Admin"], "generate payroll");
            const state = get();
            const actor = state.currentUser();
            // Reject duplicate periods for the same month/year (status != cancelled).
            const existing = (state.db.payrollPeriods || []).find((p: PayrollPeriod) => p.month === month && p.year === year && p.status !== "cancelled");
            if (existing)
                throw new Error(`Payroll for ${month}/${year} already exists (status: ${existing.status}). Reopen it instead.`);
            const id = genId("payroll");
            const now = nowIso();
            const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
            // Generate one payrollLine per active staff member using computeStaffSalary.
            const activeStaff = state.db.master.staff.filter((s: any) => s.status === "active");
            const lines: PayrollLine[] = activeStaff.map((staff: any) => {
                const computation = state.computeStaffSalary(staff.id, yearMonth);
                // Pull approved salary adjustments for this staff in this month.
                const adjustments = (state.db.salaryAdjustments || []).filter((adj: SalaryAdjustment) => adj.staff_id === staff.id && adj.status === "approved" && adj.adjustment_date.startsWith(yearMonth));
                const overtimeAmount = Math.round(adjustments.filter((a) => a.type === "overtime" || a.type === "bonus").reduce((n, a) => n + a.amount, 0) * 100) / 100;
                const otherDeductions = Math.round(adjustments.filter((a) => a.type === "deduction" || a.type === "advance" || a.type === "hold").reduce((n, a) => n + a.amount, 0) * 100) / 100;
                const grossPay = Math.round((computation.base_salary) * 100) / 100;
                const netPayable = Math.round((computation.net_salary + overtimeAmount - otherDeductions) * 100) / 100;
                const line: PayrollLine = {
                    id: genId("pline"),
                    payroll_period_id: id,
                    staff_id: staff.id,
                    base_salary: computation.base_salary,
                    present_days: computation.present_days,
                    absent_days: computation.absent_days,
                    paid_leave_days: 0,
                    overtime_amount: overtimeAmount,
                    advance_deduction: Math.round(adjustments.filter((a) => a.type === "advance").reduce((n, a) => n + a.amount, 0) * 100) / 100,
                    other_deductions: Math.round(adjustments.filter((a) => a.type === "deduction" || a.type === "hold").reduce((n, a) => n + a.amount, 0) * 100) / 100,
                    gross_pay: grossPay,
                    net_payable: netPayable,
                    payment_status: "pending",
                    deduction_explanation: `${computation.late_days} late day(s), ${computation.absent_days} absent, ${computation.half_days} half-day.`,
                };
                return line;
            });
            const period: PayrollPeriod = {
                id,
                month,
                year,
                status: "generated",
                generated_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    payrollPeriods: [period, ...(s.db.payrollPeriods || [])],
                    payrollLines: [...lines, ...(s.db.payrollLines || [])],
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Generated payroll for ${month}/${year} with ${lines.length} staff line(s).`,
                entity_type: "payroll_period",
                entity_id: id,
                entity_label: `${month}/${year}`,
                kind: "create",
            });
            return id;
        },

        addSalaryAdjustment: (staffId, type, amount, reason) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager", "Accounts / Admin"], "add salary adjustment");
            const state = get();
            const actor = state.currentUser();
            const staff = state.db.master.staff.find((s: any) => s.id === staffId);
            if (!staff)
                throw new Error("Staff not found.");
            if (!reason.trim())
                throw new Error("A reason is required for every salary adjustment (audit trail).");
            if (!Number.isFinite(amount) || amount <= 0)
                throw new Error("Adjustment amount must be a positive number.");
            const id = genId("sadj");
            const adjustment: SalaryAdjustment = {
                id,
                staff_id: staffId,
                adjustment_date: nowIso().slice(0, 10),
                type,
                amount: Math.round(amount * 100) / 100,
                reason: reason.trim(),
                status: "draft",
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    salaryAdjustments: [adjustment, ...(s.db.salaryAdjustments || [])],
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Added ${type} salary adjustment of ₹${amount} for ${staff.name}. Reason: ${reason.trim()}`,
                entity_type: "salary_adjustment",
                entity_id: id,
                entity_label: `${staff.name} · ${type}`,
                kind: "create",
            });
            return id;
        },

        approvePayrollPeriod: (id) => {
            assertRole(get().currentUser().role, ["Owner"], "approve payroll");
            const state = get();
            const actor = state.currentUser();
            const period = (state.db.payrollPeriods || []).find((p: PayrollPeriod) => p.id === id);
            if (!period)
                throw new Error("Payroll period not found.");
            if (period.status !== "generated")
                throw new Error(`Payroll period is ${period.status}; only generated periods can be approved.`);
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    payrollPeriods: (s.db.payrollPeriods || []).map((p: PayrollPeriod) => p.id === id
                        ? {
                            ...p,
                            status: "approved",
                            approved_at: now,
                            approved_by_staff_id: actor.staffId,
                        }
                        : p),
                    payrollLines: (s.db.payrollLines || []).map((l: PayrollLine) => l.payroll_period_id === id
                        ? { ...l, payment_status: "approved" as const }
                        : l),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Approved payroll for ${period.month}/${period.year}.`,
                entity_type: "payroll_period",
                entity_id: id,
                entity_label: `${period.month}/${period.year}`,
                kind: "approve",
            });
        },

        payPayrollPeriod: (id) => {
            assertRole(get().currentUser().role, ["Owner", "Accounts / Admin"], "mark payroll paid");
            const state = get();
            const actor = state.currentUser();
            const period = (state.db.payrollPeriods || []).find((p: PayrollPeriod) => p.id === id);
            if (!period)
                throw new Error("Payroll period not found.");
            if (period.status !== "approved")
                throw new Error(`Payroll period is ${period.status}; only approved periods can be marked paid.`);
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    payrollPeriods: (s.db.payrollPeriods || []).map((p: PayrollPeriod) => p.id === id
                        ? {
                            ...p,
                            status: "paid",
                            paid_at: now,
                            paid_by_staff_id: actor.staffId,
                        }
                        : p),
                    payrollLines: (s.db.payrollLines || []).map((l: PayrollLine) => l.payroll_period_id === id
                        ? { ...l, payment_status: "paid" as const }
                        : l),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Marked payroll for ${period.month}/${period.year} as paid.`,
                entity_type: "payroll_period",
                entity_id: id,
                entity_label: `${period.month}/${period.year}`,
                kind: "update",
            });
        },

        reopenPayrollPeriod: (id) => {
            assertRole(get().currentUser().role, ["Owner"], "reopen payroll");
            const state = get();
            const actor = state.currentUser();
            const period = (state.db.payrollPeriods || []).find((p: PayrollPeriod) => p.id === id);
            if (!period)
                throw new Error("Payroll period not found.");
            if (period.status === "generated" || period.status === "cancelled")
                throw new Error(`Payroll period is already ${period.status}; cannot reopen.`);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    payrollPeriods: (s.db.payrollPeriods || []).map((p: PayrollPeriod) => p.id === id
                        ? {
                            ...p,
                            status: "generated",
                            approved_at: undefined,
                            approved_by_staff_id: undefined,
                            paid_at: undefined,
                            paid_by_staff_id: undefined,
                        }
                        : p),
                    payrollLines: (s.db.payrollLines || []).map((l: PayrollLine) => l.payroll_period_id === id
                        ? { ...l, payment_status: "pending" as const }
                        : l),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Reopened payroll for ${period.month}/${period.year} (was ${period.status}).`,
                entity_type: "payroll_period",
                entity_id: id,
                entity_label: `${period.month}/${period.year}`,
                kind: "update",
            });
        },

        // FIX-CONTRACTOR-BATCH2 / F.12: Add a contractor rate row. The UI in
        // MastersSalesOpsModule "Add contractor rate" dialog drives this. The
        // store previously had NO action for contractor-rate CRUD — the only
        // way to create rows was via seed/import, so the contractor rates tab
        // was operationally read-only.
        addContractorRate: (r) => {
            const actor = get().currentUser();
            const contractor = get().db.master.contractors.find((c: any) => c.id === r.contractor_id);
            if (!contractor)
                throw new Error("Contractor not found.");
            const sub = r.work_subcategory_id
                ? get().db.master.workSubcategories.find((s: any) => s.id === r.work_subcategory_id)
                : undefined;
            const id = genId("crate");
            const now = nowIso();
            // If a subcategory was provided, default `trade` to the subcategory
            // name (so the legacy trade/rate display still works) and backfill
            // the labour_rate / with_material_rate from the dialog inputs.
            const rate: ContractorRate = {
                id,
                contractor_id: r.contractor_id || "",
                trade: r.trade || sub?.name || contractor.trade || "Contractor rate",
                rate: r.rate ?? r.labour_rate ?? 0,
                unit_id: r.unit_id,
                work_subcategory_id: r.work_subcategory_id,
                work_subcategory_name: sub?.name || r.work_subcategory_name,
                labour_rate: r.labour_rate,
                with_material_rate: r.with_material_rate,
            };
            void now; // created_at field doesn't exist on ContractorRate type — kept for parity with future schema extension.
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        contractorRates: [...s.db.master.contractorRates, rate],
                    },
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Added contractor rate for ${contractor.name} · ${rate.trade} — ${rate.rate}${rate.labour_rate != null || rate.with_material_rate != null ? ` (labour ${rate.labour_rate ?? "—"} / with material ${rate.with_material_rate ?? "—"})` : ""}`,
                entity_type: "contractorRate",
                entity_id: id,
                entity_label: `${contractor.name} · ${rate.trade}`,
                kind: "create",
                source_module: "masters",
            });
            return id;
        },

        // FIX-CONTRACTOR-BATCH2 / F.12: Add a commission-rule row. Drives
        // the findCommissionRule lookup used by accrueCommission — without
        // this UI, the master.commissionRules table was always empty on
        // production (0 rows), so accruals always fell back to
        // partner.commission_pct || 5.
        addCommissionRule: (r) => {
            const actor = get().currentUser();
            const partner = get().db.master.sourcePartners.find((p: any) => p.id === r.source_partner_id);
            if (!partner)
                throw new Error("Source partner not found.");
            if (r.applies_to === "category" && !r.category_id)
                throw new Error("Category-scoped commission rules require a category_id.");
            const category = r.category_id
                ? get().db.master.workCategories.find((c: any) => c.id === r.category_id)
                : undefined;
            const id = genId("crule");
            const rule: CommissionRule = {
                id,
                source_partner_id: r.source_partner_id || "",
                source_partner_name: partner.name,
                rate_pct: r.rate_pct ?? 0,
                // The legacy type allows "all" | "category" | "workOrder". The
                // UI form lets the user pick "quotation" | "work_order" (the
                // business labels) and we map them here: "quotation" → "all"
                // (partner-specific catch-all), "work_order" → "workOrder"
                // (partner-scoped workOrder rule).
                applies_to: (r.applies_to as any) === "quotation" ? "all"
                    : (r.applies_to as any) === "work_order" ? "workOrder"
                        : r.applies_to || "all",  // STAGE-6-FIX: cast for comparison
                category_id: r.category_id,
            };
            void category;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        commissionRules: [...s.db.master.commissionRules, rule],
                    },
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Added commission rule for ${partner.name} — ${rule.rate_pct}% (${rule.applies_to}${rule.category_id ? ` · ${rule.category_id}` : ""})`,
                entity_type: "commissionRule",
                entity_id: id,
                entity_label: `${partner.name} · ${rule.rate_pct}%`,
                kind: "create",
                source_module: "masters",
            });
            return id;
        },

        // FIX-CONTRACTOR-BATCH2 / F.12: Add a source-partner row. Drives the
        // customer/site source_partner_id dropdown AND the commission-rule
        // partner picker. Without this UI, source partners could only be
        // created via seed — so on production, no new partners could ever be
        // added, and the entire commission-accrual chain (which depends on
        // customer.source_partner_id) was unreachable.
        addSourcePartner: (p) => {
            const actor = get().currentUser();
            if (!p.name || !p.name.trim())
                throw new Error("Source partner name is required.");
            const id = genId("sp");
            const partner: SourcePartner = {
                id,
                name: p.name.trim(),
                type: p.type,
                phone: p.phone,
                email: p.email,
                commission_pct: p.commission_pct,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        sourcePartners: [...s.db.master.sourcePartners, partner],
                    },
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Added source partner ${partner.name}${partner.commission_pct != null ? ` (${partner.commission_pct}% default commission)` : ""}`,
                entity_type: "sourcePartner",
                entity_id: id,
                entity_label: partner.name,
                kind: "create",
                source_module: "masters",
            });
            return id;
        },
    };
}
