/**
 * Quotation helper functions extracted from store.ts (Phase 3j).
 *
 * These are pure functions shared by:
 *  - the quotations slice (`acceptQuotationForBidding` uses both helpers), and
 *  - the inline store.ts UI action `quotationAcceptanceWarnings` (which calls
 *    the function form to render the same warnings in the acceptance dialog
 *    before the user actually accepts).
 *
 * Pure functions only — no state, no `commitState`, no `get()`.
 */
import type {
    RDashDatabase, Quotation, PaymentTerm, TaxConfig,
} from "../types";
import { today, addDays } from "./helpers";

/**
 * Compute the accepted monetary value of a single coverage on a quotation.
 * Sums the amount of every quotation scope line whose work_required_id matches
 * the coverage and whose area_id is either empty (covers all areas) or listed
 * in `coverage.area_ids`. Rounded to 2 dp.
 */
export function coverageAcceptedValue(quotation: Quotation, coverage: import("../types").QuotationCoverage): number {
    const matchingLines = quotation.scope_lines.filter((line) => {
        if (line.work_required_id !== coverage.work_required_id)
            return false;
        return !line.area_id || coverage.area_ids.includes(line.area_id);
    });
    return (Math.round(matchingLines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100);
}

/**
 * Build the list of commercial warnings a user should acknowledge before
 * accepting a quotation. The warnings cover: status not "sent"/"accepted",
 * expired/invalid validity date, payment milestones not totalling 100%,
 * selected coverage with no priced scope line, and a "rejected" quotation
 * being accepted without a recorded reversal.
 *
 * If `coverageIds` is omitted or empty, the warnings are computed for every
 * coverage that has not already been accepted.
 */
export function quotationAcceptanceWarnings(db: RDashDatabase, quotation: Quotation, coverageIds?: string[]): string[] {
    const warnings: string[] = [];
    const selectedIds = coverageIds?.length
        ? coverageIds
        : quotation.coverage
            .filter((coverage) => coverage.status !== "accepted")
            .map((coverage) => coverage.id);
    const selectedCoverage = quotation.coverage.filter((coverage) => selectedIds.includes(coverage.id));
    if (quotation.status !== "sent" && quotation.status !== "accepted")
        warnings.push(`This quotation is ${quotation.status}. It is normally accepted only after it has been sent to the customer.`);
    if (!quotation.valid_until ||
        Number.isNaN(new Date(quotation.valid_until).getTime()) ||
        quotation.valid_until < today())
        warnings.push(`The quotation validity date (${quotation.valid_until || "not set"}) has expired or is invalid.`);
    const paymentTotal = quotation.payment_terms.reduce((sum, term) => sum + Number(term.percentage || 0), 0);
    if (!quotation.payment_terms.length || Math.abs(paymentTotal - 100) > 0.001)
        warnings.push(`Payment milestones total ${paymentTotal}%; review them before commercial acceptance.`);
    const zeroValue = selectedCoverage.filter((coverage) => coverageAcceptedValue(quotation, coverage) <= 0);
    if (zeroValue.length)
        warnings.push(`Selected scope has no priced quotation line: ${zeroValue.map((coverage) => coverage.coverage_label).join(", ")}.`);
    if (quotation.status === "rejected")
        warnings.push("This quotation was marked rejected. Confirm the customer has reversed that decision.");
    return warnings;
}

/**
 * A. Resolve the default quotation settings from the active config masters.
 *
 * Reads:
 *  - active `validityConfigs` (enabled) → drives `valid_until` + `validity_days`
 *  - default `paymentTermTemplates` (is_default=true) → seeds `payment_terms`
 *  - active `taxConfigs` (enabled) → snapshot of the first enabled rate
 *  - enabled `commercialTerms` (default ordering) → concatenated T&C text
 *
 * Pure: takes the db snapshot, returns a defaults object. Caller decides
 * whether to apply each field (caller-provided values always win).
 */
interface QuotationDefaults {
    /** ISO date string (YYYY-MM-DD) — today + active validity default_days (or +30 if none). */
    valid_until: string;
    /** Number of days the validity was computed from. */
    validity_days: number;
    /** Payment milestones copied from the default PaymentTermTemplate (or []). */
    payment_terms: PaymentTerm[];
    /** Snapshot of the first enabled tax config (or undefined if none enabled). */
    tax_config?: { name: string; rate: number; type: TaxConfig["type"] };
    /** Newline-joined text of every enabled commercial term (or undefined). */
    terms_and_conditions?: string;
}

export function resolveQuotationDefaults(db: RDashDatabase): QuotationDefaults {
    // Validity — pick the first enabled ValidityConfig. Fall back to 30 days.
    const validityConfig = db.validityConfigs.find((v) => v.enabled);
    const validityDays = validityConfig?.default_days && validityConfig.default_days > 0
        ? validityConfig.default_days
        : 30;
    const valid_until = addDays(today(), validityDays);

    // Payment terms — copy milestones from the default PTT.
    const defaultPtt = db.paymentTermTemplates.find((t) => t.is_default)
        || db.paymentTermTemplates[0];
    const payment_terms: PaymentTerm[] = defaultPtt
        ? defaultPtt.terms.map((term) => ({
            id: `pt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            label: term.label,
            percentage: term.percentage,
            due_event: term.due_event,
        }))
        : [];

    // Tax config — snapshot the first enabled config.
    const activeTax = db.taxConfigs.find((t) => t.enabled);
    const tax_config = activeTax
        ? { name: activeTax.name, rate: activeTax.rate, type: activeTax.type }
        : undefined;

    // Commercial terms — join all enabled clauses with blank-line separators.
    const enabledTerms = db.commercialTerms.filter((t) => t.enabled);
    const terms_and_conditions = enabledTerms.length
        ? enabledTerms.map((t) => `${t.label}\n${t.text}`).join("\n\n")
        : undefined;

    return { valid_until, validity_days: validityDays, payment_terms, tax_config, terms_and_conditions };
}
