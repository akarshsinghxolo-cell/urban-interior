"use client";
import * as React from "react";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatINRShort } from "@/lib/rdash/format";
import { actualCashEntries, cashFlowDays } from "@/lib/rdash/store/finance-helpers";
import { indiaDate } from "@/lib/rdash/date";
import { addDays } from "@/lib/rdash/store/helpers";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * Cash Flow Chart — animated recharts AreaChart showing the last 7 days of
 * inflows (customer receipts) vs outflows (vendor + contractor payments).
 *
 * CRON-4: Upgraded from pure CSS bars to recharts AreaChart with:
 * - Smooth animated area gradients (success green / destructive red)
 * - Interactive tooltip with formatted INR values
 * - Cartesian grid for readability
 * - Responsive container (adapts to parent width)
 * - Legend with color swatches
 */
// CRON-4: Custom tooltip for formatted INR values (declared outside render)
function CashFlowTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg">
            <p className="mb-1.5 text-xs font-bold">{label}</p>
            {payload.map((entry: any) => (
                <p key={entry.dataKey} className="flex items-center gap-1.5 text-[11px]">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                    <span className="capitalize text-muted-foreground">{entry.dataKey}:</span>
                    <span className="font-mono font-semibold tabular-nums">{formatINR(entry.value)}</span>
                </p>
            ))}
        </div>
    );
}

export function CashFlowChart() {
    const db = useRDashStore((s) => s.db);

    const openDetail = useRDashStore(s => s.openDetail);
    const setActiveModule = useRDashStore(s => s.setActiveModule);
    const [clock, setClock] = React.useState(Date.now);
    React.useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);
    const date = indiaDate(new Date(clock));
    const entries = React.useMemo(() => actualCashEntries(db), [db]);
    const start = addDays(date, -6);
    const recent = entries.filter(e => e.date >= start && e.date <= date);
    const data = React.useMemo(() => cashFlowDays(entries, start, 7), [entries, start]);

    const totalInflow = data.reduce((n, d) => n + d.inflow, 0);
    const totalOutflow = data.reduce((n, d) => n + d.outflow, 0);
    const netFlow = totalInflow - totalOutflow;

    return (
    <div className="rounded-[var(--panel-radius)] border border-border bg-gradient-to-br from-card to-muted/10 p-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-4 w-4"/>
          </span>
          <div>
            <h3 className="text-sm font-bold">7-Day Cash Flow</h3>
            <p className="text-[10px] text-muted-foreground">Confirmed receipts, supplier payments, salaries and commissions · IST</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-right">
            <p className="flex items-center gap-1 text-success"><TrendingUp className="h-3 w-3"/>{formatINRShort(totalInflow)}</p>
            <p className="text-[10px] text-muted-foreground">inflow</p>
          </div>
          <div className="text-right">
            <p className="flex items-center gap-1 text-destructive"><TrendingDown className="h-3 w-3"/>{formatINRShort(totalOutflow)}</p>
            <p className="text-[10px] text-muted-foreground">outflow</p>
          </div>
          <div className="text-right">
            <p className={cn("font-bold tabular-nums", netFlow >= 0 ? "text-success" : "text-destructive")}>{formatINRShort(netFlow)}</p>
            <p className="text-[10px] text-muted-foreground">net</p>
          </div>
        </div>
      </div>

      {/* CRON-4: Animated recharts AreaChart */}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--success, #22c55e)" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="var(--success, #22c55e)" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--destructive, #ef4444)" stopOpacity={0.35}/>
                <stop offset="95%" stopColor="var(--destructive, #ef4444)" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--muted-foreground, #71717a)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground, #71717a)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatINRShort(v)}
              width={50}
            />
            <Tooltip content={<CashFlowTooltip />} />
            <Area
              type="monotone"
              dataKey="inflow"
              stroke="var(--success, #22c55e)"
              strokeWidth={2}
              fill="url(#inflowGradient)"
              animationDuration={800}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="outflow"
              stroke="var(--destructive, #ef4444)"
              strokeWidth={2}
              fill="url(#outflowGradient)"
              animationDuration={1000}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-medium">Trace these totals · {recent.length} recorded transactions</summary>
        <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
          {recent.map(entry => <button key={entry.id} type="button" className="flex w-full flex-wrap items-start justify-between gap-2 rounded-md border p-2 text-left" onClick={() => entry.sourceKind ? openDetail(entry.sourceKind, entry.sourceId) : setActiveModule("attendancePayroll")}>
            <span className="min-w-0 break-words">{entry.date} · {entry.label}<span className="block text-muted-foreground">Ref: {entry.reference || "Not recorded — review source"}</span></span>
            <span className={entry.direction === "in" ? "text-success" : "text-destructive"}>{entry.direction === "in" ? "+" : "−"}{formatINR(entry.amount)}</span>
          </button>)}
        </div>
        <p className="mt-2 text-muted-foreground">Recorded movements only; not a reconciled cash/bank balance. Opening funds and unrecorded expenses are not included.</p>
      </details>
      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success"/>Inflow (receipts)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive"/>Outflow (payments)</span>
      </div>

      {totalInflow === 0 && totalOutflow === 0 && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">No cash flow in the last 7 days. Record receipts or payments to see the chart.</p>
      )}
    </div>);
}
