"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { GitPullRequest, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { DetailPanel } from "./DetailPanel";
import { EntityHistoryPanel, type EntityHistoryKind } from "./EntityHistoryPanel";
import { PerformanceReconciliationAgent } from "./PerformanceReconciliationAgent";
import { promptDialog } from "./PromptDialog";
import { WorkOrderVariationsPanel } from "./WorkOrderVariationsPanel";

type ExtraTab = "history" | "variations";

function useDetailPanelHosts(enabled: boolean, recordId?: string | null) {
  const [tabHost, setTabHost] = React.useState<HTMLElement | null>(null);
  const [contentHost, setContentHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!enabled || !recordId) {
      setTabHost(null);
      setContentHost(null);
      return;
    }

    const connect = () => {
      const panel = document.querySelector<HTMLElement>(
        'aside[aria-label="Record context panel"]',
      );
      const header = panel?.children.item(0) as HTMLElement | null;
      const body = panel?.children.item(1) as HTMLElement | null;
      const tabs = header?.lastElementChild as HTMLElement | null;
      setTabHost(tabs || null);
      setContentHost(body || null);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, recordId]);

  return { tabHost, contentHost };
}

function DetailExtraTabsExtension() {
  const detail = useRDashStore((state) => state.detailPanel);
  const supported = detail.kind === "visit" || detail.kind === "workOrder";
  const [active, setActive] = React.useState<ExtraTab | null>(null);
  const { tabHost, contentHost } = useDetailPanelHosts(
    supported,
    detail.recordId,
  );

  React.useEffect(() => {
    setActive(null);
  }, [detail.kind, detail.recordId]);

  React.useEffect(() => {
    if (!tabHost) return;
    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-uc-extra-detail-tab]")) return;
      if (target?.closest("button")) setActive(null);
    };
    tabHost.addEventListener("click", handleClick);
    return () => tabHost.removeEventListener("click", handleClick);
  }, [tabHost]);

  React.useEffect(() => {
    if (!contentHost) return;
    const previousPosition = contentHost.style.position;
    contentHost.style.position = "relative";
    return () => {
      contentHost.style.position = previousPosition;
    };
  }, [contentHost]);

  if (!supported || !detail.recordId || !tabHost || !contentHost) return null;

  const tabs: Array<{
    id: ExtraTab;
    label: string;
    icon: React.ReactNode;
  }> = [
    ...(detail.kind === "workOrder"
      ? [
          {
            id: "variations" as const,
            label: "Variations",
            icon: <GitPullRequest className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    {
      id: "history",
      label: "History",
      icon: <History className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <>
      {tabs.map((tab) =>
        createPortal(
          <button
            key={tab.id}
            type="button"
            data-uc-extra-detail-tab
            aria-pressed={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>,
          tabHost,
        ),
      )}
      {active
        ? createPortal(
            <div className="absolute inset-0 z-20 overflow-y-auto bg-card rd-scroll">
              {active === "variations" && detail.kind === "workOrder" ? (
                <WorkOrderVariationsPanel workOrderId={detail.recordId} />
              ) : (
                <EntityHistoryPanel
                  kind={detail.kind as EntityHistoryKind}
                  id={detail.recordId}
                />
              )}
            </div>,
            contentHost,
          )
        : null}
    </>
  );
}

function CompletedTaskReopenExtension() {
  const detail = useRDashStore((state) => state.detailPanel);
  const task = useRDashStore((state) =>
    detail.kind === "task" && detail.recordId
      ? state.db.tasks.find((row) => row.id === detail.recordId)
      : undefined,
  );
  const role = useRDashStore((state) => state.currentUser().role);
  const reopenTask = useRDashStore((state) => state.reopenTask);
  const allowed = role === "Owner" || role === "Operations Manager";
  const visible = Boolean(task && task.status === "completed" && allowed);
  const { tabHost } = useDetailPanelHosts(visible, detail.recordId);

  if (!visible || !task || !tabHost) return null;

  return createPortal(
    <button
      type="button"
      data-uc-task-reopen-action
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs font-semibold text-warning transition-colors hover:bg-warning/20"
      onClick={async () => {
        const reason = await promptDialog({
          title: "Reopen Task",
          description:
            "Return this completed task to In Progress. The reason and actor will be recorded in the task thread.",
          label: "Reopen reason",
          placeholder: "e.g. Completion proof was incomplete and the team must revisit the site.",
          required: true,
          multiline: true,
          confirmLabel: "Reopen task",
        });
        if (reason === null || !reason.trim()) return;
        try {
          reopenTask(task.id, reason.trim());
          toast.success("Task reopened and returned to In Progress");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Task could not be reopened",
          );
        }
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Reopen task
    </button>,
    tabHost,
  );
}

export function DetailPanelWithHistory() {
  return (
    <>
      <PerformanceReconciliationAgent />
      <DetailPanel />
      <DetailExtraTabsExtension />
      <CompletedTaskReopenExtension />
    </>
  );
}
