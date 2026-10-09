import type { RDashDatabase } from "../types";
import { buildSeedDatabase } from "../seed";
import {
  assertStaffOperationAllowed,
  canRole,
  moduleForCollection,
  normalizeStaffPermissions,
  normalizeRoleKey,
  type StaffPermissionRecord,
} from "../staff-operations";
import type { WorkspaceOperation } from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import { rowId, rowsFor } from "./rows";
import { requiredApprovalPolicy } from "../approval-policy";

type MutationAction = "create" | "update" | "approve";

function approvalDecision(
  collection: string,
  row: Record<string, unknown>,
  existing: Record<string, unknown>,
  current: RDashDatabase,
): boolean {
  const beforeStatus = String(existing.status || "");
  const afterStatus = String(row.status ?? existing.status ?? "");
  if (collection === "actions") {
    return beforeStatus === "pending" && ["approved", "rejected"].includes(afterStatus);
  }
  if (collection === "salaryAdjustments" || collection === "leaveRequests") {
    return ["draft", "requested"].includes(beforeStatus)
      && ["approved", "rejected"].includes(afterStatus);
  }
  if (["contractorPayments", "drawings", "boqs"].includes(collection)) {
    return beforeStatus !== "approved" && afterStatus === "approved";
  }
  if (collection === "purchaseOrders") {
    const approvedStatuses = ["approved", "sent", "partially_received", "received"];
    const crossesApprovalBoundary = !approvedStatuses.includes(beforeStatus)
      && approvedStatuses.includes(afterStatus);
    return crossesApprovalBoundary && Boolean(requiredApprovalPolicy(
      current.approvalPolicies,
      "po_amount",
      Number(row.total_amount ?? existing.total_amount) || 0,
    ));
  }
  if (collection === "vendorBills") {
    return (!existing.approved_at && Boolean(row.approved_at))
      || (beforeStatus === "pending_approval" && afterStatus !== "pending_approval");
  }
  if (collection === "quotations") {
    const beforeDiscount = Number(existing.discount_pct) || 0;
    const afterDiscount = Number(row.discount_pct ?? existing.discount_pct) || 0;
    const afterPendingApproval = row.pending_approval ?? existing.pending_approval;
    if (existing.pending_approval === true && afterPendingApproval === false) {
      return Boolean(requiredApprovalPolicy(
        current.approvalPolicies,
        "quotation_discount",
        afterDiscount,
      ));
    }
    return afterDiscount !== beforeDiscount
      && afterPendingApproval !== true
      && Boolean(requiredApprovalPolicy(
        current.approvalPolicies,
        "quotation_discount",
        afterDiscount,
      ));
  }
  return false;
}

function approvalStateOnCreate(
  collection: string,
  row: Record<string, unknown>,
  current: RDashDatabase,
): boolean {
  const status = String(row.status || "");
  if (collection === "actions") return ["approved", "rejected"].includes(status);
  if (collection === "salaryAdjustments" || collection === "leaveRequests") {
    return ["approved", "rejected"].includes(status);
  }
  if (["contractorPayments", "drawings", "boqs"].includes(collection)) {
    return status === "approved";
  }
  if (collection === "purchaseOrders") {
    return ["approved", "sent", "partially_received", "received"].includes(status)
      && Boolean(requiredApprovalPolicy(
        current.approvalPolicies,
        "po_amount",
        Number(row.total_amount) || 0,
      ));
  }
  if (collection === "vendorBills") {
    return Boolean(row.approved_at) || ["approved", "partly_paid", "paid"].includes(status);
  }
  if (collection === "payrollPeriods") return ["approved", "paid"].includes(status);
  if (collection === "payrollLines") return ["approved", "paid"].includes(String(row.payment_status || ""));
  if (collection === "quotations") {
    return row.pending_approval !== true
      && Boolean(requiredApprovalPolicy(
        current.approvalPolicies,
        "quotation_discount",
        Number(row.discount_pct) || 0,
      ));
  }
  return false;
}

function mutationAction(
  collection: string,
  row: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  current: RDashDatabase,
): MutationAction {
  if (!existing) return "create";
  if (collection === "payrollPeriods") {
    const before = String(existing.status || "");
    const after = String(row.status ?? existing.status ?? "");
    if (before === "generated" && after === "approved") return "approve";
    if (["approved", "paid"].includes(before) && after === "generated") {
      throw new Error("FORBIDDEN:Only the Owner can reopen payroll.");
    }
    if (before !== after && !(before === "approved" && after === "paid")) {
      throw new Error("FORBIDDEN:Invalid payroll status transition.");
    }
  }
  if (collection === "payrollLines") {
    const before = String(existing.payment_status || "");
    const after = String(row.payment_status ?? existing.payment_status ?? "");
    if (before === "pending" && after === "approved") return "approve";
    if (["approved", "paid"].includes(before) && after === "pending") {
      throw new Error("FORBIDDEN:Only the Owner can reopen payroll.");
    }
    if (before !== after && !(before === "approved" && after === "paid")) {
      throw new Error("FORBIDDEN:Invalid payroll line status transition.");
    }
  }
  if (approvalDecision(collection, row, existing, current)) return "approve";
  return "update";
}

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
      || parent.assigned_staff_id
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

