import type { Customer, RDashDatabase } from "./types";
import { normalizePhone } from "./customer-identity";

/**
 * Customer Desk list search, shared by both list views.
 *
 * Matches, case-insensitively:
 *  - customer name
 *  - customer email (was not searchable before)
 *  - phone / whatsapp / alternate phone with human formats: "+91 ", "0",
 *    spaces and punctuation are normalized on BOTH sides (was a raw
 *    `phone.includes(q)` before, so "+91…" and "98765 43210" never matched)
 *  - site name / address / locality / city / building name
 *
 * A query with fewer than 3 digits skips the phone branch so short text
 * queries cannot digit-match accidentally.
 */
export function customerMatchesQuery(db: RDashDatabase, customer: Customer, rawQuery: string): boolean {
    const q = rawQuery.trim().toLowerCase();
    if (!q)
        return true;
    if (customer.name.toLowerCase().includes(q))
        return true;
    if (String(customer.email || "").toLowerCase().includes(q))
        return true;
    const qDigits = normalizePhone(q);
    if (qDigits.length >= 3) {
        const phones = [customer.phone, customer.whatsapp, customer.alternate_phone];
        if (phones.some((phone) => normalizePhone(phone).includes(qDigits)))
            return true;
    }
    return db.sites.some((site) => site.customer_id === customer.id &&
        [site.name, site.address, site.locality, site.city, site.building_name].filter(Boolean).join(" ").toLowerCase().includes(q));
}

export type CustomerPendingAction = {
    key: "site" | "visit" | "measurement" | "quotation" | "budget";
    label: string;
    hint: string;
};

/**
 * Sales-lifecycle gaps for a customer, derived from the same data the
 * drawer's progress hint talks about. This is the fix for the "Pending
 * actions · 0 — fully actioned" contradiction: the section previously
 * counted open TASKS only, so a lead with no visit, no measurement, no
 * quotation and no budget claimed to be "fully actioned" one line below
 * the "plan a visit" hint.
 *
 * Only customers with active (non lost/completed) work produce gaps.
 */
export function customerLifecycleGaps(db: RDashDatabase, customerId: string): CustomerPendingAction[] {
    const activeWork = db.workRequired.filter((work) => work.customer_id === customerId && work.status !== "lost" && work.status !== "completed");
    if (!activeWork.length)
        return [];
    const gaps: CustomerPendingAction[] = [];
    if (!db.sites.some((site) => site.customer_id === customerId))
        gaps.push({ key: "site", label: "Add site", hint: "Visits and measurements need a site" });
    if (!db.visits.some((visit) => visit.customer_id === customerId && visit.status !== "cancelled"))
        gaps.push({ key: "visit", label: "Plan first visit", hint: "No site visit has been scheduled yet" });
    const siteIds = new Set(db.sites.filter((site) => site.customer_id === customerId).map((site) => site.id));
    const unmeasured = db.areas.filter((area) => siteIds.has(area.site_id) && area.stage === "unmeasured").length;
    if (unmeasured > 0)
        gaps.push({ key: "measurement", label: unmeasured === 1 ? "Capture measurement" : `Capture measurements (${unmeasured} areas)`, hint: "Unmeasured areas block quotations" });
    if (!db.quotations.some((quote) => quote.customer_id === customerId && quote.status !== "cancelled"))
        gaps.push({ key: "quotation", label: "Draft quotation", hint: "No quotation prepared for the captured scope" });
    const missingBudget = activeWork.filter((work) => !(work.budget && work.budget > 0)).length;
    if (missingBudget > 0)
        gaps.push({ key: "budget", label: missingBudget === 1 ? "Set budget (1 work item)" : `Set budget (${missingBudget} work items)`, hint: "Budgets power the pipeline value" });
    return gaps;
}
