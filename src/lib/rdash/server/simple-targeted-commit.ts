import {
  assertCustomerCatalogRelations,
  assertCustomerExists,
} from "../business-rules";
import { assertUniqueCustomerIdentity } from "../customer-identity";
import type { Customer, RDashDatabase } from "../types";
import {
  applyWorkspaceOperations,
  diffWorkspaceOperations,
  type WorkspaceOperation,
} from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import { assertWorkspaceMutationAllowed } from "./mutation-policy";
import {
  getWorkspaceSubset,
  type WorkspaceReadPlan,
  type WorkspaceSubset,
} from "./workspace";

const SIMPLE_TARGETED_COLLECTIONS = new Set(["customers", "sites", "attendance"]);
const MAX_SIMPLE_TARGETED_ROWS = 50;

export interface SimpleTargetedPreparation {
  current: WorkspaceSubset;
  operations: WorkspaceOperation[];
  loadMs: number;
  authorizeAndValidateMs: number;
  queryCount: number;
}

function rowId(row: Record<string, unknown>): string {
  return String(row.id || "").trim();
}

function addId(target: Record<string, Set<string>>, collection: string, value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return;
  (target[collection] ||= new Set()).add(id);
}

function addIds(target: Record<string, Set<string>>, collection: string, values: unknown) {
  if (!Array.isArray(values)) return;
  for (const value of values) addId(target, collection, value);
}

export function canUseSimpleTargetedCommit(operations: WorkspaceOperation[]): boolean {
  if (!operations.length) return false;

  let rowCount = 0;
  let hasBusinessMutation = false;
  for (const operation of operations) {
    if (!SIMPLE_TARGETED_COLLECTIONS.has(operation.collection)) return false;
    if ((operation.deleteIds || []).length) return false;

    const upserts = operation.upsert || [];
    rowCount += upserts.length;
    if (upserts.length) hasBusinessMutation = true;
    for (const row of upserts) {
      if (!rowId(row)) return false;
    }
  }

  return hasBusinessMutation && rowCount > 0 && rowCount <= MAX_SIMPLE_TARGETED_ROWS;
}

function buildReadPlan(user: AuthenticatedUser, operations: WorkspaceOperation[]): WorkspaceReadPlan {
  const rows: Record<string, Set<string>> = {};
  const fullCollections = new Set<string>();

  if (user.role !== "Owner") fullCollections.add("staffRolePermissions");
  if (user.staffId) addId(rows, "master.staff", user.staffId);

  for (const operation of operations) {
    if (operation.collection === "customers") {
      // Identity uniqueness is workspace-wide. Reading the Customer table is
      // still far cheaper than reconstructing unrelated ERP domains.
      fullCollections.add("customers");
    }

    for (const row of operation.upsert || []) {
      addId(rows, operation.collection, row.id);
      if (operation.collection === "customers") {
        addIds(rows, "master.workCategories", row.interest_category_ids);
        addIds(rows, "master.workSubcategories", row.interest_work_subcategory_ids);
      } else if (operation.collection === "sites") {
        addId(rows, "customers", row.customer_id);
      } else if (operation.collection === "attendance") {
        // The mutation policy uses the signed-in Staff row to block inactive
        // field users. Target Staff rows are intentionally not made a stronger
        // requirement than the authoritative domain validator.
        if (user.staffId) addId(rows, "master.staff", user.staffId);
      }
    }
  }

  for (const collection of fullCollections) delete rows[collection];
  return {
    fullCollections: [...fullCollections],
    rowsByCollection: Object.fromEntries(
      Object.entries(rows).map(([collection, ids]) => [collection, [...ids]]),
    ),
  };
}

function rowsFor(database: RDashDatabase, collection: string): Array<Record<string, unknown>> {
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    const value = (database.master as unknown as Record<string, unknown>)[key];
    return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  }
  const value = (database as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function validateCandidate(database: RDashDatabase, operations: WorkspaceOperation[]) {
  try {
    for (const operation of operations) {
      const candidates = rowsFor(database, operation.collection);
      for (const input of operation.upsert || []) {
        const id = rowId(input);
        const row = candidates.find((candidate) => rowId(candidate) === id);
        if (!row) throw new Error(`${operation.collection} "${id}" was not present after applying the operation.`);

        if (operation.collection === "customers") {
          const customer = row as unknown as Customer;
          assertCustomerCatalogRelations(database, customer, "Customer");
          assertUniqueCustomerIdentity(database.customers, customer, { excludeCustomerId: customer.id });
        } else if (operation.collection === "sites") {
          assertCustomerExists(database, String(row.customer_id || ""), "Site");
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Targeted business validation failed.";
    if (message.startsWith("INVALID:")) throw error;
    throw new Error(`INVALID:${message}`);
  }
}

/**
 * Customer, Site and attendance saves are common, small mutations whose server
 * rules can be proven from a narrow dependency set. They use the same subset
 * architecture as every other commit; there is no alternate legacy path.
 */
export async function prepareSimpleTargetedCommit(
  user: AuthenticatedUser,
  expectedRevision: number,
  operations: WorkspaceOperation[],
): Promise<SimpleTargetedPreparation | null> {
  if (!canUseSimpleTargetedCommit(operations)) return null;

  const startedAt = Date.now();
  const current = await getWorkspaceSubset(buildReadPlan(user, operations));
  if (current.revision !== expectedRevision) throw new Error("CONFLICT");
  const loadedAt = Date.now();

  // This may bind a Field Staff record to the session's staff identity, exactly
  // as the authoritative domain commit path does.
  assertWorkspaceMutationAllowed(user, operations, current.data);
  const candidate = applyWorkspaceOperations(current.data, operations);
  const preparedOperations = diffWorkspaceOperations(current.data, candidate);
  validateCandidate(candidate, preparedOperations);
  const validatedAt = Date.now();

  return {
    current,
    operations: preparedOperations,
    loadMs: loadedAt - startedAt,
    authorizeAndValidateMs: validatedAt - loadedAt,
    queryCount: current.queryCount,
  };
}
