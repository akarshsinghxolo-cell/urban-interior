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

/**
 * Reads the authorization fields required before a module query plus the small
 * work-taxonomy foundation used by global create/edit flows. Every scoped
 * workspace also receives a safe Staff directory for assignee labels/pickers.
 * Only the signed-in Staff row receives its attendance policy because field
 * geofencing needs that policy outside the HR module. Compensation, bank,
 * address, emergency-contact and auth-link fields are not included here.
 */
export async function getProjectedWorkspaceBootstrap(
  staffId?: string,
): Promise<WorkspaceSubset> {
  const base = await getWorkspaceSubset({
    fullCollections: [...WORKSPACE_FOUNDATION_COLLECTIONS],
  });
  if (base.queryCount === 0) return base;

  try {
    const [permissionRows, staffDirectoryRows, currentStaffRows] = await Promise.all([
      projectedRows("staffRolePermissions", PERMISSION_FIELDS),
      projectedRows("master.staff", STAFF_DIRECTORY_FIELDS),
      staffId
        ? projectedRows("master.staff", CURRENT_STAFF_RUNTIME_FIELDS, [staffId])
        : Promise.resolve([]),
    ]);

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

    return {
      ...base,
      data,
      rowVersions,
      queryCount: base.queryCount + 2 + (staffId ? 1 : 0),
    };
  } catch (error) {
    console.warn("[workspace-bootstrap] projected read unavailable; using bounded compatibility read:", error);
    return getWorkspaceSubset({
      fullCollections: [
        "staffRolePermissions",
        ...WORKSPACE_FOUNDATION_COLLECTIONS,
      ],
      rowsByCollection: staffId ? { "master.staff": [staffId] } : undefined,
    });
  }
}

export const WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS = Object.freeze({
  staffRolePermissions: PERMISSION_FIELDS,
  "master.staff": STAFF_DIRECTORY_FIELDS,
  currentStaffRuntime: CURRENT_STAFF_RUNTIME_FIELDS,
});
