"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Ban, Clock, ShieldCheck, CheckCircle2, ChevronRight, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { indiaDate, isDateOnlyOverdue } from "@/lib/rdash/date";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger, } from "@/components/ui/popover";
type HealthItem = {
    key: string;
    label: string;
    count: number;
    tone: "danger" | "warning" | "primary" | "success";
    icon: React.ComponentType<{
        className?: string;
    }>;
    hint: string;
    target: {
        id: string;
        label: string;
        icon: string;
    };
};
export function WorkspaceHealthPill() {
    const db = useRDashStore((s) => s.db);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const [open, setOpen] = React.useState(false);
    const items: HealthItem[] = React.useMemo(() => {
        const now = new Date();
        const openTasks = db.tasks.filter((t) => t.status === "todo" || t.status === "in_progress" || t.status === "review");
        const overdue = openTasks.filter((t) => isDateOnlyOverdue(t.due_date, now));
        const dueToday = openTasks.filter((t) => t.due_date === indiaDate(now));
        const blocked = db.blocked;
        const approvals = db.actions;
        return [
            {
                key: "overdue",
                label: "Overdue",
                count: overdue.length,
                tone: "danger",
                icon: AlertTriangle,
                hint: "Tasks past their due date",
                target: { id: "workdesk", label: "🗂️ Workdesk", icon: "🗂️" },
            },
            {
                key: "blocked",
                label: "Blocked",
                count: blocked.length,
                tone: "warning",
                icon: Ban,
                hint: "Obstacles stopping work",
                target: { id: "workdesk", label: "🗂️ Workdesk", icon: "🗂️" },
            },
            {
                key: "approvals",
                label: "Approvals",
                count: approvals.length,
                tone: "primary",
                icon: ShieldCheck,
                hint: "Decisions awaiting you",
                target: { id: "workdesk", label: "🗂️ Workdesk", icon: "🗂️" },
            },
            {
                key: "dueToday",
                label: "Due today",
                count: dueToday.length,
                tone: "success",
                icon: Clock,
                hint: "Needs same-day attention",
                target: { id: "workdesk", label: "🗂️ Workdesk", icon: "🗂️" },
            },
        ];
    }, [db]);
    const urgentCount = items[0].count + items[1].count;
    const totalActionable = items.reduce((sum, it) => sum + it.count, 0);
    const allClear = totalActionable === 0;
    const toneStyles: Record<HealthItem["tone"], string> = {
        danger: "bg-destructive/10 text-destructive border-destructive/25",
        warning: "bg-warning/10 text-warning border-warning/25",
        primary: "bg-primary/10 text-primary border-primary/25",
        success: "bg-success/10 text-success border-success/25",
    };
    const dotStyles: Record<HealthItem["tone"], string> = {
        danger: "bg-destructive",
        warning: "bg-warning",
        primary: "bg-primary",
        success: "bg-success",
    };
    const jumpTo = (target: HealthItem["target"]) => {
        setActiveModule(target.id);
        setOpen(false);
    };
    return (<TooltipProvider delayDuration={300}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button type="button" aria-label={`Workspace health: ${totalActionable} actionable items (${items[0].count} overdue, ${items[1].count} blocked, ${items[2].count} approvals, ${items[3].count} due today). Click for details.`} className={cn("group relative hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:shadow-card md:inline-flex", allClear
            ? "border-success/30 bg-success/[0.04] text-success"
            : urgentCount > 0
                ? "border-destructive/30 bg-gradient-to-r from-destructive/[0.06] to-warning/[0.04] text-foreground"
                : "border-border text-foreground")}>
                {urgentCount > 0 && (<span className="absolute inset-0 -z-10 rounded-full" style={{
                boxShadow: "0 0 0 0 rgba(var(--primary-rgb, 220 38 38), 0.45)",
                animation: "rd-pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
            }} aria-hidden/>)}
                {allClear ? (<>
                    <CheckCircle2 className="h-3.5 w-3.5"/>
                    <span>All clear</span>
                  </>) : (<>
                    <span className="relative flex h-2 w-2">
                      {urgentCount > 0 && (<span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", urgentCount > 0 ? "bg-destructive" : "bg-warning")}/>)}
                      <span className={cn("relative inline-flex h-2 w-2 rounded-full", urgentCount > 0 ? "bg-destructive" : "bg-warning")}/>
                    </span>
                    <span className="tabular-nums">{totalActionable}</span>
                    <span className="hidden text-muted-foreground lg:inline">actionable</span>
                  </>)}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {allClear
            ? "No overdue, blocked, or pending approval items"
            : `${urgentCount} urgent · ${totalActionable} total actionable`}
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" sideOffset={8} className="rd-pop-in w-80 rounded-[var(--panel-radius)] border-border p-0 shadow-popover">
          <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-transparent px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4"/>
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold">Workspace health</p>
                <p className="text-[10px] text-muted-foreground">
                  {allClear ? "Everything is on track" : `${totalActionable} items need attention`}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => jumpTo({ id: "today", label: "🗂️ Today", icon: "🗂️" })} className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
              Open
              <ChevronRight className="h-3 w-3"/>
            </button>
          </div>
          <div className="rd-scroll max-h-80 overflow-y-auto p-2">
            {items.map((it) => {
            const Icon = it.icon;
            return (<button key={it.key} type="button" onClick={() => jumpTo(it.target)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", toneStyles[it.tone])}>
                    <Icon className="h-4 w-4"/>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{it.label}</p>
                      <span className="tabular-nums text-sm font-bold text-foreground">
                        {it.count}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{it.hint}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"/>
                </button>);
        })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
              {items.map((it) => (<span key={it.key} className="inline-flex items-center gap-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[it.tone])}/>
                  {it.label}
                </span>))}
            </div>
            <span className="hidden lg:inline">Click any row to jump</span>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>);
}
