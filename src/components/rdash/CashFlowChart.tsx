"use client";
import * as React from "react";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatINRShort } from "@/lib/rdash/format";
import { cn } from "@/lib/utils";

/**
 * Cash Flow Chart — a lightweight bar chart showing the last 7 days of
 * inflows (customer receipts) vs outflows (vendor + contractor payments).
 * Uses pure CSS bars (no chart library dependency) for fast rendering.
 */
export function CashFlowChart() {
    const db = useRDashStore((s) => s.db);

    const data = React.useMemo(() => {
        const days: Array<{ date: string; label: string; inflow: number; outflow: number }> = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString("en-IN", { weekday: "short" });
            // Inflow: customer receipts on this date
            const inflow = (db.customerReceipts || [])
                .filter((r: any) => r.received_at?.slice(0, 10) === dateStr)
                .reduce((n: number, r: any) => n + (r.amount || 0), 0);
            // Outflow: vendor payments + contractor payments on this date
            const vendorOut = (db.vendorPayments || [])
                .filter((p: any) => p.paid_date?.slice(0, 10) === dateStr || p.created_at?.slice(0, 10) === dateStr)
                .reduce((n: number, p: any) => n + (p.amount || 0), 0);
            const contractorOut = (db.contractorPayments || [])
                .filter((p: any) => p.paid_date?.slice(0, 10) === dateStr || p.created_at?.slice(0, 10) === dateStr)
                .reduce((n: number, p: any) => n + (p.amount || 0), 0);
            days.push({ date: dateStr, label, inflow, outflow: vendorOut + contractorOut });
        }
        return days;
    }, [db]);

    const totalInflow = data.reduce((n, d) => n + d.inflow, 0);
    const totalOutflow = data.reduce((n, d) => n + d.outflow, 0);
    const netFlow = totalInflow - totalOutflow;
    const maxVal = Math.max(...data.map((d) => Math.max(d.inflow, d.outflow)), 1);

    return (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-4 w-4"/>
          </span>
          <div>
            <h3 className="text-sm font-bold">7-Day Cash Flow</h3>
            <p className="text-[10px] text-muted-foreground">Inflows vs outflows · last 7 days</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-right">
            <p className="flex items-center gap-1 text-success"><TrendingUp className="h-3 w-3"/>{formatINRShort(totalInflow)}</p>
            <p className="text-[9px] text-muted-foreground">inflow</p>
          </div>
          <div className="text-right">
            <p className="flex items-center gap-1 text-destructive"><TrendingDown className="h-3 w-3"/>{formatINRShort(totalOutflow)}</p>
            <p className="text-[9px] text-muted-foreground">outflow</p>
          </div>
          <div className="text-right">
            <p className={cn("font-bold", netFlow >= 0 ? "text-success" : "text-destructive")}>{formatINRShort(netFlow)}</p>
            <p className="text-[9px] text-muted-foreground">net</p>
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex h-32 items-end justify-between gap-2">
        {data.map((d, i) => {
            const inflowHeight = (d.inflow / maxVal) * 100;
            const outflowHeight = (d.outflow / maxVal) * 100;
            const isToday = i === data.length - 1;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end justify-center gap-0.5">
                  {/* Inflow bar (green) */}
                  <div className="group relative flex w-1/2 max-w-3 justify-end">
                    <div
                      className={cn("w-full rounded-t-sm transition-all duration-300 hover:opacity-80", d.inflow > 0 ? "bg-success" : "bg-success/10")}
                      style={{ height: `${Math.max(2, inflowHeight)}%` }}
                      title={`Inflow: ${formatINR(d.inflow)}`}
                    />
                  </div>
                  {/* Outflow bar (red) */}
                  <div className="group relative flex w-1/2 max-w-3 justify-start">
                    <div
                      className={cn("w-full rounded-t-sm transition-all duration-300 hover:opacity-80", d.outflow > 0 ? "bg-destructive" : "bg-destructive/10")}
                      style={{ height: `${Math.max(2, outflowHeight)}%` }}
                      title={`Outflow: ${formatINR(d.outflow)}`}
                    />
                  </div>
                </div>
                <span className={cn("text-[10px] font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{d.label}</span>
              </div>
            );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success"/>Inflow (receipts)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive"/>Outflow (payments)</span>
      </div>

      {totalInflow === 0 && totalOutflow === 0 && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">No cash flow in the last 7 days. Record receipts or payments to see the chart.</p>
      )}
    </div>);
}
