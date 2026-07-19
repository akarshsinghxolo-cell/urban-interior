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

const KIND_CONFIG: Record<string, { icon: LucideIcon; tone: string; bg: string }> = {
  create: { icon: PlusCircle, tone: "text-success", bg: "bg-success/10" },
  update: { icon: Activity, tone: "text-primary", bg: "bg-primary/10" },
  approve: { icon: CheckCircle2, tone: "text-success", bg: "bg-success/10" },
  send: { icon: FileText, tone: "text-primary", bg: "bg-primary/10" },
  receive: { icon: TrendingUp, tone: "text-success", bg: "bg-success/10" },
  comment: { icon: MessageSquare, tone: "text-muted-foreground", bg: "bg-muted" },
  decision: { icon: ShieldAlert, tone: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  alert: { icon: ShieldAlert, tone: "text-destructive", bg: "bg-destructive/10" },
  system: { icon: Activity, tone: "text-muted-foreground", bg: "bg-muted" },
  delete: { icon: Trash2, tone: "text-destructive", bg: "bg-destructive/10" },
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

  return (
    <section
      aria-label="Recent activity feed"
      className="flex flex-col overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/[0.04] to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold leading-tight">Recent Activity</h3>
            <p className="text-[10px] text-muted-foreground">Latest workspace events</p>
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
            {entries.map((entry) => {
              const cfg = KIND_CONFIG[entry.kind] || KIND_CONFIG.system;
              const Icon = cfg.icon;
              const entityLabel = entry.entity_label || shortEntityType(entry.entity_type);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setActiveModule(entry.source_module || "auditLog")}
                    className="group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                    title={entry.reason || entry.action}
                  >
                    {/* Actor avatar */}
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", avatarColor(entry.actor))}>
                      {initials(entry.actor)}
                    </span>
                    {/* Kind icon */}
                    <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md", cfg.bg)}>
                      <Icon className={cn("h-3 w-3", cfg.tone)} />
                    </span>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs leading-snug">
                        <span className="font-semibold text-foreground">{entry.actor}</span>{" "}
                        <span className="text-muted-foreground">{entry.action.toLowerCase()}</span>
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-medium text-foreground/70">
                          {entityLabel}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="rd-tabular">{timeAgo(entry.timestamp)}</span>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground/60" />
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
