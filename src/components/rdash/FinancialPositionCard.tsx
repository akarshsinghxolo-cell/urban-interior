"use client";
import * as React from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, CalendarClock, IndianRupee, Wallet } from "lucide-react";
import { contractorOutstandingTotal, useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatINRShort } from "@/lib/rdash/format";
import { invoiceAgingRows } from "@/lib/rdash/financial-projections";
import { useBusinessDate } from "@/lib/rdash/use-business-date";
import { cn } from "@/lib/utils";

/** Receivables aging + payables summary — gives the Owner an instant cash-position view. */
export function FinancialPositionCard() {
    const db = useRDashStore((s) => s.db);
    const today = useBusinessDate();
    const activeInvoices = invoiceAgingRows(db.invoices, today);
    const sum = (rows: typeof activeInvoices) => rows.reduce((total, row) => total + row.balance_amount, 0);
    const overdueReceivable = sum(activeInvoices.filter(invoice => invoice.daysOverdue > 0));
    const dueSoonReceivable = sum(activeInvoices.filter(invoice => invoice.due_date && invoice.daysOverdue <= 0 && invoice.daysOverdue >= -3));
    const currentReceivable = sum(activeInvoices.filter(invoice => !invoice.due_date || invoice.daysOverdue < -3));
    const totalReceivable = overdueReceivable + dueSoonReceivable + currentReceivable;

    const payableBills = db.vendorBills.filter((bill) => bill.status === "approved" || bill.status === "partly_paid");
    const totalPayable = payableBills.reduce((sum, bill) => sum + bill.balance_amount, 0);
    const contractorPayable = contractorOutstandingTotal(db);

    const netPosition = totalReceivable - totalPayable - contractorPayable;
    const maxSegment = Math.max(overdueReceivable, dueSoonReceivable, currentReceivable, 1);

    return (
        <section aria-label="Financial position" className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Wallet className="h-4 w-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight">Financial Position</h3>
                        <p className="text-[11px] text-muted-foreground">Receivables vs payables snapshot</p>
                    </div>
                </div>
                <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", netPosition >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                    {netPosition >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {netPosition >= 0 ? "+" : ""}{formatINRShort(netPosition)}
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {/* Receivables breakdown */}
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Receivables</span>
                        <span className="rd-tabular text-sm font-bold text-foreground">{formatINRShort(totalReceivable)}</span>
                    </div>
                    <ReceivableBar label="Overdue" value={overdueReceivable} max={maxSegment} tone="destructive" icon={<AlertCircle className="h-3 w-3" />} />
                    <ReceivableBar label="Due ≤ 3 days" value={dueSoonReceivable} max={maxSegment} tone="warning" icon={<CalendarClock className="h-3 w-3" />} />
                    <ReceivableBar label="Current" value={currentReceivable} max={maxSegment} tone="success" icon={<IndianRupee className="h-3 w-3" />} />
                </div>

                {/* Payables breakdown */}
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payables</span>
                        <span className="rd-tabular text-sm font-bold text-foreground">{formatINRShort(totalPayable + contractorPayable)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                        <span className="text-xs text-muted-foreground">Vendor bills</span>
                        <span className="rd-tabular text-xs font-semibold text-foreground">{formatINRShort(totalPayable)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                        <span className="text-xs text-muted-foreground">Contractor bills</span>
                        <span className="rd-tabular text-xs font-semibold text-foreground">{formatINRShort(contractorPayable)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2">
                        <span className="text-xs font-medium text-muted-foreground">Net receivables less payables</span>
                        <span className={cn("rd-tabular text-xs font-bold", netPosition >= 0 ? "text-success" : "text-destructive")}>
                            {netPosition >= 0 ? "+" : ""}{formatINRShort(netPosition)}
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ReceivableBar({ label, value, max, tone, icon }: { label: string; value: number; max: number; tone: "destructive" | "warning" | "success"; icon: React.ReactNode }) {
    const pct = Math.min(100, (value / max) * 100);
    const toneBar = tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-success";
    const toneText = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-success";
    const toneBg = tone === "destructive" ? "bg-destructive/5" : tone === "warning" ? "bg-warning/5" : "bg-success/5";
    return (
        <div className={cn("rounded-md px-3 py-1.5", toneBg)}>
            <div className="mb-1 flex items-center justify-between">
                <span className={cn("flex items-center gap-1 text-[11px] font-medium", toneText)}>
                    {icon}
                    {label}
                </span>
                <span className="rd-tabular text-xs font-semibold text-foreground">{formatINRShort(value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
                <div className={cn("h-full rounded-full transition-all", toneBar)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
