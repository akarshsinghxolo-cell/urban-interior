"use client";

import * as React from "react";
import { HandCoins, UsersRound } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { CommissionsModule } from "./CommissionsModule";
import { SourceReferralModule } from "./SalesExtraModules";
import { WorkspaceViewTabs, type WorkspaceViewTab } from "./WorkspaceViewTabs";

type CommissionView = "commissions" | "referrals";

export function CommissionsWorkspaceModule() {
  const db = useRDashStore((state) => state.db);
  const [view, setView] = React.useState<CommissionView>("commissions");

  const outstandingCommissionCount = db.commissions.filter(
    (commission) => commission.status !== "paid" && commission.status !== "cancelled",
  ).length;

  const tabs: WorkspaceViewTab<CommissionView>[] = [
    {
      id: "commissions",
      label: "Commissions",
      icon: <HandCoins className="h-3.5 w-3.5" />,
      badge: outstandingCommissionCount,
      hint: "Accrued, payable and paid commission records",
    },
    {
      id: "referrals",
      label: "Source / Referral",
      icon: <UsersRound className="h-3.5 w-3.5" />,
      badge: db.master.sourcePartners.length,
      hint: "Referral partners, referred customers and partner-level commission exposure",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <WorkspaceViewTabs
        tabs={tabs}
        active={view}
        onChange={setView}
        ariaLabel="Commission workspace views"
      />
      <div className="rd-module-enter" key={view}>
        {view === "commissions" ? <CommissionsModule /> : <SourceReferralModule />}
      </div>
    </div>
  );
}
