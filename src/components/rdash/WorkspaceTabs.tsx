"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";

function nextIndex(current: number, delta: number, length: number): number {
  return (current + delta + length) % length;
}

export function WorkspaceTabs() {
  const tabs = useRDashStore((state) => state.tabs);
  const activeTabId = useRDashStore((state) => state.activeTabId);
  const setActiveTab = useRDashStore((state) => state.setActiveTab);
  const closeTab = useRDashStore((state) => state.closeTab);
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const activateAndFocus = React.useCallback((id: string) => {
    setActiveTab(id);
    window.requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  }, [setActiveTab]);

  const closeAndRestoreFocus = React.useCallback((id: string, index: number) => {
    const adjacentId = tabs[index + 1]?.id || tabs[index - 1]?.id;
    const focusId = id === activeTabId ? adjacentId : activeTabId || adjacentId;
    closeTab(id);
    if (focusId) window.requestAnimationFrame(() => tabRefs.current.get(focusId)?.focus());
  }, [activeTabId, closeTab, tabs]);

  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open workspace modules"
      aria-orientation="horizontal"
      className="flex items-center gap-1 overflow-x-auto px-[var(--page-pad)] pb-1 rd-scroll"
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeTabId;
        return (
          <div key={tab.id} role="presentation" className="group flex shrink-0 items-center rounded-t-md">
            <button
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              id={`workspace-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`workspace-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const delta = event.key === "ArrowRight" ? 1 : -1;
                  activateAndFocus(tabs[nextIndex(index, delta, tabs.length)].id);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  activateAndFocus(tabs[0].id);
                } else if (event.key === "End") {
                  event.preventDefault();
                  activateAndFocus(tabs[tabs.length - 1].id);
                } else if (event.key === "Delete" && tabs.length > 1) {
                  event.preventDefault();
                  closeAndRestoreFocus(tab.id, index);
                }
              }}
              className={cn(
                "flex min-h-9 items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active
                  ? "rd-tab-active border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.icon && !tab.label.trim().startsWith(tab.icon) ? (
                <span className="text-sm leading-none" aria-hidden>{tab.icon}</span>
              ) : null}
              <span className="max-w-[220px] truncate" title={tab.label}>{tab.label}</span>
            </button>
            {tabs.length > 1 ? (
              <button
                type="button"
                aria-label={`Close ${tab.label} tab`}
                onClick={() => closeAndRestoreFocus(tab.id, index)}
                className="mr-1 flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
