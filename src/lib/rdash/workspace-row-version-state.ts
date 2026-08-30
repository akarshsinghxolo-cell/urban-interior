type WorkspaceRowVersions = Record<string, number>;

let snapshot: WorkspaceRowVersions = {};

function normalizedRowVersions(input: WorkspaceRowVersions | undefined): WorkspaceRowVersions {
  const result: WorkspaceRowVersions = {};
  for (const [key, rawVersion] of Object.entries(input || {})) {
    const version = Number(rawVersion);
    if (!key.trim() || !Number.isInteger(version) || version < 0) continue;
    result[key] = version;
  }
  return result;
}

export function mergeWorkspaceRowVersions(
  current: WorkspaceRowVersions,
  changed: WorkspaceRowVersions,
  deletedKeys: readonly string[] = [],
): WorkspaceRowVersions {
  const next = {
    ...normalizedRowVersions(current),
    ...normalizedRowVersions(changed),
  };
  for (const key of deletedKeys) delete next[key];
  return next;
}

export function deletedWorkspaceOperationVersionKeys(
  operations: ReadonlyArray<{ collection: string; deleteIds?: readonly string[] }>,
): string[] {
  const keys = new Set<string>();
  for (const operation of operations) {
    for (const rawId of operation.deleteIds || []) {
      const id = String(rawId || "").trim();
      if (!id) continue;
      keys.add(id);
      keys.add(`${operation.collection}:${id}`);
    }
  }
  return [...keys];
}

/**
 * Mirrors the store's private per-row CAS cache so remote delta hydration can
 * pass a complete version map instead of replacing it with changed rows only.
 */
export const workspaceRowVersionState = {
  getSnapshot(): WorkspaceRowVersions {
    return { ...snapshot };
  },
  replace(input: WorkspaceRowVersions | undefined): void {
    snapshot = normalizedRowVersions(input);
  },
  merge(input: WorkspaceRowVersions | undefined): void {
    snapshot = mergeWorkspaceRowVersions(snapshot, input || {});
  },
  remove(keys: readonly string[]): void {
    snapshot = mergeWorkspaceRowVersions(snapshot, {}, keys);
  },
  resetForTests(): void {
    snapshot = {};
  },
};
