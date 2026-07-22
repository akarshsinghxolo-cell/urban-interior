"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Users, Wrench, FileText, AlertTriangle, Wallet, CalendarClock } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINRShort } from "@/lib/rdash/format";
import { indiaDate } from "@/lib/rdash/date";
import { AnimatedCounter } from "./AnimatedHealthRing";

/**
 * MobileQuickStats — a compact 2×3 grid of animated stat tiles designed for
 * mobile screens. Shows the most important at-a-glance metrics.
 *
 * Features:
 * - 6 animated counter tiles (customers, live work, quotes, overdue, cash, visits)
 * - Color-coded by tone
 * - Click to navigate to relevant module
 * - Responsive: 2 cols on mobile, 3 on sm
 * - Tabular-nums for alignment
 */
export function MobileQuickStats() {
  const db = useRDashStore((s) => s.db);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const stats = React.useMemo(() => {
    const today = indiaDate();
    return [
      { label: "Customers", value: db.customers.length, icon: Users, tone: "primary" as const, module: "customerDesk" },
      { label: "Live Work", value: db.workOrders.filter((w: any) => w.status === "in_progress" || w.status === "scheduled").length, icon: Wrench, tone: "success" as const, module: "siteExecution" },
      { label: "Quotes", value: db.quotations.length, icon: FileText, tone: "default" as const, module: "quotationDesk" },
      { label: "Overdue", value: db.tasks.filter((t: any) => t.status !== "completed" && t.status !== "cancelled" && t.due_date < today).length, icon: AlertTriangle, tone: "destructive" as const, module: "tasks" },
      { label: "Today Visits", value: db.visits.filter((v: any) => v.scheduled_at?.slice(0, 10) === today).length, icon: CalendarClock, tone: "warning" as const, module: "fieldOperations" },
      { label: "Cash", value: (db.customerReceipts || []).reduce((s: number, r: any) => s + (r.amount || 0), 0), icon: Wallet, tone: "primary" as const, module: "financeOverview", format: "currency" as const },
    ];
  }, [db]);

  const toneClass = {
    primary: "bg-primary/5 text-primary border-primary/20",
    success: "bg-success/5 text-success border-success/20",
    warning: "bg-warning/5 text-warning border-warning/20",
    destructive: "bg-destructive/5 text-destructive border-destructive/20",
    default: "bg-muted/30 text-foreground border-border/50",
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:hidden">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <button
            key={stat.label}
            type="button"
            onClick={() => setActiveModule(stat.module)}
            className={cn("flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-all active:scale-95", toneClass[stat.tone])}
          >
            <Icon className="h-3.5 w-3.5 opacity-70" />
            <p className="text-sm font-bold tabular-nums">
              {stat.format === "currency" ? (
                <span>{formatINRShort(stat.value)}</span>
              ) : (
                <AnimatedCounter value={stat.value} />
              )}
            </p>
            <span className="text-[9px] font-medium uppercase tracking-wide opacity-70">{stat.label}</span>
          </button>
        );
      })}
    </div>
  );
}
