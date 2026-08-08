import { useRDashStore } from "./store";
import {
  fieldChanges,
  vendorLegacyMigrationPatch,
} from "./partner-form-consistency";

const activeScopes = new Map<string, number>();
let activeCreates = 0;
let consumers = 0;
let uninstallCurrent: (() => void) | null = null;

const isActiveScope = (id: string) => activeScopes.has(id);

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
    action: `Updated vendor ${String(after.name || id)}`,
    entity_type: "vendor",
    entity_id: id,
    entity_label: String(after.name || before.name || id),
    kind: "update",
    reason: `Changed fields: ${changes.map((change) => change.field).join(", ")}`,
    before,
    after,
    changes: changes.map((change) => ({
      id: `vendor-${id}-${change.field}`,
      field: change.field,
      before: change.before,
      after: change.after,
    })),
  });
}

function install(): () => void {
  const originalUpdateVendor = useRDashStore.getState().updateVendor;

  const updateVendor = (id: string, suppliedPatch: Record<string, unknown>) => {
    const suppliedFields = Object.keys(suppliedPatch);
    if (
      activeCreates > 0 &&
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

    if (!isActiveScope(id)) {
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
    detailedAudit(id, before, after);
  };

  useRDashStore.setState({ updateVendor: updateVendor as never });

  return () => {
    const current = useRDashStore.getState();
    useRDashStore.setState({
      updateVendor:
        current.updateVendor === updateVendor
          ? originalUpdateVendor
          : current.updateVendor,
    });
  };
}

export function retainPartnerFormStoreBridge(editId?: string): () => void {
  consumers += 1;
  if (editId) {
    activeScopes.set(editId, (activeScopes.get(editId) || 0) + 1);
  } else {
    activeCreates += 1;
  }
  if (consumers === 1) uninstallCurrent = install();

  return () => {
    if (editId) {
      const next = (activeScopes.get(editId) || 1) - 1;
      if (next <= 0) activeScopes.delete(editId);
      else activeScopes.set(editId, next);
    } else {
      activeCreates = Math.max(0, activeCreates - 1);
    }

    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) {
      uninstallCurrent?.();
      uninstallCurrent = null;
      activeScopes.clear();
      activeCreates = 0;
    }
  };
}
