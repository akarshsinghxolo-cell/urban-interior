"use client";
import * as React from "react";
import { Activity, ArrowUpRight, CalendarClock, ClipboardCopy, FileText, PhoneCall, PlusCircle, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Users, Wrench, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINRShort } from "@/lib/rdash/format";
import { useRDashStore } from "@/lib/rdash/store";
import { indiaDate } from "@/lib/rdash/date";
import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

/** Compact "Xs/m/h ago" for the health-popover last-updated timestamp. */
function timeAgoShort(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/**
 * Mini Sparkline — a tiny inline SVG line chart (48×16) for the health-badge
 * popover footer. Renders a 7-point revenue trend from the /api/health/summary
 * revenueSeries. Color: green (up), amber (down/flat), muted (zero-variance).
 * End dot for emphasis. Kept self-contained (no imports) so it can render in
 * the popover without extra dependencies.
 */
function MiniSparkline({ values }: { values: number[] }) {
  const W = 48;
  const H = 16;
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = W / (n - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = H - 1 - ((v - min) / range) * (H - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(" L ")}`;
  const trendUp = values[n - 1] > values[0];
  const trendFlat = values[n - 1] === values[0];
  const stroke = trendFlat ? "text-muted-foreground/50" : trendUp ? "text-success" : "text-amber-600 dark:text-amber-400";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={cn("shrink-0 overflow-visible", stroke)} aria-hidden>
      <path d={pathD} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={W} cy={(H - 1 - ((values[n - 1] - min) / range) * (H - 2)).toFixed(1)} r={1.5} fill="currentColor" />
    </svg>
  );
}

/** Count-up hook: animates a number from 0→value over ~600ms once mounted. */
function useCountUp(value: number, duration = 650) {
  const [display, setDisplay] = React.useState(0);
  const rafRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);
  return display;
}

function useLiveClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

type TileAccent = "blue" | "green" | "amber" | "violet";

interface PulseTileProps {
  label: string;
  value: number;
  display?: string;
  icon: React.ReactNode;
  accent: TileAccent;
  onClick?: () => void;
}

const ACCENT_STYLES: Record<TileAccent, { icon: string; ring: string; bar: string; glow: string }> = {
  blue: {
    icon: "bg-[hsl(217_91%_96%)] text-[hsl(217_91%_45%)] ring-[hsl(217_91%_85%)]",
    ring: "group-hover:border-[hsl(217_91%_60%/0.5)]",
    bar: "bg-[hsl(217_91%_55%)]",
    glow: "group-hover:shadow-[0_8px_24px_-12px_hsl(217_91%_55%/0.55)]",
  },
  green: {
    icon: "bg-[hsl(142_72%_95%)] text-[hsl(142_72%_32%)] ring-[hsl(142_72%_80%)]",
    ring: "group-hover:border-[hsl(142_72%_55%/0.5)]",
    bar: "bg-[hsl(142_72%_45%)]",
    glow: "group-hover:shadow-[0_8px_24px_-12px_hsl(142_72%_50%/0.5)]",
  },
  amber: {
    icon: "bg-[hsl(32_95%_94%)] text-[hsl(32_95%_40%)] ring-[hsl(32_95%_80%)]",
    ring: "group-hover:border-[hsl(32_95%_60%/0.5)]",
    bar: "bg-[hsl(32_95%_52%)]",
    glow: "group-hover:shadow-[0_8px_24px_-12px_hsl(32_95%_55%/0.5)]",
  },
  violet: {
    icon: "bg-[hsl(262_60%_95%)] text-[hsl(262_60%_45%)] ring-[hsl(262_60%_82%)]",
    ring: "group-hover:border-[hsl(262_60%_62%/0.5)]",
    bar: "bg-[hsl(262_60%_58%)]",
    glow: "group-hover:shadow-[0_8px_24px_-12px_hsl(262_60%_60%/0.5)]",
  },
};

function PulseTile({ label, value, display, icon, accent, onClick }: PulseTileProps) {
  const counted = useCountUp(value);
  const shown = display ?? counted.toLocaleString("en-IN");
  const a = ACCENT_STYLES[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-card/80 px-3 py-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:bg-card hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        a.ring,
        a.glow,
      )}
    >
      {/* Accent top bar */}
      <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-70 transition-opacity group-hover:opacity-100", a.bar)} aria-hidden />
      {/* Subtle radial gradient overlay that fades in on hover for depth */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20",
          a.bar,
        )}
      />
      <span className="relative flex items-center justify-between gap-2">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform duration-200 group-hover:scale-110", a.icon)} aria-hidden>
          {icon}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/70" />
      </span>
      <span className="relative rd-tabular text-lg font-bold leading-tight text-foreground">
        {shown}
      </span>
      <span className="relative truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </button>
  );
}

/**
 * PopoverStat — a single stat cell for the health-summary popover grid.
 * Renders a label + value with color-coding by tone (success/warning/
 * destructive/muted). The gap-px + bg-border/60 parent creates a 1px grid
 * divider effect between cells.
 */
function PopoverStat({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "destructive" | "muted" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2 bg-card px-3 py-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={cn("rd-tabular text-[11px] font-bold", toneClass)}>{value}</span>
    </div>
  );
}

/**
 * WorkspacePulseStrip — premium gradient hero strip shown at the top of the
 * Workdesk dashboard. Combines a live greeting + clock, four animated KPI
 * mini-tiles, and quick-action buttons into one visually rich surface.
 *
 * Layout: greeting row on top (full width), KPI tiles in a responsive grid
 * below (2 cols on mobile, 4 on xl), quick actions in a wrap row. This avoids
 * the truncation that occurred when all three were crammed into one flex row.
 */
export function WorkspacePulseStrip() {
  const db = useRDashStore((s) => s.db);
  const role = useRDashStore((s) => s.authUser?.name || "Owner");
  const setActiveModule = useRDashStore((s) => s.setActiveModule);
  const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
  const now = useLiveClock();

  // Health-aware greeting: fetch the workspace health summary once on mount
  // so the greeting can show a contextual sub-line ("You have N items needing
  // attention" or "All clear — workspace healthy") instead of a static label.
  // Also powers the mini health-summary popover on the badge. The fetchHealth
  // callback is extracted so the popover's manual refresh button can call it.
  const [health, setHealth] = React.useState<{
    badge: "healthy" | "watch" | "attention";
    attentionCount: number;
    integrityScore: number;
    integrityIssues: number;
    pendingApprovals: number;
    overdueTasks: number;
    unresolvedBlocked: number;
    openRisks: number;
    cashPosition: number;
    overdueInvoiceValue: number;
    monthRevenue: number;
    totalRecords: number;
    totalReferences: number;
    revenueSeries: Array<{ date: string; value: number }>;
  } | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastFetchedAt, setLastFetchedAt] = React.useState<number | null>(null);
  const fetchHealth = React.useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const { getSessionToken } = await import("@/lib/rdash/client-auth");
      const token = getSessionToken();
      const res = await fetch("/api/health/summary", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setHealth({
        badge: data.healthBadge,
        attentionCount: data.attentionCount,
        integrityScore: data.integrity?.healthScore ?? 100,
        integrityIssues: data.integrity?.totalIssues ?? 0,
        pendingApprovals: data.operations?.pendingApprovals ?? 0,
        overdueTasks: data.operations?.overdueTasks ?? 0,
        unresolvedBlocked: data.operations?.unresolvedBlocked ?? 0,
        openRisks: data.operations?.openRisks ?? 0,
        cashPosition: data.finance?.cashPosition ?? 0,
        overdueInvoiceValue: data.finance?.overdueInvoiceValue ?? 0,
        monthRevenue: data.finance?.monthRevenue ?? 0,
        totalRecords: data.integrity?.totalRecords ?? 0,
        totalReferences: data.integrity?.totalReferences ?? 0,
        revenueSeries: data.finance?.revenueSeries ?? [],
      });
      setLastFetchedAt(Date.now());
    } catch {
      // Non-fatal — greeting falls back to the static "Live" badge.
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);
  React.useEffect(() => {
    fetchHealth();
    const id = setInterval(() => fetchHealth(), 60_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const liveWorkOrders = db.workOrders.filter(
    (w) => w.status === "in_progress" || w.status === "scheduled",
  );
  const pipelineValue = db.quotations
    .filter((q) => q.status === "sent" || q.status === "draft")
    .reduce((t, q) => t + q.total_amount, 0);
  const todayActions = db.tasks.filter(
    (t) => t.due_date === indiaDate() && t.status !== "completed" && t.status !== "cancelled",
  );

  const firstName = role.split(" ")[0] || "Owner";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  // Contextual health message for the greeting sub-line.
  const healthMsg = health
    ? health.badge === "healthy"
      ? { text: "All clear — workspace healthy", tone: "text-success", icon: "✓" }
      : health.badge === "watch"
        ? { text: `${health.attentionCount} item(s) to review`, tone: "text-amber-600 dark:text-amber-400", icon: "!" }
        : { text: `${health.attentionCount} item(s) need attention`, tone: "text-destructive", icon: "!" }
    : null;

  const quickActions: Array<
    | { label: string; icon: React.ReactNode; kind: CreateDialogKind }
    | { label: string; icon: React.ReactNode; navigate: string }
  > = [
    { label: "Customer", icon: <Users className="h-3.5 w-3.5" />, navigate: "customerTimeline" },
    { label: "Task", icon: <PlusCircle className="h-3.5 w-3.5" />, kind: "task" },
    { label: "Quotation", icon: <FileText className="h-3.5 w-3.5" />, kind: "quotation" },
    { label: "Visit", icon: <CalendarClock className="h-3.5 w-3.5" />, kind: "visit" },
    { label: "Follow-up", icon: <PhoneCall className="h-3.5 w-3.5" />, kind: "followup" },
  ];

  return (
    <section
      aria-label="Workspace pulse"
      className="rd-pulse-strip relative overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      {/* Greeting row — full width, no truncation */}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                <span className="whitespace-nowrap">{greeting(now)},</span>{" "}
                <span className="whitespace-nowrap text-primary">{firstName}</span>
              </h2>
              {healthMsg ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        health.badge === "healthy"
                          ? "bg-success/10 text-success ring-success/20"
                          : health.badge === "watch"
                            ? "bg-warning/10 text-warning ring-warning/20"
                            : "bg-destructive/10 text-destructive ring-destructive/20",
                      )}
                      title={healthMsg.text}
                    >
                      <span className="rd-tabular">{healthMsg.icon}</span>
                      {/* On mobile, show only the count (e.g. "7") to save space.
                          On sm+, show the full text (e.g. "7 item(s) need attention"). */}
                      <span className="sm:hidden">{health.attentionCount}</span>
                      <span className="hidden sm:inline">{healthMsg.text}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={6} className="w-72 p-0">
                    {/* Mini health summary popover */}
                    <div className="border-b border-border bg-gradient-to-r from-primary/[0.05] to-transparent px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md",
                            health.badge === "healthy" ? "bg-success/10 text-success" : health.badge === "watch" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive")}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-xs font-bold">Workspace Health</span>
                        </div>
                        <span className={cn("rd-tabular text-sm font-bold",
                          health.badge === "healthy" ? "text-success" : health.badge === "watch" ? "text-warning" : "text-destructive")}>
                          {health.integrityScore}/100
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-border/60">
                      <PopoverStat label="Integrity" value={health.integrityIssues === 0 ? "Clean" : `${health.integrityIssues} issue${health.integrityIssues === 1 ? "" : "s"}`} tone={health.integrityIssues === 0 ? "success" : "destructive"} />
                      <PopoverStat label="Approvals" value={String(health.pendingApprovals)} tone={health.pendingApprovals > 0 ? "warning" : "muted"} />
                      <PopoverStat label="Overdue tasks" value={String(health.overdueTasks)} tone={health.overdueTasks > 0 ? "destructive" : "muted"} />
                      <PopoverStat label="Blocked" value={String(health.unresolvedBlocked)} tone={health.unresolvedBlocked > 0 ? "warning" : "muted"} />
                      <PopoverStat label="Open risks" value={String(health.openRisks)} tone={health.openRisks > 0 ? "destructive" : "muted"} />
                      <PopoverStat label="Overdue invoices" value={health.overdueInvoiceValue > 0 ? formatINRShort(health.overdueInvoiceValue) : "None"} tone={health.overdueInvoiceValue > 0 ? "destructive" : "muted"} />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3 text-success" />
                        <span className="text-[10px] text-muted-foreground">Cash</span>
                        <span className={cn("rd-tabular text-xs font-bold", health.cashPosition >= 0 ? "text-success" : "text-destructive")}>
                          {formatINRShort(health.cashPosition)}
                        </span>
                      </div>
                      {/* Mini revenue sparkline — 7-day trend from revenueSeries.
                          Shows the revenue direction at a glance alongside cash. */}
                      {health.revenueSeries && health.revenueSeries.length >= 2 ? (
                        <div className="flex items-center gap-1.5" title="7-day revenue trend">
                          <span className="text-[10px] text-muted-foreground">7d</span>
                          <MiniSparkline values={health.revenueSeries.map((p) => p.value)} />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setActiveModule(health.badge === "healthy" ? "integrity" : "blockedRisks")}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Open
                        <ArrowUpRight className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {/* Footer: last-updated timestamp + refresh + copy-summary buttons */}
                    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {lastFetchedAt ? `Updated ${timeAgoShort(lastFetchedAt)}` : "Loading…"}
                      </span>
                      <div className="flex items-center gap-1">
                        {/* Copy summary — copies a formatted text summary of the
                            workspace health to the clipboard. Useful for
                            support, debugging, or reporting. */}
                        <button
                          type="button"
                          onClick={() => {
                            const lines = [
                              `Urban Castle — Workspace Health Summary`,
                              `Generated: ${new Date().toLocaleString("en-IN")}`,
                              ``,
                              `Badge: ${health.badge} | Integrity: ${health.integrityScore}/100`,
                              `Attention: ${health.attentionCount} (approvals ${health.pendingApprovals}, overdue ${health.overdueTasks}, blocked ${health.unresolvedBlocked}, risks ${health.openRisks})`,
                              `Integrity issues: ${health.integrityIssues} | Records: ${health.totalRecords.toLocaleString("en-IN")} | References: ${health.totalReferences?.toLocaleString("en-IN") ?? "n/a"}`,
                              `Cash: ${formatINRShort(health.cashPosition)} | Month revenue: ${formatINRShort(health.monthRevenue)} | Overdue invoices: ${formatINRShort(health.overdueInvoiceValue)}`,
                            ];
                            const text = lines.join("\n");
                            navigator.clipboard?.writeText(text).then(
                              () => toast.success("Health summary copied", { description: "Workspace metrics copied to clipboard", duration: 3000 }),
                              () => toast.error("Copy failed", { description: "Clipboard access denied", duration: 3000 }),
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Copy health summary to clipboard"
                        >
                          <ClipboardCopy className="h-2.5 w-2.5" />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => fetchHealth(true)}
                          disabled={refreshing}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title="Refresh health summary"
                        >
                          <RefreshCw className={cn("h-2.5 w-2.5", refreshing && "animate-spin")} />
                          {refreshing ? "Refreshing" : "Refresh"}
                        </button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-success ring-1 ring-success/20">
                  <Activity className="h-2.5 w-2.5" /> Live
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3 shrink-0" />
              <span className="whitespace-nowrap">{dateStr}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="rd-tabular font-semibold text-foreground/80">{timeStr}</span>
              {/* Data-freshness indicator: shows when the workspace health was
                  last synced, so users know the numbers are current. */}
              {lastFetchedAt ? (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="flex items-center gap-0.5 whitespace-nowrap" title={`Workspace data synced ${timeAgoShort(lastFetchedAt)}`}>
                    <span className="h-1 w-1 rounded-full bg-success" />
                    <span className="text-[10px] text-muted-foreground/70">synced {timeAgoShort(lastFetchedAt)}</span>
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {/* Quick actions — wrap on small screens */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 sm:inline">Quick add</span>
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              type="button"
              onClick={() => {
                if ("kind" in qa) openCreateDialog?.({ kind: qa.kind });
                else if ("navigate" in qa) setActiveModule(qa.navigate);
              }}
              className="group inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 transition-all duration-150 hover:bg-primary/5 hover:text-primary hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {qa.icon}
              <span className="hidden sm:inline">{qa.label}</span>
              <ArrowUpRight className="h-2.5 w-2.5 opacity-50 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>

      {/* KPI tiles — responsive grid, no truncation.
          2 cols on mobile, 4 cols on sm+, gives each tile enough width. */}
      <div className="relative mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <PulseTile
          label="Customers"
          value={db.customers.length}
          icon={<Users className="h-4 w-4" />}
          accent="blue"
          onClick={() => setActiveModule("customerTimeline")}
        />
        <PulseTile
          label="Live Work"
          value={liveWorkOrders.length}
          icon={<Wrench className="h-4 w-4" />}
          accent="green"
          onClick={() => setActiveModule("sitesExecution")}
        />
        <PulseTile
          label="Pipeline"
          value={pipelineValue}
          display={formatINRShort(pipelineValue)}
          icon={<Zap className="h-4 w-4" />}
          accent="amber"
          onClick={() => setActiveModule("salesPipeline")}
        />
        <PulseTile
          label="Today"
          value={todayActions.length}
          icon={<CalendarClock className="h-4 w-4" />}
          accent="violet"
          onClick={() => setActiveModule("today")}
        />
      </div>
    </section>
  );
}
