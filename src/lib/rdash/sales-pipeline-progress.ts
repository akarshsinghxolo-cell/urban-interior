import { customerProgress, type CustomerProgress } from "./customer-progress";
import type { RDashDatabase, Site, WorkRequiredStatus } from "./types";

export type ProgressionPipelineEntry = {
  id: string;
  source: "site_progress" | "customer_progress";
  stage: WorkRequiredStatus;
  customer_id: string;
  site_id?: string;
  title: string;
  source_label: string;
  progress_label: string;
  progress_percent: number;
  created_at: string;
};

const SITE_PROGRESS: Record<Site["stage"], {
  stage: WorkRequiredStatus;
  label: string;
  percent: number;
}> = {
  enquiry: { stage: "new", label: "Enquiry", percent: 10 },
  planning: { stage: "contacted", label: "Planning", percent: 25 },
  quoted: { stage: "quotation_sent", label: "Quoted", percent: 60 },
  awarded: { stage: "accepted", label: "Awarded", percent: 75 },
  execution: { stage: "accepted", label: "Execution", percent: 88 },
  on_hold: { stage: "on_hold", label: "On hold", percent: 50 },
  completed: { stage: "accepted", label: "Completed", percent: 100 },
  cancelled: { stage: "lost", label: "Cancelled", percent: 0 },
};

const CUSTOMER_PROGRESS_STAGE: Record<CustomerProgress["key"], WorkRequiredStatus> = {
  new: "new",
  contacted: "contacted",
  visit: "visit_scheduled",
  measurement: "measurement_done",
  quote: "quotation_in_progress",
  decision: "quotation_sent",
  negotiation: "negotiation",
  accepted: "accepted",
  execution: "accepted",
  on_hold: "on_hold",
  lost: "lost",
  completed: "accepted",
};

export function pipelineStageForSiteStage(stage: Site["stage"]): WorkRequiredStatus {
  return SITE_PROGRESS[stage].stage;
}

function pipelineStageForCustomerProgress(progress: CustomerProgress): WorkRequiredStatus {
  return CUSTOMER_PROGRESS_STAGE[progress.key];
}

/**
 * Builds fallback Sales Pipeline cards from the best progression source that
 * exists before a Work Required record is created.
 *
 * Precedence is intentionally:
 *   1. Work Required lifecycle (rendered by SalesPipelineModule itself)
 *   2. Site progression for Sites with no Work Required yet
 *   3. Customer progression for Customers with no active Site yet
 *
 * That keeps the board complete without duplicating a Site/Customer once its
 * scope-specific Work Required lifecycle has started.
 */
export function buildProgressionPipelineEntries(db: RDashDatabase): ProgressionPipelineEntry[] {
  const workRequiredSiteIds = new Set(db.workRequired.map((work) => work.site_id));
  const workRequiredCustomerIds = new Set(db.workRequired.map((work) => work.customer_id));
  const activeSites = db.sites.filter((site) => !site.is_archived);
  const activeSiteCustomerIds = new Set(activeSites.map((site) => site.customer_id));

  const siteEntries = activeSites
    .filter((site) => !workRequiredSiteIds.has(site.id))
    .map((site): ProgressionPipelineEntry => {
      const progress = SITE_PROGRESS[site.stage];
      return {
        id: `progression:site:${site.id}`,
        source: "site_progress",
        stage: progress.stage,
        customer_id: site.customer_id,
        site_id: site.id,
        title: site.name,
        source_label: "Site progression",
        progress_label: progress.label,
        progress_percent: progress.percent,
        created_at: site.created_at,
      };
    });

  const customerEntries = db.customers
    .filter((customer) =>
      customer.status === "active" &&
      !activeSiteCustomerIds.has(customer.id) &&
      !workRequiredCustomerIds.has(customer.id))
    .map((customer): ProgressionPipelineEntry => {
      const progress = customerProgress(db, customer.id);
      return {
        id: `progression:customer:${customer.id}`,
        source: "customer_progress",
        stage: pipelineStageForCustomerProgress(progress),
        customer_id: customer.id,
        title: customer.name,
        source_label: "Customer progression",
        progress_label: progress.label,
        progress_percent: progress.percent,
        created_at: customer.created_at,
      };
    });

  return [...siteEntries, ...customerEntries];
}
