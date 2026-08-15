from pathlib import Path
import re

ROOT = Path('.')

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def write(path: str, content: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')

def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one occurrence, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))

def sub_once(path: str, pattern: str, repl: str, flags: int = 0) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: expected one regex replacement, found {count}: {pattern[:100]!r}')
    write(path, next_text)

# Bootstrap returns one reusable foundation snapshot.
write('src/app/api/bootstrap/route.ts', '''import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getProjectedWorkspaceBootstrap } from "@/lib/rdash/server/projected-workspace-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
});

function errorResponse(error: string, status: number, retryAfter?: string) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        ...PRIVATE_HEADERS,
        ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return errorResponse("Your session is missing or expired.", 401);
    }
    console.error("[api/bootstrap] session verification failed:", error);
    return errorResponse("The authentication service is temporarily unavailable.", 503, "5");
  }

  try {
    const startedAt = performance.now();
    const workspace = await getProjectedWorkspaceBootstrap(user.staffId);
    const loadMs = performance.now() - startedAt;
    const body = JSON.stringify({
      revision: workspace.revision,
      updatedAt: workspace.updatedAt,
      data: workspace.data,
      rowVersions: workspace.rowVersions,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        expiresAt: user.expiresAt,
      },
      workspaceId: process.env.UC_WORKSPACE_ID || "default",
      readStrategy: "foundation-first",
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...PRIVATE_HEADERS,
        "X-UC-Read-Mode": "bootstrap",
        "X-UC-Read-Strategy": "bootstrap",
        "X-UC-Read-Queries": String(workspace.queryCount),
        "X-UC-Response-Bytes": String(Buffer.byteLength(body)),
        "Server-Timing": `workspace-bootstrap;dur=${loadMs.toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error("[api/bootstrap] workspace bootstrap failed:", error);
    return errorResponse("The workspace bootstrap service is temporarily unavailable.", 503, "5");
  }
}
''')

