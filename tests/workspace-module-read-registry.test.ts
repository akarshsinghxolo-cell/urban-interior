import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import {
  COLLECTIONS_BY_SCOPE,
  CUSTOMER_SCOPE_COLLECTIONS,
  WORKSPACE_BOOTSTRAP_COLLECTIONS,
} from "@/lib/rdash/server/module-scoped-collections";
import { collectionsForWorkspaceReadTarget } from "@/lib/rdash/server/module-read-plans";
import { WORKSPACE_FOUNDATION_COLLECTIONS } from "@/lib/rdash/server/projected-workspace-bootstrap";
import { MODULE_ROUTE_REGISTRY, REGISTERED_MODULE_IDS } from "@/lib/rdash/modules";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";

/**
 * Registry guard for the module read-scope contract.
 *
 * Bug class being prevented (shipped once as the missing
 * "master.contractorRates" in the customer scope): a module component reads
 * `db.<collection>` from the client store, but the server read plan for that
 * module never transmits the collection, so the UI silently renders empty or
 * stale data. Tests elsewhere assert the plans are well-formed; this file
 * asserts the plans cover what the module UIs actually read.
 *
 * Chain resolved end to end, all derived from source (no hand-maintained
 * module table): registered module id -> renderer (MODULE_ROUTE_REGISTRY) ->
 * component file(s) (WorkspaceModuleRouter lazy imports + case bodies) ->
 * collections read (`db.<collection>` / `db.master.<collection>` tokens in the
 * mapped file plus sibling imports that stay inside components/rdash/modules,
 * so wrapper components like QuotationWorkspaceModule attribute their inner
 * module's reads) -> compared against the module's effective server plan.
 *
 * Known limitation: reads made inside shared widget files (components/rdash
 * helpers imported by many modules) are not attributed to the modules that
 * render them, because statically distinguishing "rendered and needed" from
 * "imported but props-fed" is not worth the false-positive cost. The union
 * test below still guarantees those reads are served by SOME scope.
 */

const ROUTER_FILE = "src/components/rdash/WorkspaceModuleRouter.tsx";
const RDASH_COMPONENT_DIR = "src/components/rdash";
const MODULE_COMPONENT_DIR = `${RDASH_COMPONENT_DIR}/modules`;

/** Collections every module read may assume: bootstrap-resident or foundation-embedded. */
const ALWAYS_ALLOWED = new Set<string>([
  ...WORKSPACE_BOOTSTRAP_COLLECTIONS,
  ...WORKSPACE_FOUNDATION_COLLECTIONS,
]);

const KNOWN_COLLECTIONS = new Set(Object.keys(COLLECTION_TO_TABLE));

/**
 * Documented attribution artifacts only. A module shares a component file
 * with another module (or renders an early-return subset of one), so the
 * file-level read extraction sees collections the narrower view cannot
 * reach. Every entry must name the shared file; the hygiene test below
 * fails if an allowlisted collection is not served by some other scope.
 *
 * ponytail: shrink this map by splitting shared component files, never by
 * deleting entries silently.
 */
