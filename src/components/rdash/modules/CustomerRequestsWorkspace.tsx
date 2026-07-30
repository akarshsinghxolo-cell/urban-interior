"use client";

import * as React from "react";
import { ClipboardList, ListChecks, SearchCheck } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import type { FilterPreset } from "@/lib/rdash/modules";
import { CustomerDeskExtrasModule } from "./RemainingModules";
import { WorkspaceViewTabs, type WorkspaceViewTab } from "./WorkspaceViewTabs";

type CustomerRequestView = "requests" | "workRequiredReview" | "pendingActionsCust";

export function CustomerRequestsWorkspace({
  filterPresets,
}: {
  filterPresets?: FilterPreset[];
}) {
  const db = useRDashStore((state) => state.db);
  const [view, setView] = React.useState<CustomerRequestView>("requests");

  const openTaskCount = db.tasks.filter(
    (task) => task.status === "todo" || task.status === "in_progress" || task.status === "review" || task.status === "blocked",
  ).length;
  const qualificationCount = db.workRequired.filter(
    (record) => !["lost", "accepted", "awarded", "in_progress", "completed"].includes(record.status),
  ).length;

  const tabs: WorkspaceViewTab<CustomerRequestView>[] = [
    {
      id: "requests",
      label: "Requests",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      badge: db.workRequired.length,
      hint: "All customer requests and their lifecycle status",
    },
    {
      id: "workRequiredReview",
      label: "Qualification Review",
      icon: <SearchCheck className="h-3.5 w-3.5" />,
      badge: qualificationCount,
      hint: "Open work requirements that still need qualification or sales follow-up",
    },
    {
      id: "pendingActionsCust",
      label: "Pending Actions",
      icon: <ListChecks className="h-3.5 w-3.5" />,
      badge: openTaskCount,
      hint: "Open customer-linked tasks across the workspace",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <WorkspaceViewTabs
        tabs={tabs}
        active={view}
        onChange={setView}
        ariaLabel="Customer request views"
      />
      <div className="rd-module-enter" key={view}>
        <CustomerDeskExtrasModule
          submodule={view}
          filterPresets={view === "requests" ? filterPresets : undefined}
        />
      </div>
    </div>
  );
}
