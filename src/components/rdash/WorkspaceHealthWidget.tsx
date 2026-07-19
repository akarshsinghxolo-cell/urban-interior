"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  HeartPulse,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINRShort } from "@/lib/rdash/format";
import { useRDashStore } from "@/lib/rdash/store";
import { initAuthFetch, getSessionToken } from "@/lib/rdash/client-auth";

/**
 * WorkspaceHealthWidget — a slim, premium "status ribbon" shown at the top of
 * the Workdesk dashboard AND the Daily Work module (right under the
 * WorkspacePulseStrip). It fetches `/api/health/summary` and surfaces, in one
 * glance:
 *   - overall health badge (healthy / watch / attention) with integrity score
 *   - the single most important attention count (overdue + blocked + approvals + risks)
 *   - pipeline value + active work orders + live visits
 *   - financial metrics: cash position, month revenue, overdue invoices, pending vendor bills
 *   - the latest audit-log entry ("last activity")
 *   - a manual refresh button
 *
 * Design goals:
 *   - ONE row of high-signal info, no scroll (wraps on small screens).
 *   - Color-coded health badge (green / amber / red).
 *   - Subtle gradient + animated pulse dot to feel "alive".
 *   - Clickable cells deep-link to the relevant module.
 *   - Graceful loading + error states (never blocks the dashboard).
 *   - Auto-refreshes every 60s; manual refresh button for immediate updates.
 */

type HealthBadge = "healthy" | "watch" | "attention";

interface SummaryResponse {
  status: string;
  timestamp: string;
  user: { name: string; email: string; role: string };
  healthBadge: HealthBadge;
  attentionCount: number;
  integrity: {
    healthScore: number;
    totalIssues: number;
    critical: number;
    warning: number;
    info: number;
    totalRecords: number;
    totalReferences: number;
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
  commercial: {
    pipelineValue: number;
    pipelineQuotations: number;
    customers: number;
  };
  exceptions: {
    directAwardPOs: number;
    variations: number;
    total: number;
  };
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
    timestamp: string;
    reason?: string;
  }>;
}

const BADGE_CONFIG: Record<
  HealthBadge,
  { label: string; dot: string; pill: string; icon: React.ReactNode }
