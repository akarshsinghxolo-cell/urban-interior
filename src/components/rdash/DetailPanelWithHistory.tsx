"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { FileText, GitPullRequest, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { DetailPanel } from "./DetailPanel";
import { EntityFiles, detailKindToFileEntityType } from "./EntityFiles";
import { EntityHistoryPanel, type EntityHistoryKind } from "./EntityHistoryPanel";
import { PerformanceReconciliationAgent } from "./PerformanceReconciliationAgent";
import { promptDialog } from "./PromptDialog";
import { WorkOrderVariationsPanel } from "./WorkOrderVariationsPanel";

type ExtraTab = "files" | "history" | "variations";

function useDetailPanelHosts(enabled: boolean, recordId?: string | null) {
  const [tabHost, setTabHost] = React.useState<HTMLElement | null>(null);
  const [contentHost, setContentHost] = React.useState<HTMLElement | null>(null);
  const positionedHostRef = React.useRef<HTMLElement | null>(null);
  const addedRelativeClassRef = React.useRef(false);

  React.useEffect(() => {
    const releasePositionedHost = () => {
      if (positionedHostRef.current && addedRelativeClassRef.current) {
        positionedHostRef.current.classList.remove("relative");
      }
      positionedHostRef.current = null;
      addedRelativeClassRef.current = false;
    };

    if (!enabled || !recordId) {
      releasePositionedHost();
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

      if (positionedHostRef.current !== body) {
        releasePositionedHost();
        if (body) {
          positionedHostRef.current = body;
          addedRelativeClassRef.current = !body.classList.contains("relative");
          if (addedRelativeClassRef.current) body.classList.add("relative");
        }
      }

      setTabHost((current) => current === tabs ? current : tabs || null);
      setContentHost((current) => current === body ? current : body || null);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      releasePositionedHost();
    };
  }, [enabled, recordId]);

  return { tabHost, contentHost };
}

function DetailExtraTabsExtension() {
  const detail = useRDashStore((state) => state.detailPanel);
  const fileEntityType = detailKindToFileEntityType(detail.kind);
  const hasHistoryExtension = detail.kind === "visit" || detail.kind === "workOrder";
  const supported = Boolean(fileEntityType) || hasHistoryExtension;
  const detailKey = `${detail.kind || "none"}:${detail.recordId || "none"}`;
  const [selection, setSelection] = React.useState<{
    detailKey: string;
    tab: ExtraTab | null;
  }>({ detailKey, tab: null });
  const active = selection.detailKey === detailKey ? selection.tab : null;
  const { tabHost, contentHost } = useDetailPanelHosts(
    supported,
    detail.recordId,
  );

  const clearActive = React.useCallback(() => {
    setSelection({ detailKey, tab: null });
  }, [detailKey]);

  React.useEffect(() => {
    if (!tabHost) return;
    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-uc-extra-detail-tab]")) return;
      if (target?.closest("button")) clearActive();
    };
    tabHost.addEventListener("click", handleClick);
    return () => tabHost.removeEventListener("click", handleClick);
  }, [clearActive, tabHost]);

  if (!supported || !detail.recordId || !tabHost || !contentHost) return null;

  const tabs: Array<{
    id: ExtraTab;
    label: string;
    icon: React.ReactNode;
  }> = [
    ...(fileEntityType
      ? [
          {
            id: "files" as const,
            label: "Files",
            icon: <FileText className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(detail.kind === "workOrder"
      ? [
          {
            id: "variations" as const,
            label: "Variations",
            icon: <GitPullRequest className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(hasHistoryExtension
      ? [
          {
            id: "history" as const,
            label: "History",
            icon: <History className="h-3.5 w-3.5" />,
          },
        ]
      : []),
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
            onClick={() => setSelection({ detailKey, tab: tab.id })}
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
              {active === "files" && fileEntityType ? (
                <EntityFiles
                  entityType={fileEntityType}
                  entityId={detail.recordId}
                  entityLabel={detail.kind || undefined}
                />
              ) : active === "variations" && detail.kind === "workOrder" ? (
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
