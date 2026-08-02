import type { BlockedItem, ID, RiskItem } from "./types";

export type IssueType = "blocker" | "risk";
export type IssueStatus = "open" | "resolved" | "dismissed";

/**
 * Canonical cross-module issue shape proposed for the Risks/Blockers
 * consolidation pilot.
 *
 * This contract is intentionally not wired into RDashDatabase or persistence
 * yet. It exists first so old records can be proven losslessly convertible
 * before any Supabase schema change.
 */
export interface CanonicalIssue {
  id: ID;
  issue_type: IssueType;
  status: IssueStatus;
  title: string;
  reason: string;

  customer_id?: ID;
  customer_name?: string;
  site_id?: ID;
  work_order_id?: ID;
  task_id?: ID;
  po_id?: ID;
  grn_id?: ID;
  quotation_id?: ID;
  thread_id?: ID;

  risk_type?: RiskItem["type"];
  severity?: RiskItem["severity"];
  amount?: number;

  resolved_at?: string;
  resolved_by?: string;
  created_at: string;

  /**
   * Complete legacy source row retained during compatibility migration.
   * Typed canonical fields win when projecting back, while fields unknown to
   * the canonical model survive round trips instead of being silently lost.
   */
  legacy_payload?: Readonly<Record<string, unknown>>;
}

function legacyPayload(value: object): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...(value as Record<string, unknown>) });
}

export function issueFromBlocked(blocked: BlockedItem): CanonicalIssue {
  return {
    id: blocked.id,
    issue_type: "blocker",
    status: blocked.resolved ? "resolved" : "open",
    title: blocked.title,
    reason: blocked.reason,
    customer_id: blocked.customer_id,
    customer_name: blocked.customer_name,
    work_order_id: blocked.linked_work_order_id,
    task_id: blocked.linked_task_id,
    po_id: blocked.linked_po_id,
    grn_id: blocked.linked_grn_id,
    quotation_id: blocked.linked_quotation_id,
    thread_id: blocked.thread_id,
    created_at: blocked.created_at,
    legacy_payload: legacyPayload(blocked),
  };
}

export function issueFromRisk(risk: RiskItem): CanonicalIssue {
  return {
    id: risk.id,
    issue_type: "risk",
    status: "open",
    title: risk.title,
    reason: risk.reason,
    customer_id: risk.customer_id,
    customer_name: risk.customer_name,
    risk_type: risk.type,
    severity: risk.severity,
    amount: risk.amount,
    created_at: risk.created_at,
    legacy_payload: legacyPayload(risk),
  };
}

export function blockedFromIssue(issue: CanonicalIssue): BlockedItem {
  if (issue.issue_type !== "blocker") {
    throw new Error(`Cannot project ${issue.issue_type} issue ${issue.id} as BlockedItem.`);
  }

  return {
    ...(issue.legacy_payload || {}),
    id: issue.id,
    title: issue.title,
    reason: issue.reason,
    customer_id: issue.customer_id,
    customer_name: issue.customer_name,
    linked_task_id: issue.task_id,
    linked_work_order_id: issue.work_order_id,
    linked_po_id: issue.po_id,
    linked_grn_id: issue.grn_id,
    linked_quotation_id: issue.quotation_id,
    thread_id: issue.thread_id,
    resolved: issue.status !== "open",
    created_at: issue.created_at,
  } as BlockedItem;
}

export function riskFromIssue(issue: CanonicalIssue): RiskItem {
  if (issue.issue_type !== "risk") {
    throw new Error(`Cannot project ${issue.issue_type} issue ${issue.id} as RiskItem.`);
  }
  if (!issue.risk_type || !issue.severity) {
    throw new Error(`Risk issue ${issue.id} is missing risk_type or severity.`);
  }

  return {
    ...(issue.legacy_payload || {}),
    id: issue.id,
    title: issue.title,
    type: issue.risk_type,
    severity: issue.severity,
    customer_id: issue.customer_id,
    customer_name: issue.customer_name,
    amount: issue.amount,
    reason: issue.reason,
    created_at: issue.created_at,
  } as RiskItem;
}

/**
 * Legacy Blocker readers historically keep resolved rows, so blocker Issues of
 * every status remain visible and non-open statuses project as resolved=true.
 */
export function projectLegacyBlocked(issues: readonly CanonicalIssue[]): BlockedItem[] {
  return issues
    .filter((issue) => issue.issue_type === "blocker")
    .map(blockedFromIssue);
}

/**
 * Legacy Risk resolution deletes the row. Therefore only open risk Issues may
 * appear through the temporary legacy risks projection.
 */
export function projectLegacyRisks(issues: readonly CanonicalIssue[]): RiskItem[] {
  return issues
    .filter((issue) => issue.issue_type === "risk" && issue.status === "open")
    .map(riskFromIssue);
}

export function projectLegacyIssueCollections(issues: readonly CanonicalIssue[]): {
  blocked: BlockedItem[];
  risks: RiskItem[];
} {
  return {
    blocked: projectLegacyBlocked(issues),
    risks: projectLegacyRisks(issues),
  };
}
