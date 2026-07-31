import { useRDashStore } from "./store";
import {
  contractorCapabilityRateError,
  fieldChanges,
  vendorLegacyMigrationPatch,
} from "./partner-form-consistency";

type PartnerType = "vendor" | "contractor";

const activeScopes = new Map<string, number>();
const activeCreateTypes = new Map<PartnerType, number>();
let consumers = 0;
let uninstallCurrent: (() => void) | null = null;

const scopeKey = (type: PartnerType, id: string) => `${type}:${id}`;
const isActiveScope = (type: PartnerType, id: string) =>
  activeScopes.has(scopeKey(type, id));
const isActiveCreate = (type: PartnerType) =>
  (activeCreateTypes.get(type) || 0) > 0;

function withSuppressedGenericAudit<T>(run: () => T): T {
  const originalLogAudit = useRDashStore.getState().logAudit;
  const suppressed = () => undefined;
  useRDashStore.setState({ logAudit: suppressed as never });
  try {
    return run();
  } finally {
    if (useRDashStore.getState().logAudit === suppressed) {
      useRDashStore.setState({ logAudit: originalLogAudit });
    }
  }
}

function detailedAudit(
  entityType: PartnerType,
  id: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  const changes = fieldChanges(before, after);
  if (!changes.length) return;
  const state = useRDashStore.getState();
  const actor = state.currentUser();
  state.logAudit({
    actor: actor.name,
    actor_role: actor.role,
    action: `Updated ${entityType} ${String(after.name || id)}`,
    entity_type: entityType,
    entity_id: id,
    entity_label: String(after.name || before.name || id),
    kind: "update",
    reason: `Changed fields: ${changes.map((change) => change.field).join(", ")}`,
    before,
    after,
    changes: changes.map((change) => ({
      id: `${entityType}-${id}-${change.field}`,
      field: change.field,
      before: change.before,
      after: change.after,
    })),
  });
}

function install(): () => void {
  const initial = useRDashStore.getState();
  const originalAddContractor = initial.addContractor;
  const originalUpdateVendor = initial.updateVendor;
  const originalUpdateContractor = initial.updateContractor;

  const addContractor = (input: Record<string, unknown>) => {
    if (isActiveCreate("contractor")) {
      const error = contractorCapabilityRateError(input.work_capabilities);
      if (error) throw new Error(error);
    }
    return originalAddContractor(input as never);
  };

  const updateVendor = (id: string, suppliedPatch: Record<string, unknown>) => {
    const suppliedFields = Object.keys(suppliedPatch);
    if (
      isActiveCreate("vendor") &&
      suppliedFields.length === 1 &&
      suppliedFields[0] === "article_ids"
    ) {
      const articleIds = Array.isArray(suppliedPatch.article_ids)
        ? suppliedPatch.article_ids
        : [];
      if (!articleIds.length) return;
      withSuppressedGenericAudit(() =>
        originalUpdateVendor(id, { article_ids: articleIds } as never),
      );
      return;
    }
    if (!isActiveScope("vendor", id)) {
      return originalUpdateVendor(id, suppliedPatch as never);
    }
    const state = useRDashStore.getState();
    const before = state.db.master.vendors.find((row) => row.id === id) as
      | Record<string, unknown>
      | undefined;
    if (!before) return originalUpdateVendor(id, suppliedPatch as never);

    const patch = vendorLegacyMigrationPatch(
      before,
      suppliedPatch,
      state.db.master.articles,
    );
    const after = { ...before, ...patch };
    if (!fieldChanges(before, after).length) return;
    withSuppressedGenericAudit(() => originalUpdateVendor(id, patch as never));
    detailedAudit("vendor", id, before, after);
  };

  const updateContractor = (
    id: string,
    patch: Record<string, unknown>,
  ) => {
    if (!isActiveScope("contractor", id)) {
      return originalUpdateContractor(id, patch as never);
    }
    const before = useRDashStore
      .getState()
      .db.master.contractors.find((row) => row.id === id) as
      | Record<string, unknown>
      | undefined;
    if (!before) return originalUpdateContractor(id, patch as never);
    const after = { ...before, ...patch };
    const error = contractorCapabilityRateError(after.work_capabilities);
    if (error) throw new Error(error);
    if (!fieldChanges(before, after).length) return;
    withSuppressedGenericAudit(() =>
      originalUpdateContractor(id, patch as never),
    );
    detailedAudit("contractor", id, before, after);
  };

  useRDashStore.setState({
    addContractor: addContractor as never,
    updateVendor: updateVendor as never,
    updateContractor: updateContractor as never,
  });

  return () => {
    const current = useRDashStore.getState();
    useRDashStore.setState({
      addContractor:
        current.addContractor === addContractor
          ? originalAddContractor
          : current.addContractor,
      updateVendor:
        current.updateVendor === updateVendor
          ? originalUpdateVendor
          : current.updateVendor,
      updateContractor:
        current.updateContractor === updateContractor
          ? originalUpdateContractor
          : current.updateContractor,
    });
  };
}

export function retainPartnerFormStoreBridge(
  type: PartnerType,
  editId?: string,
): () => void {
  consumers += 1;
  if (editId) {
    const key = scopeKey(type, editId);
    activeScopes.set(key, (activeScopes.get(key) || 0) + 1);
  } else {
    activeCreateTypes.set(type, (activeCreateTypes.get(type) || 0) + 1);
  }
  if (consumers === 1) uninstallCurrent = install();

  return () => {
    if (editId) {
      const key = scopeKey(type, editId);
      const next = (activeScopes.get(key) || 1) - 1;
      if (next <= 0) activeScopes.delete(key);
      else activeScopes.set(key, next);
    } else {
      const next = (activeCreateTypes.get(type) || 1) - 1;
      if (next <= 0) activeCreateTypes.delete(type);
      else activeCreateTypes.set(type, next);
    }
    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) {
      uninstallCurrent?.();
      uninstallCurrent = null;
      activeScopes.clear();
      activeCreateTypes.clear();
    }
  };
}