const READ_ATTRIBUTION_ALLOWLIST: Record<string, Record<string, string>> = {
  // CustomerDesk.tsx serves both customerDesk (default view) and
  // customerTimeline (view="timeline" early-returns before the desk tabs).
  // The timeline branch itself only reads collections the paged plan covers
  // (verified): customers, sites, workRequired, workOrders, quotations,
  // tasks, visits, payments, invoices, customerReceipts, drawings,
  // executionLogs, boqs, purchaseOrders, grns, vendorBills, commSends,
  // auditLog + customerProgress's reads.
  customerTimeline: {
    "master.catalogues": "shared CustomerDesk.tsx: default-view attachment previews only",
    "master.referenceMedia": "shared CustomerDesk.tsx: default-view attachment previews only",
    "master.contractorRates": "shared CustomerDesk.tsx: capture dialog unreachable in timeline view",
    risks: "shared CustomerDesk.tsx: desk tab content",
    variationRequests: "shared CustomerDesk.tsx: desk tab content",
    entityReferenceAssignments: "shared CustomerDesk.tsx: desk tab content",
    workOrderCostLines: "shared CustomerDesk.tsx: desk tab content",
    actions: "shared CustomerDesk.tsx: desk tab content",
    acceptedScopes: "shared CustomerDesk.tsx: desk tab content",
    contractorBills: "shared CustomerDesk.tsx: desk tab content",
  },
  // RemainingModules.tsx hosts ApprovalsModule, CashMarginRiskModule,
  // SiteVisitsModule, CustomerDeskExtrasModule and QuotationExtrasModule;
  // importers of any one are attributed the whole file's reads.
  customerRequests: {
    actions: "RemainingModules.tsx union: ApprovalsModule sibling, not rendered here",
    risks: "RemainingModules.tsx union: ApprovalsModule sibling, not rendered here",
  },
  approvals: {
    visits: "RemainingModules/SalesExtraModules union: SiteVisits/SourceReferral siblings",
    workRequired: "RemainingModules union: CustomerDeskExtras sibling",
    tasks: "RemainingModules union: CustomerDeskExtras sibling",
    "master.sourcePartners": "SalesExtraModules union: SourceReferral sibling",
    commissions: "SalesExtraModules union: SourceReferral sibling",
  },
  lostClosedReview: {
    recurringTasks: "MiscModules.tsx union: RecurringTasksModule sibling",
  },
  quotationDesk: {
    risks: "RemainingModules.tsx union via QuotationWorkspaceModule: ApprovalsModule sibling",
    visits: "RemainingModules.tsx union via QuotationWorkspaceModule: SiteVisitsModule sibling",
  },
  fieldOperations: {
    quotations: "RemainingModules.tsx union: quotations readers are extras siblings",
  },
  // DrawingsExecutionModules.tsx hosts DrawingsModule + ExecutionLogsModule.
  drawings: {
    executionLogs: "shared DrawingsExecutionModules.tsx: execution-log dialog reads",
    variationRequests: "shared DrawingsExecutionModules.tsx: execution-log dialog reads",
  },
  executionLogs: {
    drawings: "shared DrawingsExecutionModules.tsx: DrawingsModule sibling",
    areas: "shared DrawingsExecutionModules.tsx: DrawingUploadDialog (drawings flow)",
  },
  // MastersSalesOpsModule.tsx hosts MastersModule, SalesOpsModule and
  // ObstacleThreadsModule; the masters-v2/sales-ops renderer cases resolve
  // one component by submodule, but case-level attribution unions the file.
  contractorRates: {
    "master.sourcePartners": "MastersModule spans source-partner/commission filter branches",
    "master.commissionRules": "MastersModule spans source-partner/commission filter branches",
  },
  vendorRates: {
    "master.contractors": "masters-v2 case unions MastersSalesOpsModule.tsx components",
    "master.sourcePartners": "masters-v2 case unions MastersSalesOpsModule.tsx components",
    "master.commissionRules": "masters-v2 case unions MastersSalesOpsModule.tsx components",
    "master.contractorRates": "masters-v2 case unions MastersSalesOpsModule.tsx components",
    tasks: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    visits: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    workOrders: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    customers: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    quotations: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    invoices: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    sites: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    blocked: "masters-v2 case unions MastersSalesOpsModule.tsx components",
    threads: "masters-v2 case unions MastersSalesOpsModule.tsx components",
  },
  invoices: {
    "master.vendors": "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    "master.vendorRates": "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    "master.contractors": "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    "master.sourcePartners": "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    "master.commissionRules": "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    "master.contractorRates": "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    tasks: "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    visits: "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    quotations: "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
    blocked: "sales-ops renderer maps to MastersSalesOpsModule.tsx (3 components)",
  },
  // SalesExtraModules.tsx hosts SourceReferralModule, DiscountApprovalsModule
  // and GstReturnsModule.
  commissions: {
    actions: "SalesExtraModules.tsx union: DiscountApprovals sibling",
    quotations: "SalesExtraModules.tsx union: DiscountApprovals sibling",
    approvalPolicies: "SalesExtraModules.tsx union: DiscountApprovals sibling",
    invoices: "SalesExtraModules.tsx union: DiscountApprovals sibling",
    vendorBills: "SalesExtraModules.tsx union: GstReturns sibling",
  },
  gstReturns: {
    "master.sourcePartners": "SalesExtraModules.tsx union: SourceReferral sibling",
    customers: "SalesExtraModules.tsx union: SourceReferral sibling",
    commissions: "SalesExtraModules.tsx union: SourceReferral sibling",
    actions: "SalesExtraModules.tsx union: DiscountApprovals sibling",
    quotations: "SalesExtraModules.tsx union: DiscountApprovals sibling",
    approvalPolicies: "SalesExtraModules.tsx union: DiscountApprovals sibling",
  },
  // WorkdeskCombinedViews.tsx is a tab shell whose imports pull four module
  // component files into both combined modules' attribution.
  blockedRisks: {
    actions: "WorkdeskCombinedViews/MastersSalesOps import union",
    visits: "WorkdeskCombinedViews/MastersSalesOps import union",
    workRequired: "WorkdeskCombinedViews/MastersSalesOps import union",
    quotations: "WorkdeskCombinedViews/MastersSalesOps import union",
    "master.vendors": "WorkdeskCombinedViews/MastersSalesOps import union",
    "master.vendorRates": "WorkdeskCombinedViews/MastersSalesOps import union",
    "master.contractors": "WorkdeskCombinedViews/MastersSalesOps import union",
    "master.sourcePartners": "WorkdeskCombinedViews/MastersSalesOps import union",
    "master.commissionRules": "WorkdeskCombinedViews/MastersSalesOps import union",
    "master.contractorRates": "WorkdeskCombinedViews/MastersSalesOps import union",
    invoices: "WorkdeskCombinedViews/MastersSalesOps import union",
    payments: "WorkdeskCombinedViews/MastersSalesOps import union",
    purchaseOrders: "WorkdeskCombinedViews/MastersSalesOps import union",
    recurringTasks: "WorkdeskCombinedViews/MastersSalesOps import union",
  },
  calendarRecurring: {
    blocked: "WorkdeskCombinedViews.tsx union: BlockedRisksCombined sibling",
    risks: "WorkdeskCombinedViews.tsx union: BlockedRisksCombined sibling",
    actions: "WorkdeskCombinedViews import union",
    "master.vendorRates": "WorkdeskCombinedViews import union",
    "master.contractors": "WorkdeskCombinedViews import union",
    "master.sourcePartners": "WorkdeskCombinedViews import union",
    "master.commissionRules": "WorkdeskCombinedViews import union",
    "master.contractorRates": "WorkdeskCombinedViews import union",
    invoices: "WorkdeskCombinedViews import union",
    threads: "WorkdeskCombinedViews import union",
  },
  // The report-family renderer shares ReportsModule.tsx across four
  // analytics modules; per-family complete plans narrow deliberately by
  // family, so cross-family reads are expected attribution noise.
  salesAnalytics: {
    "master.vendors": "ReportsModule.tsx shared by four report-family modules",
    invoices: "ReportsModule.tsx shared by four report-family modules",
    visits: "ReportsModule.tsx shared by four report-family modules",
    tasks: "ReportsModule.tsx shared by four report-family modules",
    followups: "ReportsModule.tsx shared by four report-family modules",
    purchaseOrders: "ReportsModule.tsx shared by four report-family modules",
    grns: "ReportsModule.tsx shared by four report-family modules",
    vendorBills: "ReportsModule.tsx shared by four report-family modules",
    vendorPayments: "ReportsModule.tsx shared by four report-family modules",
    vendorRfqs: "ReportsModule.tsx shared by four report-family modules",
  },
  collectionAnalytics: {
    "master.vendors": "ReportsModule.tsx shared by four report-family modules",
    quotations: "ReportsModule.tsx shared by four report-family modules",
    visits: "ReportsModule.tsx shared by four report-family modules",
    tasks: "ReportsModule.tsx shared by four report-family modules",
    followups: "ReportsModule.tsx shared by four report-family modules",
    purchaseOrders: "ReportsModule.tsx shared by four report-family modules",
    grns: "ReportsModule.tsx shared by four report-family modules",
    vendorBills: "ReportsModule.tsx shared by four report-family modules",
    vendorPayments: "ReportsModule.tsx shared by four report-family modules",
    vendorRfqs: "ReportsModule.tsx shared by four report-family modules",
    workRequired: "ReportsModule.tsx shared by four report-family modules",
  },
  operationsAnalytics: {
    "master.vendors": "ReportsModule.tsx shared by four report-family modules",
    customerReceipts: "ReportsModule.tsx shared by four report-family modules",
    payments: "ReportsModule.tsx shared by four report-family modules",
    quotations: "ReportsModule.tsx shared by four report-family modules",
    invoices: "ReportsModule.tsx shared by four report-family modules",
    followups: "ReportsModule.tsx shared by four report-family modules",
    purchaseOrders: "ReportsModule.tsx shared by four report-family modules",
    grns: "ReportsModule.tsx shared by four report-family modules",
    vendorBills: "ReportsModule.tsx shared by four report-family modules",
    vendorPayments: "ReportsModule.tsx shared by four report-family modules",
    vendorRfqs: "ReportsModule.tsx shared by four report-family modules",
    workRequired: "ReportsModule.tsx shared by four report-family modules",
  },
  financialAnalytics: {
    visits: "ReportsModule.tsx shared by four report-family modules",
    tasks: "ReportsModule.tsx shared by four report-family modules",
    followups: "ReportsModule.tsx shared by four report-family modules",
    purchaseOrders: "ReportsModule.tsx shared by four report-family modules",
    grns: "ReportsModule.tsx shared by four report-family modules",
    vendorRfqs: "ReportsModule.tsx shared by four report-family modules",
    workRequired: "ReportsModule.tsx shared by four report-family modules",
  },
};

