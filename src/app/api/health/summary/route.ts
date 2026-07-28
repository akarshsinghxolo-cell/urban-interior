import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspaceHealthSummary } from "@/lib/rdash/server/workspace-health";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Lightweight authenticated dashboard health aggregate.
 *
 * Operational metrics read only the collections they need. The expensive full
 * referential-integrity scan is produced by the daily QA cron (or a manual
 * Integrity action) and read here as a stored snapshot.
 */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  try {
    const user = await requireSession(request);
    const summary = await getWorkspaceHealthSummary();
    console.info("[workspace-health]", {
      revision: summary.revision,
      queryCount: summary.queryCount,
      collectionCount: summary.collectionCount,
      loadMs: summary.loadMs,
      integritySnapshot: summary.integrity.snapshotAvailable,
      totalMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        user: { name: user.name, email: user.email, role: user.role },
        ...summary,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
          "Vary": "Authorization, Cookie",
          "X-UC-Health-Collections": String(summary.collectionCount),
          "X-UC-Health-Queries": String(summary.queryCount),
          "X-UC-Health-Load-Ms": String(summary.loadMs),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summary unavailable.";
    const status = message === "UNAUTHORIZED" ? 401 : 503;
    console.error("[workspace-health] failed", {
      status,
      totalMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: message,
    });
    return NextResponse.json(
      { error: status === 401 ? "Authentication is required." : "Workspace health is temporarily unavailable." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