> = {
  healthy: {
    label: "Healthy",
    dot: "bg-success",
    pill: "bg-success/10 text-success ring-1 ring-success/20",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  watch: {
    label: "Watch",
    dot: "bg-warning",
    pill: "bg-warning/10 text-warning ring-1 ring-warning/20",
    icon: <Eye className="h-3.5 w-3.5" />,
  },
  attention: {
    label: "Needs attention",
    dot: "bg-destructive",
    pill: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Sparkline — a tiny inline SVG line chart for at-a-glance trend direction.
 * Renders a 36×14 path from a 7-point number series. Color shifts to amber
 * if the trend is flat/down, success if up. Zero-variance series render as a
 * flat baseline so the sparkline never looks broken.
 */
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const W = 36;
  const H = 14;
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = W / (n - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    // Invert Y so higher values go up. Clamp to [1, H-1] for padding.
    const y = H - 1 - ((v - min) / range) * (H - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(" L ")}`;
  // Trend = last vs first (only meaningful if both > 0 or both 0).
  const trendUp = values[n - 1] > values[0];
  const trendFlat = values[n - 1] === values[0];
  const stroke = trendFlat ? "text-muted-foreground/50" : trendUp ? "text-success" : "text-amber-600 dark:text-amber-400";
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={cn("shrink-0 overflow-visible", stroke, className)}
      aria-hidden
    >
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot for emphasis */}
      <circle
        cx={(W).toFixed(1)}
        cy={(H - 1 - ((values[n - 1] - min) / range) * (H - 2)).toFixed(1)}
        r={1.4}
        fill="currentColor"
      />
    </svg>
  );
}

export function WorkspaceHealthWidget() {
  const [summary, setSummary] = React.useState<SummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [lastFetchedAt, setLastFetchedAt] = React.useState<number | null>(null);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const fetchSummary = React.useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      initAuthFetch();
      const token = getSessionToken();
      const res = await fetch("/api/health/summary", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SummaryResponse;
      setSummary(data);
      setError(false);
      setLastFetchedAt(Date.now());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSummary();
    // Refresh every 60s so the ribbon stays current without manual refresh.
    const id = setInterval(fetchSummary, 60_000);
    return () => clearInterval(id);
  }, [fetchSummary]);

  if (loading) {
    return (
      <section
        aria-label="Workspace health"
        className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card/60 px-4 py-3 shadow-card animate-pulse"
      >
        <HeartPulse className="h-4 w-4 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">Loading workspace health…</span>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section
        aria-label="Workspace health"
        className="flex items-center gap-2 rounded-[var(--panel-radius)] border border-border bg-card px-4 py-3 shadow-card"
      >
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Health summary unavailable.</span>
        <button
          type="button"
          onClick={fetchSummary}
          className="ml-auto text-xs font-medium text-primary hover:underline"
        >
          Retry
        </button>
      </section>
    );
  }

  const badge = BADGE_CONFIG[summary.healthBadge];
  const lastActivity = summary.recentActivity[0];

  return (
    <section
      aria-label="Workspace health"
      className="group relative overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card px-5 py-4 shadow-card transition-shadow hover:shadow-soft"
    >
      {/* Subtle left accent bar that matches the health badge color */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          summary.healthBadge === "healthy"
            ? "bg-success"
            : summary.healthBadge === "watch"
              ? "bg-warning"
              : "bg-destructive",
        )}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        {/* ── Health badge block (left anchor) ── */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                badge.dot,
              )}
            />
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", badge.dot)} />
          </span>
          <div className="flex flex-col">
            <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", badge.pill)}>
              {badge.icon}
              {badge.label}
            </span>
            <span className="mt-1 text-[10px] text-muted-foreground">
              Integrity{" "}
              <span className="rd-tabular text-xs font-bold text-foreground">{summary.integrity.healthScore}</span>
              <span className="text-muted-foreground/50">/100</span>
            </span>
          </div>
        </div>

        {/* Vertical divider (desktop) */}
        <span aria-hidden className="hidden h-10 w-px shrink-0 bg-border lg:inline-block" />

        {/* ── Operations + finance metrics row ── */}
        <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2.5">
          <MetricChip
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            value={summary.attentionCount}
            label="attention"
            tone="warning"
            title="Overdue tasks + blocked items + pending approvals + open risks"
            onClick={() => setActiveModule("blockedRisks")}
          />
          <MetricChip
            icon={<Clock className="h-3.5 w-3.5" />}
            value={summary.operations.dueTodayTasks}
            label="due today"
            tone="primary"
            onClick={() => setActiveModule("today")}
          />
          <MetricChip
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            value={summary.operations.pendingApprovals}
            label="approvals"
            tone="success"
            onClick={() => setActiveModule("approvals")}
          />
          <MetricChip
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            value={formatINRShort(summary.commercial.pipelineValue)}
            label="pipeline"
            tone="amber"
            title={`${summary.commercial.pipelineQuotations} quotations in pipeline`}
            onClick={() => setActiveModule("salesPipeline")}
          />
          <MetricChip
            icon={<Activity className="h-3.5 w-3.5" />}
            value={summary.operations.activeWorkOrders}
            label="live work"
            tone="success"
            onClick={() => setActiveModule("sitesExecution")}
          />
          <MetricChip
            icon={<Zap className="h-3.5 w-3.5" />}
            value={summary.operations.activeVisits}
            label="visits"
            tone="violet"
            onClick={() => setActiveModule("fieldOperations")}
          />

          {/* Financial metrics — only render when finance block is present */}
          {summary.finance ? (
            <>
              <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border/60 sm:inline-block" />
              <MetricChip
                icon={<Wallet className="h-3.5 w-3.5" />}
                value={formatINRShort(summary.finance.cashPosition)}
                label="cash"
                tone={summary.finance.cashPosition >= 0 ? "success" : "destructive"}
                title={`Received ${formatINRShort(summary.finance.totalReceived)} − Paid ${formatINRShort(summary.finance.totalPaidOut)}`}
                onClick={() => setActiveModule("financeOverview")}
              />
              <MetricChip
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                value={formatINRShort(summary.finance.monthRevenue)}
                label="month"
                tone="success"
                title="Customer receipts received this month · 7-day trend shown"
                onClick={() => setActiveModule("financeOverview")}
                trailing={
                  summary.finance.revenueSeries && summary.finance.revenueSeries.length >= 2 ? (
                    <Sparkline values={summary.finance.revenueSeries.map((p) => p.value)} />
                  ) : null
                }
              />
              {summary.finance.overdueInvoiceValue > 0 ? (
                <MetricChip
                  icon={<TrendingDown className="h-3.5 w-3.5" />}
                  value={formatINRShort(summary.finance.overdueInvoiceValue)}
                  label="overdue"
                  tone="destructive"
                  title={`${summary.finance.overdueInvoiceCount} overdue invoice(s)`}
                  onClick={() => setActiveModule("paymentRecovery")}
                />
              ) : null}
              {summary.finance.pendingVendorBillValue > 0 ? (
                <MetricChip
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  value={formatINRShort(summary.finance.pendingVendorBillValue)}
                  label="payable"
                  tone="warning"
                  title={`${summary.finance.pendingVendorBillCount} pending vendor bill(s)`}
                  onClick={() => setActiveModule("vendorBills")}
                />
              ) : null}
            </>
          ) : null}
        </div>

        {/* ── Last activity (right, desktop only) ── */}
        {lastActivity ? (
          <button
            type="button"
            onClick={() => setActiveModule("auditLog")}
            className="hidden min-w-0 max-w-[260px] items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60 xl:flex"
            title={lastActivity.reason || lastActivity.action}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] leading-tight">
                <span className="font-semibold text-foreground/80">{lastActivity.actor}</span>{" "}
                <span className="text-muted-foreground">{lastActivity.action.toLowerCase()}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">Last activity · {timeAgo(lastActivity.timestamp)}</p>
            </div>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : null}

        {/* ── Right-side actions: refresh + integrity deep-link ── */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => fetchSummary(true)}
            disabled={refreshing}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
            title={lastFetchedAt ? `Last refreshed ${timeAgo(new Date(lastFetchedAt).toISOString())}` : "Refresh workspace health"}
            aria-label="Refresh workspace health"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setActiveModule("integrity")}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            title="Open Data Integrity module"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            <span className="hidden sm:inline">
              <span className="rd-tabular font-semibold text-foreground">{summary.integrity.totalRecords.toLocaleString("en-IN")}</span> rec ·{" "}
              <span className="rd-tabular font-semibold text-foreground">{summary.integrity.totalReferences.toLocaleString("en-IN")}</span> refs
            </span>
            <span className="sm:hidden">Integrity</span>
          </button>
        </div>
      </div>
    </section>
  );
}

type MetricTone = "primary" | "success" | "warning" | "amber" | "violet" | "destructive";

const METRIC_TONE: Record<MetricTone, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  amber: "text-amber-600 dark:text-amber-400",
  violet: "text-violet-600 dark:text-violet-400",
  destructive: "text-destructive",
};

function MetricChip({
  icon,
  value,
  label,
  tone,
  onClick,
  title,
  trailing,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: MetricTone;
  onClick: () => void;
  title?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="group/chip flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className={cn("shrink-0", METRIC_TONE[tone])}>{icon}</span>
      <span className="rd-tabular text-sm font-bold leading-none text-foreground">{value}</span>
      <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
      {trailing}
    </button>
  );
}
