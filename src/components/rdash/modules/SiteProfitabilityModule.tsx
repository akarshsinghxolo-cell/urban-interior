"use client";
import * as React from "react";
import { TrendingUp, Building2, ArrowDownRight, ArrowUpRight, Wallet, Receipt } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatINRShort, formatDate } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeWorkOrderPnL } from "@/lib/rdash/store/finance-helpers";

interface SitePnL {
    site_id: string;
    site_name: string;
    customer_name: string;
    site_type: string;
    stage: string;
    // Value side
    total_quoted_value: number;
    accepted_value: number;
    invoiced_amount: number;
    amount_received: number;
    // Cost side (G: now derived from workOrderCostLines via the canonical
    // computeWorkOrderPnL helper, NOT from raw vendorBills + contractorBills.
    // This makes SiteProfitability agree with JobPnLModule and FinanceOverview.)
    total_po_value: number;
    contractor_award_total: number;
    vendor_bill_total: number;
    contractor_bill_total: number;
    amount_spent: number;
    // Derived
    outstanding_receivable: number;
    outstanding_payable: number;
    margin: number;
    margin_pct: number;
    work_order_count: number;
}

function computeSitePnLs(db: any): SitePnL[] {
    const sites = db.sites || [];
    const customers = db.customers || [];
    const allWorkOrders = db.workOrders || [];
    const allQuotations = db.quotations || [];
    const allAcceptedScopes = db.acceptedScopes || [];
    const allPOs = db.purchaseOrders || [];
    const allVendorBills = db.vendorBills || [];
    const allContractorBills = db.contractorBills || [];
    const allVendorPayments = db.vendorPayments || [];
    const allContractorPayments = db.contractorPayments || [];
    return sites.map((site: any) => {
        const customer = customers.find((c: any) => c.id === site.customer_id);
        const siteWorkOrders = allWorkOrders.filter((wo: any) => wo.site_id === site.id);
        const woIds = new Set(siteWorkOrders.map((wo: any) => wo.id));
        const siteQuotations = allQuotations.filter((q: any) => q.site_id === site.id);
        const siteScopes = allAcceptedScopes.filter((s: any) => s.site_id === site.id);
        const sitePOs = allPOs.filter((po: any) => po.site_id === site.id);
        const siteVendorBills = allVendorBills.filter((b: any) => b.site_id === site.id || (b.po_id && sitePOs.some((po: any) => po.id === b.po_id)));
        const siteContractorBills = allContractorBills.filter((b: any) => b.site_id === site.id || (b.work_order_id && woIds.has(b.work_order_id)));
        const totalQuotedValue = siteQuotations.reduce((n: number, q: any) => n + (q.total_amount || 0), 0);
        const acceptedValue = siteScopes.reduce((n: number, s: any) => n + (s.accepted_value || 0), 0);
        // G: roll up per-work-order P&L via the canonical computeWorkOrderPnL
        // helper so this view agrees with JobPnLModule and FinanceOverview.
        const woPnLs = siteWorkOrders
            .map((wo: any) => computeWorkOrderPnL(db, wo.id))
            .filter((p: any): p is NonNullable<typeof p> => Boolean(p));
        const invoicedAmount = woPnLs.reduce((n: number, p: any) => n + (p.invoiced || 0), 0);
        const amountReceived = woPnLs.reduce((n: number, p: any) => n + (p.collected || 0), 0);
        const amountSpent = woPnLs.reduce((n: number, p: any) => n + (p.total_cost || 0), 0);
        // PO value + contractor award totals are still derived from raw records
        // (they are not part of the P&L formula — they are commitment indicators).
        const totalPoValue = sitePOs.reduce((n: number, po: any) => n + (po.total_amount || 0), 0);
        const contractorAwardTotal = siteWorkOrders.reduce((n: number, wo: any) => n + (wo.contractor_award_amount || 0), 0);
        const vendorBillTotal = siteVendorBills.reduce((n: number, b: any) => n + (b.total_amount || b.amount || 0), 0);
        const contractorBillTotal = siteContractorBills.reduce((n: number, b: any) => n + (b.amount || 0), 0);
        const outstandingReceivable = Math.max(0, acceptedValue - amountReceived);
        const vendorPaidTotal = allVendorPayments.filter((vp: any) => siteVendorBills.some((b: any) => b.id === vp.vendor_bill_id)).reduce((n: number, vp: any) => n + (vp.amount || 0), 0);
        const contractorPaidTotal = allContractorPayments.filter((cp: any) => siteContractorBills.some((b: any) => b.id === cp.contractor_bill_id)).reduce((n: number, cp: any) => n + (cp.amount || 0), 0);
        const outstandingPayable = Math.max(0, vendorBillTotal + contractorBillTotal - vendorPaidTotal - contractorPaidTotal);
        const margin = acceptedValue - amountSpent;
        const marginPct = acceptedValue > 0 ? Math.round((margin / acceptedValue) * 10000) / 100 : 0;
        return {
            site_id: site.id,
            site_name: site.name,
            customer_name: customer?.name || "—",
            site_type: site.site_type || "other",
            stage: site.stage || "unknown",
            total_quoted_value: totalQuotedValue,
            accepted_value: acceptedValue,
            invoiced_amount: invoicedAmount,
            amount_received: amountReceived,
            total_po_value: totalPoValue,
            contractor_award_total: contractorAwardTotal,
            vendor_bill_total: vendorBillTotal,
            contractor_bill_total: contractorBillTotal,
            amount_spent: amountSpent,
            outstanding_receivable: outstandingReceivable,
            outstanding_payable: outstandingPayable,
            margin,
            margin_pct: marginPct,
            work_order_count: siteWorkOrders.length,
        };
    });
}

