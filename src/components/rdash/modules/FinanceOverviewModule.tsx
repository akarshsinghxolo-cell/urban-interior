"use client";
import * as React from "react";
import { Building2, Clock3, HandCoins, IndianRupee, ReceiptText, WalletCards } from "lucide-react";
import { useRDashStore, siteFinancials, contractorOutstandingTotal } from "@/lib/rdash/store";
import { formatINRShort } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { MetricCard, StatusBadge } from "../primitives";
import { CashFlowChart } from "../CashFlowChart";

import { customerFinancialSummary, receivableAgingBuckets } from "@/lib/rdash/financial-projections";
import { useBusinessDate } from "@/lib/rdash/use-business-date";
export { receivableAgingBuckets } from "@/lib/rdash/financial-projections";
type ReceivableAging = ReturnType<typeof receivableAgingBuckets>;

export function FinanceOverviewModule() {
    const db = useRDashStore((state) => state.db);
    const setActiveModule = useRDashStore((state) => state.setActiveModule);
    const businessDay = useBusinessDate();
    const { receivable: customerReceivable, collected: customerCollected } = customerFinancialSummary(db.invoices, db.customerReceipts);
    const vendorPayable = db.vendorBills
        .filter((bill) => bill.status === "approved" || bill.status === "partly_paid" || bill.status === "paid")
        .reduce((total, bill) => total + bill.balance_amount, 0);
    // FIX-CONTRACTOR-BATCH1 / F.4: use the unified contractorOutstandingTotal
    // selector so this module's "Contractor payable" metric agrees with
    // ContractorDetailModule, ContractorPerformanceModule, and
    // ContractorPaymentsModule. The previous inline formula (sum of
    // bill.balance_amount for verified/approved/partly_paid/paid bills) did
    // not subtract paid payments or settlements — overstating the payable
    // whenever a payment was recorded or a contractor was settled.
    const contractorPayable = contractorOutstandingTotal(db);
    const siteRows = db.sites.map((site) => ({ site, financials: siteFinancials(db, site.id) }));
    const totalContracted = siteRows.reduce((total, row) => total + row.financials.contracted, 0);
    const totalCost = siteRows.reduce((total, row) => total + row.financials.totalCost, 0);
    const aging = React.useMemo(() => receivableAgingBuckets(db.invoices, businessDay), [db.invoices, businessDay]);
    const overdueAmount = aging.d1_30.amount + aging.d31_60.amount + aging.d61_90.amount + aging.d90plus.amount;
    return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><WalletCards className="h-5 w-5"/></span>
        <div><h2 className="text-lg font-bold tracking-tight">Finance Control</h2><p className="text-xs text-muted-foreground">Customer collections, vendor and contractor payables, and Site / Work Order profitability stay separate but reconcile through the same Site context.</p></div>
      </div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => setActiveModule("payments")}>Customer collections</Button><Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => setActiveModule("vendorBills")}>Vendor payables</Button><Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => setActiveModule("contractorPayments")}>Contractor payables</Button></div>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <MetricCard label="Customer receivable" value={formatINRShort(customerReceivable)} tone="warning" icon={<IndianRupee className="h-4 w-4"/>}/>
      <MetricCard label="Customer collected" value={formatINRShort(customerCollected)} tone="success" icon={<ReceiptText className="h-4 w-4"/>}/>
      <MetricCard label="Vendor payable" value={formatINRShort(vendorPayable)} tone="destructive" icon={<Building2 className="h-4 w-4"/>}/>
      <MetricCard label="Contractor payable" value={formatINRShort(contractorPayable)} tone="warning" icon={<HandCoins className="h-4 w-4"/>}/>
      <MetricCard label="Contract value" value={formatINRShort(totalContracted)} subValue={formatINRShort(totalCost)} subLabel="Actual cost" tone="primary" icon={<WalletCards className="h-4 w-4"/>}/>
    </div>

    <ReceivablesAgingCard aging={aging} overdueAmount={overdueAmount} onOpenCollections={() => setActiveModule("payments")}/>

    <section className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-sm font-bold">Site financial position</p><p className="text-xs text-muted-foreground">Customer billing and collections are distinct from vendor and contractor liabilities.</p></div><Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => setActiveModule("profitability")}>Open P&amp;L</Button></div>
      <div className="divide-y divide-border">
        {siteRows.length === 0 ? <div className="px-4 py-8 text-sm text-muted-foreground">Create a Site before creating service-work finance records.</div> : siteRows.map(({ site, financials }) => <div key={site.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,1.4fr)_repeat(5,minmax(90px,1fr))] md:items-center">
          <div><p className="text-sm font-semibold">{site.name}</p><p className="text-[11px] text-muted-foreground">{db.customers.find((customer) => customer.id === site.customer_id)?.name || "Customer"} · {site.site_type}</p></div>
          <FinanceCell label="Contracted" value={financials.contracted}/>
          <FinanceCell label="Invoiced" value={financials.invoiced}/>
          <FinanceCell label="Collected" value={financials.collected} tone="success"/>
          <FinanceCell label="Receivable" value={financials.receivable} tone="warning"/>
          <div><p className="text-[10px] uppercase text-muted-foreground">Payables / margin</p><p className="font-mono text-xs font-semibold">{formatINRShort(financials.vendorPayable + financials.contractorPayable)} / {formatINRShort(financials.grossMargin)}</p><StatusBadge label={site.stage.replaceAll("_", " ")} className="mt-1 bg-muted text-muted-foreground border-border"/></div>
        </div>)}</div>
    </section>

    <CashFlowChart />

    <div className="grid gap-3 lg:grid-cols-3">
      <FinancePath title="Customer money" description="Quotation / work order → customer invoice → collection receipt. Service records must have a Site; retail remains explicitly retail." action="Open collections" onClick={() => setActiveModule("payments")}/>
      <FinancePath title="Vendor money" description="PO → GRN → three-way matched vendor bill → approved payment with reference. Partial payments retain an exact balance." action="Open vendor bills" onClick={() => setActiveModule("vendorBills")}/>
      <FinancePath title="Contractor money" description="Verified progress → contractor bill → owner approval → finance payment reference. Awarded Work Order and Site are mandatory." action="Open contractor payables" onClick={() => setActiveModule("contractorPayments")}/>
    </div>
  </div>;
}
function FinanceCell({ label, value, tone }: {
    label: string;
    value: number;
    tone?: "success" | "warning";
}) {
    return <div><p className={`text-[10px] uppercase ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-muted-foreground"}`}>{label}</p><p className="font-mono text-xs font-semibold">{formatINRShort(value)}</p></div>;
}
function FinancePath({ title, description, action, onClick }: {
    title: string;
    description: string;
    action: string;
    onClick: () => void;
}) {
    return <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><p className="text-sm font-bold">{title}</p><p className="mt-1 min-h-12 text-xs leading-5 text-muted-foreground">{description}</p><Button className="mt-3" size="sm" variant="outline" onClick={onClick}>{action}</Button></div>;
}

