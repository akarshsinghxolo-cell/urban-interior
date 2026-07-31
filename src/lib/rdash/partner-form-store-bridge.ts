import { useRDashStore } from "./store";
import {
  fieldChanges,
  legacyVendorArticleNames,
  vendorNotesWithoutLegacyArticles,
} from "./partner-form-consistency";

type PartnerType = "vendor" | "contractor";

const activeScopes = new Map<string, number>();
let consumers = 0;
let uninstallCurrent: (() => void) | null = null;

const scopeKey = (type: PartnerType, id: string) => `${type}:${id}`;
const isActiveScope = (type: PartnerType, id: string) =>
  activeScopes.has(scopeKey(type, id));

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
  const originalUpdateVendor = initial.updateVendor;
  const originalUpdateContractor = initial.updateContractor;

  const updateVendor = (id: string, suppliedPatch: Record<string, unknown>) => {
    if (!isActiveScope("vendor", id)) {
      return originalUpdateVendor(id, suppliedPatch as never);
    }
    const state = useRDashStore.getState();
    const before = state.db.master.vendors.find((row) => row.id === id) as
      | Record<string, unknown>
      | undefined;
    if (!before) return originalUpdateVendor(id, suppliedPatch as never);

    const patch = { ...suppliedPatch };
    const structuredIds = (before.article_ids as string[] | undefined) || [];
    const legacyNames = legacyVendorArticleNames(before.notes as string | undefined);
    if (!structuredIds.length && legacyNames.length) {
      const resolvedIds = legacyNames
        .map(
          (articleName) =>
            state.db.master.articles.find(
              (article) =>
                article.name.toLowerCase() === articleName.toLowerCase(),
            )?.id,
        )
        .filter((articleId): articleId is string => Boolean(articleId));
      if (!("article_ids" in patch) && resolvedIds.length) {
        patch.article_ids = resolvedIds;
      }
      if (
        !("notes" in patch) &&
        resolvedIds.length === legacyNames.length
      ) {
        patch.notes =
          vendorNotesWithoutLegacyArticles(before.notes as string | undefined) ||
          undefined;
      }
    }

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
    if (!fieldChanges(before, after).length) return;
    withSuppressedGenericAudit(() =>
      originalUpdateContractor(id, patch as never),
    );
    detailedAudit("contractor", id, before, after);
  };

  useRDashStore.setState({
    updateVendor: updateVendor as never,
    updateContractor: updateContractor as never,
  });

  return () => {
    const current = useRDashStore.getState();
    useRDashStore.setState({
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
  }
  if (consumers === 1) uninstallCurrent = install();

  return () => {
    if (editId) {
      const key = scopeKey(type, editId);
      const next = (activeScopes.get(key) || 1) - 1;
      if (next <= 0) activeScopes.delete(key);
      else activeScopes.set(key, next);
    }
    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) {
      uninstallCurrent?.();
      uninstallCurrent = null;
      activeScopes.clear();
    }
  };
}
