"use client";
import * as React from "react";
import { AlertTriangle, ArrowRight, Gavel, FileWarning, Zap, ScrollText, ChevronRight } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { formatINRShort } from "@/lib/rdash/format";
import { indiaDate, isDateOnlyOverdue } from "@/lib/rdash/date";

interface ExceptionItem {
  id: string;
  kind: "direct_award" | "renegotiation" | "variation" | "decision" | "overdue";
  title: string;
  subtitle: string;
  reason?: string;
  actor?: string;
  timestamp: string;
  amount?: number;
  entityLabel?: string;
  onClick?: () => void;
}

/**
 * ExceptionDashboard — a compact, visually rich widget that surfaces
 * operational exceptions: direct-award POs, quotation renegotiations/variations,
 * recent audit decisions, and overdue items. Designed to give managers
 * immediate visibility into "things that broke the normal process".
 */
export function ExceptionDashboard({ onNavigateAudit }: { onNavigateAudit?: () => void }) {
  const db = useRDashStore((s) => s.db);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const exceptions = React.useMemo<ExceptionItem[]>(() => {
    const items: ExceptionItem[] = [];

    // 1. Direct-award POs
    for (const po of db.purchaseOrders) {
      if (po.direct_award || po.award_basis === "direct") {
        items.push({
          id: `da-${po.id}`,
          kind: "direct_award",
          title: `Direct Award: ${po.po_no}`,
          subtitle: po.vendor_name || "Vendor",
          reason: po.award_reason,
          actor: po.award_approved_by,
          timestamp: po.created_at,
          amount: po.total_amount,
          entityLabel: po.po_no,
          onClick: () => setActiveModule("procurement"),
        });
      }
    }

    // 2. Quotation renegotiations and variations
    for (const q of db.quotations) {
      if (q.revision_kind === "renegotiation" || q.revision_kind === "variation") {
        items.push({
          id: `rev-${q.id}`,
          kind: q.revision_kind,
          title: `${q.revision_kind === "renegotiation" ? "Renegotiation" : "Variation"}: ${q.quotation_no}`,
          subtitle: q.customer_name || "Customer",
          reason: q.revision_reason,
          actor: q.revision_approved_by,
          timestamp: q.created_at,
          amount: q.total_amount,
          entityLabel: q.quotation_no,
          onClick: () => setActiveModule("quotationDesk"),
        });
      }
    }

    // 3. Recent audit decisions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    for (const log of db.auditLog) {
      if (log.kind === "decision" && new Date(log.timestamp) >= sevenDaysAgo) {
        items.push({
          id: `dec-${log.id}`,
          kind: "decision",
          title: log.action,
          subtitle: log.entity_label || log.entity_type,
          reason: log.reason,
          actor: log.actor,
          timestamp: log.timestamp,
          onClick: onNavigateAudit,
        });
      }
    }

    // 4. Overdue tasks (top 3)
    const overdueTasks = db.tasks
      .filter((t) => isDateOnlyOverdue(t.due_date) && (t.status === "todo" || t.status === "in_progress"))
      .slice(0, 3);
    for (const t of overdueTasks) {
      items.push({
        id: `od-${t.id}`,
        kind: "overdue",
        title: t.title,
        subtitle: `Due ${t.due_date}`,
        timestamp: `${t.due_date}T00:00:00`,
        onClick: () => setActiveModule("tasks"),
      });
    }

    // Sort by timestamp descending (most recent first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items.slice(0, 12);
  }, [db.purchaseOrders, db.quotations, db.auditLog, db.tasks, setActiveModule, onNavigateAudit]);

  // Count by kind
  const counts = React.useMemo(() => {
    const c = { direct_award: 0, renegotiation: 0, variation: 0, decision: 0, overdue: 0 };
    for (const item of exceptions) c[item.kind]++;
    return c;
  }, [exceptions]);

  const totalExceptions = exceptions.length;

  const kindConfig: Record<ExceptionItem["kind"], { icon: React.ReactNode; color: string; bg: string; border: string; label: string }> = {
    direct_award: { icon: <Zap className="h-3.5 w-3.5" />, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20", label: "Direct Award" },
    renegotiation: { icon: <FileWarning className="h-3.5 w-3.5" />, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "Renegotiation" },
    variation: { icon: <FileWarning className="h-3.5 w-3.5" />, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", label: "Variation" },
    decision: { icon: <Gavel className="h-3.5 w-3.5" />, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", label: "Decision" },
    overdue: { icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", label: "Overdue" },
  };

  // "Next Step" action labels — tells the user the immediate action needed for
  // each exception kind, so they can triage without reading the full description.
  // Color-coded: green = approve/confirm, blue = review, amber = follow up,
  // red = resolve urgently.
  const nextStepConfig: Record<ExceptionItem["kind"], { label: string; className: string }> = {
    direct_award: { label: "Review", className: "bg-primary/10 text-primary ring-1 ring-primary/20" },
    renegotiation: { label: "Follow up", className: "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400" },
    variation: { label: "Approve", className: "bg-success/10 text-success ring-1 ring-success/20" },
    decision: { label: "Decide", className: "bg-primary/10 text-primary ring-1 ring-primary/20" },
    overdue: { label: "Resolve", className: "bg-destructive/10 text-destructive ring-1 ring-destructive/20" },
  };

  return (
    <section aria-label="Exception dashboard" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive ring-1 ring-destructive/20">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Exceptions &amp; Decisions</h3>
            <p className="text-[11px] text-muted-foreground">Operational exceptions that broke the normal process</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", totalExceptions > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
            {totalExceptions} {totalExceptions === 1 ? "item" : "items"}
          </span>
          {onNavigateAudit && (
            <button type="button" onClick={onNavigateAudit} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ScrollText className="h-3.5 w-3.5" /> Audit log
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Summary tiles — zero counts show "—" instead of "0" for clearer
          visual distinction between "nothing here" and "has items". */}
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-5">
        {(Object.keys(kindConfig) as Array<ExceptionItem["kind"]>).map((kind) => {
          const cfg = kindConfig[kind];
          const count = counts[kind];
          const isEmpty = count === 0;
          return (
            <div key={kind} className={cn("flex flex-col gap-1 px-3 py-2.5 bg-card transition-colors", !isEmpty && cfg.bg)}>
              <div className="flex items-center gap-1.5">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded", !isEmpty ? cfg.color : "text-muted-foreground/40")}>{cfg.icon}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{cfg.label}</span>
              </div>
              <span
                className={cn("rd-tabular text-lg font-bold leading-none", isEmpty ? "text-muted-foreground/40" : cfg.color)}
                title={isEmpty ? `No ${cfg.label.toLowerCase()} items` : `${count} ${cfg.label.toLowerCase()} item${count === 1 ? "" : "s"}`}
              >
                {isEmpty ? "—" : count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Exception list */}
      {exceptions.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
            <AlertTriangle className="h-5 w-5 text-success" />
          </div>
          <p className="text-sm font-semibold text-foreground">No exceptions to review</p>
          <p className="mt-0.5 text-xs text-muted-foreground">All processes are following the standard workflow.</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto rd-scroll">
          {exceptions.map((item) => {
            const cfg = kindConfig[item.kind];
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="group flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1", cfg.bg, cfg.color, cfg.border)}>
                  {cfg.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    {/* "Next Step" action tag — color-coded so users know the
                        immediate action needed without reading the full row. */}
                    {(() => {
                      const ns = nextStepConfig[item.kind];
                      return ns ? (
                        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", ns.className)}>
                          {ns.label}
                        </span>
                      ) : null;
                    })()}
                    <p className="truncate text-xs font-semibold text-foreground">{item.title}</p>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{item.subtitle}</span>
                    {item.reason && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="truncate italic">"{item.reason}"</span>
                      </>
                    )}
                    {item.actor && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="shrink-0 font-medium text-muted-foreground">by {item.actor}</span>
                      </>
                    )}
                  </div>
                </div>
                {item.amount !== undefined && item.amount > 0 && (
                  <span className="shrink-0 rd-tabular text-xs font-bold text-foreground">
                    {formatINRShort(item.amount)}
                  </span>
                )}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
