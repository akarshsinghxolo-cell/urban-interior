/**
 * Site lifecycle helpers — pure functions shared by the store slices.
 *
 * #8: Site.stage used to be auto-advanced only enquiry → planning (first
 * measurement); quoted/awarded/execution/completed were dead ends, so the
 * Sales Pipeline fallback pinned such Sites at "Planning 25%" forever. These
 * helpers give every lifecycle write path a single monotonic line.
 *
 * #9: archiving a Site with active linked records used to succeed and then
 * hard-fail every later customer save ("must belong to one active Site").
 * siteArchiveBlockers mirrors the active/terminal statuses so archiveSite can
 * refuse up front, the same way archiveArea does.
 */
import type { RDashDatabase, Site } from "./types";

export type SiteStage = Site["stage"];

/** enquiry(0) → planning(1) → quoted(2) → awarded(3) → execution(4) → completed(5). */
const SITE_STAGE_LADDER: Partial<Record<SiteStage, number>> = {
    enquiry: 0,
    planning: 1,
    quoted: 2,
    awarded: 3,
    execution: 4,
    completed: 5,
};

/**
 * Monotonic Site stage advance: only ever moves UP the ladder, so replaying a
 * write path (or a late-arriving quotation) never regresses a stage.
 * on_hold / cancelled are terminal-ish: never auto-advanced FROM (a human
 * reopens them) and never auto-advanced TO (archiveSite writes those directly).
 */
export function advanceSiteStage(current: SiteStage, next: SiteStage): SiteStage {
    if (current === "on_hold" || current === "cancelled") return current;
    if (next === "on_hold" || next === "cancelled") return current;
    const from = SITE_STAGE_LADDER[current];
    const to = SITE_STAGE_LADDER[next];
    return from !== undefined && to !== undefined && to > from ? next : current;
}

/**
 * Slice-side one-liner: returns `sites` with `siteId`'s row advanced to the
 * next lifecycle stage. No-op for records without a Site (customer-level
 * quotations), unknown `next` stages, and when the stage would not change
 * (the row object is returned untouched so state diffs stay clean).
 * `next === undefined` means "this transition does not map to a stage".
 */
export function advanceSitesStage(sites: Site[], siteId: string | undefined, next: SiteStage | undefined, now: string): Site[] {
    if (!siteId || !next) return sites;
    return sites.map((site) => {
        if (site.id !== siteId) return site;
        const stage = advanceSiteStage(site.stage, next);
        return stage === site.stage ? site : { ...site, stage, updated_at: now };
    });
}

export interface SiteArchiveBlockers {
    workRequired: number;
    visits: number;
    workOrders: number;
    total: number;
}

/**
 * Active records a Site still owns — the terminal statuses are history, not
 * blockers: workRequired excludes "lost"/"completed" (it has no "cancelled"
 * status); visits exclude only "cancelled" (missed/completed visits still
 * belong to the Site record); workOrders exclude "cancelled" AND "completed" —
 * a completed order is finished work and must NOT block archiving, an
 * abandoned one is unresolved and does.
 */
export function siteArchiveBlockers(db: Pick<RDashDatabase, "workRequired" | "visits" | "workOrders">, siteId: string): SiteArchiveBlockers {
    const workRequired = db.workRequired.filter((row) => row.site_id === siteId && row.status !== "lost" && row.status !== "completed").length;
    const visits = db.visits.filter((row) => row.site_id === siteId && row.status !== "cancelled").length;
    const workOrders = db.workOrders.filter((row) => row.site_id === siteId && row.status !== "cancelled" && row.status !== "completed").length;
    return { workRequired, visits, workOrders, total: workRequired + visits + workOrders };
}
