"use client";

import * as React from "react";
import { FileText, Layers3, Printer } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import type { FilterPreset } from "@/lib/rdash/modules";
import { QuotationsModule } from "./QuotationsModule";
import { QuotationExtrasModule } from "./RemainingModules";
import { WorkspaceViewTabs, type WorkspaceViewTab } from "./WorkspaceViewTabs";

type QuotationView = "quotations" | "workRequiredBoq" | "quotationPrintExport";

export function QuotationWorkspaceModule({
  filterPresets,
  statusFilter,
  view,
}: {
  filterPresets?: FilterPreset[];
  statusFilter?: string;
  view?: string;
}) {
  const db = useRDashStore((state) => state.db);
  const [activeView, setActiveView] = React.useState<QuotationView>(
    view === "workRequiredBoq" || view === "quotationPrintExport" ? view : "quotations",
  );

  React.useEffect(() => {
    if (view === "workRequiredBoq" || view === "quotationPrintExport") {
      setActiveView(view);
    }
  }, [view]);

  const scopeLineCount = db.quotations.reduce(
    (total, quotation) => total + quotation.scope_lines.length,
    0,
  );
  const printableCount = db.quotations.filter((quotation) => quotation.status !== "draft").length;

  const tabs: WorkspaceViewTab<QuotationView>[] = [
    {
      id: "quotations",
      label: "Quotations",
      icon: <FileText className="h-3.5 w-3.5" />,
      badge: db.quotations.length,
      hint: "Create, revise, send and accept quotations",
    },
    {
      id: "workRequiredBoq",
      label: "Scope / BOQ View",
      icon: <Layers3 className="h-3.5 w-3.5" />,
      badge: scopeLineCount,
      hint: "Review quotation scope lines as an article-level commercial breakdown",
    },
    {
      id: "quotationPrintExport",
      label: "Print & Export",
      icon: <Printer className="h-3.5 w-3.5" />,
      badge: printableCount,
      hint: "Open customer-ready quotations for printing or export",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <WorkspaceViewTabs
        tabs={tabs}
        active={activeView}
        onChange={setActiveView}
        ariaLabel="Quotation workspace views"
      />
      <div className="rd-module-enter" key={activeView}>
        {activeView === "quotations" ? (
          <QuotationsModule
            filterPresets={filterPresets}
            statusFilter={statusFilter}
            view={view}
          />
        ) : (
          <QuotationExtrasModule submodule={activeView} />
        )}
      </div>
    </div>
  );
}
