import { getSupabaseAdminClient } from "../../supabase/server";
import type { RDashDatabase } from "../types";
import { COLLECTION_TO_TABLE } from "./commit-rest";
import type { WorkspaceSubset } from "./workspace";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";
const SAFE_JSON_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type EntityScopedReadPlan = {
  fullCollections?: string[];
  rowsByCollection?: Record<string, string[]>;
  jsonFieldValuesByCollection?: Record<string, Record<string, string[]>>;
};

type RestEntityRow = {
  id: string;
  revision?: number;
  data: unknown;
};

type CollectionQuery = {
  collection: string;
  full: boolean;
  ids: string[];
  jsonFields: Record<string, string[]>;
};

function normalizeValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 500);
}

function tableFor(collection: string): string {
  const table = COLLECTION_TO_TABLE[collection];
  if (!table) throw new Error(`INVALID:Unknown workspace collection ${collection}.`);
  return table;
}

function emptyWorkspaceData(): RDashDatabase {
  const data: Record<string, unknown> = { master: {} };
  const master = data.master as Record<string, unknown>;
  for (const collection of Object.keys(COLLECTION_TO_TABLE)) {
    if (collection.startsWith("master.")) {
      master[collection.slice("master.".length)] = [];
    } else {
      data[collection] = [];
    }
  }
  data._workspace_mode = "rest";
  data._data_source = "supabase-rest";
  return data as unknown as RDashDatabase;
}

function decodeRow(row: RestEntityRow): Record<string, unknown> | null {
  try {
    const value = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function readRevision(): Promise<{ revision: number; updatedAt: string }> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("entity_workspace_revision")
    .select("revision,updated_at")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Could not read workspace revision: ${error.message}`);
  return {
    revision: typeof data?.revision === "number" ? data.revision : 0,
    updatedAt: String(data?.updated_at || new Date().toISOString()),
  };
}

function collectionQueries(plan: EntityScopedReadPlan): CollectionQuery[] {
  const queries = new Map<string, CollectionQuery>();
  const ensure = (collection: string) => {
    const normalized = String(collection || "").trim();
    if (!normalized) throw new Error("INVALID:Workspace collection is required.");
    const current = queries.get(normalized) || {
      collection: normalized,
      full: false,
      ids: [],
      jsonFields: {},
    };
    queries.set(normalized, current);
    return current;
  };

  for (const collection of plan.fullCollections || []) ensure(collection).full = true;
  for (const [collection, rawValues] of Object.entries(plan.rowsByCollection || {})) {
    const query = ensure(collection);
    query.ids = normalizeValues(rawValues);
  }
  for (const [collection, rawFields] of Object.entries(plan.jsonFieldValuesByCollection || {})) {
    const query = ensure(collection);
    for (const [field, rawValues] of Object.entries(rawFields || {})) {
      if (!SAFE_JSON_FIELD.test(field)) throw new Error(`INVALID:Unsafe JSON relationship field ${field}.`);
      const values = normalizeValues(rawValues);
      if (values.length) query.jsonFields[field] = values;
    }
  }

  return [...queries.values()].filter((query) =>
    query.full || query.ids.length > 0 || Object.keys(query.jsonFields).length > 0
  );
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function inExpression(column: string, values: string[]): string {
  return `${column}.in.(${values.map(quotePostgrestValue).join(",")})`;
}

/**
 * Reads entity rows by primary ID or top-level JSONB relationship fields.
 * All selectors for one table are combined into a single PostgREST OR filter,
 * so adding dependency fields does not multiply requests to the same collection.
 */
export async function getRestWorkspaceBySelectors(plan: EntityScopedReadPlan): Promise<WorkspaceSubset> {
  const admin = getSupabaseAdminClient();
  const revisionState = await readRevision();
  const queries = collectionQueries(plan);

  const results = await Promise.all(queries.map(async (spec) => {
    const table = tableFor(spec.collection);
    let query = admin
      .from(table)
      .select("id,revision,data")
      .eq("workspace_id", workspaceId);

    if (!spec.full) {
      const filters: string[] = [];
      if (spec.ids.length) filters.push(inExpression("id", spec.ids));
      for (const [field, values] of Object.entries(spec.jsonFields)) {
        filters.push(inExpression(`data->>${field}`, values));
      }
      query = query.or(filters.join(","));
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Could not read entity-scoped collection ${spec.collection}: ${error.message}`);
    }
    return { collection: spec.collection, rows: (data || []) as RestEntityRow[] };
  }));

  const data = emptyWorkspaceData();
  const rowVersions: Record<string, number> = {};
  for (const result of results) {
    const decoded = result.rows.map((row) => {
      if (typeof row.revision === "number") {
        rowVersions[row.id] = row.revision;
        rowVersions[`${result.collection}:${row.id}`] = row.revision;
      }
      return decodeRow(row);
    }).filter(Boolean) as Array<Record<string, unknown>>;

    if (result.collection.startsWith("master.")) {
      const key = result.collection.slice("master.".length);
      (data.master as unknown as Record<string, unknown>)[key] = decoded;
    } else {
      (data as unknown as Record<string, unknown>)[result.collection] = decoded;
    }
  }

  return {
    revision: revisionState.revision,
    updatedAt: revisionState.updatedAt,
    data,
    rowVersions,
    queryCount: 1 + queries.length,
  };
}
