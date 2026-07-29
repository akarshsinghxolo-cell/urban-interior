"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { DetailPanel } from "./DetailPanel";
import { EntityHistoryPanel, type EntityHistoryKind } from "./EntityHistoryPanel";

function DetailHistoryExtension() {
  const detail = useRDashStore((state) => state.detailPanel);
  const supported = detail.kind === "visit" || detail.kind === "workOrder";
  const [active, setActive] = React.useState(false);
  const [tabHost, setTabHost] = React.useState<HTMLElement | null>(null);
  const [contentHost, setContentHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setActive(false);
  }, [detail.kind, detail.recordId]);

  React.useEffect(() => {
    if (!supported || !detail.recordId) {
      setTabHost(null);
      setContentHost(null);
      return;
    }

    const connect = () => {
      const panel = document.querySelector<HTMLElement>('aside[aria-label="Record context panel"]');
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
  }, [detail.recordId, supported]);

  React.useEffect(() => {
    if (!tabHost) return;
    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-uc-history-tab]")) return;
      if (target?.closest("button")) setActive(false);
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

  return (
    <>
      {createPortal(
        <button
          type="button"
          data-uc-history-tab
          aria-pressed={active}
          onClick={() => setActive(true)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            active
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <History className="h-3.5 w-3.5" />
          History
        </button>,
        tabHost,
      )}
      {active
        ? createPortal(
            <div className="absolute inset-0 z-20 overflow-y-auto bg-card rd-scroll">
              <EntityHistoryPanel
                kind={detail.kind as EntityHistoryKind}
                id={detail.recordId}
              />
            </div>,
            contentHost,
          )
        : null}
    </>
  );
}

export function DetailPanelWithHistory() {
  return (
    <>
      <DetailPanel />
      <DetailHistoryExtension />
    </>
  );
}
