"use client";

let revision = 0;

function normalizeRevision(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export const workspaceFoundationRevisionState = {
  get(): number {
    return revision;
  },

  replace(value: number): void {
    revision = normalizeRevision(value);
  },

  advance(value: number): void {
    revision = Math.max(revision, normalizeRevision(value));
  },

  reset(): void {
    revision = 0;
  },
};
