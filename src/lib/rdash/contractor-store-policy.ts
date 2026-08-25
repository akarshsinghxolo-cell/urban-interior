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

  const addContractor: RDashState["addContractor"] = (input) => {
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
  };

  const updateContractor: RDashState["updateContractor"] = (id, suppliedPatch) => {
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
  };

  const addContractorRate: RDashState["addContractorRate"] = (rate) => {
    const state = store.getState();
    assertContractorPermission(state, "edit contractor rates");
    const contractor = state.db.master.contractors.find((row) => row.id === rate.contractor_id) as ContractorProfileRecord | undefined;
    if (!contractor) throw new Error("Contractor not found.");
    const contractorId = contractor.id;
    if (!contractorId) throw new Error("Contractor ID is required.");
    if (!rate.work_subcategory_id || !rate.work_type_id) {
      throw new Error("Contractor rates must be linked to a Work Subcategory and Work Type. Edit the contractor capability instead of creating a free-form rate.");
    }

    const subcategory = state.db.master.workSubcategories.find((row) => row.id === rate.work_subcategory_id);
    if (!subcategory) throw new Error("Work Subcategory not found.");
    const workType = workTypesForSubcategory(subcategory).find((row) => row.id === rate.work_type_id);
    if (!workType) throw new Error("Work Type not found for this Work Subcategory.");
    const capabilities = canonicalContractorCapabilities(contractor, state.db);
    const existing = capabilities.find((row) => row.subcategory_id === rate.work_subcategory_id);
    const workTypeRates = [
      ...(existing?.work_type_rates || []).filter((row) => row.work_type_id !== workType.id),
      {
        work_type_id: workType.id,
        work_type_name: workType.name,
        unit_id: rate.unit_id || workType.unit_id || subcategory.unit_id,
        material_rate: rate.material_rate,
        labour_rate: rate.labour_rate ?? rate.rate ?? 0,
        notes: rate.notes,
      },
    ];
    const next: ContractorCapability = {
      ...existing,
      subcategory_id: rate.work_subcategory_id,
      subcategory_name: subcategory.name,
      work_type_rates: workTypeRates,
    };
    const updated = existing
      ? capabilities.map((row) => row.subcategory_id === next.subcategory_id ? next : row)
      : [...capabilities, next];
    updateContractor(contractorId, { work_capabilities: updated } as never);
    const refreshed = store.getState().db.master.contractorRates.find(
      (row) => row.contractor_id === contractorId
        && row.work_subcategory_id === next.subcategory_id
        && row.work_type_id === workType.id,
    );
    return refreshed?.id || `crate-${contractorId}-${next.subcategory_id}-${workType.id}`;
  };

  store.setState({
    addContractor,
    updateContractor,
    addContractorRate,
  });
}
