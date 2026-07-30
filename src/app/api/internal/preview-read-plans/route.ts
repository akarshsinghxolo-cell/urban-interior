import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getModuleScopedWorkspace } from "@/lib/rdash/server/module-scoped-read";
import type { AuthenticatedUser } from "@/lib/rdash/server/auth";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  if (process.env.VERCEL_ENV !== "preview" || process.env.UC_PREVIEW_DEMO !== "1") {
    return false;
  }
  const expected = String(process.env.UC_PREVIEW_VERIFY_TOKEN || "").trim();
  const supplied = String(request.headers.get("x-uc-preview-verifier") || "").trim();
  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer);
}

const verifier: AuthenticatedUser = {
  userId: "preview-read-verifier",
  email: "preview-verifier@urban-castle.invalid",
  name: "Preview Read Verifier",
  role: "Owner",
  expiresAt: Date.now() + 60_000,
};

async function verifyModule(moduleId: string) {
  const workspace = await getModuleScopedWorkspace(
    verifier,
    workspaceReadTargetForModule(moduleId),
  );
  const metadata = workspace.data as unknown as Record<string, unknown>;
  const savedCollections = Math.max(
    0,
    workspace.scopeCollectionCount - workspace.collectionCount,
  );
  return {
    moduleId,
    scope: workspace.scope,
    strategy: workspace.readStrategy,
    queries: workspace.queryCount,
    collections: workspace.collectionCount,
    scopeCollections: workspace.scopeCollectionCount,
    savedCollections,
    collectionReductionPercent: workspace.scopeCollectionCount > 0
      ? Math.round((savedCollections / workspace.scopeCollectionCount) * 100)
      : 0,
    limitedCollections: workspace.limitedCollections,
    projectedBootstrap: Boolean(metadata._workspace_bootstrap_projection),
    dataSource: String(metadata._data_source || "in-memory-preview"),
    loadedModule: metadata._workspace_read_module,
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [tasks, vendorRates, finance] = await Promise.all([
      verifyModule("tasks"),
      verifyModule("vendorRates"),
      verifyModule("financeDesk"),
    ]);

    const valid =
      tasks.strategy === "module" &&
      tasks.savedCollections > 0 &&
      vendorRates.limitedCollections["master.vendorRateHistories"] === 100 &&
      finance.strategy === "scope" &&
      finance.savedCollections === 0;

    return NextResponse.json(
      {
        valid,
        verificationMode: "isolated-preview-seed",
        databaseProjectionVerifiedSeparately: true,
        tasks,
        vendorRates,
        finance,
      },
      {
        status: valid ? 200 : 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    console.error("[preview-read-plans] verification failed:", error);
    return NextResponse.json(
      { error: "Preview read-plan verification failed." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  }
}
