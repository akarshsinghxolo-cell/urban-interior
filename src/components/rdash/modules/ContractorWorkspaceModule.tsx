"use client";

import * as React from "react";
import { Activity, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Partner360Phase2Workspace } from "./PartnerGovernanceModule";
import { ContractorDetailModule } from "./ContractorDetailModule";

type View = "relationship" | "operations";

export function ContractorWorkspaceModule() {
  const [view, setView] = React.useState<View>("relationship");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-card">
        <button
          type="button"
          onClick={() => setView("relationship")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold",
            view === "relationship" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          360° & Governance
        </button>
        <button
          type="button"
          onClick={() => setView("operations")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold",
            view === "operations" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Operational Actions
        </button>
        <span className="ml-auto px-2 text-[10px] text-muted-foreground">
          One contractor workspace · no duplicate sidebar entries
        </span>
      </div>

      {view === "relationship" ? <Partner360Phase2Workspace mode="contractor" /> : <ContractorDetailModule />}
    </div>
  );
}
