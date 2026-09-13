import { assertCustomerExists } from "../business-rules";
import { assertCustomerRecord } from "../customer-domain-rules";
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
import { rowsFor, rowId } from "./rows";

const SIMPLE_TARGETED_COLLECTIONS = new Set(["customers", "sites", "attendance"]);
const MAX_SIMPLE_TARGETED_ROWS = 50;

interface SimpleTargetedPreparation {
  current: WorkspaceSubset;
  operations: WorkspaceOperation[];
  loadMs: number;
  authorizeAndValidateMs: number;
  queryCount: number;
}
function addId(target: Record<string, Set<string>>, collection: string, value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return;
  (target[collection] ||= new Set()).add(id);
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

function addCustomerReferrerDependency(rows: Record<string, Set<string>>, row: Record<string, unknown>) {
  const referrerType = String(row.referrer_type || "");
  const referrerId = row.referrer_id;
  if (referrerType === "customer") addId(rows, "customers", referrerId);
  else if (referrerType === "contractor") addId(rows, "master.contractors", referrerId);
  else if (referrerType === "vendor") addId(rows, "master.vendors", referrerId);
  else if (referrerType === "source_partner") addId(rows, "master.sourcePartners", referrerId);
}

function buildReadPlan(user: AuthenticatedUser, operations: WorkspaceOperation[]): WorkspaceReadPlan {
  const rows: Record<string, Set<string>> = {};
  const fullCollections = new Set<string>();

  if (user.role !== "Owner") fullCollections.add("staffRolePermissions");
  if (user.staffId) addId(rows, "master.staff", user.staffId);

  for (const operation of operations) {
    if (operation.collection === "customers") {
      // Contact identity uniqueness is workspace-wide.
      fullCollections.add("customers");
    }

    for (const row of operation.upsert || []) {
      addId(rows, operation.collection, row.id);
      if (operation.collection === "customers") {
        addCustomerReferrerDependency(rows, row);
      } else if (operation.collection === "sites") {
        addId(rows, "customers", row.customer_id);
      } else if (operation.collection === "attendance") {
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
          assertCustomerRecord(database, customer);
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
