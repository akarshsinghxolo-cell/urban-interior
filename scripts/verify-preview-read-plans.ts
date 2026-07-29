import { getModuleScopedWorkspace } from "../src/lib/rdash/server/module-scoped-read";
import { workspaceReadTargetForModule } from "../src/lib/rdash/workspace-read-scope";
import type { AuthenticatedUser } from "../src/lib/rdash/server/auth";

const verifier: AuthenticatedUser = {
  userId: "preview-read-verifier",
  email: "preview-verifier@urban-castle.invalid",
  name: "Preview Read Verifier",
  role: "Owner",
  expiresAt: Date.now() + 60_000,
};

function metadata(database: unknown): Record<string, unknown> {
  return database && typeof database === "object"
    ? database as Record<string, unknown>
    : {};
}

async function verify(moduleId: string) {
  const target = workspaceReadTargetForModule(moduleId);
  const workspace = await getModuleScopedWorkspace(verifier, target);
  const meta = metadata(workspace.data);
  return {
    moduleId,
    scope: workspace.scope,
    strategy: workspace.readStrategy,
    queries: workspace.queryCount,
    collections: workspace.collectionCount,
    scopeCollections: workspace.scopeCollectionCount,
    limitedCollections: workspace.limitedCollections,
    projectedBootstrap: Boolean(meta._workspace_bootstrap_projection),
    loadedModule: meta._workspace_read_module,
  };
}

const tasks = await verify("tasks");
if (tasks.strategy !== "module" || tasks.collections >= tasks.scopeCollections) {
  throw new Error(`Tasks did not use a narrower module plan: ${JSON.stringify(tasks)}`);
}
if (!tasks.projectedBootstrap) {
  throw new Error("The live preview bootstrap did not use JSON field projection.");
}

const vendorRates = await verify("vendorRates");
if (vendorRates.limitedCollections["master.vendorRateHistories"] !== 100) {
  throw new Error(`Vendor-rate history was not bounded: ${JSON.stringify(vendorRates)}`);
}

const finance = await verify("financeDesk");
if (finance.strategy !== "scope") {
  throw new Error(`Finance dashboard must retain its complete scope: ${JSON.stringify(finance)}`);
}

console.log("[preview-read-verification]", JSON.stringify({ tasks, vendorRates, finance }));
