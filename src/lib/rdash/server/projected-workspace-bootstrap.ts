import { getSupabaseAdminClient } from "../../supabase/server";
import {
  CURRENT_STAFF_RUNTIME_FIELDS,
  STAFF_DIRECTORY_FIELDS,
} from "../staff-directory";
import type { RDashDatabase } from "../types";
import { COLLECTION_TO_TABLE } from "./commit-rest";
import {
  getWorkspaceSubset,
  type WorkspaceSubset,
} from "./workspace";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

export const WORKSPACE_FOUNDATION_COLLECTIONS = Object.freeze([
  "master.units",
  "master.workCategories",
  "master.workSubcategories",
  "master.articles",
  "master.articleVariants",
  "master.subcategoryArticleMap",
  "master.workOptionGroups",
  "master.workOptionValues",
] as const);

const WORKSPACE_BOOTSTRAP_DATA_COLLECTIONS = Object.freeze([
  "staffRolePermissions",
  "master.staff",
  ...WORKSPACE_FOUNDATION_COLLECTIONS,
] as const);

const PERMISSION_FIELDS = Object.freeze([
  "role_key",
  "module_key",
  "module_label",
  "can_view",
  "can_create",
  "can_update",
  "can_approve",
  "can_delete",
  "updated_at",
] as const);

type ProjectedEnvelope = {
  id: string;
  revision?: number;
} & Record<string, unknown>;

function projectionSelect(fields: readonly string[]): string {
  return [
    "id",
    "revision",
    ...fields.map((field) => `${field}:data->${field}`),
  ].join(",");
}

function decodeProjectedRows(
  rows: ProjectedEnvelope[],
  fields: readonly string[],
  collection: string,
  rowVersions: Record<string, number>,
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const decoded: Record<string, unknown> = { id: row.id };
    for (const field of fields) {
      if (row[field] !== undefined) decoded[field] = row[field];
    }
    if (typeof row.revision === "number") {
      rowVersions[row.id] = row.revision;
      rowVersions[`${collection}:${row.id}`] = row.revision;
    }
    return decoded;
  });
}

async function projectedRows(
  collection: string,
  fields: readonly string[],
  ids?: readonly string[],
): Promise<ProjectedEnvelope[]> {
  const table = COLLECTION_TO_TABLE[collection];
  if (!table) throw new Error(`INVALID:Unknown workspace collection ${collection}.`);

  const admin = getSupabaseAdminClient();
  let query = admin
    .from(table)
    .select(projectionSelect(fields))
    .eq("workspace_id", workspaceId);

  if (ids?.length) query = query.in("id", [...ids]);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Could not read projected ${collection}: ${error.message}`);
  }
  return (data || []) as unknown as ProjectedEnvelope[];
}

function mergeProjectedStaffRows(
  directoryRows: Array<Record<string, unknown>>,
  currentRows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const currentById = new Map(
    currentRows.map((row) => [String(row.id || ""), row]),
  );
  return directoryRows.map((row) => ({
    ...row,
    ...(currentById.get(String(row.id || "")) || {}),
  }));
}

function markBootstrapMetadata(database: RDashDatabase): void {
  const metadata = database as unknown as Record<string, unknown>;
  metadata._workspace_read_scope = "bootstrap";
  metadata._workspace_read_mode = "bootstrap";
  metadata._workspace_read_strategy = "bootstrap";
  metadata._workspace_read_collections = [...WORKSPACE_BOOTSTRAP_DATA_COLLECTIONS];
  metadata._workspace_foundation_embedded = true;
  metadata._workspace_staff_projection = "directory";
}

/**
 * Minimal authorization read for module/entity endpoints. The reusable Master
 * foundation is not retransmitted after /api/bootstrap.
 */
export async function getProjectedWorkspacePermissions(): Promise<WorkspaceSubset> {
  const base = await getWorkspaceSubset({});
  const permissionRows = await projectedRows("staffRolePermissions", PERMISSION_FIELDS);
  const data = structuredClone(base.data) as RDashDatabase;
  const rowVersions = { ...(base.rowVersions || {}) };
  data.staffRolePermissions = decodeProjectedRows(
    permissionRows,
    PERMISSION_FIELDS,
    "staffRolePermissions",
    rowVersions,
  ) as unknown as RDashDatabase["staffRolePermissions"];

  return {
    ...base,
    data,
    rowVersions,
    queryCount: base.queryCount + 1,
  };
}

async function readProjectedWorkspaceBootstrap(
  staffId?: string,
): Promise<WorkspaceSubset> {
  const base = await getWorkspaceSubset({
    fullCollections: [...WORKSPACE_FOUNDATION_COLLECTIONS],
  });

  const [permissionRows, staffDirectoryRows, currentStaffRows] = await Promise.all([
    projectedRows("staffRolePermissions", PERMISSION_FIELDS),
    projectedRows("master.staff", STAFF_DIRECTORY_FIELDS),
    staffId
      ? projectedRows("master.staff", CURRENT_STAFF_RUNTIME_FIELDS, [staffId])
      : Promise.resolve([]),
  ]);

  // Ensure the foundation and projections belong to one revision. Bootstrap is
  // infrequent, so one tiny revision check is cheaper than a mixed client state.
  const revisionCheck = await getWorkspaceSubset({});
  if (revisionCheck.revision !== base.revision) {
    throw new Error("READ_CONFLICT");
  }

  const data = structuredClone(base.data) as RDashDatabase;
  const rowVersions = { ...(base.rowVersions || {}) };
  data.staffRolePermissions = decodeProjectedRows(
    permissionRows,
    PERMISSION_FIELDS,
    "staffRolePermissions",
    rowVersions,
  ) as unknown as RDashDatabase["staffRolePermissions"];

  const directory = decodeProjectedRows(
    staffDirectoryRows,
    STAFF_DIRECTORY_FIELDS,
    "master.staff",
    rowVersions,
  );
  const currentRuntime = decodeProjectedRows(
    currentStaffRows,
    CURRENT_STAFF_RUNTIME_FIELDS,
    "master.staff",
    rowVersions,
  );
  data.master.staff = mergeProjectedStaffRows(
    directory,
    currentRuntime,
  ) as unknown as RDashDatabase["master"]["staff"];

  (data as unknown as Record<string, unknown>)._workspace_bootstrap_projection = {
    staffRolePermissions: [...PERMISSION_FIELDS],
    "master.staff": {
      directory: [...STAFF_DIRECTORY_FIELDS],
      ...(staffId ? { currentStaffRuntime: [...CURRENT_STAFF_RUNTIME_FIELDS] } : {}),
    },
    foundation: [...WORKSPACE_FOUNDATION_COLLECTIONS],
  };
  markBootstrapMetadata(data);

  return {
    ...base,
    data,
    rowVersions,
    queryCount: base.queryCount + 3 + (staffId ? 1 : 0),
  };
}

/** One bootstrap shape only; projection errors fail closed rather than fallback. */
export async function getProjectedWorkspaceBootstrap(
  staffId?: string,
): Promise<WorkspaceSubset> {
  try {
    return await readProjectedWorkspaceBootstrap(staffId);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "READ_CONFLICT") throw error;
    return readProjectedWorkspaceBootstrap(staffId);
  }
}

export const WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS = Object.freeze({
  staffRolePermissions: PERMISSION_FIELDS,
  "master.staff": STAFF_DIRECTORY_FIELDS,
  currentStaffRuntime: CURRENT_STAFF_RUNTIME_FIELDS,
});