# Module reads authorize via projected permissions and never retransmit foundation.
path = 'src/lib/rdash/server/module-scoped-read.ts'
replace_once(path, 'import { getProjectedWorkspaceBootstrap } from "./projected-workspace-bootstrap";', '''import {
  getProjectedWorkspaceBootstrap,
  getProjectedWorkspacePermissions,
  WORKSPACE_FOUNDATION_COLLECTIONS,
} from "./projected-workspace-bootstrap";''')
replace_once(path, '''import {
  COLLECTIONS_BY_SCOPE,
  WORKSPACE_BOOTSTRAP_COLLECTIONS,
} from "./module-scoped-collections";''', 'import { COLLECTIONS_BY_SCOPE } from "./module-scoped-collections";')
replace_once(path, 'export const MODULE_SCOPED_READS_ENABLED = true;\n', 'export const MODULE_SCOPED_READS_ENABLED = true;\nconst FOUNDATION_COLLECTIONS = new Set<string>(WORKSPACE_FOUNDATION_COLLECTIONS);\n')
sub_once(path, r'''async function authorizedBootstrap\([\s\S]*?\n\}\n\nasync function readAuthorizedScope''', '''async function authorizeModuleTarget(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget & { scope: ModuleWorkspaceReadScope },
): Promise<WorkspaceSubset> {
  const authorization = await getProjectedWorkspacePermissions();
  const access = workspaceRouteAccessDecision(
    target.moduleId,
    user.role,
    authorization.data.staffRolePermissions as unknown[],
    target.permissionModule,
  );
  if (access.status !== "allowed") {
    throw new Error(`FORBIDDEN:Your role cannot open ${access.moduleLabel}.`);
  }
  return authorization;
}

async function readAuthorizedScope''', re.S)
replace_once(path, '  const bootstrap = await authorizedBootstrap(user, target);\n  const plan = workspaceModuleReadPlan(target);', '  const authorization = await authorizeModuleTarget(user, target);\n  const plan = workspaceModuleReadPlan(target);')
replace_once(path, '''  const plannedFullStaff = plannedCollections.includes("master.staff");
  const fullStaffAllowed = plannedFullStaff && canReadFullStaffData(user.role);
  const fullCollections = fullStaffAllowed
    ? [...plannedCollections]
    : plannedCollections.filter((collection) => collection !== "master.staff");
''', '''  const plannedFullStaff = plannedCollections.includes("master.staff");
  const fullStaffAllowed = plannedFullStaff && canReadFullStaffData(user.role);
  const transmittedCollections = plannedCollections.filter(
    (collection) => !FOUNDATION_COLLECTIONS.has(collection),
  );
  const fullCollections = fullStaffAllowed
    ? [...transmittedCollections]
    : transmittedCollections.filter((collection) => collection !== "master.staff");
''')
replace_once(path, '  const merged = mergeWorkspaceSubsets(bootstrap, scoped);\n  const savings = moduleReadPlanSavings(target);', '  if (scoped.revision !== authorization.revision) throw new Error("READ_CONFLICT");\n  const savings = moduleReadPlanSavings(target);')
replace_once(path, '''  const readCollections = [...new Set([
    ...WORKSPACE_BOOTSTRAP_COLLECTIONS,
    ...plannedCollections,
  ])];

  moduleMetadata({
    database: merged.data,
''', '''  const readCollections = [...new Set([
    ...fullCollections,
    ...(plannedFullStaff && !fullStaffAllowed && user.staffId ? ["master.staff"] : []),
  ])];

  moduleMetadata({
    database: scoped.data,
''')
replace_once(path, '    pagination: merged.pagination,', '    pagination: scoped.pagination,')
replace_once(path, '''  return {
    ...merged,
    scope: target.scope,
    collectionCount: readCollections.length,
    scopeCollectionCount: savings.scope + WORKSPACE_BOOTSTRAP_COLLECTIONS.length,
''', '''  return {
    ...scoped,
    queryCount: scoped.queryCount + authorization.queryCount,
    scope: target.scope,
    collectionCount: readCollections.length,
    scopeCollectionCount: savings.scope,
''')
replace_once(path, '''  metadata._workspace_pagination = { ...(input.pagination || {}) };
  if (input.pageOnly) metadata._workspace_page_only = true;
''', '''  metadata._workspace_pagination = { ...(input.pagination || {}) };
  metadata._workspace_foundation_embedded = false;
  if (input.pageOnly) metadata._workspace_page_only = true;
''')
replace_once(path, '  const bootstrap = await authorizedBootstrap(user, target);\n  const plan = workspaceModuleReadPlan(target);', '  const authorization = await authorizeModuleTarget(user, target);\n  const plan = workspaceModuleReadPlan(target);')
replace_once(path, '  if (page.revision !== bootstrap.revision) throw new Error("READ_CONFLICT");', '  if (page.revision !== authorization.revision) throw new Error("READ_CONFLICT");')
replace_once(path, '''  return {
    ...page,
    scope: target.scope,
    collectionCount: pageCollections.length,
    scopeCollectionCount: savings.scope + WORKSPACE_BOOTSTRAP_COLLECTIONS.length,
''', '''  return {
    ...page,
    queryCount: page.queryCount + authorization.queryCount,
    scope: target.scope,
    collectionCount: pageCollections.length,
    scopeCollectionCount: savings.scope,
''')

