/**
 * Shared utilities used by store slices.
 * Extracted from store.ts during Phase 3 split — pure functions, no state.
 */
import type { RDashDatabase } from "../types";
import type { CurrentUserContext, GuardResult } from "./ui-types";

export function genId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;
}

export const nowIso = (): string => new Date().toISOString();

export function businessDate(value = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(value);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export const today = (): string => businessDate();

export function permissionError(role: string, action: string): Error {
    return new Error(`Permission denied: ${role} cannot ${action}.`);
}

export function assertRole(role: string, allowed: string[], action: string): void {
    if (!allowed.includes(role))
        throw permissionError(role, action);
}

/** Extract a Google Drive file ID from a Drive URL. */
export function googleFileIdFromUrl(value?: string): string | undefined {
    const match = /drive\.google\.com\/file\/d\/([^/?#]+)/.exec(value || "") || /[?&]id=([^&#]+)/.exec(value || "");
    return match?.[1];
}

/**
 * Test whether a URL points to a Google Drive stored media resource. Used by
 * the procurement slice (fileGRN) and by inline store.ts execution-log /
 * variation code to gate proof uploads on the Google Drive host.
 *
 * Moved from store.ts to helpers.ts during Phase 3i so the procurement slice
 * (fileGRN) and the remaining inline store.ts call sites (execution log
 * uploads, variation material-receipt confirmation) can share a single
 * implementation.
 */
export function isStoredMediaUrl(value?: string): boolean {
    return /^https:\/\/drive\.google\.com\//.test(value || "");
}

/**
 * Resolve a synthetic CurrentUserContext for the first active staff member
 * matching `role` (with common role aliases). Falls back to a stub with the
 * requested role if no matching staff member exists. Used by store actions
 * that need an "actor" for audit/thread messages when no human is signed in
 * (e.g. system-generated actions, auto-thread replies).
 *
 * Moved from store.ts to helpers.ts during Phase 3g so the vendor-bills
 * (and future procurement) slices can use it without duplicating logic.
 */
export function userForRole(db: RDashDatabase, role: string): CurrentUserContext {
    const aliases: Record<string, string[]> = {
        Owner: ["Owner"],
        "Operations Manager": ["Operations Manager", "Sales Lead"],
        "Field Staff": ["Field Staff"],
        "Procurement Staff": ["Procurement Staff"],
        Finance: ["Finance", "Accounts"],
        Accounts: ["Accounts", "Finance"],
        Designer: ["Designer"],
    };
    const wanted = aliases[role] || [role];
    const staff = db.master.staff.find((row) => row.status === "active" && wanted.includes(row.role));
    return {
        name: staff?.name || role,
        role: staff?.role || role,
        staffId: staff?.id,
    };
}

/**
 * Try each role in turn, returning the first match that resolves to a real
 * staff member. Falls back to a stub with `fallbackRole` if none match.
 */
export function userForAnyRole(db: RDashDatabase, roles: string[], fallbackRole: string): CurrentUserContext {
    for (const role of roles) {
        const user = userForRole(db, role);
        if (user.staffId)
            return user;
    }
    return { name: fallbackRole, role: fallbackRole };
}

/**
 * Add `days` to a date string (or today if undefined), returning a business
 * date string in IST. Midday IST is used to avoid DST/edge-of-day drift.
 *
 * Moved from store.ts to helpers.ts during Phase 3h so the contractors slice
 * (and other future slices) can use it without a circular import on
 * `dateOnlyFrom` (which lives in finance-helpers). The behaviour is
 * semantically identical to the original:
 *   - valid date string → businessDate(new Date(date))
 *   - undefined / invalid → businessDate(today)
 * followed by `+ days * 86400000` ms.
 */
export function addDays(date: string | undefined, days: number): string {
    const base = date ? new Date(date) : new Date();
    const source = Number.isNaN(base.getTime()) ? businessDate() : businessDate(base);
    const noonInIndia = new Date(`${source}T12:00:00+05:30`);
    return businessDate(new Date(noonInIndia.getTime() + days * 86400000));
}

/**
 * Check whether a WorkOrder has the required contractor confirmation photo
 * proof uploaded via a daily execution log entry. Used by the contractor
 * settlement / RA bill / payment actions (which now live in the contractors
 * slice) and by the `canReleaseContractorPayment` selector still in store.ts.
 *
 * Moved from store.ts to helpers.ts during Phase 3h so both call sites can
 * share a single implementation.
 */
export function contractorPaymentProofStatus(db: RDashDatabase, workOrderId: string): GuardResult {
    const workOrder = db.workOrders.find((row) => row.id === workOrderId);
    if (!workOrder)
        return { ok: false, reason: "WorkOrder not found for contractor payment." };
    const hasProof = db.executionLogs.some((log) => log.work_order_id === workOrderId &&
        Boolean(log.contractor_confirmation_attachment_id));
    if (hasProof)
        return { ok: true };
    return {
        ok: false,
        reason: `Contractor payment blocked for ${workOrder.work_order_no}: upload contractor confirmation photo proof in the daily execution log before releasing payment.`,
    };
}

/**
 * Returns true when the actor is the workspace Owner or Operations Manager
 * (the two roles that can perform privileged operations across the app).
 *
 * Moved from store.ts to helpers.ts during Phase 3l so the visits slice
 * (assertVisitOwnership) and the inline store.ts call sites
 * (assertTaskActor, assertFollowupActor, task/followup action guards) can
 * share a single implementation.
 */
export function isOwnerOrOperations(actor: CurrentUserContext): boolean {
    return actor.role === "Owner" || actor.role === "Operations Manager";
}
