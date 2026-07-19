"use client";
import * as React from "react";
import { MessageSquare, FileText, CheckCircle2, AlertTriangle, Camera, Gavel, User, ArrowRight, Activity } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  kind: "comment" | "system" | "proof" | "decision" | "alert";
  author: string;
  body: string;
  threadTitle?: string;
  timestamp: string;
  threadId?: string;
}

/**
 * RecentActivityTimeline — a compact vertical timeline showing the most
 * recent conversation messages across all threads. Surfaces who said
 * what, when, and in which thread — giving managers a quick pulse of
 * project communication.
 */
export function RecentActivityTimeline({ onOpenInbox }: { onOpenInbox?: () => void }) {
  const db = useRDashStore((s) => s.db);

  const activities = React.useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const thread of db.threads) {
      for (const msg of thread.messages) {
        items.push({
          id: msg.id,
          kind: msg.kind,
          author: msg.author_name,
          body: msg.body,
          threadTitle: thread.title,
          timestamp: msg.created_at,
          threadId: thread.id,
        });
      }
    }
    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items.slice(0, 15);
  }, [db.threads]);

  const kindConfig: Record<ActivityItem["kind"], { icon: React.ReactNode; color: string; bg: string; ring: string; label: string }> = {
    comment: { icon: <MessageSquare className="h-3 w-3" />, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20", label: "Comment" },
    system: { icon: <Activity className="h-3 w-3" />, color: "text-muted-foreground", bg: "bg-muted", ring: "ring-border", label: "System" },
    proof: { icon: <Camera className="h-3 w-3" />, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", label: "Proof" },
    decision: { icon: <Gavel className="h-3 w-3" />, color: "text-warning", bg: "bg-warning/10", ring: "ring-warning/20", label: "Decision" },
    alert: { icon: <AlertTriangle className="h-3 w-3" />, color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/20", label: "Alert" },
  };

  function formatRelative(ts: string): string {
    const now = Date.now();
    const then = new Date(ts).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  return (
    <section aria-label="Recent activity timeline" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Recent Activity</h3>
            <p className="text-[11px] text-muted-foreground">Latest messages across all threads</p>
          </div>
        </div>
        {onOpenInbox && (
          <button
            type="button"
            onClick={onOpenInbox}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Inbox <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">No recent activity</p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto rd-scroll">
          {activities.map((item, idx) => {
            const cfg = kindConfig[item.kind];
            const isLast = idx === activities.length - 1;
            return (
              <div key={item.id} className="group relative flex gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30">
                {/* Timeline line + node */}
                <div className="flex flex-col items-center">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1", cfg.bg, cfg.color, cfg.ring)}>
                    {cfg.icon}
                  </span>
                  {!isLast && <span className="mt-0.5 w-px flex-1 bg-border" />}
                </div>
                {/* Content */}
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide", cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    <span className="truncate text-xs font-semibold text-foreground">{item.author}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatRelative(item.timestamp)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{item.body}</p>
                  {item.threadTitle && (
                    <p className="mt-0.5 truncate text-[10px] font-medium text-primary/70">
                      <FileText className="mr-0.5 inline h-2.5 w-2.5" />
                      {item.threadTitle}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
