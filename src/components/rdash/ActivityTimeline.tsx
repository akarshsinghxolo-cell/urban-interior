"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Plus, Pencil, CheckCircle2, Send, Download, MessageSquare, Gavel, AlertTriangle, Settings, Trash2, ChevronRight, Activity, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { relativeTime } from "@/lib/rdash/format";
import type { LucideIcon } from "lucide-react";
const KIND_META: Record<string, {
    icon: LucideIcon;
    tone: string;
    bg: string;
}> = {
    create: { icon: Plus, tone: "text-success", bg: "bg-success/10" },
    update: { icon: Pencil, tone: "text-primary", bg: "bg-primary/10" },
    approve: { icon: CheckCircle2, tone: "text-success", bg: "bg-success/10" },
    send: { icon: Send, tone: "text-primary", bg: "bg-primary/10" },
    receive: { icon: Download, tone: "text-success", bg: "bg-success/10" },
    comment: { icon: MessageSquare, tone: "text-muted-foreground", bg: "bg-muted" },
    decision: { icon: Gavel, tone: "text-warning", bg: "bg-warning/10" },
    alert: { icon: AlertTriangle, tone: "text-destructive", bg: "bg-destructive/10" },
    system: { icon: Settings, tone: "text-muted-foreground", bg: "bg-muted" },
    delete: { icon: Trash2, tone: "text-destructive", bg: "bg-destructive/10" },
};
export function ActivityTimeline({ limit = 6 }: {
    limit?: number;
}) {
    const db = useRDashStore((s) => s.db);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const entries = React.useMemo(() => {
        return [...db.auditLog]
            .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
            .slice(0, limit);
    }, [db.auditLog, limit]);
    if (entries.length === 0) {
        return (<section aria-label="Activity timeline" className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary"/>
          <h3 className="text-sm font-semibold">Recent activity</h3>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">No activity yet.</p>
      </section>);
    }
    return (<section aria-label="Activity timeline" className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-4 w-4"/>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            <p className="text-[10px] text-muted-foreground">Last {entries.length} workspace actions</p>
          </div>
        </div>
        <button type="button" onClick={() => setActiveModule("auditLog")} className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
          View all
          <ChevronRight className="h-3 w-3"/>
        </button>
      </div>

      <ol className="relative flex flex-col gap-0">
        <span className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden/>

        {entries.map((entry, i) => {
            const meta = KIND_META[entry.kind] || KIND_META.system;
            const Icon = meta.icon;
            return (<li key={entry.id || `${entry.timestamp}-${i}`} className="rd-module-enter relative flex items-start gap-3 py-1.5 pl-0" style={{ animationDelay: `${i * 30}ms` }}>
              <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-card shadow-sm", meta.bg, meta.tone)}>
                <Icon className="h-3.5 w-3.5"/>
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="line-clamp-2 text-xs font-medium text-foreground">{entry.action}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground">
                  <span className="font-medium">{entry.actor}</span>
                  <span aria-hidden>·</span>
                  <span>{relativeTime(new Date(entry.timestamp).getTime())}</span>
                  {entry.entity_type && (<>
                      <span aria-hidden>·</span>
                      <span className="capitalize">{entry.entity_type}</span>
                    </>)}
                </div>
              </div>
            </li>);
        })}
      </ol>
    </section>);
}