# Entity graphs also use projected authorization and depend on client foundation.
path = 'src/lib/rdash/server/entity-scoped-read.ts'
replace_once(path, '''import {
  getWorkspaceBootstrap,
  mergeWorkspaceSubsets,
} from "./module-scoped-read";''', '''import { mergeWorkspaceSubsets } from "./module-scoped-read";
import { getProjectedWorkspacePermissions } from "./projected-workspace-bootstrap";''')
sub_once(path, r'''export const ENTITY_REFERENCE_COLLECTIONS = Object\.freeze\(\[[\s\S]*?\] as const\);''', '''export const ENTITY_REFERENCE_COLLECTIONS = Object.freeze([
  "commercialTerms",
  "paymentTermTemplates",
  "taxConfigs",
  "validityConfigs",
] as const);''', re.S)
replace_once(path, '''  let merged = await getWorkspaceBootstrap(user);
  const access = workspaceRouteAccessDecision(
    target.moduleId,
    user.role,
    merged.data.staffRolePermissions as unknown[],
    target.permissionModule,
  );
''', '''  const authorization = await getProjectedWorkspacePermissions();
  const access = workspaceRouteAccessDecision(
    target.moduleId,
    user.role,
    authorization.data.staffRolePermissions as unknown[],
    target.permissionModule,
  );
''')
replace_once(path, '''  const first = relationPlan(entity.kind, entity.id);
  requestedCollections(first).forEach((collection) => touchedCollections.add(collection));
  merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(first));
''', '''  const first = relationPlan(entity.kind, entity.id);
  requestedCollections(first).forEach((collection) => touchedCollections.add(collection));
  let merged = await getRestWorkspaceBySelectors(first);
  if (merged.revision !== authorization.revision) throw new Error("READ_CONFLICT");
''')
replace_once(path, '''  metadata._workspace_read_collections = [...touchedCollections];

  return {
    ...merged,
''', '''  metadata._workspace_read_collections = [...touchedCollections];
  metadata._workspace_foundation_embedded = false;

  return {
    ...merged,
    queryCount: merged.queryCount + authorization.queryCount,
''')

# Delta filters distinguish raw module cache entries from the foundation-bearing session.
path = 'src/lib/rdash/workspace-delta.ts'
replace_once(path, 'import type { RDashDatabase } from "./types";', 'import type { RDashDatabase } from "./types";\nimport { WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS } from "./workspace-session-merge";')
sub_once(path, r'''export const WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS = Object\.freeze\(\[[\s\S]*?\] as const\);''', 'export const WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS =\n  WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS;', re.S)
replace_once(path, '''  return new Set([
    ...WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS,
    ...raw.map((value) => String(value || "").trim()).filter(knownWorkspaceCollection),
  ]);
''', '''  const foundation = metadata._workspace_foundation_embedded === true
    ? WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS
    : [];
  return new Set([
    ...foundation,
    ...raw.map((value) => String(value || "").trim()).filter(knownWorkspaceCollection),
  ]);
''')

# Store starts empty, never synthesizes records during hydration, and accepts compact commits.
path = 'src/lib/rdash/raw-store.ts'
replace_once(path, 'import { buildSeedDatabase } from "./seed";\n', '')
replace_once(path, 'import { formatINR } from "./format";\n', '')
replace_once(path, 'import { prepareWorkspaceData } from "./work-category-master";\n', '')
replace_once(path, 'import { diffWorkspaceOperations } from "./workspace-operations";', 'import { diffWorkspaceOperations } from "./workspace-operations";\nimport { createEmptyWorkspaceDatabase, mergeWorkspaceSnapshot, mergeWorkspaceVersionMap, normalizeWorkspaceSession } from "./workspace-session-merge";')
replace_once(path, 'threadParentExists, ', '')
sub_once(path, r'''function loadStoredWorkspaceDatabase\(\): RDashDatabase \| null \{\n    return null;\n\}\n''', '')
sub_once(path, r'''function createSystemThread\([\s\S]*?\n\}\n// quotationWorkRequiredIds, primaryWorkRequiredId, upsertQuotationFollowup moved to slices/quotations\.ts \(Phase 3j\)''', '''// Hydration is pure; record creation belongs to explicit business actions.
// quotationWorkRequiredIds, primaryWorkRequiredId, upsertQuotationFollowup moved to slices/quotations.ts (Phase 3j)''', re.S)
sub_once(path, r'''    // Per-aggregate revision cache \(relational mode only\)\.[\s\S]*?    interface WorkspaceTransaction \{''', '''    // Per-row revisions are the canonical optimistic-concurrency signal.
    let rowVersionsCache: Record<string, number> | null = null;
    interface WorkspaceTransaction {''', re.S)
sub_once(path, r'''    const restoreAcceptedWorkspace = \(error: string, payload\?: \{[\s\S]*?    \};\n    const queueSecureWorkspaceSave''', '''    const restoreAcceptedWorkspace = (error: string) => {
        const source = lastAcceptedServerDb;
        if (source) {
            const restored = normalizeWorkspaceSession(structuredClone(source) as RDashDatabase);
            setBase({
                db: restored,
                serverRevision: lastAcceptedServerRevision,
                workspaceSyncStatus: "error",
                workspaceSyncError: error,
            });
            serverRevisionForQueue = lastAcceptedServerRevision;
            return;
        }
        setBase({ workspaceSyncStatus: "error", workspaceSyncError: error });
    };
    const queueSecureWorkspaceSave''', re.S)
