import { getSupabaseAdminClient } from "../../supabase/server";

interface WorkspaceHealthAggregate {
  revision: number;
  healthBadge: "healthy" | "watch" | "attention";
  attentionCount: number;
  integrity: {
    snapshotAvailable: boolean;
    healthScore: number;
    totalIssues: number;
    critical: number;
    warning: number;
    info: number;
    totalRecords: number;
    totalReferences: number;
    businessRuleIssues: number;
    calculatedAt: string | null;
  };
  operations: {
    openTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
    activeFollowups: number;
    pendingApprovals: number;
    unresolvedBlocked: number;
    openRisks: number;
    activeWorkOrders: number;
    activeVisits: number;
  };
  commercial: {
    pipelineValue: number;
    pipelineQuotations: number;
    customers: number;
  };
  exceptions: {
    directAwardPOs: number;
    variations: number;
    total: number;
  };
  finance: {
    cashPosition: number;
    monthRevenue: number;
    overdueInvoiceValue: number;
    overdueInvoiceCount: number;
    pendingVendorBillValue: number;
    pendingVendorBillCount: number;
    totalReceived: number;
    totalPaidOut: number;
    revenueSeries: Array<{ date: string; value: number }>;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    kind: string;
    entityType: string;
    entityLabel: string;
    actor: string;
    actorRole?: string;
    sourceModule?: string;
    reason?: string;
    timestamp: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readAggregate(value: unknown): WorkspaceHealthAggregate {
  if (!isRecord(value) || typeof value.revision !== "number") {
    throw new Error("Workspace health aggregate returned an invalid payload.");
  }
  if (!isRecord(value.operations) || !isRecord(value.commercial) || !isRecord(value.finance)) {
    throw new Error("Workspace health aggregate is missing dashboard sections.");
  }
  if (!isRecord(value.integrity) || !isRecord(value.exceptions) || !Array.isArray(value.recentActivity)) {
    throw new Error("Workspace health aggregate is incomplete.");
  }
  return value as unknown as WorkspaceHealthAggregate;
}

export async function getWorkspaceHealthSummary() {
  const startedAt = performance.now();
  const workspaceId = process.env.UC_WORKSPACE_ID || "default";
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_workspace_health_summary_v2", {
    p_workspace_id: workspaceId,
  });
  if (error) {
    throw new Error(`Could not read aggregate workspace health: ${error.message}`);
  }

  const aggregate = readAggregate(data);
  return {
    ...aggregate,
    queryCount: 1,
    collectionCount: 0,
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}
