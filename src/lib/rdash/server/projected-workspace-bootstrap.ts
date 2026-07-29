import { getSupabaseAdminClient } from "../../supabase/server";
import type { RDashDatabase } from "../types";
import { COLLECTION_TO_TABLE } from "./commit-rest";
import {
  getWorkspaceSubset,
  type WorkspaceSubset,
} from "./workspace";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

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

const STAFF_IDENTITY_FIELDS = Object.freeze([
  "code",
  "name",
  "phone",
  "email",
  "role",
  "status",
  "auth_user_id",
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

/**
 * Reads only the authorization fields required before a module query. The
 * entity tables store records inside a JSONB `data` envelope, so selecting the
 * whole envelope for every role permission wastes Supabase egress. If the
 * development fallback is active, or a projection is unavailable, this safely
 * falls back to the ordinary bounded bootstrap read.
 */
export async function getProjectedWorkspaceBootstrap(
  staffId?: string,
): Promise<WorkspaceSubset> {
  const base = await getWorkspaceSubset({});
  if (base.queryCount === 0) return base;

  try {
    const [permissionRows, staffRows] = await Promise.all([
      projectedRows("staffRolePermissions", PERMISSION_FIELDS),
      staffId
        ? projectedRows("master.staff", STAFF_IDENTITY_FIELDS, [staffId])
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
    data.master.staff = decodeProjectedRows(
      staffRows,
      STAFF_IDENTITY_FIELDS,
      "master.staff",
      rowVersions,
    ) as unknown as RDashDatabase["master"]["staff"];

    (data as unknown as Record<string, unknown>)._workspace_bootstrap_projection = {
      staffRolePermissions: [...PERMISSION_FIELDS],
      ...(staffId ? { "master.staff": [...STAFF_IDENTITY_FIELDS] } : {}),
    };

    return {
      ...base,
      data,
      rowVersions,
      queryCount: base.queryCount + 1 + (staffId ? 1 : 0),
    };
  } catch (error) {
    console.warn("[workspace-bootstrap] projected read unavailable; using bounded compatibility read:", error);
    return getWorkspaceSubset({
      fullCollections: ["staffRolePermissions"],
      rowsByCollection: staffId ? { "master.staff": [staffId] } : undefined,
    });
  }
}

export const WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS = Object.freeze({
  staffRolePermissions: PERMISSION_FIELDS,
  "master.staff": STAFF_IDENTITY_FIELDS,
});
