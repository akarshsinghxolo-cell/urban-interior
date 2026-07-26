"use client";

import * as React from "react";
import { Building2, BriefcaseBusiness } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteProfitabilityModule } from "./SiteProfitabilityModule";
import { JobPnLModule } from "./JobPnLModule";

type View = "site" | "work-order";

export function ProfitabilityWorkspaceModule() {
  const [view, setView] = React.useState<View>("site");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-card">
        <button
          type="button"
          onClick={() => setView("site")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold",
            view === "site" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Building2 className="h-3.5 w-3.5" />
          Site View
        </button>
        <button
          type="button"
          onClick={() => setView("work-order")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold",
            view === "work-order" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <BriefcaseBusiness className="h-3.5 w-3.5" />
          Work Order View
        </button>
        <span className="ml-auto px-2 text-[10px] text-muted-foreground">
          Accepted value · collections · posted cost · committed cost · margin
        </span>
      </div>

      {view === "site" ? <SiteProfitabilityModule /> : <JobPnLModule />}
    </div>
  );
}
