"use client";

import * as React from "react";
import { FileText, LayoutDashboard, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartnerGovernanceModule } from "./PartnerGovernanceModule";
import { Partner360Module } from "./Partner360Module";
import { ContractorDetailModule } from "./ContractorDetailModule";
import { useActiveTabScroll } from "@/components/rdash/use-active-tab-scroll";

type View = "overview" | "operations" | "records";

const views = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "operations", label: "Operations", icon: SlidersHorizontal },
  { id: "records", label: "Records & Documents", icon: FileText },
] as const;

export function ContractorWorkspaceModule() {
  const [view, setView] = React.useState<View>("overview");
  const { stripRef, bindActiveTab } = useActiveTabScroll(view);

  return (
    <div className="space-y-4">
      <div
        ref={stripRef}
        className="flex overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-card"
        aria-label="Contractor workspace sections"
      >
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            ref={bindActiveTab(id)}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold",
              view === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {view === "overview" && <Partner360Module mode="contractor" />}
      {view === "operations" && <ContractorDetailModule />}
      {view === "records" && <PartnerGovernanceModule mode="contractor" />}
    </div>
  );
}