sub_once(path, r'''                // Build the commit body\.[\s\S]*?                if \(rowVersionsCache && Object\.keys\(rowVersionsCache\)\.length > 0\) \{''', '''                const commitBody: Record<string, unknown> = {
                    revision: serverRevisionForQueue,
                    operations,
                };
                if (rowVersionsCache && Object.keys(rowVersionsCache).length > 0) {''', re.S)
replace_once(path, '''                data?: RDashDatabase;
                rowVersions?: Record<string, number>;
                bumpedAggregateRevisions?: Record<string, number>;
''', '''                patches?: import("./workspace-operations").WorkspaceOperation[];
                rowVersions?: Record<string, number>;
''')
replace_once(path, '                restoreAcceptedWorkspace(message, payload);', '                restoreAcceptedWorkspace(message);')
sub_once(path, r'''            if \(payload\.data && typeof payload\.revision === "number"\) \{[\s\S]*?            \}\n        \}\);''', '''            if (typeof payload.revision === "number") {
                const accepted = normalizeWorkspaceSession(snapshot);
                serverRevisionForQueue = payload.revision;
                lastAcceptedServerRevision = payload.revision;
                lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
                rowVersionsCache = mergeWorkspaceVersionMap(rowVersionsCache, payload.rowVersions);
                setBase({
                    serverRevision: payload.revision,
                    workspaceSyncStatus: "saved",
                    workspaceSyncError: null,
                });
            }
        });''', re.S)
replace_once(path, '        db: loadStoredWorkspaceDatabase() || attachCustomerLabels(prepareWorkspaceDatabase(buildSeedDatabase())),', '        db: createEmptyWorkspaceDatabase(),')
replace_once(path, '        selectedCustomerId: "cust-das",', '        selectedCustomerId: null,')
sub_once(path, r'''        hydrateSecureWorkspace: \(\{ db, revision, user, aggregateRevisions, rowVersions \}\) => \{[\s\S]*?        \},\n        // currentUser, canReleaseContractorPayment moved to core slice''', '''        hydrateSecureWorkspace: ({ db, revision, user, rowVersions }) => {
            const current = get();
            const accepted = mergeWorkspaceSnapshot(current.db, db);
            const nextRevision = Math.max(
                revision,
                current.serverRevision,
                serverRevisionForQueue,
                lastAcceptedServerRevision,
            );
            serverRevisionForQueue = nextRevision;
            lastAcceptedServerRevision = nextRevision;
            lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
            rowVersionsCache = mergeWorkspaceVersionMap(rowVersionsCache, rowVersions);
            const selectedCustomerId = current.selectedCustomerId;
            const resolvedCustomerId = accepted.customers.some((customer) => customer.id === selectedCustomerId)
                ? selectedCustomerId
                : accepted.customers[0]?.id || null;
            setBase({
                db: accepted,
                selectedCustomerId: resolvedCustomerId,
                serverRevision: nextRevision,
                authUser: user,
                workspaceSyncStatus: "saved",
                workspaceSyncError: null,
            });
        },
        // currentUser, canReleaseContractorPayment moved to core slice''', re.S)
text = read(path)
text = text.replace('attachCustomerLabels(prepareWorkspaceDatabase(', 'normalizeWorkspaceSession(')
write(path, text)

