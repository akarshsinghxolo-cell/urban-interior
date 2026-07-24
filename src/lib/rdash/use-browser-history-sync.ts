"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRDashStore } from "./store";
import type { WorkspaceNavigationSnapshot, WorkspaceOverlaySnapshot } from "./store/ui-types";
import {
  ROOT_LAYER,
  browserNavigationState,
  commonPrefixLength,
  isBrowserNavigationState,
  navigationLayerListsEqual,
  navigationLayers,
  type BrowserNavigationState,
  type NavigationLayer,
} from "./navigation-history";

const ROOT_EXIT_GUARD_PREFIX = "uc-root-exit";
const ROOT_EXIT_CONFIRMATION_MS = 2_000;

function mergedHistoryState(state: BrowserNavigationState): Record<string, unknown> {
  const current = window.history.state;
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
  return { ...base, ...state };
}

function pushBrowserState(state: BrowserNavigationState): void {
  try {
    window.history.pushState(mergedHistoryState(state), "");
  } catch {
    // Browser history is best-effort in embedded/private browsing contexts.
  }
}

function replaceBrowserState(state: BrowserNavigationState): void {
  try {
    window.history.replaceState(mergedHistoryState(state), "");
  } catch {
    // Browser history is best-effort in embedded/private browsing contexts.
  }
}

