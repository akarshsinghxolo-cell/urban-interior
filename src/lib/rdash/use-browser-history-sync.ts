"use client";

import * as React from "react";
import { useRDashStore } from "./store";

/**
 * useBrowserHistorySync
 *
 * Mirrors the app's in-app navigation onto the real browser history so the
 * mobile back gesture (iOS edge-swipe, Android hardware/gesture back) walks
 * the user back through the app instead of exiting it on the first swipe.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * The app is a single-route SPA (`/`) that drives all "screens" through
 * Zustand state (`activeModuleId`, `detailPanel`, dialogs…). The browser
 * therefore has only ONE history entry. The OS back gesture has nowhere to
 * go, so on iOS PWA (standalone) it exits the app, and on Android it jumps
 * to the previous app/tab. Users report this as "swiping back closes the
 * app". This hook gives the browser a history entry per navigated "layer".
 *
 * ── Layer model ──────────────────────────────────────────────────────────
 * A stack of layers, deepest last:
 *   [root]                            workdesk module, nothing open
 *   [root, module]                    a non-workdesk module
 *   [root, module?, detail]           a detail panel open
 *   [root, module?, detail?, overlay] a modal/palette/nav-drawer open
 *
 * Each layer transition pushes / pops a real `history` entry, so the OS back
 * affordance always has somewhere to go until the user is truly at the root,
 * at which point back exits the app (intentional — recommended default).
 *
 * ── Sync rules ───────────────────────────────────────────────────────────
 *  • Opening a layer (deeper nav)        → history.pushState
 *  • Closing a layer via in-app X button → history.go(-n)  (browser pops to
 *    the previous entry, which already represents the previous layer)
 *  • Sibling swap (e.g. sidebar module switch) → history.replaceState
 *    (sidebar items don't stack history; back returns to root, not to the
 *    previous module — standard business-app behaviour)
 *  • Browser back (popstate)             → restore the app to the layer
 *    described by event.state
 *
 * ── Overlays ─────────────────────────────────────────────────────────────
 * Overlays (command palette, action/create/edit/quotation dialogs, mobile
 * nav drawer, more menu) are treated as a single transient "overlay" layer.
 * We push an entry when one opens (so back closes it instead of exiting)
 * and pop on close. We do NOT restore a specific overlay on popstate —
 * overlays are ephemeral by nature.
 */

type Layer =
  | { type: "root" }
  | { type: "module"; id: string }
  | { type: "detail"; kind: string; recordId: string }
  | { type: "overlay" };

const ROOT: Layer = { type: "root" };
/** Module id that represents the "home"/root screen (no history entry). */
const ROOT_MODULE = "workdesk";

interface HistoryState {
  layer: Layer;
  /** Position of this entry in our layer stack (0 = root). */
  depth: number;
}

function layersEqual(a: Layer, b: Layer): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "module" && b.type === "module") return a.id === b.id;
  if (a.type === "detail" && b.type === "detail")
    return a.kind === b.kind && a.recordId === b.recordId;
  return true;
}

function commonPrefixLen(a: Layer[], b: Layer[]): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && layersEqual(a[i], b[i])) i++;
  return i;
}

/** Push `layer` onto history as a new entry. */
function pushLayer(layer: Layer, depth: number) {
  try {
    history.pushState({ layer, depth } satisfies HistoryState, "");
  } catch {
    /* non-browser / SSR — ignore */
  }
}

/** Replace the current history entry's state with `layer`. */
function replaceLayer(layer: Layer, depth: number) {
  try {
    history.replaceState({ layer, depth } satisfies HistoryState, "");
  } catch {
    /* ignore */
  }
}

