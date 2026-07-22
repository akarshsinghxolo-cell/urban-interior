import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { checkWorkspaceIntegrity } from "@/lib/rdash/integrity";
import { validateBusinessData } from "@/lib/rdash/business-rules";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/qa/cron
 *
 * Recurring QA health check — designed to be called by Vercel Cron once daily
 * (see vercel.json `crons` array). Returns a compact JSON status report:
 *
 *   - workspace loaded OK?
 *   - integrity issues count (by severity)
 *   - business-rule validation issues count
 *   - critical entity counts (customers, sites, quotations, payments, workOrders)
 *   - storage templates / instances / accounts sanity
 *
 * Auth: REQUIRED bearer token when CRON_SECRET (Vercel convention) or
 *   CRON_BEARER_TOKEN (legacy alias) is set. Vercel Cron automatically sends
 *   `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is in the env.
 *   When neither env var is set (development), all requests are allowed.
 *
 * Response shape (HTTP 200 when healthy, 500 when something is broken):
 *   {
 *     "ok": true,
 *     "timestamp": "2026-07-22T03:30:00.000Z",
 *     "durationMs": 412,
 *     "workspace": { "revision": 42, "counts": {...} },
 *     "integrity": { "critical": 0, "warning": 0, "total": 0, "healthScore": 100 },
 *     "businessRules": { "total": 0, "firstError": null }
 *   }
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  // Auth: require bearer token when CRON_SECRET (Vercel convention) or
  // CRON_BEARER_TOKEN (legacy) is set. Vercel Cron automatically sends
  // Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set in the env.
  // When neither env var is set (development mode), all requests are allowed.
  const expectedToken = (process.env.CRON_SECRET || process.env.CRON_BEARER_TOKEN || "").trim();
  const authHeader = request.headers.get("authorization") || "";
  if (expectedToken) {
    const suppliedToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice("bearer ".length).trim()
      : "";
    // Timing-safe comparison
    const a = Buffer.from(suppliedToken);
    const b = Buffer.from(expectedToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized." },
        { status: 401 },
      );
    }
  }

  try {
    // 1. Load the workspace (this also exercises the prepareWorkspaceData normalization
    //    that was added in QA-INTEGRITY-001 — if it throws, we want to know).
    const workspace = await getWorkspace(false);
    const db = workspace.data;

    // 2. Integrity check (read-only, no repair)
    const integrity = checkWorkspaceIntegrity(db);
    const integrityBySeverity: Record<string, number> = { critical: 0, warning: 0, info: 0 };
    for (const issue of integrity.issues || []) {
      const sev = (issue.severity || "info").toLowerCase();
      integrityBySeverity[sev] = (integrityBySeverity[sev] || 0) + 1;
    }

    // 3. Business-rule validation (read-only)
    let businessRuleIssues: string[] = [];
    try {
      businessRuleIssues = validateBusinessData(db) || [];
    } catch (validationErr) {
      businessRuleIssues = [`Validator threw: ${validationErr instanceof Error ? validationErr.message : String(validationErr)}`];
    }

    // 4. Critical entity counts + storage sanity
    const counts = {
      customers: db.customers?.length || 0,
      sites: db.sites?.length || 0,
      quotations: db.quotations?.length || 0,
      payments: db.payments?.length || 0,
      workOrders: db.workOrders?.length || 0,
      tasks: db.tasks?.length || 0,
      visits: db.visits?.length || 0,
      purchaseOrders: db.purchaseOrders?.length || 0,
      grns: db.grns?.length || 0,
      vendorBills: db.vendorBills?.length || 0,
      fileAssets: db.master?.fileAssets?.length || 0,
      storageAccounts: db.master?.storageAccounts?.length || 0,
      storageFolderTemplates: db.master?.storageFolderTemplates?.length || 0,
      storageFolderInstances: db.master?.storageFolderInstances?.length || 0,
      entityFileAttachments: db.entityFileAttachments?.length || 0,
      auditLog: db.auditLog?.length || 0,
    };

    const durationMs = Date.now() - startedAt;
    const ok = integrityBySeverity.critical === 0 && businessRuleIssues.length === 0;

    return NextResponse.json(
      {
        ok,
        timestamp: new Date().toISOString(),
        durationMs,
        workspace: {
          revision: workspace.revision,
          counts,
        },
        integrity: {
          critical: integrityBySeverity.critical,
          warning: integrityBySeverity.warning,
          info: integrityBySeverity.info,
          total: (integrity.issues?.length || 0),
          healthScore: integrity.healthScore ?? 100,
        },
        businessRules: {
          total: businessRuleIssues.length,
          firstError: businessRuleIssues[0] || null,
        },
      },
      { status: ok ? 200 : 500 },
    );
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    // Log full error server-side; return generic message to client to avoid
    // leaking internal table/column names or stack-trace fragments.
    console.error("[qa/cron] health check failed:", err);
    return NextResponse.json(
      {
        ok: false,
        timestamp: new Date().toISOString(),
        durationMs,
        error: "Health check failed. See server logs for details.",
      },
      { status: 500 },
    );
  }
}