/** renderer -> component file paths, derived from the router's lazy imports + case bodies. */
async function componentFilesByRenderer(): Promise<Map<string, string[]>> {
  const source = await testFile(ROUTER_FILE).text();
  const lazyFileByIdentifier = new Map<string, string>();
  const lazyPattern = /const\s+([A-Za-z0-9_]+)\s*=\s*React\.lazy\(\s*\(\)\s*=>\s*import\("([^"]+)"\)/g;
  for (const [, identifier, importPath] of source.matchAll(lazyPattern)) {
    lazyFileByIdentifier.set(identifier, resolveRouterImport(importPath));
  }

  const byRenderer = new Map<string, Set<string>>();
  const casePattern = /case\s+"([^"]+)":([\s\S]*?)(?=case\s+"|default:|$)/g;
  for (const [, renderer, body] of source.matchAll(casePattern)) {
    const files = byRenderer.get(renderer) ?? new Set<string>();
    for (const [, identifier] of body.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
      const file = lazyFileByIdentifier.get(identifier);
      if (file) files.add(file);
    }
    if (files.size > 0) byRenderer.set(renderer, files);
  }
  return new Map([...byRenderer].map(([renderer, files]) => [renderer, [...files]]));
}

function resolveRouterImport(importPath: string): string {
  // Router lazy imports are relative to src/components/rdash (e.g. ./modules/CustomerDesk).
  const base = `${RDASH_COMPONENT_DIR}/${importPath.replace(/^\.\//, "")}`;
  return base.endsWith(".tsx") || base.endsWith(".ts") ? base : `${base}.tsx`;
}

