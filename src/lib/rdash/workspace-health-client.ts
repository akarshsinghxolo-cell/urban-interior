"use client";

import * as React from "react";
import { getSessionToken, initAuthFetch } from "./client-auth";

type WorkspaceHealthBadge = "healthy" | "watch" | "attention";

export interface WorkspaceHealthSummary {
  status: string;
  timestamp: string;
  user: { name: string; email: string; role: string };
  revision: number;
  healthBadge: WorkspaceHealthBadge;
  attentionCount: number;
  integrity: {
    snapshotAvailable?: boolean;
    healthScore: number;
    totalIssues: number;
    critical: number;
    warning: number;
    info: number;
    totalRecords: number;
    totalReferences: number;
    businessRuleIssues?: number;
    calculatedAt?: string | null;
  };
  operations: {
    openTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
    activeFollowups: number;
    pendingApprovals: number;
    unresolvedBlocked: number;
    openRisks: number;
    activeWorkOrders: number;
    activeVisits: number;
  };
  commercial: { pipelineValue: number; pipelineQuotations: number; customers: number };
  exceptions: { directAwardPOs: number; variations: number; total: number };
  finance?: {
    cashPosition: number;
    monthRevenue: number;
    overdueInvoiceValue: number;
    overdueInvoiceCount: number;
    pendingVendorBillValue: number;
    pendingVendorBillCount: number;
    totalReceived: number;
    totalPaidOut: number;
    revenueSeries?: Array<{ date: string; value: number }>;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    kind: string;
    entityType: string;
    entityLabel: string;
    actor: string;
    actorRole?: string;
    sourceModule?: string;
    timestamp: string;
    reason?: string;
  }>;
}

type HealthState = {
  summary: WorkspaceHealthSummary | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  fetchedAt: number | null;
};

const FRESH_MS = 5 * 60_000;
let state: HealthState = { summary: null, loading: false, refreshing: false, error: null, fetchedAt: null };
let request: Promise<WorkspaceHealthSummary | null> | null = null;
let invalidationTimer: number | null = null;
const listeners = new Set<() => void>();

function emit(patch: Partial<HealthState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function getWorkspaceHealthSnapshot() {
  return state;
}

function subscribeWorkspaceHealth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadWorkspaceHealth(options: { force?: boolean } = {}) {
  const force = options.force === true;
  const fresh = state.summary && state.fetchedAt && state.fetchedAt + FRESH_MS > Date.now();
  if (!force && fresh) return state.summary;
  if (request) return request;

  initAuthFetch();
  emit({ loading: !state.summary, refreshing: Boolean(state.summary), error: null });
  request = (async () => {
    const token = getSessionToken();
    const response = await fetch("/api/health/summary", {
      credentials: "same-origin",
      cache: force ? "reload" : "default",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (response.status === 401) {
      emit({ loading: false, refreshing: false, error: "Your session has expired." });
      return null;
    }
    if (!response.ok) throw new Error(`Health summary failed (${response.status}).`);
    const summary = await response.json() as WorkspaceHealthSummary;
    emit({ summary, fetchedAt: Date.now(), loading: false, refreshing: false, error: null });
    return summary;
  })().catch((error) => {
    emit({ loading: false, refreshing: false, error: error instanceof Error ? error.message : "Health summary unavailable." });
    return null;
  }).finally(() => {
    request = null;
  });
  return request;
}

function refreshWorkspaceHealth(manual = true) {
  return loadWorkspaceHealth({ force: manual });
}

function invalidateWorkspaceHealth() {
  emit({ fetchedAt: null });
  if (typeof window === "undefined" || listeners.size === 0) return;
  if (invalidationTimer !== null) window.clearTimeout(invalidationTimer);
  invalidationTimer = window.setTimeout(() => {
    invalidationTimer = null;
    void loadWorkspaceHealth({ force: true });
  }, 750);
}

let invalidationListenerInstalled = false;
function installInvalidationListener() {
  if (invalidationListenerInstalled || typeof window === "undefined") return;
  invalidationListenerInstalled = true;
  window.addEventListener("uc-workspace-health-invalidated", invalidateWorkspaceHealth);
}

export function useWorkspaceHealth() {
  installInvalidationListener();
  const snapshot = React.useSyncExternalStore(
    subscribeWorkspaceHealth,
    getWorkspaceHealthSnapshot,
    getWorkspaceHealthSnapshot,
  );
  React.useEffect(() => {
    void loadWorkspaceHealth();
  }, []);
  return {
    summary: snapshot.summary,
    loading: snapshot.loading && !snapshot.summary,
    refreshing: snapshot.refreshing,
    error: snapshot.error,
    lastFetchedAt: snapshot.fetchedAt,
    refresh: refreshWorkspaceHealth,
  };
}
