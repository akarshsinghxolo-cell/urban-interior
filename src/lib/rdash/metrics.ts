import type { Quotation, WorkOrder, WorkRequired } from "./types";

const WON_SALES_STATUSES = new Set<WorkRequired["status"]>([
  "accepted",
  "contractor_bidding",
  "awarded",
  "in_progress",
  "completed",
]);
const LOST_SALES_STATUSES = new Set<WorkRequired["status"]>(["lost"]);
const OPEN_SALES_STATUSES = new Set<WorkRequired["status"]>([
  "new",
  "contacted",
  "visit_scheduled",
  "measurement_done",
  "quotation_in_progress",
  "quotation_sent",
  "negotiation",
  "on_hold",
]);
const DECIDED_QUOTATION_STATUSES = new Set<Quotation["status"]>([
  "accepted",
  "rejected",
  "expired",
]);
const OPEN_QUOTATION_STATUSES = new Set<Quotation["status"]>(["draft", "sent"]);

export function isWonSalesStatus(status: WorkRequired["status"]): boolean {
  return WON_SALES_STATUSES.has(status);
}

export function isOpenSalesStatus(status: WorkRequired["status"]): boolean {
  return OPEN_SALES_STATUSES.has(status);
}

export interface SalesPipelineMetricOptions {
  wonWorkRequiredIds?: ReadonlySet<string>;
}

export function calculateSalesPipelineMetrics(
  records: readonly WorkRequired[],
  options: SalesPipelineMetricOptions = {},
) {
  const isWon = (record: WorkRequired) =>
    isWonSalesStatus(record.status) || options.wonWorkRequiredIds?.has(record.id) === true;
  const won = records.filter(isWon);
  const lost = records.filter((record) => LOST_SALES_STATUSES.has(record.status) && !isWon(record));
  const decidedCount = won.length + lost.length;
  const open = records.filter((record) => isOpenSalesStatus(record.status) && !isWon(record));

  return {
    totalLeads: records.length,
    wonCount: won.length,
    lostCount: lost.length,
    decidedCount,
    openCount: open.length,
    winRate: decidedCount > 0 ? Math.round((won.length / decidedCount) * 100) : 0,
    pipelineValue: open.reduce((sum, record) => sum + (record.budget || 0), 0),
    wonValue: won.reduce((sum, record) => sum + (record.budget || 0), 0),
  };
}

function quotationRootId(quotation: Quotation, byId: ReadonlyMap<string, Quotation>): string {
  let current = quotation;
  const visited = new Set<string>([current.id]);
  while (current.parent_quotation_id) {
    const parent = byId.get(current.parent_quotation_id);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

function isNewerQuotation(candidate: Quotation, current: Quotation): boolean {
  if ((candidate.revision_no || 0) !== (current.revision_no || 0)) {
    return (candidate.revision_no || 0) > (current.revision_no || 0);
  }
  const candidateTime = candidate.updated_at || candidate.created_at || "";
  const currentTime = current.updated_at || current.created_at || "";
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.id > current.id;
}

/** Latest revision from each quotation chain. Prevents revisions being double-counted. */
export function latestQuotationRevisions(quotations: readonly Quotation[]): Quotation[] {
  const byId = new Map(quotations.map((quotation) => [quotation.id, quotation]));
  const latestByRoot = new Map<string, Quotation>();
  for (const quotation of quotations) {
    const rootId = quotationRootId(quotation, byId);
    const current = latestByRoot.get(rootId);
    if (!current || isNewerQuotation(quotation, current)) latestByRoot.set(rootId, quotation);
  }
  return Array.from(latestByRoot.values());
}


/** Work requirements that have crossed the customer-acceptance boundary. */
export function collectWonWorkRequiredIds(
  quotations: readonly Quotation[],
  workOrders: readonly WorkOrder[],
): Set<string> {
  const ids = new Set<string>();
  for (const quotation of latestQuotationRevisions(quotations)) {
    if (quotation.status !== "accepted") continue;
    for (const coverage of quotation.coverage || []) {
      if (coverage.status === "accepted") ids.add(coverage.work_required_id);
    }
  }
  for (const workOrder of workOrders) {
    for (const id of workOrder.work_required_ids || []) ids.add(id);
  }
  return ids;
}

export function calculateQuotationMetrics(quotations: readonly Quotation[]) {
  const current = latestQuotationRevisions(quotations);
  const accepted = current.filter((quotation) => quotation.status === "accepted");
  const decided = current.filter((quotation) => DECIDED_QUOTATION_STATUSES.has(quotation.status));
  const open = current.filter((quotation) => OPEN_QUOTATION_STATUSES.has(quotation.status));

  return {
    current,
    totalCount: current.length,
    acceptedCount: accepted.length,
    decidedCount: decided.length,
    openCount: open.length,
    conversionRate: decided.length > 0 ? Math.round((accepted.length / decided.length) * 100) : 0,
    pipelineValue: open.reduce((sum, quotation) => sum + (quotation.total_amount || 0), 0),
    acceptedValue: accepted.reduce((sum, quotation) => sum + (quotation.total_amount || 0), 0),
  };
}
