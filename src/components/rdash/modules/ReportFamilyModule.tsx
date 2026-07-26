"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportsModule } from "./ReportsModule";

export type ReportFamily = "sales" | "collections" | "operations" | "financial";

type ReportOption = { id: string; label: string };

const REPORT_FAMILIES: Record<ReportFamily, { title: string; description: string; reports: ReportOption[] }> = {
  sales: {
    title: "Sales Analytics",
    description: "Quotation value, conversion and lead-source performance",
    reports: [
      { id: "salesReport", label: "Sales Overview" },
      { id: "quotationConversion", label: "Quotation Conversion" },
      { id: "leadSourceReport", label: "Lead Sources" },
    ],
  },
  collections: {
    title: "Collections Analytics",
    description: "Collection health, overdue exposure and receivables aging",
    reports: [
      { id: "collectionReport", label: "Collections" },
      { id: "agingReportRep", label: "Receivables Aging" },
    ],
  },
  operations: {
    title: "Operations & Staff Analytics",
    description: "Staff productivity, visit compliance and task throughput",
    reports: [
      { id: "staffProductivity", label: "Staff Productivity" },
      { id: "visitCompliance", label: "Visit Compliance" },
      { id: "taskThroughput", label: "Task Throughput" },
    ],
  },
  financial: {
    title: "Profitability, Exposure & Tax",
    description: "Work-order margin, vendor exposure and GST reporting",
    reports: [
      { id: "jobPnlReport", label: "Work Order P&L" },
      { id: "vendorExposureReport", label: "Vendor Exposure" },
      { id: "taxReport", label: "Tax / GST" },
    ],
  },
};

export function ReportFamilyModule({ family }: { family: ReportFamily }) {
  const meta = REPORT_FAMILIES[family];
  const [reportId, setReportId] = React.useState(meta.reports[0].id);

  React.useEffect(() => {
    setReportId(meta.reports[0].id);
  }, [family, meta.reports]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold">{meta.title}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {meta.reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setReportId(report.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-semibold",
                  reportId === report.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {report.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ReportsModule reportId={reportId} />
    </div>
  );
}
