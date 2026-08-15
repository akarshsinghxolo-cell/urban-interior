"use client";

import type { RDashDatabase } from "./types";
import type { AuthenticatedWorkspaceUser } from "./store/ui-types";
import {
  workspaceReadTargetKey,
  type WorkspaceReadStateSnapshot,
} from "./workspace-read-state";
import type { WorkspaceReadTarget } from "./workspace-read-scope";

const MAX_CACHE_ENTRIES = 32;

export interface WorkspaceReadCacheEntry {
  cacheKey: string;
  userKey: string;
  targetKey: string;
  target: WorkspaceReadTarget;
  revision: number;
  data: RDashDatabase;
  rowVersions?: Record<string, number>;
  aggregateRevisions?: Record<string, number>;
  readState: WorkspaceReadStateSnapshot;
  cachedAt: number;
}

function authenticatedUserKey(user: AuthenticatedWorkspaceUser): string {
  return [
    user.email.trim().toLowerCase(),
    user.role.trim(),
    String(user.staffId || "").trim(),
  ].join("|");
}

function cacheKey(target: WorkspaceReadTarget, user: AuthenticatedWorkspaceUser): string {
  return `${authenticatedUserKey(user)}::${workspaceReadTargetKey(target)}`;
}

function cloneEntry(entry: WorkspaceReadCacheEntry): WorkspaceReadCacheEntry {
  return {
    ...entry,
    target: structuredClone(entry.target),
    data: structuredClone(entry.data),
    rowVersions: entry.rowVersions ? { ...entry.rowVersions } : undefined,
    aggregateRevisions: entry.aggregateRevisions ? { ...entry.aggregateRevisions } : undefined,
    readState: { ...entry.readState },
  };
}

const entries = new Map<string, WorkspaceReadCacheEntry>();

function trim(): void {
  while (entries.size > MAX_CACHE_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) return;
    entries.delete(oldest);
  }
}

function putEntry(entry: WorkspaceReadCacheEntry): void {
  const next = cloneEntry({ ...entry, cachedAt: Date.now() });
  entries.delete(next.cacheKey);
  entries.set(next.cacheKey, next);
  trim();
}

export const workspaceReadCache = {
  get(
    target: WorkspaceReadTarget,
    user: AuthenticatedWorkspaceUser,
  ): WorkspaceReadCacheEntry | null {
    const key = cacheKey(target, user);
    const entry = entries.get(key);
    if (!entry) return null;
    entries.delete(key);
    entries.set(key, entry);
    return cloneEntry(entry);
  },

  peek(
    target: WorkspaceReadTarget,
    user: AuthenticatedWorkspaceUser,
  ): WorkspaceReadCacheEntry | null {
    const entry = entries.get(cacheKey(target, user));
    return entry ? cloneEntry(entry) : null;
  },

  put(entry: WorkspaceReadCacheEntry): void {
    putEntry(entry);
  },

  store(input: {
    target: WorkspaceReadTarget;
    user: AuthenticatedWorkspaceUser;
    revision: number;
    data: RDashDatabase;
    rowVersions?: Record<string, number>;
    aggregateRevisions?: Record<string, number>;
    readState: WorkspaceReadStateSnapshot;
  }): WorkspaceReadCacheEntry {
    const userKey = authenticatedUserKey(input.user);
    const targetKey = workspaceReadTargetKey(input.target);
    const entry: WorkspaceReadCacheEntry = {
      cacheKey: `${userKey}::${targetKey}`,
      userKey,
      targetKey,
      target: structuredClone(input.target),
      revision: input.revision,
      data: structuredClone(input.data),
      rowVersions: input.rowVersions ? { ...input.rowVersions } : undefined,
      aggregateRevisions: input.aggregateRevisions ? { ...input.aggregateRevisions } : undefined,
      readState: {
        ...input.readState,
        requestStatus: "idle",
        requestTargetKey: undefined,
        requestError: undefined,
      },
      cachedAt: Date.now(),
    };
    putEntry(entry);
    return cloneEntry(entry);
  },

  clear(): void {
    entries.clear();
  },

  sizeForTests(): number {
    return entries.size;
  },
};