# RDashApp hydrates the foundation returned by bootstrap.
path = 'src/components/rdash/RDashApp.tsx'
replace_once(path, '''                user?: {
                    userId: string;
                    name: string;
                    email: string;
                    role: string;
                    staffId?: string;
                    expiresAt: number;
                };
''', '''                data?: import("@/lib/rdash/types").RDashDatabase;
                rowVersions?: Record<string, number>;
                user?: {
                    userId: string;
                    name: string;
                    email: string;
                    role: string;
                    staffId?: string;
                    expiresAt: number;
                };
''')
replace_once(path, '''            if (!response.ok || typeof payload.revision !== "number" || !payload.user)
                throw new Error(payload.error || "The secure workspace session could not be initialized.");
''', '''            if (!response.ok || typeof payload.revision !== "number" || !payload.user || !payload.data)
                throw new Error(payload.error || "The secure workspace session could not be initialized.");
''')
replace_once(path, '''            useRDashStore.setState({
                authUser: payload.user,
                serverRevision: payload.revision,
                workspaceSyncStatus: "idle",
                workspaceSyncError: null,
            });
            workspaceReadState.recordResponse(response);
''', '''            useRDashStore.getState().hydrateSecureWorkspace({
                db: payload.data,
                revision: payload.revision,
                user: payload.user,
                rowVersions: payload.rowVersions,
            });
            workspaceReadState.recordResponse(response);
''')

# Cache has a non-mutating synchronous lookup for before-paint restoration.
path = 'src/lib/rdash/workspace-read-cache.ts'
replace_once(path, '''  put(entry: WorkspaceReadCacheEntry): void {
    putEntry(entry);
  },
''', '''  peek(
    target: WorkspaceReadTarget,
    user: AuthenticatedWorkspaceUser,
  ): WorkspaceReadCacheEntry | null {
    const entry = entries.get(cacheKey(target, user));
    return entry ? cloneEntry(entry) : null;
  },

  put(entry: WorkspaceReadCacheEntry): void {
    putEntry(entry);
  },
''')

# Module revisit restores cached target before paint and revalidates in background.
path = 'src/components/urban-castle/WorkspaceScopedReadBoundary.tsx'
replace_once(path, 'import { restoreWorkspaceOutboxOverlay } from "@/lib/uploads/workspace-outbox";', 'import { restoreWorkspaceOutboxOverlay, workspaceOutboxStore } from "@/lib/uploads/workspace-outbox";')
replace_once(path, '''  const targetKey = workspaceReadTargetKey(requestedTarget);
  const needsExpansion = Boolean(authUser) && !workspaceReadCoverageIsCompatible(readState, requestedTarget);
  const loadState = workspaceReadLoadStateForTarget(readState, requestedTarget);
''', '''  const targetKey = workspaceReadTargetKey(requestedTarget);
  const currentCoverageCompatible = workspaceReadCoverageIsCompatible(readState, requestedTarget);
  const cachedTarget = React.useMemo(
    () => authUser ? workspaceReadCache.peek(requestedTarget, authUser) : null,
    [authUser, requestedTarget, targetKey],
  );
  const cachedCoverageAvailable = Boolean(
    cachedTarget && workspaceReadCoverageIsCompatible(cachedTarget.readState, requestedTarget),
  );
  const needsExpansion = Boolean(authUser)
    && !currentCoverageCompatible
    && !cachedCoverageAvailable;
  const loadState = workspaceReadLoadStateForTarget(readState, requestedTarget);
''')
replace_once(path, '''  React.useLayoutEffect(() => {
    latestTargetKeyRef.current = targetKey;
  }, [targetKey]);

  React.useEffect(() => {
''', '''  React.useLayoutEffect(() => {
    latestTargetKeyRef.current = targetKey;
  }, [targetKey]);

  React.useLayoutEffect(() => {
    if (!authUser || currentCoverageCompatible || !cachedTarget || !cachedCoverageAvailable) return;

    if (workspaceOutboxStore.getSnapshot().items.length === 0) {
      useRDashStore.getState().hydrateSecureWorkspace({
        db: cachedTarget.data,
        revision: cachedTarget.revision,
        user: authUser,
        rowVersions: cachedTarget.rowVersions,
      });
    }
    workspaceReadState.restoreCached(requestedTarget, cachedTarget.readState);
  }, [
    authUser,
    cachedCoverageAvailable,
    cachedTarget,
    currentCoverageCompatible,
    requestedTarget,
    targetKey,
  ]);

  React.useEffect(() => {
''')