function marginTone(pct: number): "success" | "warning" | "destructive" {
    if (pct > 20) return "success";
    if (pct > 5) return "warning";
    return "destructive";
}

export function SiteProfitabilityModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [expandedSite, setExpandedSite] = React.useState<string | null>(null);
    const sitePnLs = React.useMemo(() => {
        try {
            return computeSitePnLs(db);
        } catch (err) {
            console.error("[SiteProfitabilityModule] computeSitePnLs failed:", err);
            return [];
        }
    }, [db]);
    const totals = React.useMemo(() => ({
        accepted: sitePnLs.reduce((n, s) => n + s.accepted_value, 0),
        received: sitePnLs.reduce((n, s) => n + s.amount_received, 0),
        spent: sitePnLs.reduce((n, s) => n + s.amount_spent, 0),
        margin: sitePnLs.reduce((n, s) => n + s.margin, 0),
        outstanding_receivable: sitePnLs.reduce((n, s) => n + s.outstanding_receivable, 0),
        outstanding_payable: sitePnLs.reduce((n, s) => n + s.outstanding_payable, 0),
    }), [sitePnLs]);
    const overallMarginPct = totals.accepted > 0 ? Math.round((totals.margin / totals.accepted) * 10000) / 100 : 0;
    const tone = marginTone(overallMarginPct);

    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-4 w-4"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Site Profitability</h2>
            <p className="text-xs text-muted-foreground">Value vs. cost across every site — receivables, spend, and margin at a glance</p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total Accepted" value={formatINRShort(totals.accepted)} icon={<Receipt className="h-4 w-4"/>} tone="primary"/>
        <SummaryCard label="Received" value={formatINRShort(totals.received)} icon={<ArrowDownRight className="h-4 w-4"/>} tone="success"/>
        <SummaryCard label="Outstanding" value={formatINRShort(totals.outstanding_receivable)} icon={<Wallet className="h-4 w-4"/>} tone="warning"/>
        <SummaryCard label="Total Spent" value={formatINRShort(totals.spent)} icon={<ArrowUpRight className="h-4 w-4"/>} tone="destructive"/>
        <SummaryCard label="Payable" value={formatINRShort(totals.outstanding_payable)} icon={<Wallet className="h-4 w-4"/>} tone="warning"/>
        <SummaryCard label="Margin" value={`${formatINRShort(totals.margin)} (${overallMarginPct}%)`} icon={<TrendingUp className="h-4 w-4"/>} tone={tone}/>
      </section>

      {/* Per-site table */}
      <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-bold">Per-Site Breakdown</h3>
          <p className="text-xs text-muted-foreground">Click a site to see work-order-level detail</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/20 text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-semibold">Site</th>
                <th className="px-3 py-2 text-right font-semibold">Accepted Value</th>
                <th className="px-3 py-2 text-right font-semibold">Received</th>
                <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                <th className="px-3 py-2 text-right font-semibold">PO Value</th>
                <th className="px-3 py-2 text-right font-semibold">Spent</th>
                <th className="px-3 py-2 text-right font-semibold">Payable</th>
                <th className="px-3 py-2 text-right font-semibold">Margin</th>
                <th className="px-3 py-2 text-right font-semibold">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {sitePnLs.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No sites found.</td></tr>
              ) : sitePnLs.map((s) => {
                  const sTone = marginTone(s.margin_pct);
                  const isExpanded = expandedSite === s.site_id;
                  return (<React.Fragment key={s.site_id}>
                    <tr className={cn("border-b border-border cursor-pointer transition-colors hover:bg-muted/20", isExpanded && "bg-primary/[0.03]")} onClick={() => setExpandedSite(isExpanded ? null : s.site_id)}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground"/>
                          <div>
                            <p className="font-semibold text-foreground">{s.site_name}</p>
                            <p className="text-[10px] text-muted-foreground">{s.customer_name} · {s.site_type} · {s.work_order_count} WO</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatINR(s.accepted_value)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-success">{formatINR(s.amount_received)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-warning">{formatINR(s.outstanding_receivable)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatINR(s.total_po_value)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-destructive">{formatINR(s.amount_spent)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-warning">{formatINR(s.outstanding_payable)}</td>
                      <td className={cn("px-3 py-2.5 text-right font-mono font-bold", sTone === "success" ? "text-success" : sTone === "warning" ? "text-warning" : "text-destructive")}>{formatINR(s.margin)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold",
                          sTone === "success" ? "border-success/30 bg-success/10 text-success" :
                          sTone === "warning" ? "border-warning/30 bg-warning/10 text-warning" :
                          "border-destructive/30 bg-destructive/10 text-destructive")}>
                          {s.margin_pct}%
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (<tr className="bg-muted/10">
                      <td colSpan={9} className="px-6 py-3">
                        <ExpandedSiteDetail siteId={s.site_id} db={db} openDetail={openDetail}/>
                      </td>
                    </tr>)}
                  </React.Fragment>);
              })}
            </tbody>
            <tfoot className="bg-muted/30 font-bold">
              <tr className="border-t-2 border-border">
                <td className="px-3 py-2.5">TOTAL ({sitePnLs.length} sites)</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatINR(totals.accepted)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-success">{formatINR(totals.received)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-warning">{formatINR(totals.outstanding_receivable)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatINR(sitePnLs.reduce((n, s) => n + s.total_po_value, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-destructive">{formatINR(totals.spent)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-warning">{formatINR(totals.outstanding_payable)}</td>
                <td className={cn("px-3 py-2.5 text-right font-mono", tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-destructive")}>{formatINR(totals.margin)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold",
                    tone === "success" ? "border-success/30 bg-success/10 text-success" :
                    tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" :
                    "border-destructive/30 bg-destructive/10 text-destructive")}>
                    {overallMarginPct}%
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>);
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "primary" | "success" | "warning" | "destructive" }) {
    const toneClass = {
        primary: "bg-primary/10 text-primary border-primary/20",
        success: "bg-success/10 text-success border-success/20",
        warning: "bg-warning/10 text-warning border-warning/20",
        destructive: "bg-destructive/10 text-destructive border-destructive/20",
    }[tone];
    return (<div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {icon}{label}
      </div>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>);
}

