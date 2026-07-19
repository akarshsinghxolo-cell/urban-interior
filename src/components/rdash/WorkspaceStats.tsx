"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Users, Briefcase, MessageSquare, MapPin } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
export function WorkspaceStats() {
    const db = useRDashStore((s) => s.db);
    const sparkline = React.useMemo(() => {
        const days: number[] = new Array(7).fill(0);
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        const dayMs = 86400000;
        db.auditLog.forEach((entry) => {
            const ts = new Date(entry.timestamp || "");
            if (isNaN(ts.getTime()))
                return;
            const daysAgo = Math.floor((now.getTime() - ts.getTime()) / dayMs);
            if (daysAgo >= 0 && daysAgo < 7) {
                days[6 - daysAgo]++;
            }
        });
        return days;
    }, [db.auditLog]);
    const maxVal = Math.max(...sparkline, 1);
    const stats = [
        {
            label: "Customers",
            value: db.customers.length,
            icon: Users,
            tone: "text-primary",
            bg: "bg-primary/10",
            barBg: "bg-primary",
            data: sparkline,
        },
        {
            label: "Live workOrders",
            value: db.workOrders.filter((j) => j.status === "in_progress" || j.status === "scheduled").length,
            icon: Briefcase,
            tone: "text-success",
            bg: "bg-success/10",
            barBg: "bg-success",
            data: sparkline.map((v) => Math.max(0, v - 1)),
        },
        {
            label: "Visits (7d)",
            value: db.visits.filter((v) => {
                const d = new Date(v.scheduled_at);
                const weekAgo = new Date(Date.now() - 7 * 86400000);
                return d >= weekAgo;
            }).length,
            icon: MapPin,
            tone: "text-warning",
            bg: "bg-warning/10",
            barBg: "bg-warning",
            data: sparkline.map((v) => Math.floor(v / 2)),
        },
        {
            label: "Threads",
            value: db.threads.length,
            icon: MessageSquare,
            tone: "text-primary",
            bg: "bg-primary/10",
            barBg: "bg-primary",
            data: sparkline.map((v) => Math.max(0, v - 2)),
        },
    ];
    return (<section aria-label="Workspace stats" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {stats.map((s) => {
            const Icon = s.icon;
            return (<div key={s.label} className="rd-card-hover group flex items-center gap-2.5 rounded-[var(--panel-radius)] border border-border bg-card p-2.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", s.bg, s.tone)}>
              <Icon className="h-4 w-4"/>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="rd-tabular truncate text-sm font-bold text-foreground">{s.value}</p>
            </div>
            <div className="flex h-8 items-end gap-0.5" aria-hidden>
              {s.data.map((v, i) => (<span key={i} className={cn("w-1 rounded-full transition-all duration-300 group-hover:opacity-80", s.barBg, v === 0 && "opacity-20")} style={{ height: `${Math.max(2, (v / maxVal) * 100)}%`, opacity: v === 0 ? 0.15 : 0.4 + (v / maxVal) * 0.6 }}/>))}
            </div>
          </div>);
        })}
    </section>);
}
