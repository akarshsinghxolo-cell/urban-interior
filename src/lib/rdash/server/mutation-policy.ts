import type { Master, RDashDatabase } from "../types";
import { buildSeedDatabase } from "../seed";
import {
  assertStaffOperationAllowed,
  canRole,
  createDefaultStaffPermissions,
  moduleForCollection,
  normalizeRoleKey,
  type StaffPermissionRecord,
} from "../staff-operations";
import type { WorkspaceOperation } from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";

const threadParentCollection: Record<string, string> = {
  quotation: "quotations",
  workOrder: "workOrders",
  task: "tasks",
  followup: "followups",
  visit: "visits",
  payment: "payments",
  invoice: "invoices",
  vendor_bill: "vendorBills",
  inventory: "inventory",
  po: "purchaseOrders",
  grn: "grns",
  dispatch: "dispatches",
  blocked: "blocked",
  approval: "actions",
  commission: "commissions",
  bid: "contractorBids",
  settlement: "contractorSettlements",
  site: "sites",
  drawing: "drawings",
  execution_log: "executionLogs",
  workRequired: "workRequired",
};

function rowsFor(database: RDashDatabase | undefined, collection: string): Array<Record<string, unknown>> {
  if (!database) return [];
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length) as keyof Master;
    const value = database.master?.[key];
    return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  }
  const value = (database as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function rowId(row: Record<string, unknown>) {
  return String(row.id || "");
}

function parentReference(collection: string, id: string) {
  return `${collection}:${id}`;
}

function linkedThreadIsAuthorized(
  row: Record<string, unknown>,
  authorizedUpserts: Set<string>,
  current: RDashDatabase | undefined,
  staffId: string | undefined,
) {
  const kind = String(row.kind || row.record_type || "");
  const recordId = String(row.record_id || "");
  const collection = threadParentCollection[kind];
  if (!collection || !recordId) return false;
  if (authorizedUpserts.has(parentReference(collection, recordId))) return true;

  const parent = rowsFor(current, collection).find((candidate) => rowId(candidate) === recordId);
  if (!parent || !staffId) return false;
  const ownerId = String(
    parent.staff_id
      || parent.assigned_to_staff_id
      || parent.assignee_id
      || parent.filed_by_staff_id
      || parent.received_by_staff_id
      || "",
  );
  return Boolean(ownerId) && ownerId === staffId;
}

function assertFieldExecutionLog(row: Record<string, unknown>, staffId: string | undefined) {
  if (!staffId || String(row.filed_by_staff_id || "") !== staffId) {
    throw new Error("FORBIDDEN:Field Staff can create execution logs filed under their staff identity only.");
  }
}

export function assertWorkspaceMutationAllowed(
  user: AuthenticatedUser,
  operations: WorkspaceOperation[],
  current?: RDashDatabase,
) {
  if (user.role === "Owner") return;

  const permissions = (
    (current as unknown as { staffRolePermissions?: StaffPermissionRecord[] })?.staffRolePermissions
    || createDefaultStaffPermissions()
  );
  const roleKey = normalizeRoleKey(user.role);
  const isFieldStaff = roleKey === "FIELD_STAFF";
  const authorizedUpserts = new Set<string>();

  for (const operation of operations.filter((entry) => entry.collection !== "threads")) {
    const existingIds = new Set(rowsFor(current, operation.collection).map(rowId));

    if (operation.deleteIds?.length) {
      if (isFieldStaff && operation.collection === "executionLogs") {
        throw new Error("FORBIDDEN:Field Staff cannot delete execution logs.");
      }
      const moduleKey = moduleForCollection(operation.collection);
      if (!canRole(permissions, user.role, moduleKey, "delete")) {
        throw new Error(`FORBIDDEN:${operation.collection}`);
      }
    }

    for (const row of operation.upsert || []) {
      const action = existingIds.has(rowId(row)) ? "update" : "create";

      if (isFieldStaff && operation.collection === "executionLogs") {
        assertFieldExecutionLog(row, user.staffId);
        authorizedUpserts.add(parentReference(operation.collection, rowId(row)));
        continue;
      }

      const moduleKey = moduleForCollection(operation.collection);
      if (!canRole(permissions, user.role, moduleKey, action)) {
        throw new Error(`FORBIDDEN:${operation.collection}`);
      }

      if (["visits", "attendance", "staffLocationPings", "tasks"].includes(operation.collection)) {
        assertStaffOperationAllowed(
          current || buildSeedDatabase(),
          permissions,
          user.role,
          user.staffId,
          operation.collection,
          row,
        );
      }

      authorizedUpserts.add(parentReference(operation.collection, rowId(row)));
    }
  }

  for (const operation of operations.filter((entry) => entry.collection === "threads")) {
    if (operation.deleteIds?.length) {
      throw new Error("FORBIDDEN:threads");
    }

    const existingIds = new Set(rowsFor(current, operation.collection).map(rowId));
    for (const row of operation.upsert || []) {
      const action = existingIds.has(rowId(row)) ? "update" : "create";
      if (isFieldStaff) {
        if (!linkedThreadIsAuthorized(row, authorizedUpserts, current, user.staffId)) {
          throw new Error("FORBIDDEN:Field Staff can create threads only as part of their authorized operational record.");
        }
        continue;
      }

      const moduleKey = moduleForCollection(operation.collection);
      if (!canRole(permissions, user.role, moduleKey, action)) {
        throw new Error(`FORBIDDEN:${operation.collection}`);
      }
    }
  }
}

const volatileKeys = new Set([
  "auditLog",
  "created_at",
  "updated_at",
  "timestamp",
  "captured_at",
  "generated_at",
  "last_run",
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !volatileKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function stableWorkspaceSignature(database: RDashDatabase) {
  return JSON.stringify(stableValue(database));
}

let canonicalSeedSignature: string | undefined;

function seedSignature() {
  canonicalSeedSignature ||= stableWorkspaceSignature(buildSeedDatabase());
  return canonicalSeedSignature;
}

export function assertNotImplicitSeedReset(current: RDashDatabase, candidate: RDashDatabase) {
  const candidateIsCanonicalSeed = stableWorkspaceSignature(candidate) === seedSignature();
  if (!candidateIsCanonicalSeed) return;

  const currentIsCanonicalSeed = stableWorkspaceSignature(current) === seedSignature();
  if (!currentIsCanonicalSeed) {
    throw new Error("RESET_REQUIRES_DEDICATED_ENDPOINT");
  }
}
