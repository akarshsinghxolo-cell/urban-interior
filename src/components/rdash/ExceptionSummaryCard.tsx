"use client";
import * as React from "react";
import { Zap, RefreshCw, AlertTriangle, ShieldCheck, TrendingUp } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINRShort } from "@/lib/rdash/format";
import { cn } from "@/lib/utils";

/**
 * Exception Summary Card — shows the count and value of all "flexibility with
 * accountability" exceptions in the workspace:
 *  - Direct-award POs (skipped formal RFQ/bidding)
 *  - Direct-award contractor assignments (skipped formal bidding)
 *  - Quotation renegotiations/variations (post-acceptance changes)
 *  - Regularized attendance records (reversed auto-absences)
 *
 * This makes the audited exception paths visible at a glance, so managers can
 * see how often the formal process is being bypassed and why.
 */
export function ExceptionSummaryCard() {
    const db = useRDashStore((s) => s.db);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);

    const directAwardPOs = (db.purchaseOrders || []).filter((po: any) => po.direct_award || po.award_basis === "direct");
    const directAwardPOValue = directAwardPOs.reduce((n: number, po: any) => n + (po.total_amount || 0), 0);

    const directAwardContractors = (db.workOrders || []).filter((wo: any) => wo.contractor_selection_method === "direct_award");
    const directAwardContractorValue = directAwardContractors.reduce((n: number, wo: any) => n + (wo.contractor_award_amount || 0), 0);

    const renegotiations = (db.quotations || []).filter((q: any) => q.revision_kind === "renegotiation" || q.revision_kind === "variation");
    const variations = (db.quotations || []).filter((q: any) => q.revision_kind === "variation");

    const regularizedAttendance = (db.attendance || []).filter((a: any) => a.auto_generated && a.attendance_mode === "manual_adjustment");

    const totalExceptions = directAwardPOs.length + directAwardContractors.length + renegotiations.length + regularizedAttendance.length;
    const totalExceptionValue = directAwardPOValue + directAwardContractorValue;

    const exceptions = [
        {
            label: "Direct-Award POs",
            count: directAwardPOs.length,
            value: directAwardPOValue,
            icon: <Zap className="h-3.5 w-3.5"/>,
            tone: "warning" as const,
            onClick: () => setActiveModule("procurement"),
        },
        {
            label: "Direct-Award Contractors",
            count: directAwardContractors.length,
            value: directAwardContractorValue,
            icon: <Zap className="h-3.5 w-3.5"/>,
            tone: "warning" as const,
            onClick: () => setActiveModule("siteExecution"),
        },
        {
            label: "Quotation Renegotiations",
            count: renegotiations.length,
            value: 0,
            icon: <RefreshCw className="h-3.5 w-3.5"/>,
            tone: "info" as const,
            onClick: () => setActiveModule("quotations"),
        },
        {
            label: "Attendance Regularized",
            count: regularizedAttendance.length,
            value: 0,
            icon: <ShieldCheck className="h-3.5 w-3.5"/>,
            tone: "success" as const,
            onClick: () => setActiveModule("attendancePayroll"),
        },
    ];

    const toneClass = {
        warning: "border-warning/30 bg-warning/[0.06] text-warning",
        info: "border-primary/30 bg-primary/[0.06] text-primary",
        success: "border-success/30 bg-success/[0.06] text-success",
    };

    return (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <AlertTriangle className="h-4 w-4"/>
          </span>
          <div>
            <h3 className="text-sm font-bold">Exception Summary</h3>
            <p className="text-[10px] text-muted-foreground">Audited exceptions — formal process skipped with reason</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{totalExceptions}</p>
          <p className="text-[10px] text-muted-foreground">total exceptions</p>
        </div>
      </div>

      {totalExceptions === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <ShieldCheck className="h-8 w-8 text-success/30"/>
          <p className="mt-1.5 text-xs font-semibold text-success">No exceptions recorded</p>
          <p className="text-[10px] text-muted-foreground">All work following the formal process</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {exceptions.filter((e) => e.count > 0).map((exc, i) => (
            <button key={i} type="button" onClick={exc.onClick} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-all hover:scale-[1.02] hover:shadow-sm", toneClass[exc.tone])}>
              <span className="shrink-0">{exc.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide">{exc.label}</p>
                <p className="text-sm font-bold">{exc.count}</p>
                {exc.value > 0 && <p className="text-[10px] opacity-80">{formatINRShort(exc.value)}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {totalExceptionValue > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
            <TrendingUp className="h-3 w-3"/>Total exception value
          </span>
          <span className="font-mono text-sm font-bold text-foreground">{formatINRShort(totalExceptionValue)}</span>
        </div>
      )}
    </div>);
}
