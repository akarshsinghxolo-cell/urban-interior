import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clientIp, rateLimit } from "@/lib/rdash/server/ratelimit";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { checkWorkspaceIntegrity } from "@/lib/rdash/integrity/checker";
import { validateBusinessData } from "@/lib/rdash/business-rules";
import { cleanupExpiredStaffRouteBundles } from "@/lib/rdash/server/staff-location";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily QA and maintenance job (scheduled by vercel.json).
 *
 * The expensive full integrity scan runs here as scheduled validation instead
 * of on every dashboard health request. Expired route bundles are also removed
 * once per day.
 *
 * Auth contract matches how the job is actually invoked:
 *  - CRON_SECRET configured → Vercel Cron sends `Authorization: Bearer` and
 *    the full diagnostic payload is returned (timing-safe compare).
 *  - No secret configured → the bearer gate made the scheduler 503 forever,
 *    silently disabling daily QA. Vercel Cron invocations carry the
 *    platform-set `x-vercel-cron` header, so those are let through as a
 *    fallback: per-IP rate limited and the response is trimmed to summary
 *    counts (no record counts, no business-rule messages, no revision) so a
 *    spoofed header cannot farm diagnostics. Configure CRON_SECRET for the
 *    strict mode.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const expectedToken = (
    process.env.CRON_SECRET
    || process.env.CRON_BEARER_TOKEN
    || ""
  ).trim();
  const vercelCronFallback = !expectedToken;
  // Fail closed for everything that is neither bearer-authenticated nor a
  // Vercel Cron invocation: a public, unauthenticated full-workspace
  // integrity scan must stay impossible.
  if (!expectedToken && request.headers.get("x-vercel-cron") !== "1") {
    return NextResponse.json(
      { ok: false, error: "Cron endpoint disabled: CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!vercelCronFallback) {
    const authHeader = request.headers.get("authorization") || "";
    const suppliedToken = authHeader
      .toLowerCase()
      .startsWith("bearer ")
      ? authHeader.slice("bearer ".length).trim()
      : "";
    const supplied = Buffer.from(suppliedToken);
    const expected = Buffer.from(expectedToken);
    if (
      supplied.length !== expected.length
      || !timingSafeEqual(supplied, expected)
    ) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized." },
        { status: 401 },
      );
    }
  } else {
    // Unauthenticated fallback: the header is spoofable, so cap how often any
    // one caller can trigger the expensive scan (real cron fires once/day).
    const gate = rateLimit(`qa-cron:${clientIp(request)}`, 6, 60 * 60);
    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many unauthenticated cron checks; set CRON_SECRET for bearer auth.",
          retryAfterSec: gate.retryAfterSec,
        },
        { status: 429 },
      );
    }
    console.warn(
      "[qa/cron] running via the unauthenticated x-vercel-cron fallback — set CRON_SECRET to require bearer auth and return full diagnostics.",
    );
  }

  try {
    const workspace = await getWorkspace(false);
    const db = workspace.data;
    const integrity = checkWorkspaceIntegrity(db);
    const integrityBySeverity: Record<string, number> = {
      critical: 0,
      warning: 0,
      info: 0,
    };
    for (const issue of integrity.issues || []) {
      const severity = (issue.severity || "info").toLowerCase();
      integrityBySeverity[severity] =
        (integrityBySeverity[severity] || 0) + 1;
    }

    let businessRuleIssues: string[] = [];
    try {
      businessRuleIssues = validateBusinessData(db) || [];
    } catch (validationError) {
      businessRuleIssues = [
        `Validator threw: ${
          validationError instanceof Error
            ? validationError.message
            : String(validationError)
        }`,
      ];
    }

    const expiredRouteBundlesDeleted = await cleanupExpiredStaffRouteBundles().catch((error) => {
      console.error(
        "[qa/cron] route-bundle cleanup failed:",
        error,
      );
      return -1;
    });

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
      storageAccounts:
        db.master?.storageAccounts?.length || 0,
      storageFolderTemplates:
        db.master?.storageFolderTemplates?.length || 0,
      storageFolderInstances:
        db.master?.storageFolderInstances?.length || 0,
      entityFileAttachments:
        db.entityFileAttachments?.length || 0,
      auditLog: db.auditLog?.length || 0,
    };
    const durationMs = Date.now() - startedAt;
    const ok =
      integrityBySeverity.critical === 0
      && businessRuleIssues.length === 0;
    const integritySummary = {
      critical: integrityBySeverity.critical,
      warning: integrityBySeverity.warning,
      info: integrityBySeverity.info,
      total: integrity.issues?.length || 0,
    };
    const maintenance = { expiredRouteBundlesDeleted };
    const base = {
      ok,
      timestamp: new Date().toISOString(),
      durationMs,
    };

    // Bearer mode (CRON_SECRET set): full diagnostics.
    if (!vercelCronFallback) {
      return NextResponse.json(
        {
          ...base,
          workspace: {
            revision: workspace.revision,
            counts,
          },
          integrity: {
            ...integritySummary,
            healthScore: integrity.healthScore ?? 100,
          },
          businessRules: {
            total: businessRuleIssues.length,
            firstError: businessRuleIssues[0] || null,
          },
          maintenance,
        },
        { status: ok ? 200 : 500 },
      );
    }

    // Fallback mode: summary only — no record counts, no revision, and no
    // business-rule messages (firstError can embed real workspace data).
    return NextResponse.json(
      {
        ...base,
        mode: "vercel-cron-fallback",
        integrity: integritySummary,
        maintenance,
      },
      { status: ok ? 200 : 500 },
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error("[qa/cron] health check failed:", error);
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