/** Collections read by a file (plus one level of local relative imports inside components/rdash). */
async function collectionsReadByFile(filePath: string, seen = new Set<string>()): Promise<Set<string>> {
  if (seen.has(filePath)) return new Set();
  seen.add(filePath);
  const source = await testFile(filePath).text();
  const reads = new Set<string>();
  for (const [, key] of source.matchAll(/\bdb\.master\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const collection = `master.${key}`;
    if (KNOWN_COLLECTIONS.has(collection)) reads.add(collection);
  }
  for (const [, key] of source.matchAll(/\bdb\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (key === "master") continue; // handled by the dotted pattern above
    if (KNOWN_COLLECTIONS.has(key)) reads.add(key);
  }
  // Follow relative imports that stay inside components/rdash/modules so
  // wrapper modules (e.g. QuotationWorkspaceModule -> QuotationsModule)
  // attribute the module components they render. Shared widget files outside
  // modules/ are deliberately not attributed (see header note).
  for (const [, relative] of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const candidate = resolveLocalImport(filePath, relative);
    if (
      candidate &&
      candidate.startsWith(`${MODULE_COMPONENT_DIR}/`) &&
      (await testFile(candidate).exists())
    ) {
      const inner = await collectionsReadByFile(candidate, seen);
      for (const collection of inner) reads.add(collection);
    }
  }
  return reads;
}

/** Resolve a local relative import to a repo path, or undefined when it leaves components/rdash. */
function resolveLocalImport(fromFile: string, relative: string): string | undefined {
  const segments = [...fromFile.split("/").slice(0, -1), ...relative.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  const base = resolved.join("/");
  if (!base.startsWith(`${RDASH_COMPONENT_DIR}/`)) return undefined;
  return base.endsWith(".tsx") || base.endsWith(".ts") ? base : `${base}.tsx`;
}

describe("workspace module read registry", () => {
  test("every module renderer resolves to at least one component file", async () => {
    const filesByRenderer = await componentFilesByRenderer();
    for (const id of REGISTERED_MODULE_IDS) {
      const route = MODULE_ROUTE_REGISTRY.get(id);
      expect(route, `module ${id} missing from MODULE_ROUTE_REGISTRY`).toBeDefined();
      const files = filesByRenderer.get(route!.renderer);
      expect(
        files,
        `renderer "${route!.renderer}" (module ${id}) has no case with lazy component in ${ROUTER_FILE}`,
      ).toBeDefined();
    }
  });

  test("critical module files stay reachable through the router chain", async () => {
    const filesByRenderer = await componentFilesByRenderer();
    const reachable = new Set([...filesByRenderer.values()].flat());
    // If these go missing, router parsing drifted and the coverage tests below
    // would silently under-report instead of guarding.
    for (const critical of [
      "src/components/rdash/modules/CustomerDesk.tsx",
      "src/components/rdash/modules/DailyWork.tsx",
    ]) {
      expect(reachable.has(critical), `${critical} unreachable from router chain`).toBe(true);
    }
  });

  test("customer scope still carries contractor rates for the capture estimates (Task 24 pin)", () => {
    expect(CUSTOMER_SCOPE_COLLECTIONS).toContain("master.contractorRates");
  });

  test("every collection read by a module UI is served by at least one scope", async () => {
    const filesByRenderer = await componentFilesByRenderer();
    const served = new Set<string>([
      ...ALWAYS_ALLOWED,
      ...Object.values(COLLECTIONS_BY_SCOPE).flat(),
    ]);
    const offenders = new Map<string, string[]>();
    for (const id of REGISTERED_MODULE_IDS) {
      const route = MODULE_ROUTE_REGISTRY.get(id)!;
      for (const file of filesByRenderer.get(route.renderer) ?? []) {
        for (const collection of await collectionsReadByFile(file)) {
          if (!served.has(collection)) {
            offenders.set(collection, [...(offenders.get(collection) ?? []), `${id} (${file})`]);
          }
        }
      }
    }
    expect(
      [...offenders.entries()].map(
        ([collection, readers]) => `${collection} read by ${readers.join(", ")}`,
      ),
    ).toEqual([]);
  });

  test("every module read is covered by that module's server plan (or the attribution allowlist)", async () => {
    const filesByRenderer = await componentFilesByRenderer();
    const failures: string[] = [];
    for (const id of REGISTERED_MODULE_IDS) {
      const route = MODULE_ROUTE_REGISTRY.get(id)!;
      const target = workspaceReadTargetForModule(id);
      const planned = collectionsForWorkspaceReadTarget(target);
      const allowlisted = READ_ATTRIBUTION_ALLOWLIST[id] ?? {};
      const allowed = new Set<string>([...planned, ...ALWAYS_ALLOWED, ...Object.keys(allowlisted)]);
      const reads = new Set<string>();
      for (const file of filesByRenderer.get(route.renderer) ?? []) {
        for (const collection of await collectionsReadByFile(file)) reads.add(collection);
      }
      const missing = [...reads].filter((collection) => !allowed.has(collection));
      if (missing.length > 0) {
        failures.push(
          `${id} (renderer ${route.renderer}, scope ${target.scope}) reads ` +
            `${missing.join(", ")} that its plan does not serve` +
            (Object.keys(allowlisted).length > 0
              ? ` (allowlist already documents: ${Object.keys(allowlisted).join(", ")})`
              : ""),
        );
      }
    }
    expect(failures).toEqual([]);
  });

  test("allowlist entries stay honest: allowlisted data must be served somewhere else", async () => {
    const served = new Set<string>([
      ...ALWAYS_ALLOWED,
      ...Object.values(COLLECTIONS_BY_SCOPE).flat(),
    ]);
    for (const [moduleId, entries] of Object.entries(READ_ATTRIBUTION_ALLOWLIST)) {
      for (const [collection, reason] of Object.entries(entries)) {
        expect(reason.length, `${moduleId}: ${collection} allowlist entry needs a reason`).toBeGreaterThan(0);
        expect(
          served.has(collection),
          `${moduleId} allowlists ${collection} but no scope serves it — this is a missing-data bug, not an attribution artifact`,
        ).toBe(true);
      }
    }
  });
});