function shouldGuardMobileRootExit(): boolean {
  try {
    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    return Boolean(
      window.matchMedia?.("(pointer: coarse)").matches ||
      window.matchMedia?.("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent),
    );
  } catch {
    return false;
  }
}

function isRootExitGuard(state: BrowserNavigationState): boolean {
  return state.entryId.startsWith(`${ROOT_EXIT_GUARD_PREFIX}-`);
}

export function useBrowserHistorySync(): void {
  const moduleId = useRDashStore((state) => state.activeModuleId);
  const activeTabId = useRDashStore((state) => state.activeTabId);
  const moduleHistoryIndex = useRDashStore((state) => state.moduleHistoryIndex);
  const moduleHistoryLength = useRDashStore((state) => state.moduleHistory.length);
  const selectedCustomerId = useRDashStore((state) => state.selectedCustomerId);
  const detailPanel = useRDashStore((state) => state.detailPanel);
  const contextHistory = useRDashStore((state) => state.contextHistory);
  const contextHistoryIndex = useRDashStore((state) => state.contextHistoryIndex);
  const commandPaletteOpen = useRDashStore((state) => state.commandPaletteOpen);
  const actionDialog = useRDashStore((state) => state.actionDialog);
  const createDialog = useRDashStore((state) => state.createDialog);
  const quotationAcceptanceDialog = useRDashStore((state) => state.quotationAcceptanceDialog);
  const editDialog = useRDashStore((state) => state.editDialog);
  const mobileNavOpen = useRDashStore((state) => state.mobileNavOpen);
  const moreMenuOpen = useRDashStore((state) => state.moreMenuOpen);
  const quickAddOpen = useRDashStore((state) => state.quickAddOpen);
  const keyboardShortcutsOpen = useRDashStore((state) => state.keyboardShortcutsOpen);

  const overlays = React.useMemo<WorkspaceOverlaySnapshot[]>(() => {
    const result: WorkspaceOverlaySnapshot[] = [];
    if (commandPaletteOpen) result.push({ type: "commandPalette" });
    if (actionDialog.type) result.push({ type: "actionDialog", value: actionDialog });
    if (createDialog) result.push({ type: "createDialog", value: createDialog });
    if (quotationAcceptanceDialog) {
      result.push({ type: "quotationAcceptance", quotationId: quotationAcceptanceDialog.quotationId });
    }
    if (editDialog) result.push({ type: "editDialog", value: editDialog });
    if (mobileNavOpen) result.push({ type: "mobileNav" });
    if (moreMenuOpen) result.push({ type: "moreMenu" });
    if (quickAddOpen) result.push({ type: "quickAdd" });
    if (keyboardShortcutsOpen) result.push({ type: "keyboardShortcuts" });
    return result;
  }, [
    commandPaletteOpen,
    actionDialog,
    createDialog,
    quotationAcceptanceDialog,
    editDialog,
    mobileNavOpen,
    moreMenuOpen,
    quickAddOpen,
    keyboardShortcutsOpen,
  ]);

  const desiredSnapshot = React.useMemo<WorkspaceNavigationSnapshot>(() => ({
    moduleId,
    activeTabId,
    moduleHistoryIndex,
    moduleHistoryLength,
    selectedCustomerId,
    detailPanel,
    contextHistory,
    contextHistoryIndex,
    overlays,
  }), [
    moduleId,
    activeTabId,
    moduleHistoryIndex,
    moduleHistoryLength,
    selectedCustomerId,
    detailPanel,
    contextHistory,
    contextHistoryIndex,
    overlays,
  ]);
  const desiredLayers = React.useMemo(() => navigationLayers(desiredSnapshot), [desiredSnapshot]);

  const entriesRef = React.useRef<BrowserNavigationState[]>([]);
  const positionRef = React.useRef(0);
  const sequenceRef = React.useRef(0);
  const applyingPopRef = React.useRef(false);
  const pendingPopEntryIdRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(false);
  const mobileRootGuardEnabledRef = React.useRef(false);
  const rootExitArmedUntilRef = React.useRef(0);

  const nextEntryId = React.useCallback((prefix = "uc-nav") => {
    sequenceRef.current += 1;
    return `${prefix}-${Date.now().toString(36)}-${sequenceRef.current.toString(36)}`;
  }, []);

  React.useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const rootLayers: NavigationLayer[] = [ROOT_LAYER];
    const initial = browserNavigationState(rootLayers, desiredSnapshot, nextEntryId());

    mobileRootGuardEnabledRef.current = shouldGuardMobileRootExit();
    if (mobileRootGuardEnabledRef.current) {
      // Keep one managed root entry behind the active workspace entry. The
      // first mobile Back press reaches this guard and stays inside the app;
      // a second press within the confirmation window is allowed to leave.
      const exitGuard = browserNavigationState(
        rootLayers,
        desiredSnapshot,
        nextEntryId(ROOT_EXIT_GUARD_PREFIX),
      );
      entriesRef.current = [exitGuard, initial];
      positionRef.current = 1;
      replaceBrowserState(exitGuard);
      pushBrowserState(initial);
      return;
    }

    entriesRef.current = [initial];
    positionRef.current = 0;
    replaceBrowserState(initial);
  }, [desiredSnapshot, nextEntryId]);

  React.useEffect(() => {
    if (!mountedRef.current || pendingPopEntryIdRef.current) return;
    if (applyingPopRef.current) {
      applyingPopRef.current = false;
      return;
    }

    const entries = entriesRef.current;
    const current = entries[positionRef.current];
    if (!current) return;

    if (navigationLayerListsEqual(current.layers, desiredLayers)) {
      const updated = browserNavigationState(desiredLayers, desiredSnapshot, current.entryId);
      entries[positionRef.current] = updated;
      replaceBrowserState(updated);
      return;
    }

    const currentSnapshot = current.snapshot;
    const contextTraversal =
      desiredSnapshot.contextHistory.length === currentSnapshot.contextHistory.length &&
      desiredSnapshot.contextHistoryIndex !== currentSnapshot.contextHistoryIndex;
    const moduleTraversal =
      desiredSnapshot.moduleHistoryLength === currentSnapshot.moduleHistoryLength &&
      desiredSnapshot.moduleHistoryIndex !== currentSnapshot.moduleHistoryIndex;

    if (contextTraversal || moduleTraversal) {
      const direction = contextTraversal
        ? Math.sign(desiredSnapshot.contextHistoryIndex - currentSnapshot.contextHistoryIndex)
        : Math.sign(desiredSnapshot.moduleHistoryIndex - currentSnapshot.moduleHistoryIndex);
      let targetIndex = -1;
      for (
        let index = positionRef.current + direction;
        index >= 0 && index < entries.length;
        index += direction
      ) {
        const candidate = entries[index];
        if (
          navigationLayerListsEqual(candidate.layers, desiredLayers) &&
          candidate.snapshot.contextHistoryIndex === desiredSnapshot.contextHistoryIndex &&
          candidate.snapshot.moduleHistoryIndex === desiredSnapshot.moduleHistoryIndex
        ) {
          targetIndex = index;
          break;
        }
      }
      if (targetIndex >= 0) {
        pendingPopEntryIdRef.current = entries[targetIndex].entryId;
        try {
          window.history.go(targetIndex - positionRef.current);
          return;
        } catch {
          pendingPopEntryIdRef.current = null;
        }
      }
    }

    const common = commonPrefixLength(current.layers, desiredLayers);
    const isPureRemoval = common === desiredLayers.length && desiredLayers.length < current.layers.length;

    if (isPureRemoval) {
      let targetIndex = -1;
      for (let index = positionRef.current - 1; index >= 0; index -= 1) {
        if (navigationLayerListsEqual(entries[index].layers, desiredLayers)) {
          targetIndex = index;
          break;
        }
      }
      if (targetIndex >= 0) {
        pendingPopEntryIdRef.current = entries[targetIndex].entryId;
        try {
          window.history.go(targetIndex - positionRef.current);
          return;
        } catch {
          pendingPopEntryIdRef.current = null;
        }
      }
      // No matching managed entry exists (for example after a full reload).
      // Replace the current entry rather than creating a Back loop.
      const replacement = browserNavigationState(desiredLayers, desiredSnapshot, current.entryId);
      entries[positionRef.current] = replacement;
      replaceBrowserState(replacement);
      return;
    }

    // A direct addition can contain more than one layer when React batches
    // state changes. Persist each intermediate layer so Back closes one layer
    // at a time. Lateral transitions are a single exact destination.
    const additionsOnly = common === current.layers.length && desiredLayers.length > current.layers.length;
    const layersToPush = additionsOnly
      ? desiredLayers.slice(current.layers.length).map((_, offset) => desiredLayers.slice(0, current.layers.length + offset + 1))
      : [desiredLayers];

    entriesRef.current = entries.slice(0, positionRef.current + 1);
    for (const layers of layersToPush) {
      const entry = browserNavigationState(layers, desiredSnapshot, nextEntryId());
      entriesRef.current.push(entry);
      positionRef.current = entriesRef.current.length - 1;
      pushBrowserState(entry);
    }
  }, [desiredLayers, desiredSnapshot, nextEntryId]);

  React.useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // Ignore route-level history entries owned by Next.js or another page.
      if (!isBrowserNavigationState(event.state)) {
        pendingPopEntryIdRef.current = null;
        applyingPopRef.current = false;
        return;
      }

      const state = event.state;
      if (mobileRootGuardEnabledRef.current && isRootExitGuard(state)) {
        pendingPopEntryIdRef.current = null;
        applyingPopRef.current = false;
        const now = Date.now();

        if (now <= rootExitArmedUntilRef.current) {
          rootExitArmedUntilRef.current = 0;
          window.history.back();
          return;
        }

        rootExitArmedUntilRef.current = now + ROOT_EXIT_CONFIRMATION_MS;
        const activeRoot = browserNavigationState([ROOT_LAYER], state.snapshot, nextEntryId());
        entriesRef.current = [state, activeRoot];
        positionRef.current = 1;
        pushBrowserState(activeRoot);
        toast.info("Press Back again to exit Urban Castle", {
          duration: ROOT_EXIT_CONFIRMATION_MS,
        });
        return;
      }

      const knownIndex = entriesRef.current.findIndex((entry) => entry.entryId === state.entryId);
      if (knownIndex >= 0) {
        positionRef.current = knownIndex;
        entriesRef.current[knownIndex] = state;
      } else {
        // A valid entry can outlive the in-memory list after Fast Refresh or a
        // browser page restore. It is still safe because the state is fully
        // validated and contains the complete navigation snapshot.
        entriesRef.current = [state];
        positionRef.current = 0;
      }
      pendingPopEntryIdRef.current = null;
      applyingPopRef.current = true;
      useRDashStore.getState().restoreNavigationSnapshot(state.snapshot);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [nextEntryId]);
}
