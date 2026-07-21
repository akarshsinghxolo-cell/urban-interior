"use client";
import * as React from "react";
import { TrendingUp, TrendingDown, Wallet, ArrowDownCircle, ArrowUpCircle, Calendar, Banknote } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { formatINRShort, formatINR } from "@/lib/rdash/format";
import { indiaDate } from "@/lib/rdash/date";
import { addDays } from "@/lib/rdash/store/helpers";

interface FlowDay {
  date: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
  isToday: boolean;
}

/**
 * CashFlowForecast — a 14-day rolling cash flow forecast widget.
 * Shows expected inflows (customer receipts + invoice dues) and
 * outflows (vendor payments + contractor payments) with a running
 * cumulative balance. Includes a mini bar chart for visual trend.
 */
export function CashFlowForecast() {
  const db = useRDashStore((s) => s.db);

  const { days, totals } = React.useMemo(() => {
    const today = indiaDate();
    const days: FlowDay[] = [];
    let cumulative = 0;

    // Seed cumulative with current cash position (sum of received receipts minus paid vendor/contractor payments)
    const receivedToDate = db.customerReceipts
      .filter((r) => new Date(r.received_at) <= new Date(`${today}T23:59:59`))
      .reduce((s, r) => s + r.amount, 0);
    const paidToDate =
      db.vendorPayments.filter((p) => p.status === "paid" && p.paid_at && new Date(p.paid_at) <= new Date(`${today}T23:59:59`)).reduce((s, p) => s + p.amount, 0) +
      db.contractorPayments.filter((p) => p.status === "paid" && p.paid_at && new Date(p.paid_at) <= new Date(`${today}T23:59:59`)).reduce((s, p) => s + p.amount, 0);
    cumulative = receivedToDate - paidToDate;

    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 14; i++) {
      const dayStr = addDays(today, i);
      const d = new Date(`${dayStr}T12:00:00+05:30`);
      const dayEnd = new Date(`${dayStr}T23:59:59`);

      // Inflows: customer receipts expected on this day
      const inflow = db.customerReceipts
        .filter((r) => {
          const dt = new Date(r.received_at);
          return dt >= new Date(`${dayStr}T00:00:00`) && dt <= dayEnd;
        })
        .reduce((s, r) => s + r.amount, 0) +
        db.payments
          .filter((p) => {
            if (p.status === "received" || p.status === "partial") return 0;
            return p.due_date === dayStr;
          })
          .reduce((s, p) => s + (p.amount - (p.received_amount || 0)), 0);

      // Outflows: vendor + contractor payments due on this day
      const outflow =
        db.vendorPayments
          .filter((p) => p.status !== "paid" && p.status !== "cancelled")
          .filter((p) => {
            // Use created_at as proxy due date if no explicit due date
            const dt = new Date(p.created_at);
            return dt >= new Date(`${dayStr}T00:00:00`) && dt <= dayEnd;
          })
          .reduce((s, p) => s + p.amount, 0) +
        db.contractorPayments
          .filter((p) => p.status !== "paid" && p.status !== "cancelled")
          .filter((p) => {
            const dt = new Date(p.created_at);
            return dt >= new Date(`${dayStr}T00:00:00`) && dt <= dayEnd;
          })
          .reduce((s, p) => s + p.amount, 0);

      const net = inflow - outflow;
      cumulative += net;
      days.push({
        date: dayStr,
        label: dayLabels[d.getUTCDay()],
        inflow,
        outflow,
        net,
        cumulative,
        isToday: i === 0,
      });
    }

    const totals = {
      inflow: days.reduce((s, d) => s + d.inflow, 0),
      outflow: days.reduce((s, d) => s + d.outflow, 0),
      net: days.reduce((s, d) => s + d.net, 0),
      endingBalance: cumulative,
    };
    return { days, totals };
  }, [db.customerReceipts, db.payments, db.vendorPayments, db.contractorPayments]);

  // Find max absolute value for chart scaling
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.net)), 1);
  const hasData = totals.inflow > 0 || totals.outflow > 0;

  return (
    <section aria-label="Cash flow forecast" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Banknote className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Cash Flow Forecast</h3>
            <p className="text-[11px] text-muted-foreground">14-day rolling inflow / outflow projection</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          14 days
        </span>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <ArrowDownCircle className="h-3 w-3 text-success" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-success">{formatINRShort(totals.inflow)}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <ArrowUpCircle className="h-3 w-3 text-destructive" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Out</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-destructive">{formatINRShort(totals.outflow)}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <Wallet className={cn("h-3 w-3", totals.net >= 0 ? "text-success" : "text-destructive")} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Net</span>
          </div>
          <p className={cn("rd-tabular mt-0.5 text-xs font-bold", totals.net >= 0 ? "text-success" : "text-destructive")}>{formatINRShort(totals.net)}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">End</span>
          </div>
          <p className={cn("rd-tabular mt-0.5 text-xs font-bold", totals.endingBalance >= 0 ? "text-primary" : "text-destructive")}>{formatINRShort(totals.endingBalance)}</p>
        </div>
      </div>

      {/* Mini bar chart */}
      {hasData ? (
        <div className="px-4 py-3">
          <div className="flex items-end gap-0.5" style={{ height: "60px" }}>
            {days.map((day) => {
              const heightPct = Math.min(100, (Math.abs(day.net) / maxAbs) * 100);
              const isPositive = day.net >= 0;
              return (
                <div key={day.date} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] shadow-md group-hover:block">
                    <div className="font-semibold text-foreground">{day.label}, {day.date.slice(8)}</div>
                    {day.inflow > 0 && <div className="text-success">In: {formatINR(day.inflow)}</div>}
                    {day.outflow > 0 && <div className="text-destructive">Out: {formatINR(day.outflow)}</div>}
                    <div className={isPositive ? "text-success" : "text-destructive"}>Net: {formatINR(day.net)}</div>
                  </div>
                  {/* Bar */}
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-all duration-300",
                      day.isToday ? "ring-1 ring-primary ring-offset-1" : "",
                      isPositive ? "bg-success/60 hover:bg-success" : "bg-destructive/60 hover:bg-destructive",
                    )}
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                  />
                  {day.isToday && (
                    <span className="absolute -top-3 text-[8px] font-bold text-primary">T</span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Axis labels */}
          <div className="mt-1 flex justify-between text-[8px] text-muted-foreground">
            <span>Today</span>
            <span>+7d</span>
            <span>+13d</span>
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">No scheduled payments in the next 14 days</p>
        </div>
      )}
    </section>
  );
}
