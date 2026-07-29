"use client";

import * as React from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, History, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { EmptyState, MetricCard } from "./primitives";

export type EntityHistoryKind = "visit" | "workOrder";

type HistoryEvent = {
  id: string;
  timestamp: string;
  actor: string;
  actorRole?: string;
  action: string;
  kind: string;
  source: "audit" | "thread";
  entityLabel?: string;
};

function normalizeEntityType(value?: string) {
  const normalized = (value || "").replaceAll("-", "_").toLowerCase();
  const aliases: Record<string, string> = {
    work_order: "workOrder",
    workorder: "workOrder",
    purchase_order: "po",
    vendor_bill: "vendorBill",
    execution_log: "executionLog",
  };
  return aliases[normalized] || value || normalized;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function relativeTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatTimestamp(value);
}

function eventTone(kind: string) {
  if (["approve", "receive", "proof", "create"].includes(kind)) {
    return "border-success/25 bg-success/10 text-success";
  }
  if (["alert", "delete", "rejected"].includes(kind)) {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (["decision", "send"].includes(kind)) {
    return "border-warning/25 bg-warning/10 text-warning";
  }
  return "border-primary/20 bg-primary/10 text-primary";
}

export function EntityHistoryPanel({
  kind,
  id,
}: {
  kind: EntityHistoryKind;
  id: string;
}) {
  const db = useRDashStore((state) => state.db);

  const events = React.useMemo(() => {
    const related = new Set<string>();
    const threadIds = new Set<string>();
    const addTarget = (entityType: string, entityId?: string, threadId?: string) => {
      if (entityId) related.add(`${normalizeEntityType(entityType)}:${entityId}`);
      if (threadId) threadIds.add(threadId);
    };

    if (kind === "visit") {
      const visit = db.visits.find((record) => record.id === id);
      addTarget("visit", id, visit?.thread_id);
    } else {
      const workOrder = db.workOrders.find((record) => record.id === id);
      addTarget("workOrder", id, workOrder?.thread_id);
      db.boqs.filter((record) => record.work_order_id === id).forEach((record) => addTarget("boq", record.id, record.thread_id));
      db.purchaseOrders.filter((record) => record.work_order_id === id).forEach((record) => addTarget("po", record.id, record.thread_id));
      db.grns.filter((record) => record.work_order_id === id).forEach((record) => addTarget("grn", record.id, record.thread_id));
      db.dispatches.filter((record) => record.work_order_id === id).forEach((record) => addTarget("dispatch", record.id, record.thread_id));
      db.executionLogs.filter((record) => record.work_order_id === id).forEach((record) => addTarget("executionLog", record.id, record.thread_id));
      db.drawings.filter((record) => record.work_order_id === id).forEach((record) => addTarget("drawing", record.id, record.thread_id));
    }

    const timeline: HistoryEvent[] = [];

    db.auditLog.forEach((entry) => {
      const key = `${normalizeEntityType(entry.entity_type)}:${entry.entity_id || ""}`;
      if (!related.has(key)) return;
      timeline.push({
        id: `audit:${entry.id}`,
        timestamp: entry.timestamp,
        actor: entry.actor,
        actorRole: entry.actor_role,
        action: entry.action,
        kind: entry.kind,
        source: "audit",
        entityLabel: entry.entity_label,
      });
    });

    db.threads.forEach((thread) => {
      const key = `${normalizeEntityType(thread.record_type)}:${thread.record_id}`;
      if (!related.has(key) && !threadIds.has(thread.id)) return;
      thread.messages.forEach((message) => {
        timeline.push({
          id: `thread:${message.id}`,
          timestamp: message.created_at,
          actor: message.author_name,
          actorRole: message.author_role,
          action: message.body,
          kind: message.kind,
          source: "thread",
          entityLabel: thread.title,
        });
      });
    });

    return timeline
      .filter((event) => event.timestamp)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [db, id, kind]);

  const decisionCount = events.filter((event) => ["decision", "approve"].includes(event.kind)).length;
  const alertCount = events.filter((event) => event.kind === "alert").length;
  const proofCount = events.filter((event) => event.kind === "proof" || event.kind === "receive").length;

  return (
    <div className="min-h-full bg-card p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold">
            {kind === "visit" ? "Visit History" : "Work Order History"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Audit events, status decisions, proofs and linked operational conversations.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Events" value={events.length} tone="primary" icon={<Activity className="h-3.5 w-3.5" />} />
        <MetricCard label="Decisions" value={decisionCount} tone="warning" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
        <MetricCard label="Proof / receipt" value={proofCount} tone="success" icon={<MessageSquare className="h-3.5 w-3.5" />} />
        <MetricCard label="Alerts" value={alertCount} tone="destructive" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
      </div>

      {events.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No history recorded yet"
            description="Status changes, audit events and thread decisions will appear here automatically."
            icon={<History className="h-8 w-8" />}
          />
        </div>
      ) : (
        <ol className="relative mt-4 space-y-2 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-border">
          {events.map((event) => (
            <li key={event.id} className="relative flex items-start gap-3 rounded-lg border border-border bg-background p-3 shadow-xs">
              <span
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-black uppercase",
                  eventTone(event.kind),
                )}
              >
                {event.source === "thread" ? "M" : event.kind === "alert" ? "!" : event.kind === "decision" || event.kind === "approve" ? "✓" : "•"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-foreground">{event.action}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground/80">{event.actor}</span>
                  {event.actorRole ? <span>· {event.actorRole}</span> : null}
                  {event.entityLabel ? <span className="truncate">· {event.entityLabel}</span> : null}
                  <span className="inline-flex items-center gap-1" title={formatTimestamp(event.timestamp)}>
                    <Clock3 className="h-2.5 w-2.5" />
                    {relativeTimestamp(event.timestamp)}
                  </span>
                  <span>· {event.source === "thread" ? "Thread" : "Audit"}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
