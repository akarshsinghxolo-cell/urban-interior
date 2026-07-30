"use client";
import { Building2, HandCoins, IndianRupee, ReceiptText, WalletCards } from "lucide-react";
import { useRDashStore, siteFinancials, contractorOutstandingTotal } from "@/lib/rdash/store";
import { formatINRShort } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { MetricCard, StatusBadge } from "../primitives";
export function FinanceOverviewModule() {
    const db = useRDashStore((state) => state.db);
    const setActiveModule = useRDashStore((state) => state.setActiveModule);
    const customerReceivable = db.invoices.filter((invoice) => invoice.status !== "cancelled").reduce((total, invoice) => total + invoice.balance_amount, 0);
    const customerCollected = db.customerReceipts.reduce((total, receipt) => total + receipt.amount, 0);
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