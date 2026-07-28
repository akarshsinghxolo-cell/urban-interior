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

type QuerySpec =
  | { collection: string; kind: "full" }
  | { collection: string; kind: "ids"; values: string[] }
  | { collection: string; kind: "json-in"; field: string; values: string[] };

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

function querySpecs(plan: EntityScopedReadPlan): QuerySpec[] {
  const full = new Set((plan.fullCollections || []).map((value) => String(value || "").trim()).filter(Boolean));
  const specs: QuerySpec[] = [...full].map((collection) => ({ collection, kind: "full" }));

  for (const [collection, rawValues] of Object.entries(plan.rowsByCollection || {})) {
    if (full.has(collection)) continue;
    const values = normalizeValues(rawValues);
    if (values.length) specs.push({ collection, kind: "ids", values });
  }

  for (const [collection, rawFields] of Object.entries(plan.jsonFieldValuesByCollection || {})) {
    if (full.has(collection)) continue;
    for (const [field, rawValues] of Object.entries(rawFields || {})) {
      if (!SAFE_JSON_FIELD.test(field)) throw new Error(`INVALID:Unsafe JSON relationship field ${field}.`);
      const values = normalizeValues(rawValues);
      if (values.length) specs.push({ collection, kind: "json-in", field, values });
    }
  }

  return specs;
}

/**
 * Reads entity rows by primary ID or by a top-level JSONB relationship field.
 * PostgREST supports JSON paths in filters, so `data->>site_id IN (...)` avoids
 * reconstructing a complete collection merely to select one Customer/Site graph.
 */
export async function getRestWorkspaceBySelectors(plan: EntityScopedReadPlan): Promise<WorkspaceSubset> {
  const admin = getSupabaseAdminClient();
  const revisionState = await readRevision();
  const specs = querySpecs(plan);

  const results = await Promise.all(specs.map(async (spec) => {
    const table = tableFor(spec.collection);
    let query = admin
      .from(table)
      .select("id,revision,data")
      .eq("workspace_id", workspaceId);

    if (spec.kind === "ids") {
      query = query.in("id", spec.values);
    } else if (spec.kind === "json-in") {
      query = query.in(`data->>${spec.field}`, spec.values);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Could not read entity-scoped collection ${spec.collection}: ${error.message}`);
    }
    return { collection: spec.collection, rows: (data || []) as RestEntityRow[] };
  }));

  const mergedByCollection = new Map<string, Map<string, RestEntityRow>>();
  for (const result of results) {
    const rows = mergedByCollection.get(result.collection) || new Map<string, RestEntityRow>();
    for (const row of result.rows) rows.set(row.id, row);
    mergedByCollection.set(result.collection, rows);
  }

  const data = emptyWorkspaceData();
  const rowVersions: Record<string, number> = {};
  for (const [collection, rows] of mergedByCollection) {
    const decoded = [...rows.values()].map((row) => {
      if (typeof row.revision === "number") {
        rowVersions[row.id] = row.revision;
        rowVersions[`${collection}:${row.id}`] = row.revision;
      }
      return decodeRow(row);
    }).filter(Boolean) as Array<Record<string, unknown>>;

    if (collection.startsWith("master.")) {
      const key = collection.slice("master.".length);
      (data.master as unknown as Record<string, unknown>)[key] = decoded;
    } else {
      (data as unknown as Record<string, unknown>)[collection] = decoded;
    }
  }

  return {
    revision: revisionState.revision,
    updatedAt: revisionState.updatedAt,
    data,
    rowVersions,
    queryCount: 1 + specs.length,
  };
}
