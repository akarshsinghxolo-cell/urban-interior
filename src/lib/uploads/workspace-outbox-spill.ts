"use client";

import type { WorkspaceCommitPayload } from "./workspace-outbox-types";

/**
 * Secondary durability tier for workspace commits.
 *
 * The outbox normally captures every commit into IndexedDB before the request
 * is sent (see client-auth). When that primary capture fails — storage
 * unavailable, quota exceeded, corrupted DB — the change used to be sent with
 * no durable copy at all: closing the tab mid-request silently lost it.
 *
 * This module spills the raw payload into localStorage instead. localStorage
 * is an independent storage backend, so it stays usable in the most common
 * IndexedDB failure modes. The outbox promotes spilled commits back into the
 * IndexedDB queue on the next hydrate, where the existing replay path
 * (X-UC-Outbox-Replay) takes over. If BOTH stores fail, the commit still goes
 * out online (unchanged behavior) — there is no third place to persist it.
 *
 * This module must stay a leaf: it is imported by client-auth and by the
 * outbox itself, so it must not import back from workspace-outbox.
 */
const SPILL_KEY = "uc_workspace_outbox_spill_v1";
const SPILL_LIMIT = 20;

function isSpillablePayload(value: unknown): value is WorkspaceCommitPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkspaceCommitPayload>;
  return (
    typeof candidate.revision === "number"
    && Array.isArray(candidate.operations)
    && candidate.operations.length > 0
  );
}

function readSpill(): WorkspaceCommitPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SPILL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSpillablePayload);
  } catch {
    return [];
  }
}

function writeSpill(items: WorkspaceCommitPayload[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SPILL_KEY, JSON.stringify(items.slice(-SPILL_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort secondary capture of a commit that the primary IndexedDB
 * capture could not store. Never throws. Returns true only when the payload
 * is durably spilled.
 */
export function spillWorkspaceCommit(body: BodyInit | null | undefined): boolean {
  if (typeof body !== "string" || !body.trim()) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (!isSpillablePayload(parsed)) return false;
  const previous = readSpill();
  const remaining = previous.filter((item) => !item.operationId || item.operationId !== parsed.operationId);
  return writeSpill([...remaining, parsed]);
}

/** Spilled commits waiting for the primary outbox to come back. */
export function readSpilledWorkspaceCommits(): WorkspaceCommitPayload[] {
  return readSpill();
}

/** Drop the given payloads (matched by operationId or exact entry) from the spill. */
export function replaceSpilledWorkspaceCommits(remaining: WorkspaceCommitPayload[]): void {
  if (!remaining.length) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(SPILL_KEY);
    } catch {
      // Nothing durable to do; the spill simply survives until it can be removed.
    }
    return;
  }
  writeSpill(remaining);
}