const AGING_SEGMENTS: Array<{
    key: keyof Omit<ReceivableAging, "total">;
    label: string;
    shortLabel: string;
    className: string;
}> = [
    { key: "notDue", label: "Not yet due", shortLabel: "Due", className: "bg-success" },
    { key: "d1_30", label: "1–30 days overdue", shortLabel: "1–30", className: "bg-warning" },
    { key: "d31_60", label: "31–60 days overdue", shortLabel: "31–60", className: "bg-chart-5" },
    { key: "d61_90", label: "61–90 days overdue", shortLabel: "61–90", className: "bg-destructive/75" },
    { key: "d90plus", label: "90+ days overdue", shortLabel: "90+", className: "bg-destructive" },
];

function ReceivablesAgingCard({ aging, overdueAmount, onOpenCollections }: {
    aging: ReceivableAging;
    overdueAmount: number;
    onOpenCollections: () => void;
}) {
    const widthPct = (amount: number) => aging.total.amount > 0 ? Math.max(0, (amount / aging.total.amount) * 100) : 0;
    return (<section className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning"><Clock3 className="h-4 w-4"/></span>
          <div className="min-w-0">
            <p className="text-sm font-bold">Receivables aging</p>
            <p className="text-xs text-muted-foreground">
              {aging.total.count === 0
                ? "No open customer balances."
                : overdueAmount > 0
                    ? `${formatINRShort(overdueAmount)} of ${formatINRShort(aging.total.amount)} is past due across ${aging.total.count} invoice${aging.total.count === 1 ? "" : "s"}.`
                    : `${formatINRShort(aging.total.amount)} open across ${aging.total.count} invoice${aging.total.count === 1 ? "" : "s"} — nothing overdue.`}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="min-h-[40px]" onClick={onOpenCollections}>Open collections</Button>
      </div>
      {aging.total.amount > 0 && (<div className="px-4 pt-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Receivables aging distribution">
            {AGING_SEGMENTS.map((segment) => {
        const width = widthPct(aging[segment.key].amount);
        return width > 0 ? <span key={segment.key} title={`${segment.label}: ${formatINRShort(aging[segment.key].amount)}`} className={segment.className} style={{ width: `${width}%` }}/> : null;
      })}
          </div>
        </div>)}
      <div className="mt-3 grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-3 lg:grid-cols-5">
        {AGING_SEGMENTS.map((segment) => {
        const bucket = aging[segment.key];
        const active = bucket.amount > 0;
        return (<div key={segment.key} className={active ? "bg-card px-3 py-2.5" : "bg-muted/30 px-3 py-2.5"}>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${active ? segment.className : "bg-muted-foreground/30"}`}/>
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{segment.shortLabel}</p>
            </div>
            <p className={`mt-1 truncate font-mono text-sm font-bold ${active ? "" : "text-muted-foreground/60"}`}>{formatINRShort(bucket.amount)}</p>
            <p className="text-[10px] text-muted-foreground">{bucket.count} invoice{bucket.count === 1 ? "" : "s"}</p>
          </div>);
      })}
      </div>
    </section>);
}