# Regression tests for merge semantics and revised bootstrap/navigation contract.
write('tests/workspace-session-merge.test.ts', '''import { describe, expect, test } from "vitest";
import {
  createEmptyWorkspaceDatabase,
  mergeWorkspaceSnapshot,
  normalizeWorkspaceSession,
  WORKSPACE_SESSION_FOUNDATION_COLLECTIONS,
} from "@/lib/rdash/workspace-session-merge";
import type { RDashDatabase } from "@/lib/rdash/types";

function scoped(collections: string[], patch: (db: RDashDatabase) => void, options?: { strategy?: "module" | "scope" | "row"; pageOnly?: boolean }): RDashDatabase {
  const db = createEmptyWorkspaceDatabase();
  patch(db);
  const metadata = db as unknown as Record<string, unknown>;
  metadata._workspace_read_scope = options?.strategy === "row" ? "customer" : "workdesk";
  metadata._workspace_read_mode = options?.strategy === "row" ? "customer-row" : "workdesk";
  metadata._workspace_read_strategy = options?.strategy || "module";
  metadata._workspace_read_collections = collections;
  metadata._workspace_foundation_embedded = false;
  if (options?.pageOnly) metadata._workspace_page_only = true;
  return db;
}

describe("workspace session merge", () => {
  test("starts empty instead of booting demo Customer data", () => {
    const db = createEmptyWorkspaceDatabase();
    expect(db.customers).toEqual([]);
    expect(db.sites).toEqual([]);
    expect(db.tasks).toEqual([]);
  });

  test("keeps bootstrap Master foundation resident across module switches", () => {
    const current = createEmptyWorkspaceDatabase();
    current.master.units = [{ id: "pcs", name: "Pieces", symbol: "pcs", family: "count" }];
    const meta = current as unknown as Record<string, unknown>;
    meta._workspace_foundation_embedded = true;
    meta._workspace_read_collections = [...WORKSPACE_SESSION_FOUNDATION_COLLECTIONS];
    const incoming = scoped(["tasks"], (db) => { db.tasks = [{ id: "t1", title: "Task", status: "pending", priority: "normal", created_at: "", updated_at: "" }] as RDashDatabase["tasks"]; });
    const merged = mergeWorkspaceSnapshot(current, incoming);
    expect(merged.master.units.map((row) => row.id)).toEqual(["pcs"]);
    expect(merged.tasks.map((row) => row.id)).toEqual(["t1"]);
  });

  test("complete module collections replace old rows", () => {
    const current = createEmptyWorkspaceDatabase();
    current.tasks = [{ id: "old", title: "Old", status: "pending", priority: "normal", created_at: "", updated_at: "" }] as RDashDatabase["tasks"];
    const incoming = scoped(["tasks"], (db) => { db.tasks = [{ id: "new", title: "New", status: "pending", priority: "normal", created_at: "", updated_at: "" }] as RDashDatabase["tasks"]; });
    expect(mergeWorkspaceSnapshot(current, incoming).tasks.map((row) => row.id)).toEqual(["new"]);
  });

  test("row graphs and page-only payloads merge", () => {
    const current = createEmptyWorkspaceDatabase();
    current.customers = [{ id: "c1", name: "One", status: "active", customer_segments: [], created_at: "", updated_at: "" }, { id: "c2", name: "Two", status: "active", customer_segments: [], created_at: "", updated_at: "" }] as RDashDatabase["customers"];
    const row = scoped(["customers"], (db) => { db.customers = [{ id: "c1", name: "Updated", status: "active", customer_segments: [], created_at: "", updated_at: "" }] as RDashDatabase["customers"]; }, { strategy: "row" });
    const rowMerged = mergeWorkspaceSnapshot(current, row);
    expect(rowMerged.customers.map((customer) => customer.id).sort()).toEqual(["c1", "c2"]);
    const page = scoped(["customers"], (db) => { db.customers = [{ id: "c3", name: "Three", status: "active", customer_segments: [], created_at: "", updated_at: "" }] as RDashDatabase["customers"]; }, { pageOnly: true });
    expect(mergeWorkspaceSnapshot(rowMerged, page).customers.map((customer) => customer.id).sort()).toEqual(["c1", "c2", "c3"]);
  });

  test("normalization does not synthesize threads or follow-ups", () => {
    const db = createEmptyWorkspaceDatabase();
    const first = normalizeWorkspaceSession(db);
    const second = normalizeWorkspaceSession(first);
    expect(first.threads).toEqual([]);
    expect(first.followups).toEqual([]);
    expect(second).toEqual(first);
  });
});
''')

