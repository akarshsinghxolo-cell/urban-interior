"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronRight, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/browser/copy-text";
import { useRDashStore } from "@/lib/rdash/store";
import { workspaceLocationPresentation } from "@/lib/rdash/workspace-location-presentation";
import {
  canonicalWorkspaceRecordPath,
  canonicalWorkspaceRecordUrl,
} from "@/lib/rdash/workspace-share-link";

/**
 * Persistent, hydration-aware location trail for the active module and record.
 * The trail is intentionally compact so it remains useful without displacing
 * search and global actions in the primary header row.
 */
export function WorkspaceLocationBreadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const db = useRDashStore((state) => state.db);
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const detail = useRDashStore((state) => state.detailPanel);
  const contextHistory = useRDashStore((state) => state.contextHistory);
  const contextHistoryIndex = useRDashStore((state) => state.contextHistoryIndex);
  const closeDetail = useRDashStore((state) => state.closeDetail);
  const [copied, setCopied] = React.useState(false);
  const copiedTimerRef = React.useRef<number | null>(null);

  const snapshot = React.useMemo(() => ({
    moduleId: activeModuleId,
    detailPanel: detail,
    contextHistory,
    contextHistoryIndex,
  }), [activeModuleId, contextHistory, contextHistoryIndex, detail]);

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

  const sharePath = React.useMemo(
    () => canonicalWorkspaceRecordPath(snapshot, pathname, search),
    [pathname, search, snapshot],
  );
  const hasRecord = Boolean(detail.kind && detail.recordId && location.recordLabel);

  React.useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const currentRecordUrl = React.useCallback(() => canonicalWorkspaceRecordUrl(
    snapshot,
    pathname,
    search,
    window.location.origin,
  ), [pathname, search, snapshot]);

  const copyRecordLink = React.useCallback(async () => {
    const url = currentRecordUrl();
    if (!url) {
      toast.error("Record link unavailable", {
        description: "This record does not have a stable public workspace route yet.",
      });
      return;
    }
    try {
      await copyTextToClipboard(url);
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
      toast.success("Record link copied", {
        description: location.recordLabel || "The canonical workspace URL is ready to paste.",
      });
    } catch (error) {
      toast.error("Copy failed", {
        description: error instanceof Error ? error.message : "Clipboard access was denied.",
      });
    }
  }, [currentRecordUrl, location.recordLabel]);

  const shareRecordLink = React.useCallback(async () => {
    const url = currentRecordUrl();
    if (!url) {
      toast.error("Record link unavailable", {
        description: "This record does not have a stable public workspace route yet.",
      });
      return;
    }

    if (typeof navigator.share !== "function") {
      await copyRecordLink();
      return;
    }

    try {
      await navigator.share({
        title: location.recordLabel || "Urban Castle record",
        text: location.kindLabel
          ? `${location.kindLabel}: ${location.recordLabel || "Record"}`
          : location.recordLabel || "Urban Castle record",
        url,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Share failed", {
        description: error instanceof Error ? error.message : "The share sheet could not be opened.",
      });
    }
  }, [copyRecordLink, currentRecordUrl, location.kindLabel, location.recordLabel]);

  return (
    <nav
      aria-label="Workspace location"
      className="flex min-w-0 items-center gap-2 px-[var(--page-pad)] pb-1 text-[11px] text-muted-foreground"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
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
      </div>

      {sharePath ? (
        <div className="flex shrink-0 items-center gap-0.5" aria-label="Record link actions">
          <button
            type="button"
            onClick={() => void copyRecordLink()}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Copy record link"
            title="Copy canonical record link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden lg:inline">{copied ? "Copied" : "Copy link"}</span>
          </button>
          <button
            type="button"
            onClick={() => void shareRecordLink()}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Share record link"
            title="Share canonical record link"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Share</span>
          </button>
        </div>
      ) : null}
    </nav>
  );
}
