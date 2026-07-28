"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { workspaceLocationPresentation } from "@/lib/rdash/workspace-location-presentation";

/**
 * Persistent, hydration-aware location trail for the active module and record.
 * The trail is intentionally compact so it remains useful without displacing
 * search and global actions in the primary header row.
 */
export function WorkspaceLocationBreadcrumbs() {
  const db = useRDashStore((state) => state.db);
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const detail = useRDashStore((state) => state.detailPanel);
  const contextHistory = useRDashStore((state) => state.contextHistory);
  const contextHistoryIndex = useRDashStore((state) => state.contextHistoryIndex);
  const closeDetail = useRDashStore((state) => state.closeDetail);

  const location = React.useMemo(
    () => workspaceLocationPresentation({
      db,
      moduleId: activeModuleId,
      detail,
      contextHistory,
      contextHistoryIndex,
    }),
    [activeModuleId, contextHistory, contextHistoryIndex, db, detail],
  );

  const hasRecord = Boolean(detail.kind && detail.recordId && location.recordLabel);

  return (
    <nav
      aria-label="Workspace location"
      className="flex min-w-0 items-center gap-1 overflow-hidden px-[var(--page-pad)] pb-1 text-[11px] text-muted-foreground"
    >
      <button
        type="button"
        onClick={hasRecord ? closeDetail : undefined}
        disabled={!hasRecord}
        className="max-w-[180px] shrink-0 truncate rounded px-1.5 py-0.5 font-semibold text-foreground transition-colors enabled:hover:bg-accent disabled:cursor-default"
        title={hasRecord ? `Back to ${location.moduleLabel}` : location.moduleLabel}
      >
        {location.moduleLabel}
      </button>

      {location.customerContextLabel ? (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="hidden max-w-[180px] truncate sm:inline" title={location.customerContextLabel}>
            {location.customerContextLabel}
          </span>
        </>
      ) : null}

      {hasRecord ? (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="hidden shrink-0 font-medium md:inline">{location.kindLabel}</span>
          <span
            aria-current={location.viewLabel ? undefined : "page"}
            className="min-w-0 truncate font-semibold text-foreground"
            title={location.recordLabel}
          >
            {location.recordLabel}
          </span>
        </>
      ) : null}

      {location.viewLabel ? (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span aria-current="page" className="shrink-0 font-semibold text-primary">
            {location.viewLabel}
          </span>
        </>
      ) : null}
    </nav>
  );
}