path = 'tests/workspace-bootstrap-scoped-flow.test.ts'
sub_once(path, r'''  test\("keeps foundational taxonomy loaded in every scoped snapshot", async \(\) => \{[\s\S]*?  \}\);\n\n  test\("starts with the minimal bootstrap and never hydrates the full workspace", async \(\) => \{[\s\S]*?  \}\);''', '''  test("loads the reusable Master foundation once in bootstrap", async () => {
    const projectedBootstrap = await testFile("src/lib/rdash/server/projected-workspace-bootstrap.ts").text();
    const moduleReader = await testFile("src/lib/rdash/server/module-scoped-read.ts").text();
    for (const collection of ["master.units", "master.workCategories", "master.workSubcategories", "master.articles", "master.articleVariants", "master.subcategoryArticleMap", "master.workOptionGroups", "master.workOptionValues"]) {
      expect(projectedBootstrap).toContain(`"${collection}"`);
    }
    expect(projectedBootstrap).toContain("fullCollections: [...WORKSPACE_FOUNDATION_COLLECTIONS]");
    expect(projectedBootstrap).not.toContain("bounded compatibility read");
    expect(moduleReader).toContain("!FOUNDATION_COLLECTIONS.has(collection)");
  });

  test("hydrates the foundation bootstrap without loading operational workspace tables", async () => {
    const app = await testFile("src/components/rdash/RDashApp.tsx").text();
    const bootstrap = await testFile("src/app/api/bootstrap/route.ts").text();
    expect(app).toContain('fetch("/api/bootstrap"');
    expect(app).not.toContain('fetch("/api/workspace"');
    expect(app).toContain("hydrateSecureWorkspace({");
    expect(bootstrap).toContain("getProjectedWorkspaceBootstrap(user.staffId)");
    expect(bootstrap).toContain("data: workspace.data");
    expect(bootstrap).toContain('readStrategy: "foundation-first"');
  });''', re.S)

path = 'tests/workspace-navigation-revalidation.test.ts'
replace_once(path, '    expect(source).toContain("workspaceReadCache.get(requestedTarget, authUser)");', '    expect(source).toContain("workspaceReadCache.peek(requestedTarget, authUser)");\n    expect(source).toContain("workspaceReadCache.get(requestedTarget, authUser)");')
replace_once(path, '    expect(source).toContain("if (!needsExpansion) {");\n    expect(source).toContain("if (!pageCursors.length && !pageError) return null");', '    expect(source).toContain("if (!needsExpansion) {");\n    expect(source).toContain("workspaceReadState.restoreCached(requestedTarget, cachedTarget.readState)");\n    expect(source).toContain("if (!pageCursors.length && !pageError) return null");')

path = 'tests/runtime-efficiency-hardening.test.ts'
text = read(path)
idx = text.rfind('\n});\n')
if idx < 0:
    raise SystemExit('runtime efficiency describe end not found')
addition = '''\n  test("uses one foundation-first client hydration lifecycle", async () => {\n    const store = await read("src/lib/rdash/raw-store.ts");\n    const bootstrap = await read("src/app/api/bootstrap/route.ts");\n    const projected = await read("src/lib/rdash/server/projected-workspace-bootstrap.ts");\n    expect(store).not.toContain('import { buildSeedDatabase } from "./seed"');\n    expect(store).not.toContain("prepareWorkspaceDatabase(");\n    expect(store).not.toContain('selectedCustomerId: "cust-das"');\n    expect(store).toContain("db: createEmptyWorkspaceDatabase()");\n    expect(store).toContain("mergeWorkspaceSnapshot(current.db, db)");\n    expect(bootstrap).toContain("getProjectedWorkspaceBootstrap(user.staffId)");\n    expect(projected).toContain("getProjectedWorkspacePermissions");\n    expect(projected).not.toContain("compatibility read");\n  });\n'''
write(path, text[:idx] + addition + text[idx:])

print('session refactor patched')
