"use client";

import * as React from "react";
import { X, XSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import type { WorkspaceTab } from "@/lib/rdash/store/ui-types";

function nextIndex(current: number, delta: number, length: number): number {
  return (current + delta + length) % length;
}

export function WorkspaceTabs() {
  const tabs = useRDashStore((state) => state.tabs);
  const activeTabId = useRDashStore((state) => state.activeTabId);
  const setActiveTab = useRDashStore((state) => state.setActiveTab);
  const closeTab = useRDashStore((state) => state.closeTab);
  const closeOtherTabs = useRDashStore((state) => state.closeOtherTabs);
  const restoreTabs = useRDashStore((state) => state.restoreTabs);
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const activateAndFocus = React.useCallback((id: string) => {
    setActiveTab(id);
    window.requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  }, [setActiveTab]);

  // Every close path offers an Undo toast — closing tabs is destructive and
  // the ⊗N "close others" pill especially can sweep away a whole working set
  // with one tap on a phone.
  const announceClose = React.useCallback((snapshot: { tabs: WorkspaceTab[]; activeTabId: string | null }, closedLabel: string, closedCount: number) => {
    const previousTabs = snapshot.tabs;
    const previousActive = snapshot.activeTabId;
    if (!previousTabs.length || !previousActive) return;
    toast.info(closedCount > 1 ? `Closed ${closedCount} tabs` : `Closed “${closedLabel}”`, {
      description: closedCount > 1 ? "Undo restores the full tab set." : undefined,
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => restoreTabs(previousTabs, previousActive),
      },
    });
  }, [restoreTabs]);

  const closeAndRestoreFocus = React.useCallback((id: string, index: number) => {
    const snapshot = { tabs, activeTabId };
    const closedLabel = tabs[index]?.label || "tab";
    const adjacentId = tabs[index + 1]?.id || tabs[index - 1]?.id;
    const focusId = id === activeTabId ? adjacentId : activeTabId || adjacentId;
    closeTab(id);
    announceClose(snapshot, closedLabel, 1);
    if (focusId) window.requestAnimationFrame(() => tabRefs.current.get(focusId)?.focus());
  }, [activeTabId, announceClose, closeTab, tabs]);

  // Keep the active module tab visible: on phones the strip overflows and a
  // newly activated tab (opened from the nav drawer, command palette or FAB)
  // can otherwise sit entirely outside the visible area with no indication
  // of where the user landed.
  const tablistRef = React.useRef<HTMLDivElement | null>(null);
  // Scroll-affordance edges: fade masks appear only on the sides that still
  // have off-screen tabs, so the strip reads as scrollable instead of cut off.
  const [scrollEdges, setScrollEdges] = React.useState({ left: false, right: false });
  const updateScrollEdges = React.useCallback(() => {
    const strip = tablistRef.current;
    if (!strip) return;
    const max = strip.scrollWidth - strip.clientWidth;
    setScrollEdges({ left: strip.scrollLeft > 4, right: strip.scrollLeft < max - 4 });
  }, []);
  React.useEffect(() => {
    updateScrollEdges();
  }, [tabs, updateScrollEdges]);
  React.useEffect(() => {
    const strip = tablistRef.current;
    const activeNode = activeTabId ? tabRefs.current.get(activeTabId) : undefined;
    if (!strip || !activeNode || !strip.contains(activeNode)) return;
    const centered = activeNode.offsetLeft - (strip.clientWidth - activeNode.offsetWidth) / 2;
    const next = Math.max(0, Math.min(centered, strip.scrollWidth - strip.clientWidth));
    if (Math.abs(strip.scrollLeft - next) > 1) {
      strip.scrollTo({ left: next, behavior: "smooth" });
    }
  }, [activeTabId, tabs]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-stretch">
    <div className="relative flex min-w-0 flex-1 items-stretch">
    <div
      ref={tablistRef}
      role="tablist"
      aria-label="Open workspace modules"
      aria-orientation="horizontal"
      onScroll={updateScrollEdges}
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-[var(--page-pad)] pb-1 rd-scroll"
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
                className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-100 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
    {scrollEdges.left ? (
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-7 bg-gradient-to-r from-background via-background/70 to-transparent" />
    ) : null}
    {scrollEdges.right ? (
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-7 bg-gradient-to-l from-background via-background/70 to-transparent" />
    ) : null}
    </div>
    {tabs.length > 3 ? (
      <button
        type="button"
        aria-label={`Close all tabs except ${tabs.find((tab) => tab.id === activeTabId)?.label || "the active tab"}`}
        title={`Close other ${tabs.length - 1} tabs`}
        onClick={() => {
          if (!activeTabId) return;
          const snapshot = { tabs, activeTabId };
          const closedCount = tabs.length - 1;
          closeOtherTabs(activeTabId);
          announceClose(snapshot, "", closedCount);
        }}
        className="mr-2 mb-1 flex shrink-0 items-center gap-1 self-center rounded-full border border-border bg-card px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XSquare className="h-3 w-3" aria-hidden />
        {tabs.length - 1}
      </button>
    ) : null}
    </div>
  );
}
