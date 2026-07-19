import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { checkWorkspaceIntegrity } from "@/lib/rdash/integrity";
import { indiaDate, isDateOnlyOverdue } from "@/lib/rdash/date";

export const runtime = "nodejs";

/**
 * GET /api/health/summary
 * Authenticated. Returns a lightweight workspace health summary:
 *   - integrity healthScore + issue counts
 *   - pending approvals, overdue tasks, due-today actions
 *   - pipeline value, active work orders, live visits
 *   - last 5 audit-log entries (compact "recent activity")
 *   - exception counts (direct-award POs, variations)
 *
 * This is a READ-ONLY aggregate. It does NOT mutate state. Used by the
 * dashboard's WorkspaceHealthWidget and by the recurring QA cron for a
 * fast at-a-glance health check.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const workspace = await getWorkspace(false);
    const db = workspace.data;

    // Integrity (read-only check, no repair)
    const report = checkWorkspaceIntegrity(db);

    // Tasks
    const openTasks = db.tasks.filter(
      (t) => t.status === "todo" || t.status === "in_progress" || t.status === "review",
    );
    const overdueTasks = openTasks.filter((t) => isDateOnlyOverdue(t.due_date));
    const dueTodayTasks = openTasks.filter((t) => t.due_date === indiaDate());

    // Followups
    const activeFollowups = db.followups.filter(
      (f) => f.status === "pending" || f.status === "scheduled" || f.status === "missed",
    );

    // Approvals + blocked + risks
    const pendingApprovals = (db.actions || []).filter((a) => a.status === "pending");
    const unresolvedBlocked = (db.blocked || []).filter((b) => !b.resolved);
    const openRisks = db.risks || [];

    // Work orders + visits + quotations
    const activeWorkOrders = (db.workOrders || []).filter(
      (w) => w.status === "in_progress" || w.status === "scheduled",
    );
    const activeVisits = (db.visits || []).filter(
      (v) => v.status === "scheduled" || v.status === "en_route" || v.status === "checked_in",
    );
    const pipelineValue = (db.quotations || [])
      .filter((q) => q.status === "sent" || q.status === "draft")
      .reduce((sum, q) => sum + (q.total_amount || 0), 0);

    // Exceptions (direct-award POs + variations)
    const directAwardPOs = (db.purchaseOrders || []).filter(
      (po: any) => po.direct_award || po.award_basis === "direct",
    );
    const variations = (db.quotations || []).filter(
      (q: any) => q.revision_kind === "variation" || q.revision_kind === "renegotiation",
    );

    // Recent activity (last 5 audit entries, compact)
    const recentActivity = [...(db.auditLog || [])]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        action: e.action,
        kind: e.kind,
        entityType: e.entity_type,
        entityLabel: e.entity_label || e.entity_type,
        actor: e.actor || "system",
        actorRole: e.actor_role,
        sourceModule: e.source_module,
        reason: e.reason,
        timestamp: e.timestamp,
      }));

    // Overall workspace health badge
    const attentionCount =
      pendingApprovals.length + unresolvedBlocked.length + overdueTasks.length + openRisks.length;
    const healthBadge: "healthy" | "watch" | "attention" =
      attentionCount === 0 && report.healthScore >= 95
        ? "healthy"
        : attentionCount <= 3 && report.healthScore >= 80
          ? "watch"
          : "attention";

    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        user: { name: user.name, email: user.email, role: user.role },
        healthBadge,
        attentionCount,
        integrity: {
          healthScore: report.healthScore,
          totalIssues: report.issues.length,
          critical: report.bySeverity.critical,
          warning: report.bySeverity.warning,
          info: report.bySeverity.info,
          totalRecords: report.totalRecords,
          totalReferences: report.totalReferences,
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
          pipelineValue,
          pipelineQuotations: (db.quotations || []).filter(
            (q) => q.status === "sent" || q.status === "draft",
          ).length,
          customers: (db.customers || []).length,
        },
        exceptions: {
          directAwardPOs: directAwardPOs.length,
          variations: variations.length,
          total: directAwardPOs.length + variations.length,
        },
        recentActivity,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Summary unavailable." },
      { status: 401 },
    );
  }
}
