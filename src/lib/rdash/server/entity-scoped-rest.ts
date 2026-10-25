import { getSupabaseAdminClient } from "../../supabase/server";
import { COLLECTION_TO_TABLE, emptyWorkspaceData, putCollectionRows, readRevision, type RestEntityRow } from "./commit-rest";
import type { WorkspaceSubset } from "./workspace";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";
const SAFE_JSON_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

const CUSTOMER_GRAPH_COLLECTIONS = new Set([
  "sites", "workRequired", "quotations", "acceptedScopes", "workOrders", "visits",
  "tasks", "followups", "actions", "risks", "blocked", "payments", "invoices",
  "customerReceipts", "contractorBills", "commissions", "variationRequests", "commSends",
  "entityReferenceAssignments",
]);

const SITE_GRAPH_COLLECTIONS = new Set([
  "areas", "workRequired", "quotations", "acceptedScopes", "workOrders", "visits",
  "tasks", "followups", "actions", "risks", "blocked", "payments", "invoices",
  "customerReceipts", "contractorBills", "commissions", "variationRequests", "commSends",
  "entityReferenceAssignments",
]);

export type EntityScopedReadPlan = {
  fullCollections?: string[];
  rowsByCollection?: Record<string, string[]>;
  jsonFieldValuesByCollection?: Record<string, Record<string, string[]>>;
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

function selectorColumn(collection: string, field: string): { column: string; json: boolean } {
  if (field === "id") return { column: "id", json: false };
  if (field === "customer_id" && CUSTOMER_GRAPH_COLLECTIONS.has(collection)) {
    return { column: "customer_id_gen", json: false };
  }
  if (field === "site_id" && SITE_GRAPH_COLLECTIONS.has(collection)) {
    return { column: "site_id_gen", json: false };
  }
  return { column: `data->>${field}`, json: true };
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
 * Reads entity rows by primary ID or indexed relationship columns. Relationship
 * selectors fall back to JSONB only for fields that do not have a canonical
 * generated column yet. All selectors for one table are still combined into
 * one PostgREST OR filter, so dependency expansion does not multiply requests.
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
        const selector = selectorColumn(spec.collection, field);
        filters.push(inExpression(selector.column, values));
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
    putCollectionRows(data, rowVersions, result.collection, result.rows);
  }

  return {
    revision: revisionState.revision,
    updatedAt: revisionState.updatedAt,
    data,
    rowVersions,
    queryCount: 1 + queries.length,
  };
}
