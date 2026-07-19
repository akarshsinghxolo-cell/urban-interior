"use client";

import * as React from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileText,
  MessageSquare,
  PlusCircle,
  ShieldAlert,
  Trash2,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";

/**
 * ActivityFeedWidget — a compact, premium "what just happened" card showing
 * the last 6 audit-log entries. Each entry renders with:
 *   - a colored actor-initials avatar (deterministic color from name)
 *   - a kind-specific icon (create/approve/decision/alert/etc.)
 *   - a one-line summary (actor + action + entity label)
 *   - a relative timestamp ("2m ago")
 *   - click-to-deep-link to the Audit Log module
 *
 * This complements the RecentActivityTimeline (which shows thread messages)
 * by surfacing operational events — POs created, quotations accepted,
 * variations raised, payments made, etc.
 *
 * Design: a fixed-height card (max-h-72) with a scrollable list, a header
 * with a "View all" link, and an empty-state for workspaces with no audit
 * entries. Hover states on each row for scannability.
 */

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actor_role?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  entity_label?: string;
  kind: string;
  source_module?: string;
  reason?: string;
}

const KIND_CONFIG: Record<string, { icon: LucideIcon; tone: string; bg: string; urgency: "high" | "medium" | "low" }> = {
  // urgency: "high" (red dot — alert/delete), "medium" (amber — decision),
  // "low" (no dot — routine create/update/approve/etc.). Lets users triage
  // the feed at a glance without reading every row.
  create: { icon: PlusCircle, tone: "text-success", bg: "bg-success/10", urgency: "low" as const },
  update: { icon: Activity, tone: "text-primary", bg: "bg-primary/10", urgency: "low" as const },
  approve: { icon: CheckCircle2, tone: "text-success", bg: "bg-success/10", urgency: "low" as const },
  send: { icon: FileText, tone: "text-primary", bg: "bg-primary/10", urgency: "low" as const },
  receive: { icon: TrendingUp, tone: "text-success", bg: "bg-success/10", urgency: "low" as const },
  comment: { icon: MessageSquare, tone: "text-muted-foreground", bg: "bg-muted", urgency: "low" as const },
  decision: { icon: ShieldAlert, tone: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", urgency: "medium" as const },
  alert: { icon: ShieldAlert, tone: "text-destructive", bg: "bg-destructive/10", urgency: "high" as const },
  system: { icon: Activity, tone: "text-muted-foreground", bg: "bg-muted", urgency: "low" as const },
  delete: { icon: Trash2, tone: "text-destructive", bg: "bg-destructive/10", urgency: "high" as const },
};

const URGENCY_DOT: Record<"high" | "medium" | "low", string> = {
  high: "bg-destructive",
  medium: "bg-amber-500",
  low: "",
};

// Deterministic avatar color from a name string (stable across renders).
const AVATAR_COLORS = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-violet-600/15 text-violet-600 dark:text-violet-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-cyan-600/15 text-cyan-600 dark:text-cyan-400",
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

// Shorten an entity type for display (e.g., "purchase_order" → "PO").
function shortEntityType(t: string): string {
  const map: Record<string, string> = {
    purchase_order: "PO",
    work_order: "WO",
    quotation: "Quote",
    invoice: "Invoice",
    customer: "Customer",
    site: "Site",
    vendor: "Vendor",
    contractor: "Contractor",
    vendor_rate: "Rate",
    payment: "Payment",
    grn: "GRN",
    task: "Task",
    visit: "Visit",
    followup: "Follow-up",
  };
  return map[t] || t.replace(/_/g, " ");
}

export function ActivityFeedWidget() {
  const db = useRDashStore((s) => s.db);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const entries = React.useMemo<AuditEntry[]>(() => {
    return [...(db.auditLog || [])]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        actor: e.actor || "system",
        actor_role: e.actor_role,
        action: e.action,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        entity_label: e.entity_label,
        kind: e.kind,
        source_module: e.source_module,
        reason: e.reason,
      }));
  }, [db.auditLog]);

  // New-entry detection: track the most-recent entry ID across renders. When a
  // fresh entry appears at position 0 (one we haven't seen before), mark it as
  // "isNew" so it gets a slide-in + flash animation. The animation is a one-shot
  // (the flag clears after the render). This gives the feed a true real-time feel.
  const prevTopIdRef = React.useRef<string | null>(null);
  const [newEntryId, setNewEntryId] = React.useState<string | null>(null);
  React.useEffect(() => {
    const topId = entries[0]?.id ?? null;
    if (topId && topId !== prevTopIdRef.current && prevTopIdRef.current !== null) {
      setNewEntryId(topId);
      // Clear the flag after the animation completes (1.2s) so it doesn't replay.
      const t = setTimeout(() => setNewEntryId(null), 1200);
      prevTopIdRef.current = topId;
      return () => clearTimeout(t);
    }
    if (topId) prevTopIdRef.current = topId;
  }, [entries]);

  return (
    <section
      aria-label="Recent activity feed"
      className="flex flex-col overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/[0.04] to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
            {/* Subtle pulsing dot on the header icon to signal "live feed" */}
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success ring-1 ring-card" />
            </span>
          </span>
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold leading-tight">
              Recent Activity
              <span className="rd-tabular rounded-full bg-muted/70 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                {entries.length}
              </span>
            </h3>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-1 w-1 rounded-full bg-success" />
              Live workspace events
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveModule("auditLog")}
          className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          View all
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-xs font-semibold text-muted-foreground">No activity yet</p>
          <p className="text-[10px] text-muted-foreground/70">Workspace events will appear here as they happen.</p>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto rd-scroll">
          <ul className="divide-y divide-border/60">
            {entries.map((entry, idx) => {
              const cfg = KIND_CONFIG[entry.kind] || KIND_CONFIG.system;
              const Icon = cfg.icon;
              const entityLabel = entry.entity_label || shortEntityType(entry.entity_type);
              // "Live" indicator: the most recent entry (idx === 0) is "live"
              // if it occurred within the last 60 seconds. Renders a pulsing
              // green dot on the avatar to signal real-time freshness.
              const entryAgeMs = Date.now() - new Date(entry.timestamp).getTime();
              const isLive = idx === 0 && entryAgeMs < 60_000;
              const isNew = entry.id === newEntryId;
              return (
                <li
                  key={entry.id}
                  className={cn(
                    isLive && "bg-success/[0.03]",
                    // New-entry animation: slide-in from left + brief green flash.
                    // The animation runs once (1.2s) then the flag clears.
                    isNew && "rd-activity-enter",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveModule(entry.source_module || "auditLog")}
                    className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:gap-2.5 sm:py-2.5"
                    title={entry.reason || entry.action}
                  >
                    {/* Actor avatar with optional live indicator.
                        Larger on mobile (h-9 w-9) for better tap targets +
                        visual weight; compact (h-7 w-7) on sm+. */}
                    <span className="relative shrink-0">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-sm ring-1 ring-background sm:h-7 sm:w-7 sm:text-[10px]", avatarColor(entry.actor))}>
                        {initials(entry.actor)}
                      </span>
                      {isLive ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success ring-1 ring-card" />
                        </span>
                      ) : null}
                    </span>
                    {/* Kind icon — slightly larger on mobile for visibility.
                        Urgency dot overlay: red (high), amber (medium), none (low). */}
                    <span className="relative mt-1 shrink-0 sm:mt-0.5">
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md shadow-sm sm:h-5 sm:w-5", cfg.bg)}>
                        <Icon className={cn("h-3 w-3", cfg.tone)} />
                      </span>
                      {cfg.urgency !== "low" ? (
                        <span
                          className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-1 ring-card", URGENCY_DOT[cfg.urgency])}
                          title={cfg.urgency === "high" ? "High urgency" : "Needs decision"}
                          aria-label={cfg.urgency === "high" ? "High urgency" : "Needs decision"}
                        />
                      ) : null}
                    </span>
                    {/* Content — slightly larger text on mobile for readability */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-snug sm:text-xs">
                        <span className="font-semibold text-foreground">{entry.actor}</span>{" "}
                        <span className="text-muted-foreground">{entry.action.toLowerCase()}</span>
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground sm:mt-0.5 sm:text-[10px]">
                        <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-medium text-foreground/70">
                          {entityLabel}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="rd-tabular">{timeAgo(entry.timestamp)}</span>
                        {isLive ? (
                          <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-success">
                            <span className="h-1 w-1 rounded-full bg-success" /> Live
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ArrowRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground/60 sm:mt-1 sm:h-3 sm:w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
