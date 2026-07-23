"use client";
import * as React from "react";
import { Heart, Smile, Meh, Frown, TrendingUp, ArrowRight, Star, ThumbsUp, CheckCircle2, Clock } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { formatINRShort } from "@/lib/rdash/format";
import { calculateQuotationMetrics } from "@/lib/rdash/metrics";

interface SatisfactionMetric {
  label: string;
  value: number;
  total: number;
  pct: number;
  icon: React.ReactNode;
  color: string;
}

/**
 * CustomerSatisfaction — a widget that derives customer satisfaction
 * from operational signals: quotation acceptance rate, payment receipt
 * rate, project completion rate, and follow-up completion rate.
 *
 * Also shows a list of customers with their "satisfaction score"
 * (composite of their quotation acceptance + payment status + project progress).
 */
export function CustomerSatisfaction() {
  const db = useRDashStore((s) => s.db);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const metrics = React.useMemo<SatisfactionMetric[]>(() => {
    // 1. Quotation acceptance rate — latest revision per chain and only
    // customer decisions in the denominator (accepted/rejected/expired).
    const quotationMetrics = calculateQuotationMetrics(db.quotations);
    const totalQuotes = quotationMetrics.decidedCount;
    const acceptedQuotes = quotationMetrics.acceptedCount;
    const quotePct = quotationMetrics.conversionRate;

    // 2. Payment receipt rate
    const totalInvoiced = db.invoices.reduce((s, inv) => s + inv.total_amount, 0);
    const totalReceived = db.customerReceipts.reduce((s, r) => s + r.amount, 0);
    const paymentPct = totalInvoiced > 0 ? Math.min(100, (totalReceived / totalInvoiced) * 100) : 0;

    // 3. Project completion rate (work orders)
    const totalWos = db.workOrders.length;
    const completedWos = db.workOrders.filter((w) => w.status === "completed").length;
    const completionPct = totalWos > 0 ? (completedWos / totalWos) * 100 : 0;

    // 4. Follow-up completion rate
    const totalFollowups = db.followups.length;
    const completedFollowups = db.followups.filter((f) => f.status === "completed").length;
    const followupPct = totalFollowups > 0 ? (completedFollowups / totalFollowups) * 100 : 100;

    return [
      { label: "Quote Accept", value: acceptedQuotes, total: totalQuotes, pct: quotePct, icon: <ThumbsUp className="h-3 w-3" />, color: quotePct >= 50 ? "text-success" : quotePct >= 25 ? "text-warning" : "text-destructive" },
      { label: "Payment", value: Math.round(totalReceived / 1000), total: Math.round(totalInvoiced / 1000), pct: paymentPct, icon: <CheckCircle2 className="h-3 w-3" />, color: paymentPct >= 80 ? "text-success" : paymentPct >= 50 ? "text-warning" : "text-destructive" },
      { label: "Delivery", value: completedWos, total: totalWos, pct: completionPct, icon: <Clock className="h-3 w-3" />, color: completionPct >= 50 ? "text-success" : "text-warning" },
      { label: "Follow-up", value: completedFollowups, total: totalFollowups, pct: followupPct, icon: <Star className="h-3 w-3" />, color: followupPct >= 70 ? "text-success" : "text-warning" },
    ];
  }, [db.quotations, db.invoices, db.customerReceipts, db.workOrders, db.followups]);

  // Overall satisfaction score (weighted average)
  const overallScore = React.useMemo(() => {
    const weights = [0.3, 0.3, 0.25, 0.15]; // quote, payment, delivery, follow-up
    const score = metrics.reduce((sum, m, i) => sum + m.pct * weights[i], 0);
    return Math.round(score);
  }, [metrics]);

  const satisfactionLevel = overallScore >= 75 ? "excellent" : overallScore >= 50 ? "good" : overallScore >= 30 ? "average" : "needs_attention";
  const levelConfig = {
    excellent: { icon: <Smile className="h-5 w-5" />, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", label: "Excellent", emoji: "😊" },
    good: { icon: <Smile className="h-5 w-5" />, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20", label: "Good", emoji: "🙂" },
    average: { icon: <Meh className="h-5 w-5" />, color: "text-warning", bg: "bg-warning/10", ring: "ring-warning/20", label: "Average", emoji: "😐" },
    needs_attention: { icon: <Frown className="h-5 w-5" />, color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/20", label: "Needs Attention", emoji: "😟" },
  }[satisfactionLevel];

  // Per-customer satisfaction
  const customerScores = React.useMemo(() => {
    return db.customers.map((c) => {
      const quotes = db.quotations.filter((q) => q.customer_id === c.id);
      const quoteMetrics = calculateQuotationMetrics(quotes);
      const accepted = quoteMetrics.acceptedCount;
      const wos = db.workOrders.filter((w) => w.customer_id === c.id);
      const completedWos = wos.filter((w) => w.status === "completed").length;
      const receipts = db.customerReceipts.filter((r) => r.customer_id === c.id);
      const receiptAmount = receipts.reduce((s, r) => s + r.amount, 0);
      const sites = db.sites.filter((s) => s.customer_id === c.id);

      // Composite score
      const quoteScore = quoteMetrics.decidedCount > 0 ? (quoteMetrics.conversionRate / 100) * 40 : 20;
      const woScore = wos.length > 0 ? (completedWos / wos.length) * 30 : 15;
      const paymentScore = receiptAmount > 0 ? 30 : 0;
      const score = Math.round(quoteScore + woScore + paymentScore);

      return {
        id: c.id,
        name: c.name,
        score,
        quotes: quoteMetrics.totalCount,
        accepted,
        wos: wos.length,
        completedWos,
        sites: sites.length,
        receiptAmount,
      };
    }).sort((a, b) => b.score - a.score);
  }, [db.customers, db.quotations, db.workOrders, db.customerReceipts, db.sites]);

  return (
    <section aria-label="Customer satisfaction" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20">
            <Heart className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Customer Satisfaction</h3>
            <p className="text-[11px] text-muted-foreground">Composite health from operational signals</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveModule("customerTimeline")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Customers <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Overall score + metrics */}
      <div className="grid grid-cols-[auto_1fr] gap-3 border-b border-border p-3">
        {/* Overall score dial */}
        <div className={cn("flex flex-col items-center justify-center rounded-xl px-4 py-3 ring-1", levelConfig.bg, levelConfig.ring)}>
          <span className={cn("mb-0.5", levelConfig.color)}>{levelConfig.icon}</span>
          <span className={cn("rd-tabular text-2xl font-black leading-none", levelConfig.color)}>{overallScore}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">/ 100</span>
          <span className={cn("mt-0.5 text-[10px] font-bold", levelConfig.color)}>{levelConfig.label}</span>
        </div>

        {/* Metric bars */}
        <div className="flex flex-col justify-center gap-1.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2">
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center", m.color)}>{m.icon}</span>
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    m.pct >= 70 ? "bg-success" : m.pct >= 40 ? "bg-warning" : "bg-destructive",
                  )}
                  style={{ width: `${Math.min(100, m.pct)}%` }}
                />
              </div>
              <span className={cn("rd-tabular w-12 shrink-0 text-right text-[10px] font-bold", m.color)}>
                {Math.round(m.pct)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Customer list */}
      <div className="max-h-64 overflow-y-auto rd-scroll">
        {customerScores.map((c) => {
          const tone = c.score >= 70 ? "text-success" : c.score >= 40 ? "text-warning" : "text-destructive";
          const bgTone = c.score >= 70 ? "bg-success/10 ring-success/20" : c.score >= 40 ? "bg-warning/10 ring-warning/20" : "bg-destructive/10 ring-destructive/20";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveModule("customerTimeline")}
              className="group flex w-full items-center gap-3 border-b border-border/60 px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{c.name}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{c.quotes} quotes</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{c.accepted} accepted</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{c.completedWos}/{c.wos} delivered</span>
                  {c.receiptAmount > 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="rd-tabular font-medium text-success">{formatINRShort(c.receiptAmount)}</span>
                    </>
                  )}
                </div>
              </div>
              <span className={cn("rd-tabular shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", bgTone, tone)}>
                {c.score}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
