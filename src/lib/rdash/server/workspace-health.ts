import { indiaDate, isDateOnlyOverdue } from "../date";
import { calculateQuotationMetrics } from "../metrics";
import type { IntegrityReport, RDashDatabase } from "../types";
import { getSupabaseAdminClient } from "../../supabase/server";
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

type SnapshotRow = {
  workspace_revision: number;
  health_score: number;
  total_issues: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  total_records: number;
  total_references: number;
  business_rule_issues: number;
  calculated_at: string;
};

function workspaceId() {
  return process.env.UC_WORKSPACE_ID || "default";
}

function isMissingSnapshotTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("workspace_health_snapshot")
  ));
}

export async function readStoredIntegritySnapshot(): Promise<StoredIntegritySnapshot | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("workspace_health_snapshot")
    .select("workspace_revision,health_score,total_issues,critical_count,warning_count,info_count,total_records,total_references,business_rule_issues,calculated_at")
    .eq("workspace_id", workspaceId())
    .maybeSingle();
  if (error) {
    if (isMissingSnapshotTable(error)) return null;
    throw new Error(`Could not load the integrity snapshot: ${error.message}`);
  }
  if (!data) return null;
  const row = data as unknown as SnapshotRow;
  return {
    workspaceRevision: row.workspace_revision,
    healthScore: row.health_score,
    totalIssues: row.total_issues,
    critical: row.critical_count,
    warning: row.warning_count,
    info: row.info_count,
    totalRecords: row.total_records,
    totalReferences: row.total_references,
    businessRuleIssues: row.business_rule_issues,
    calculatedAt: row.calculated_at,
  };
}

export async function saveStoredIntegritySnapshot(input: {
  revision: number;
  report: IntegrityReport;
  businessRuleIssues: number;
}) {
  const { report } = input;
  const { error } = await getSupabaseAdminClient()
    .from("workspace_health_snapshot")
    .upsert({
      workspace_id: workspaceId(),
      workspace_revision: input.revision,
      health_score: report.healthScore ?? 100,
      total_issues: report.issues?.length || 0,
      critical_count: report.bySeverity?.critical || 0,
      warning_count: report.bySeverity?.warning || 0,
      info_count: report.bySeverity?.info || 0,
      total_records: report.totalRecords || 0,
      total_references: report.totalReferences || 0,
      business_rule_issues: input.businessRuleIssues,
      report_json: report,
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });
  if (error) {
    if (isMissingSnapshotTable(error)) return false;
    throw new Error(`Could not save the integrity snapshot: ${error.message}`);
  }
  return true;
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

function isMissingHealthRpc(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.message?.includes("get_workspace_health_summary")
  ));
}

export async function getWorkspaceHealthSummary() {
  const startedAt = performance.now();
  // The additive RPC is deployed by this PR's migration; generated database
  // types will include it after the next schema type refresh. Keep the escape
  // hatch local to this single call rather than weakening the admin client.
  const healthRpcClient = getSupabaseAdminClient() as unknown as {
    rpc: (
      name: "get_workspace_health_summary",
      args: { p_workspace_id: string },
    ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  };
  const { data, error } = await healthRpcClient.rpc("get_workspace_health_summary", {
    p_workspace_id: workspaceId(),
  });
  if (!error && data && typeof data === "object") {
    return {
      ...(data as ReturnType<typeof buildOperationalHealth> & { revision: number }),
      queryCount: 1,
      collectionCount: 0,
      loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  }
  if (error && !isMissingHealthRpc(error)) {
    throw new Error(`Could not load the workspace health aggregate: ${error.message}`);
  }

  const [workspace, integrity] = await Promise.all([
    getWorkspaceSubset({ fullCollections: [...HEALTH_SUMMARY_COLLECTIONS] }),
    readStoredIntegritySnapshot(),
  ]);
  return {
    revision: workspace.revision,
    queryCount: workspace.queryCount + 1,
    collectionCount: HEALTH_SUMMARY_COLLECTIONS.length,
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
    ...buildOperationalHealth(workspace.data, integrity),
  };
}
