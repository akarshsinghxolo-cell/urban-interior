"use client";

import * as React from "react";
import { Percent, ShieldCheck } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { ApprovalsModule } from "./RemainingModules";
import { DiscountApprovalsModule } from "./SalesExtraModules";
import { WorkspaceViewTabs, type WorkspaceViewTab } from "./WorkspaceViewTabs";

type ApprovalView = "business" | "discounts";

export function BusinessApprovalsWorkspace() {
  const db = useRDashStore((state) => state.db);
  const [view, setView] = React.useState<ApprovalView>("business");

  const pendingBusiness = db.actions.filter((action) => action.status === "pending").length;
  const pendingDiscounts = db.quotations.filter((quotation) => quotation.pending_approval).length;

  const tabs: WorkspaceViewTab<ApprovalView>[] = [
    {
      id: "business",
      label: "Business Approvals",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      badge: pendingBusiness,
      hint: "Purchase orders, partner payments, vendor bills and other business decisions",
    },
    {
      id: "discounts",
      label: "Discount Approvals",
      icon: <Percent className="h-3.5 w-3.5" />,
      badge: pendingDiscounts,
      hint: "Quotation discounts that cross the active approval-policy threshold",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <WorkspaceViewTabs
        tabs={tabs}
        active={view}
        onChange={setView}
        ariaLabel="Business approval views"
      />
      <div className="rd-module-enter" key={view}>
        {view === "business" ? <ApprovalsModule /> : <DiscountApprovalsModule />}
      </div>
    </div>
  );
}
