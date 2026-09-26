import type { StoreApi, UseBoundStore } from "zustand";
import type { RDashState } from "./store/types";
import {
  canonicalContractorCapabilities,
  contractorDuplicateConflicts,
  contractorProfileValidationError,
  contractorRateProjection,
  normalizeContractorForWrite,
  type ContractorCapability,
  type ContractorProfileRecord,
} from "./contractor-profile";
import { workTypesForSubcategory } from "./work-types";

const installedStores = new WeakSet<object>();
const WRITE_ROLES = new Set(["Owner", "Operations Manager", "OWNER", "OPERATIONS_MANAGER"]);

type TransactionRunner = <T>(name: string, fn: () => T) => T;

function workspaceTransactionRunner(store: RDashStore): TransactionRunner {
  const runner = (store as unknown as { __runInWorkspaceTransaction?: TransactionRunner }).__runInWorkspaceTransaction;
  // Fallback keeps the policy usable in non-browser tests without the store
  // extension; the real store always provides the runner.
  return runner || ((name, fn) => fn());
}

type RDashStore = UseBoundStore<StoreApi<RDashState>>;

function assertContractorPermission(state: RDashState, action: string) {
  const authUser = state.authUser;
  if (!authUser) return;
  if (!WRITE_ROLES.has(authUser.role)) {
    throw new Error(`Permission denied: ${authUser.role} cannot ${action}.`);
  }
}

function hardDuplicateError(
  state: RDashState,
  candidate: ContractorProfileRecord,
  excludeId?: string,
): string | null {
  const conflict = contractorDuplicateConflicts(state.db, candidate, excludeId).find((row) => row.hard);
  if (!conflict) return null;
  return `Possible duplicate contractor: ${conflict.name} has ${conflict.reasons.join(", ")}. Open the existing contractor instead of creating another record.`;
}

function synchronizeRateProjection(store: RDashStore, contractorId: string) {
  const state = store.getState();
  const contractor = state.db.master.contractors.find((row) => row.id === contractorId) as ContractorProfileRecord | undefined;
  if (!contractor) return;
  const projected = contractorRateProjection(state.db, contractor);
  const current = state.db.master.contractorRates || [];
  if (JSON.stringify(projected) === JSON.stringify(current)) return;
  state.mutateMaster((master) => ({ ...master, contractorRates: projected }));
}

function synchronizeWorkTypeCatalog(store: RDashStore, capabilities: ContractorCapability[]) {
  const state = store.getState();
  let changed = false;
  const workSubcategories = state.db.master.workSubcategories.map((subcategory) => {
    const capability = capabilities.find((row) => row.subcategory_id === subcategory.id);
    if (!capability) return subcategory;
    const existing = workTypesForSubcategory(subcategory);
    const byId = new Map(existing.map((row) => [row.id, row]));
    let rowChanged = false;
    for (const rate of capability.work_type_rates || []) {
      if (byId.has(rate.work_type_id)) continue;
      byId.set(rate.work_type_id, {
        id: rate.work_type_id,
        name: rate.work_type_name || "Work type",
        unit_id: rate.unit_id || subcategory.unit_id || "pcs",
        notes: rate.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      changed = true;
      rowChanged = true;
    }
    return rowChanged ? { ...subcategory, work_types: Array.from(byId.values()), updated_at: new Date().toISOString() } : subcategory;
  });
  if (changed) state.mutateMaster((master) => ({ ...master, workSubcategories }));
}

/**
 * Permanent contractor-domain guard installed at the public store boundary.
 * Every normal add/update/rate write goes through the same canonical
 * normalization, duplicate, permission, lifecycle and rate-projection rules.
 */
export function installContractorStorePolicy(store: RDashStore): void {
  if (installedStores.has(store as object)) return;
  installedStores.add(store as object);

  const initial = store.getState();
  const originalAddContractor = initial.addContractor;
  const originalUpdateContractor = initial.updateContractor;
  const inTransaction = workspaceTransactionRunner(store);

  const addContractor: RDashState["addContractor"] = (input) => inTransaction("addContractor", () => {
    const state = store.getState();
    assertContractorPermission(state, "create contractors");
    const normalized = normalizeContractorForWrite(input as ContractorProfileRecord, state.db, {
      id: (input as ContractorProfileRecord).id,
    });
    const validationError = contractorProfileValidationError(normalized, { isCreate: true });
    if (validationError) throw new Error(validationError);
    const duplicateError = hardDuplicateError(state, normalized);
    if (duplicateError) throw new Error(duplicateError);

    synchronizeWorkTypeCatalog(store, normalized.work_capabilities || []);
    const id = originalAddContractor(normalized as never);
    synchronizeRateProjection(store, id);
    return id;
  });

  // One transaction, ONE workspace save: the capability row travels together
  // with its workSubcategories and rate-projection changes. Splitting them
  // into separate saves made the projection sync land as a rates-ONLY commit,
  // which the server used to reject ("read-only projections").
  const updateContractor: RDashState["updateContractor"] = (id, suppliedPatch) => inTransaction("updateContractor", () => {
    const state = store.getState();
    assertContractorPermission(state, "update contractors");
    const before = state.db.master.contractors.find((row) => row.id === id) as ContractorProfileRecord | undefined;
    if (!before) return originalUpdateContractor(id, suppliedPatch);

    const patch = suppliedPatch as ContractorProfileRecord;
    const merged: ContractorProfileRecord = { ...before, ...patch, id };
    let capabilitiesOverride: ContractorCapability[] | undefined;
    if (Object.prototype.hasOwnProperty.call(patch, "work_capabilities")) {
      capabilitiesOverride = canonicalContractorCapabilities(
        { ...merged, work_capabilities: patch.work_capabilities },
        state.db,
      );
    }

    const normalized = normalizeContractorForWrite(merged, state.db, {
      id,
      capabilitiesOverride,
    });
    const activating = before.status !== "active" && normalized.status === "active";
    const validationError = contractorProfileValidationError(normalized, { activating });
    if (validationError) throw new Error(validationError);
    const duplicateError = hardDuplicateError(state, normalized, id);
    if (duplicateError) throw new Error(duplicateError);

    synchronizeWorkTypeCatalog(store, normalized.work_capabilities || []);
    originalUpdateContractor(id, normalized as never);
    synchronizeRateProjection(store, id);
  });



  store.setState({
    addContractor,
    updateContractor,
  });
}
