import { indiaDate, isDateOnlyOverdue } from "../date";
import { calculateQuotationMetrics } from "../metrics";
import type { IntegrityReport, RDashDatabase } from "../types";
import { getWorkspaceSubset } from "./workspace";

export const HEALTH_SUMMARY_COLLECTIONS = Object.freeze([
  "customers",
  "quotations",
  "workOrders",
  "purchaseOrders",
  "visits",
  "tasks",
  "followups",
  "actions",
  "blocked",
  "risks",
  "invoices",
  "customerReceipts",
  "vendorBills",
  "vendorPayments",
  "auditLog",
] as const);

export interface StoredIntegritySnapshot {
  workspaceRevision: number;
  healthScore: number;
  totalIssues: number;
  critical: number;
  warning: number;
  info: number;
  totalRecords: number;
  totalReferences: number;
  businessRuleIssues: number;
  calculatedAt: string;
}

function buildOperationalHealth(db: RDashDatabase, integrity: StoredIntegritySnapshot | null) {
  const openTasks = db.tasks.filter(
    (task) => task.status === "todo" || task.status === "in_progress" || task.status === "review",
  );
  const overdueTasks = openTasks.filter((task) => isDateOnlyOverdue(task.due_date));
  const dueTodayTasks = openTasks.filter((task) => task.due_date === indiaDate());
  const activeFollowups = db.followups.filter(
    (followup) => followup.status === "pending" || followup.status === "scheduled" || followup.status === "missed",
  );
  const pendingApprovals = db.actions.filter((action) => action.status === "pending");
  const unresolvedBlocked = db.blocked.filter((item) => !item.resolved);
  const openRisks = db.risks;
  const activeWorkOrders = db.workOrders.filter(
    (workOrder) => workOrder.status === "in_progress" || workOrder.status === "scheduled",
  );
  const activeVisits = db.visits.filter(
    (visit) => visit.status === "scheduled" || visit.status === "en_route" || visit.status === "checked_in",
  );
  const quotationMetrics = calculateQuotationMetrics(db.quotations);
  const directAwardPOs = db.purchaseOrders.filter(
    (purchaseOrder: any) => purchaseOrder.direct_award || purchaseOrder.award_basis === "direct",
  );
  const variations = db.quotations.filter(
    (quotation: any) => quotation.revision_kind === "variation" || quotation.revision_kind === "renegotiation",
  );
  const recentActivity = [...db.auditLog]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id,
      action: entry.action,
      kind: entry.kind,
      entityType: entry.entity_type,
      entityLabel: entry.entity_label || entry.entity_type,
      actor: entry.actor || "system",
      actorRole: entry.actor_role,
      sourceModule: entry.source_module,
      reason: entry.reason,
      timestamp: entry.timestamp,
    }));

  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();
  const totalReceived = db.customerReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
  const totalPaidOut = db.vendorPayments.reduce((sum, payment: any) => sum + (payment.amount || 0), 0);
  const overdueInvoices = db.invoices.filter(
    (invoice) =>
      (invoice.status === "issued" || invoice.status === "partial" || invoice.status === "overdue") &&
      invoice.due_date &&
      isDateOnlyOverdue(invoice.due_date),
  );
  const pendingVendorBills = db.vendorBills.filter(
    (bill) => bill.status === "pending" || bill.status === "approved" || bill.status === "partly_paid",
  );
  const monthRevenue = db.customerReceipts
    .filter((receipt) => {
      const receivedAt = new Date(receipt.received_at).getTime();
      return Number.isFinite(receivedAt) && receivedAt >= monthStartMs && receivedAt <= now;
    })
    .reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
  const revenueSeries: Array<{ date: string; value: number }> = [];
  const indiaToday = indiaDate();
  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(`${indiaToday}T12:00:00+05:30`);
    day.setDate(day.getDate() - dayOffset);
    const dayKey = indiaDate(day);
    revenueSeries.push({
      date: dayKey,
      value: db.customerReceipts
        .filter((receipt) => receipt.received_at && indiaDate(receipt.received_at) === dayKey)
        .reduce((sum, receipt) => sum + (receipt.amount || 0), 0),
    });
  }

  const attentionCount = pendingApprovals.length + unresolvedBlocked.length + overdueTasks.length + openRisks.length;
  const integrityScore = integrity?.healthScore ?? 100;
  const healthBadge: "healthy" | "watch" | "attention" = !integrity
    ? "watch"
    : attentionCount === 0 && integrityScore >= 95
      ? "healthy"
      : attentionCount <= 3 && integrityScore >= 80
        ? "watch"
        : "attention";

  return {
    healthBadge,
    attentionCount,
    integrity: {
      snapshotAvailable: Boolean(integrity),
      healthScore: integrityScore,
      totalIssues: integrity?.totalIssues || 0,
      critical: integrity?.critical || 0,
      warning: integrity?.warning || 0,
      info: integrity?.info || 0,
      totalRecords: integrity?.totalRecords || 0,
      totalReferences: integrity?.totalReferences || 0,
      businessRuleIssues: integrity?.businessRuleIssues || 0,
      calculatedAt: integrity?.calculatedAt || null,
    },
    operations: {
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      dueTodayTasks: dueTodayTasks.length,
      activeFollowups: activeFollowups.length,
      pendingApprovals: pendingApprovals.length,
      unresolvedBlocked: unresolvedBlocked.length,
      openRisks: openRisks.length,
      activeWorkOrders: activeWorkOrders.length,
      activeVisits: activeVisits.length,
    },
    commercial: {
      pipelineValue: quotationMetrics.pipelineValue,
      pipelineQuotations: quotationMetrics.openCount,
      customers: db.customers.length,
    },
    exceptions: {
      directAwardPOs: directAwardPOs.length,
      variations: variations.length,
      total: directAwardPOs.length + variations.length,
    },
    finance: {
      cashPosition: totalReceived - totalPaidOut,
      monthRevenue,
      overdueInvoiceValue: overdueInvoices.reduce((sum, invoice) => sum + (invoice.balance_amount || 0), 0),
      overdueInvoiceCount: overdueInvoices.length,
      pendingVendorBillValue: pendingVendorBills.reduce((sum, bill) => sum + (bill.balance_amount || 0), 0),
      pendingVendorBillCount: pendingVendorBills.length,
      totalReceived,
      totalPaidOut,
      revenueSeries,
    },
    recentActivity,
  };
}

export async function getWorkspaceHealthSummary() {
  const startedAt = performance.now();
  const workspace = await getWorkspaceSubset({
    fullCollections: [...HEALTH_SUMMARY_COLLECTIONS],
  });
  return {
    revision: workspace.revision,
    queryCount: workspace.queryCount,
    collectionCount: HEALTH_SUMMARY_COLLECTIONS.length,
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
    ...buildOperationalHealth(workspace.data, null),
  };
}
