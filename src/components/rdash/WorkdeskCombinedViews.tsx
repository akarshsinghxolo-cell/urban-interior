"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Ban, AlertTriangle, Calendar, Repeat } from "lucide-react";
import { CashMarginRiskModule } from "./modules/RemainingModules";
import { ObstacleThreadsModule } from "./modules/MastersSalesOpsModule";
import { CalendarModule } from "./modules/CalendarModule";
import { RecurringTasksModule } from "./modules/MiscModules";
import { useRDashStore } from "@/lib/rdash/store";
function CombinedShell({ tabs, active, onChange, children, }: {
    tabs: {
        id: string;
        label: string;
        icon: React.ReactNode;
        count?: number;
    }[];
    active: string;
    onChange: (id: string) => void;
    children: React.ReactNode;
}) {
    return (<div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--panel-radius)] border border-border bg-card p-1.5 shadow-card">
        {tabs.map((t) => (<button key={t.id} type="button" onClick={() => onChange(t.id)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all", active === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {t.icon}
            {t.label}
            {t.count != null && t.count > 0 && (<span className={cn("rounded-full px-1.5 text-[10px] font-semibold", active === t.id ? "bg-primary-foreground/20" : "bg-muted")}>
                {t.count}
              </span>)}
          </button>))}
      </div>
      <div className="rd-module-enter" key={active}>
        {children}
      </div>
    </div>);
}
export function BlockedRisksCombined() {
    const db = useRDashStore((s) => s.db);
    const [tab, setTab] = React.useState("blocked");
    const tabs = [
        { id: "blocked", label: "Blocked", icon: <Ban className="h-3.5 w-3.5"/>, count: db.blocked.filter((b) => !b.resolved).length },
        { id: "risk", label: "Risk Watch", icon: <AlertTriangle className="h-3.5 w-3.5"/>, count: db.risks.length },
    ];
    return (<CombinedShell tabs={tabs} active={tab} onChange={setTab}>
      {tab === "blocked" && <ObstacleThreadsModule />}
      {tab === "risk" && <CashMarginRiskModule />}
    </CombinedShell>);
}
export function CalendarRecurringCombined() {
    const [tab, setTab] = React.useState("calendar");
    const tabs = [
        { id: "calendar", label: "Calendar", icon: <Calendar className="h-3.5 w-3.5"/> },
        { id: "recurring", label: "Recurring Tasks", icon: <Repeat className="h-3.5 w-3.5"/> },
    ];
    return (<CombinedShell tabs={tabs} active={tab} onChange={setTab}>
      {tab === "calendar" && <CalendarModule />}
      {tab === "recurring" && <RecurringTasksModule />}
    </CombinedShell>);
}