export function useBrowserHistorySync(): void {
  // ── Reactive state for computing the desired layer stack ───────────────
  const activeModuleId = useRDashStore((s) => s.activeModuleId);
  const detailKind = useRDashStore((s) => s.detailPanel.kind);
  const detailRecordId = useRDashStore((s) => s.detailPanel.recordId);
  const commandPaletteOpen = useRDashStore((s) => s.commandPaletteOpen);
  const actionDialogType = useRDashStore((s) => s.actionDialog.type);
  const createDialog = useRDashStore((s) => s.createDialog);
  const quotationAcceptanceDialog = useRDashStore(
    (s) => s.quotationAcceptanceDialog,
  );
  const editDialog = useRDashStore((s) => s.editDialog);
  const mobileNavOpen = useRDashStore((s) => s.mobileNavOpen);
  const moreMenuOpen = useRDashStore((s) => s.moreMenuOpen);

  // ── Refs ───────────────────────────────────────────────────────────────
  // The layer stack as currently reflected in browser history.
  const stackRef = React.useRef<Layer[]>([ROOT]);
  // True while we are applying a popstate-driven restore (suppresses the
  // sync effect from re-pushing entries the browser just popped).
  const restoringRef = React.useRef(false);
  // Layers to push after an in-flight history.go(-n) completes (used when a
  // single user action both removes and adds layers, e.g. closing an overlay
  // and switching modules).
  const pendingPushRef = React.useRef<Layer[]>([]);
  const mountedRef = React.useRef(false);

  // ── Desired layer stack derived from store state ───────────────────────
  const desiredStack: Layer[] = React.useMemo(() => {
    const stack: Layer[] = [ROOT];
    if (activeModuleId && activeModuleId !== ROOT_MODULE)
      stack.push({ type: "module", id: activeModuleId });
    if (detailKind && detailRecordId)
      stack.push({
        type: "detail",
        kind: detailKind,
        recordId: detailRecordId,
      });
    const overlayOpen =
      commandPaletteOpen ||
      actionDialogType !== null ||
      createDialog !== null ||
      quotationAcceptanceDialog !== null ||
      editDialog !== null ||
      mobileNavOpen ||
      moreMenuOpen;
    if (overlayOpen) stack.push({ type: "overlay" });
    return stack;
  }, [
    activeModuleId,
    detailKind,
    detailRecordId,
    commandPaletteOpen,
    actionDialogType,
    createDialog,
    quotationAcceptanceDialog,
    editDialog,
    mobileNavOpen,
    moreMenuOpen,
  ]);

  // ── Restore app state to match a target layer stack (on popstate) ──────
  // Reads fresh state via getState() so the callback is stable.
  const applyStack = React.useCallback((stack: Layer[]) => {
    const s = useRDashStore.getState();
    // Close every overlay + detail first, then re-open down to the target.
    if (s.commandPaletteOpen) s.setCommandPaletteOpen(false);
    if (s.actionDialog.type !== null) s.closeActionDialog();
    if (s.createDialog !== null) s.closeCreateDialog();
    if (s.quotationAcceptanceDialog !== null) s.closeQuotationAcceptanceDialog();
    if (s.editDialog !== null) s.closeEditDialog();
    if (s.mobileNavOpen) s.setMobileNavOpen(false);
    if (s.moreMenuOpen) s.setMoreMenuOpen(false);
    if (s.detailPanel.kind) s.closeDetail();

    let moduleApplied = false;
    for (const layer of stack) {
      if (layer.type === "root") {
        if (!moduleApplied) {
          s.setActiveModule(ROOT_MODULE);
          moduleApplied = true;
        }
      } else if (layer.type === "module") {
        s.setActiveModule(layer.id);
        moduleApplied = true;
      } else if (layer.type === "detail") {
        // Re-open the detail record. `openDetail` resolves the customer /
        // context internally; fromModule defaults to the active module.
        s.openDetail(layer.kind as never, layer.recordId);
      }
      // overlay: deliberately not restored (transient).
    }
  }, []);

  // ── Seed the initial history entry on mount ────────────────────────────
  React.useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    replaceLayer(ROOT, 0);
    stackRef.current = [ROOT];
  }, []);

  // ── Sync effect: mirror desiredStack onto browser history ──────────────
  React.useEffect(() => {
    if (!mountedRef.current) return;

    // If we just applied a popstate restore, adopt the resulting stack
    // without touching history (the browser already moved).
    if (restoringRef.current) {
      restoringRef.current = false;
      stackRef.current = desiredStack;
      return;
    }

    const oldStack = stackRef.current;
    const common = commonPrefixLen(oldStack, desiredStack);
    const removed = oldStack.length - common;
    const added = desiredStack.slice(common);

    if (removed === 0 && added.length === 0) return;

    // Case A — sibling swap (e.g. sidebar module switch):
    // replace the current top entry. Back goes to root, not the previous
    // module — standard for sidebar navigation.
    if (removed === 1 && added.length === 1) {
      stackRef.current = desiredStack;
      replaceLayer(added[0], desiredStack.length - 1);
      return;
    }

    // Case B — layers removed only (e.g. closed a detail/overlay via X):
    // pop browser entries to match.
    if (removed > 0 && added.length === 0) {
      restoringRef.current = true;
      stackRef.current = desiredStack; // optimistic; popstate confirms
      try {
        history.go(-removed);
      } catch {
        restoringRef.current = false;
      }
      return;
    }

    // Case C — removed + added (e.g. closed an overlay AND switched module):
    // go back to the common prefix, then push the new tail once the browser
    // settles.
    if (removed > 0 && added.length > 0) {
      restoringRef.current = true;
      pendingPushRef.current = added;
      stackRef.current = oldStack.slice(0, common);
      try {
        history.go(-removed);
      } catch {
        restoringRef.current = false;
        pendingPushRef.current = [];
        // Fall back to pushing directly.
        for (const layer of added) {
          stackRef.current.push(layer);
          pushLayer(layer, stackRef.current.length - 1);
        }
      }
      return;
    }

    // Case D — added only (e.g. opened a detail panel / overlay):
    // push new entries.
    // removed === 0 && added.length > 0
    for (const layer of added) {
      stackRef.current.push(layer);
      pushLayer(layer, stackRef.current.length - 1);
    }
  }, [desiredStack]);

  // ── popstate listener (browser back / forward) ────────────────────────
  React.useEffect(() => {
    function onPopState(e: PopStateEvent) {
      // (1) Self-initiated navigation (we called history.go(-n)). Consume
      // the guard, align the stack to where the browser landed, and flush
      // any pending pushes.
      if (restoringRef.current) {
        restoringRef.current = false;
        const targetDepth = (e.state as HistoryState | null)?.depth ?? 0;
        stackRef.current = stackRef.current.slice(0, targetDepth + 1);
        const pending = pendingPushRef.current;
        pendingPushRef.current = [];
        for (const layer of pending) {
          stackRef.current.push(layer);
          pushLayer(layer, stackRef.current.length - 1);
        }
        return;
      }

      // (2) User-initiated back. Restore the app to the layer described by
      // event.state.
      const state = (e.state as HistoryState | null) ?? null;
      const targetDepth = state?.depth ?? 0;
      const targetStack =
        stackRef.current.slice(0, targetDepth + 1).length > 0
          ? stackRef.current.slice(0, targetDepth + 1)
          : [ROOT];

      restoringRef.current = true;
      stackRef.current = targetStack;
      try {
        applyStack(targetStack);
      } catch {
        // Restoration is best-effort; don't crash the back gesture.
        restoringRef.current = false;
      }
      // applyStack mutates store state → desiredStack recomputes → sync
      // effect runs with restoringRef=true → adopts stack, no history push.
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyStack]);
}