function ExpandedSiteDetail({ siteId, db, openDetail }: { siteId: string; db: any; openDetail: any }) {
    const workOrders = (db.workOrders || []).filter((wo: any) => wo.site_id === siteId);
    if (!workOrders.length)
        return <p className="text-xs text-muted-foreground">No work orders for this site.</p>;
    const allPOs = db.purchaseOrders || [];
    return (<div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Work Orders</p>
      <div className="space-y-1.5">
        {workOrders.map((wo: any) => {
            const contractor = wo.contractor_name || "—";
            const woPoTotal = allPOs.filter((po: any) => po.work_order_id === wo.id).reduce((n: number, po: any) => n + (po.total_amount || 0), 0);
            // G: use the canonical computeWorkOrderPnL so this per-WO margin
            // matches JobPnLModule.
            const pnl = computeWorkOrderPnL(db, wo.id);
            const woBills = pnl?.total_cost || 0;
            const woReceipts = pnl?.collected || 0;
            const woMargin = pnl?.gross_margin ?? (wo.value - woBills);
            return (<div key={wo.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-2 text-xs">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs font-mono" onClick={() => openDetail("workOrder", wo.id)}>{wo.work_order_no}</Button>
                <span className="text-muted-foreground">{wo.title}</span>
              </div>
              <div className="flex items-center gap-4 font-mono">
                <span className="text-muted-foreground">Value: <span className="text-foreground">{formatINR(wo.value)}</span></span>
                <span className="text-muted-foreground">Received: <span className="text-success">{formatINR(woReceipts)}</span></span>
                <span className="text-muted-foreground">POs: <span className="text-foreground">{formatINR(woPoTotal)}</span></span>
                <span className="text-muted-foreground">Spent: <span className="text-destructive">{formatINR(woBills)}</span></span>
                <span className="text-muted-foreground">Contractor: <span className="text-foreground">{contractor}</span></span>
                <span className={woMargin >= 0 ? "text-success font-bold" : "text-destructive font-bold"}>Margin: {formatINR(woMargin)}</span>
              </div>
            </div>);
        })}
      </div>
    </div>);
}
