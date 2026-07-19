"use client";
import * as React from "react";
import { Activity, ArrowUpRight, CalendarClock, FileText, PhoneCall, PlusCircle, Sparkles, Users, Wrench, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINRShort } from "@/lib/rdash/format";
import { useRDashStore } from "@/lib/rdash/store";
import { indiaDate } from "@/lib/rdash/date";
import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";

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
  const [health, setHealth] = React.useState<{
    badge: "healthy" | "watch" | "attention";
    attentionCount: number;
    integrityScore: number;
  } | null>(null);
  React.useEffect(() => {
    let active = true;
    const fetchHealth = async () => {
      try {
        const { getSessionToken } = await import("@/lib/rdash/client-auth");
        const token = getSessionToken();
        const res = await fetch("/api/health/summary", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setHealth({
          badge: data.healthBadge,
          attentionCount: data.attentionCount,
          integrityScore: data.integrity?.healthScore ?? 100,
        });
      } catch {
        // Non-fatal — greeting falls back to the static "Live" badge.
      }
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);

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
                <button
                  type="button"
                  onClick={() => setActiveModule(health?.badge === "healthy" ? "integrity" : "blockedRisks")}
                  className={cn(
                    "hidden items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 transition-colors hover:opacity-80 sm:inline-flex",
                    health.badge === "healthy"
                      ? "bg-success/10 text-success ring-success/20"
                      : health.badge === "watch"
                        ? "bg-warning/10 text-warning ring-warning/20"
                        : "bg-destructive/10 text-destructive ring-destructive/20",
                  )}
                  title={healthMsg.text}
                >
                  <span className="rd-tabular">{healthMsg.icon}</span>
                  {healthMsg.text}
                </button>
              ) : (
                <span className="hidden items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success ring-1 ring-success/20 sm:inline-flex">
                  <Activity className="h-2.5 w-2.5" /> Live
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3 shrink-0" />
              <span className="whitespace-nowrap">{dateStr}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="rd-tabular font-semibold text-foreground/80">{timeStr}</span>
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
              className="group inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-all duration-150 hover:bg-primary/5 hover:text-primary hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
