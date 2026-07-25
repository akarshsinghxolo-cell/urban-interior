import type { RDashDatabase } from "@/lib/rdash/types";
import type { WorkspaceOperation } from "@/lib/rdash/workspace-operations";

export type WorkspaceOutboxStatus =
  | "pending"
  | "syncing"
  | "waiting_for_network"
  | "conflict"
  | "failed_retryable"
  | "failed_permanent";

export interface WorkspaceOutboxSummary {
  collection: string;
  upsertIds: string[];
  deleteIds: string[];
}

export interface WorkspaceCommitOutboxRecord {
  operationId: string;
  workspaceId: string;
  revision: number;
  operations: WorkspaceOperation[];
  expectedRevisions?: Record<string, number>;
  expectedRowVersions?: Record<string, number>;
  uploadBatchIds: string[];
  status: WorkspaceOutboxStatus;
  retryCount: number;
  retryAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  summary: WorkspaceOutboxSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceOutboxSnapshot {
  ready: boolean;
  online: boolean;
  items: WorkspaceCommitOutboxRecord[];
}

export interface WorkspaceCommitPayload {
  revision?: number;
  operations?: WorkspaceOperation[];
  expectedRevisions?: Record<string, number>;
  expectedRowVersions?: Record<string, number>;
  operationId?: string;
}

export interface WorkspaceCommitResponsePayload {
  revision?: number;
  data?: RDashDatabase;
  rowVersions?: Record<string, number>;
  bumpedAggregateRevisions?: Record<string, number>;
  error?: string;
}