function auditSideEffectIsAuthorized(
  row: Record<string, unknown>,
  user: AuthenticatedUser,
  authorizedEntityIds: Set<string>,
) {
  return Boolean(
    rowId(row)
      && String(row.actor || "") === user.name
      && String(row.actor_role || "") === user.role
      && authorizedEntityIds.has(String(row.entity_id || "")),
  );
}

function threadSideEffectIsAuthorized(
  row: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  authorizedAuditIds: Set<string>,
) {
  const messages = Array.isArray(row.messages) ? row.messages as Array<Record<string, unknown>> : [];
  const existingMessages = Array.isArray(existing?.messages)
    ? existing.messages as Array<Record<string, unknown>>
    : [];
  const existingById = new Map(existingMessages.map((message) => [rowId(message), message]));

  if (existing) {
    const unchangedExistingMessages = existingMessages.every((message) => {
      const candidate = messages.find((entry) => rowId(entry) === rowId(message));
      return candidate && JSON.stringify(candidate) === JSON.stringify(message);
    });
    if (!unchangedExistingMessages) return false;

    const existingShell = { ...existing, messages: undefined, updated_at: undefined };
    const candidateShell = { ...row, messages: undefined, updated_at: undefined };
    if (JSON.stringify(candidateShell) !== JSON.stringify(existingShell)) return false;
  }

  const added = messages.filter((message) => !existingById.has(rowId(message)));
  if (!added.some((message) => authorizedAuditIds.has(String(message.related_audit_id || "")))) return false;

  return added.every((message) => {
    const auditId = String(message.related_audit_id || "");
    if (auditId) return authorizedAuditIds.has(auditId);
    return !existing
      && message.author_name === "System"
      && message.kind === "system"
      && String(message.body || "").startsWith("Thread opened for ");
  });
}

export function assertWorkspaceMutationAllowed(
  user: AuthenticatedUser,
  operations: WorkspaceOperation[],
  current?: RDashDatabase,
) {
  if (user.role === "Owner") return;

  const database = current || buildSeedDatabase();
  const permissions = normalizeStaffPermissions(
    (database as unknown as { staffRolePermissions?: StaffPermissionRecord[] }).staffRolePermissions,
  );
  const roleKey = normalizeRoleKey(user.role);
  const isFieldStaff = roleKey === "FIELD_STAFF";
  const authorizedUpserts = new Set<string>();
  const authorizedEntityIds = new Set<string>();

  for (const operation of operations.filter((entry) => !["threads", "auditLog"].includes(entry.collection))) {
    const existingRows = rowsFor(current, operation.collection);
    const existingById = new Map(existingRows.map((row) => [rowId(row), row]));

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
      const existing = existingById.get(rowId(row));
      const action = mutationAction(operation.collection, row, existing, database);

      if (isFieldStaff && operation.collection === "executionLogs") {
        assertFieldExecutionLog(row, user.staffId);
        authorizedUpserts.add(parentReference(operation.collection, rowId(row)));
        authorizedEntityIds.add(rowId(row));
        continue;
      }

      const moduleKey = moduleForCollection(operation.collection);
      if (!canRole(permissions, user.role, moduleKey, action)) {
        throw new Error(`FORBIDDEN:${operation.collection}`);
      }
      if (!existing
        && approvalStateOnCreate(operation.collection, row, database)
        && !canRole(permissions, user.role, moduleKey, "approve")) {
        throw new Error(`FORBIDDEN:${operation.collection}`);
      }

      if (["visits", "attendance", "staffLocationPings", "tasks"].includes(operation.collection)) {
        assertStaffOperationAllowed(
          database,
          permissions,
          user.role,
          user.staffId,
          operation.collection,
          row,
        );
      }

      authorizedUpserts.add(parentReference(operation.collection, rowId(row)));
      authorizedEntityIds.add(rowId(row));
    }
  }

  const authorizedAuditIds = new Set<string>();
  for (const operation of operations.filter((entry) => entry.collection === "auditLog")) {
    if (operation.deleteIds?.length) throw new Error("FORBIDDEN:auditLog");
    const existingIds = new Set(rowsFor(current, operation.collection).map(rowId));
    for (const row of operation.upsert || []) {
      if (existingIds.has(rowId(row)) || !auditSideEffectIsAuthorized(row, user, authorizedEntityIds)) {
        throw new Error("FORBIDDEN:auditLog");
      }
      authorizedAuditIds.add(rowId(row));
    }
  }

  for (const operation of operations.filter((entry) => entry.collection === "threads")) {
    if (operation.deleteIds?.length) {
      throw new Error("FORBIDDEN:threads");
    }

    const existingRows = rowsFor(current, operation.collection);
    const existingIds = new Set(existingRows.map(rowId));
    for (const row of operation.upsert || []) {
      const existing = existingRows.find((candidate) => rowId(candidate) === rowId(row));
      if (threadSideEffectIsAuthorized(row, existing, authorizedAuditIds)) continue;

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
