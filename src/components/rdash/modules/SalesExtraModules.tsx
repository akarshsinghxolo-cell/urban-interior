"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatINRShort, formatDate, relativeDay, titleCase } from "@/lib/rdash/format";
import { Users, HandCoins, Percent, Phone, Building2, TrendingUp, CheckCircle2, AlertTriangle, FileText, ArrowRight, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function SourceReferralModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const partners = React.useMemo(() => {
        return db.master.sourcePartners.map((sp) => {
            const customers = db.customers.filter((p) => p.source_partner_id === sp.id);
            const commissions = db.commissions.filter((c) => c.source_partner_id === sp.id);
            const totalCommission = commissions.reduce((n, c) => n + c.amount, 0);
            const paidCommission = commissions.filter((c) => c.status === "paid").reduce((n, c) => n + c.amount, 0);
            const outstanding = totalCommission - paidCommission;
            return { ...sp, customerCount: customers.length, customers, totalCommission, paidCommission, outstanding, commissionCount: commissions.length };
        });
    }, [db.master.sourcePartners, db.customers, db.commissions]);
    const totalCommission = partners.reduce((n, p) => n + p.totalCommission, 0);
    const totalOutstanding = partners.reduce((n, p) => n + p.outstanding, 0);
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><HandCoins className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Source / Referral</h2>
          <p className="text-xs text-muted-foreground">Referral partners, their customers and commission tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Source partners" value={partners.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Referred customers" value={partners.reduce((n, p) => n + p.customerCount, 0)} tone="default" icon={<Building2 className="h-4 w-4"/>}/>
        <MetricCard label="Total commission" value={formatINRShort(totalCommission)} tone="warning" icon={<HandCoins className="h-4 w-4"/>}/>
        <MetricCard label="Outstanding" value={formatINRShort(totalOutstanding)} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
      </div>

      <div className="rd-stagger grid gap-3 lg:grid-cols-2">
        {partners.map((p) => (<div key={p.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <Avatar name={p.name} size={40}/>
                <div>
                  <p className="text-sm font-bold">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{titleCase(p.type || "Partner")} · {p.phone}</p>
                </div>
              </div>
              <StatusBadge label={`${p.commission_pct || 0}% rate`} className="bg-warning/10 text-warning border-warning/20"/>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-muted/40 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Customers</p>
                <p className="text-base font-bold">{p.customerCount}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Earned</p>
                <p className="text-sm font-mono font-bold text-success">{formatINRShort(p.paidCommission)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Due</p>
                <p className={cn("text-sm font-mono font-bold", p.outstanding > 0 ? "text-destructive" : "text-muted-foreground")}>{formatINRShort(p.outstanding)}</p>
              </div>
            </div>
            {p.customers.length > 0 && (<div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Referred customers</p>
                <div className="flex flex-wrap gap-1">
                  {p.customers.slice(0, 5).map((c) => (<button key={c.id} type="button" onClick={() => openDetail("customer", c.id)} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium hover:bg-accent/30">
                      <Avatar name={c.name} size={14}/> {c.name.split(" ")[0]}
                    </button>))}
                  {p.customers.length > 5 && <span className="text-[10px] text-muted-foreground">+{p.customers.length - 5} more</span>}
                </div>
              </div>)}
          </div>))}
      </div>
      {partners.length === 0 && <EmptyState title="No source partners" description="Add referral partners to track lead sources and commissions." icon={<Users className="h-8 w-8"/>}/>}
    </div>);
}
export function DiscountApprovalsModule() {
    const db = useRDashStore((s) => s.db);
    const approveQuotationDiscount = useRDashStore((s) => s.approveQuotationDiscount);
    const updateQuotation = useRDashStore((s) => s.updateQuotation);
    const openDetail = useRDashStore((s) => s.openDetail);
    // C: pull discount approvals from the canonical `quotation.pending_approval`
    //    flag (set by `addQuotation` / `updateQuotation` whenever the discount %
    //    crosses the active `quotation_discount` policy threshold). The previous
    //    implementation matched `db.actions` by substring on `title` which was
    //    unreliable and missed many cases.
    const pendingQuotations = db.quotations
        .filter((q) => q.pending_approval)
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    // History — every quotation that previously had a discount applied (>=1%)
    // AND is no longer held. This surfaces the audit trail of approvals.
    const recentDecisions = db.quotations
        .filter((q) => !q.pending_approval && (q.discount_pct ?? 0) > 0)
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
        .slice(0, 10);
    const pendingValue = pendingQuotations.reduce((n, q) => n + q.total_amount, 0);
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning"><Percent className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Discount Approvals</h2>
          <p className="text-xs text-muted-foreground">Quotation discounts above the active policy threshold — owner approval protects margins</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Pending" value={pendingQuotations.length} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Pending value" value={formatINRShort(pendingValue)} tone="primary" icon={<FileText className="h-4 w-4"/>}/>
        <MetricCard label="Recent decisions" value={recentDecisions.length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Active policy" value={db.approvalPolicies.filter((p) => p.enabled && p.trigger === "quotation_discount").length} tone="default" icon={<Percent className="h-4 w-4"/>}/>
      </div>

      {pendingQuotations.length === 0 ? (<EmptyState title="No discount approvals pending" description="Quotation discounts that cross the active policy threshold will appear here automatically. Adjust the policy in Approval Policies if the threshold is too low." icon={<Percent className="h-8 w-8"/>}/>) : (<div className="space-y-2">
          {pendingQuotations.map((q) => {
              const discountPct = q.discount_pct ?? 0;
              const baseAmount = q.subtotal || q.total_amount || 0;
              const discountValue = Math.round((baseAmount * discountPct) / 100);
              return (<div key={q.id} className={cn("flex flex-col gap-2 rounded-[var(--panel-radius)] border border-warning/30 bg-card p-3 shadow-card sm:flex-row sm:items-center")}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
                    <Percent className="h-4 w-4"/>
                  </span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => openDetail("quotation", q.id)} className="block truncate text-left text-sm font-semibold text-foreground hover:underline">
                      {q.quotation_no} · {q.title}
                    </button>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{q.customer_name || "Customer"}</span>
                      <span className="font-mono font-semibold text-warning">{discountPct}% off · saves {formatINR(discountValue)}</span>
                      <span>· total {formatINR(q.total_amount)}</span>
                      {q.updated_at && <span>· updated {relativeDay(q.updated_at)}</span>}
                    </div>
                    {q.approval_reason && <p className="mt-0.5 truncate text-[10px] text-warning/80" title={q.approval_reason}>{q.approval_reason}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" className="h-7 text-xs" onClick={() => { try {
                        approveQuotationDiscount(q.id);
                        toast.success(`Discount approved for ${q.quotation_no}`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Approval blocked");
                    } }}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Approve
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { try {
                        // Rejection = clear discount back to 0 (which auto-clears the hold).
                        updateQuotation(q.id, { discount_pct: 0 });
                        toast.info(`Discount cleared on ${q.quotation_no}`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Rejection blocked");
                    } }}>
                        Reject
                    </Button>
                  </div>
                </div>);
          })}
        </div>)}

      {recentDecisions.length > 0 && (<div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="border-b border-border bg-muted/30 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent decisions (last 10)</h3>
          </div>
          <div className="divide-y divide-border">
            {recentDecisions.map((q) => {
                const discountPct = q.discount_pct ?? 0;
                return (<button key={q.id} type="button" onClick={() => openDetail("quotation", q.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-xs hover:bg-accent/30">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success"/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{q.quotation_no} · {q.customer_name || "Customer"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{discountPct}% discount · {q.status} · updated {relativeDay(q.updated_at)}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatINR(q.total_amount)}</span>
                  </button>);
            })}
          </div>
        </div>)}

      <div className="rounded-[var(--panel-radius)] border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-primary"/>
          <h3 className="text-sm font-semibold text-primary">How discount approvals work</h3>
        </div>
        <ol className="mt-2 space-y-1 text-xs text-foreground/80">
          <li><span className="font-semibold">1.</span> Configure a <span className="font-semibold">quotation_discount</span> policy in Approval Policies (e.g. discount &gt; 5% requires Owner approval).</li>
          <li><span className="font-semibold">2.</span> When a sales rep sets a discount % above that threshold, the quotation is automatically flagged <code className="rounded bg-muted px-1 py-0.5 text-[10px]">pending_approval</code> via <code className="rounded bg-muted px-1 py-0.5 text-[10px]">addQuotation</code> / <code className="rounded bg-muted px-1 py-0.5 text-[10px]">updateQuotation</code>.</li>
          <li><span className="font-semibold">3.</span> The quotation appears in this queue with the policy reason. The discount badge also surfaces on the Quotations module card and the quotation detail panel.</li>
          <li><span className="font-semibold">4.</span> Approving clears the hold (the owner has accepted the margin impact). Rejecting clears the discount back to 0%.</li>
        </ol>
      </div>
    </div>);
}
export function GstReturnsModule() {
    const db = useRDashStore((s) => s.db);
    const gstCollected = db.quotations.reduce((n, q) => n + q.tax_amount, 0);
    const gstPaid = db.vendorBills.filter((b) => b.status === "paid").reduce((n, b) => n + (b.tax_amount || 0), 0);
    const netGst = gstCollected - gstPaid;
    const outputCount = db.quotations.length;
    const inputCount = db.vendorBills.filter((b) => b.tax_amount).length;
    const months = React.useMemo(() => {
        const m = new Map<string, {
            collected: number;
            paid: number;
        }>();
        db.quotations.forEach((q) => {
            const month = new Date(q.created_at).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
            const e = m.get(month) || { collected: 0, paid: 0 };
            e.collected += q.tax_amount;
            m.set(month, e);
        });
        db.vendorBills.filter((b) => b.tax_amount).forEach((b) => {
            const month = new Date(b.created_at).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
            const e = m.get(month) || { collected: 0, paid: 0 };
            e.paid += b.tax_amount || 0;
            m.set(month, e);
        });
        return Array.from(m.entries()).map(([month, v]) => ({ month, ...v, net: v.collected - v.paid }));
    }, [db.quotations, db.vendorBills]);
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">GST Returns</h2>
          <p className="text-xs text-muted-foreground">Output tax (collected) vs input tax credit (paid) · net GST payable</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Output tax (sales)" value={formatINRShort(gstCollected)} tone="success" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Input tax (purchases)" value={formatINRShort(gstPaid)} tone="primary" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Net GST payable" value={formatINRShort(netGst)} tone={netGst > 0 ? "warning" : "success"} icon={<Percent className="h-4 w-4"/>}/>
        <MetricCard label="GSTR-1 entries" value={outputCount} tone="default" icon={<FileText className="h-4 w-4"/>}/>
      </div>
      <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-4 py-2">
          <h3 className="text-sm font-semibold">Monthly GST summary</h3>
        </div>
        <div className="overflow-x-auto rd-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Month</th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground">Output Tax</th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground">Input Tax</th>
                <th className="px-4 py-2 text-right font-semibold text-muted-foreground">Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (<tr key={m.month} className="border-b border-border last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-medium">{m.month}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-success">{formatINR(m.collected)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-primary">{formatINR(m.paid)}</td>
                  <td className={cn("px-4 py-2.5 text-right font-mono font-bold", m.net > 0 ? "text-warning" : "text-success")}>{formatINR(m.net)}</td>
                </tr>))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20">
                <td className="px-4 py-2.5 font-bold">Total</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-success">{formatINR(gstCollected)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-primary">{formatINR(gstPaid)}</td>
                <td className={cn("px-4 py-2.5 text-right font-mono font-bold", netGst > 0 ? "text-warning" : "text-success")}>{formatINR(netGst)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="rounded-[var(--panel-radius)] border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary"/>
          <h3 className="text-sm font-semibold text-primary">Filing checklist</h3>
        </div>
        <div className="mt-2 space-y-1 text-xs text-foreground/80">
          <p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success"/> GSTR-1: {outputCount} outward supplies recorded</p>
          <p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success"/> GSTR-2: {inputCount} inward purchases with tax recorded</p>
          <p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success"/> GSTR-3B: Net payable = {formatINR(netGst)}</p>
          <p className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-warning"/> File before 20th of next month to avoid penalty</p>
        </div>
      </div>
    </div>);
}
