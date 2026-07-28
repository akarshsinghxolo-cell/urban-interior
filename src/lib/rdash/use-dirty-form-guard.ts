"use client";

import * as React from "react";
import { useRDashStore } from "./store";
import {
  dirtyFormRegistry,
  type DirtyFormRegistration,
  type DirtyFormRegistrySnapshot,
} from "./dirty-form-registry";

export function useDirtyFormRegistrySnapshot(): DirtyFormRegistrySnapshot {
  return React.useSyncExternalStore(
    dirtyFormRegistry.subscribe,
    dirtyFormRegistry.getSnapshot,
    dirtyFormRegistry.getSnapshot,
  );
}

export function useDirtyFormRegistration(
  registration: DirtyFormRegistration,
): { markClean: () => void } {
  const saveRef = React.useRef(registration.save);
  const discardRef = React.useRef(registration.discard);
  saveRef.current = registration.save;
  discardRef.current = registration.discard;

  React.useEffect(() => dirtyFormRegistry.register({
    ...registration,
    save: () => saveRef.current(),
    discard: () => discardRef.current(),
  }), [registration.id, registration.label]);

  React.useEffect(() => {
    dirtyFormRegistry.update(registration.id, { dirty: registration.dirty });
  }, [registration.dirty, registration.id]);

  return React.useMemo(() => ({
    markClean: () => dirtyFormRegistry.markClean(registration.id),
  }), [registration.id]);
}

type StoreState = ReturnType<typeof useRDashStore.getState>;
type StoreAction = (...args: unknown[]) => unknown;

const GUARDED_ACTIONS = [
  "closeCreateDialog",
  "closeActionDialog",
  "closeEditDialog",
  "closeQuotationAcceptanceDialog",
  "setActiveModule",
  "navigateModuleHistory",
  "openTab",
  "closeTab",
  "setActiveTab",
  "openContextCustomer",
  "openContextDetail",
  "setContextCustomerTab",
  "setContextDetailTab",
  "navigateContextHistory",
  "clearContextHistory",
  "openDetail",
  "closeDetail",
] as const satisfies readonly (keyof StoreState)[];

type GuardedActionKey = (typeof GUARDED_ACTIONS)[number];

const NAVIGATION_REASONS: Partial<Record<GuardedActionKey, string>> = {
  closeCreateDialog: "close this form",
  closeActionDialog: "close this form",
  closeEditDialog: "close this form",
  closeQuotationAcceptanceDialog: "close this form",
  setActiveModule: "open another module",
  navigateModuleHistory: "move through module history",
  openTab: "open another workspace tab",
  closeTab: "close the active workspace tab",
  setActiveTab: "switch workspace tabs",
  openContextCustomer: "open another Customer",
  openContextDetail: "open another record",
  setContextCustomerTab: "switch Customer views",
  setContextDetailTab: "switch record views",
  navigateContextHistory: "move through record history",
  clearContextHistory: "leave the current record",
  openDetail: "open another record",
  closeDetail: "close the current record",
};

/**
 * Installs one central guard over the existing Zustand navigation actions. The
 * original action implementations remain authoritative; this only delays them
 * until every registered dirty form has been saved or discarded.
 */
export function useInstallDirtyFormNavigationGuards(): void {
  React.useEffect(() => {
    const initial = useRDashStore.getState();
    const originals = {} as Partial<Record<GuardedActionKey, StoreAction>>;
    const wrappers = {} as Partial<Record<GuardedActionKey, StoreAction>>;

    for (const key of GUARDED_ACTIONS) {
      const candidate = initial[key];
      if (typeof candidate !== "function") continue;
      const original = candidate as StoreAction;
      originals[key] = original;
      wrappers[key] = (...args: unknown[]) => {
        if (key === "closeTab") {
          const requestedTabId = String(args[0] || "");
          if (useRDashStore.getState().activeTabId !== requestedTabId) {
            original(...args);
            return;
          }
        }
        dirtyFormRegistry.requestNavigation(
          () => { original(...args); },
          { reason: NAVIGATION_REASONS[key] },
        );
      };
    }

    useRDashStore.setState(wrappers as Partial<StoreState>);

    return () => {
      const current = useRDashStore.getState();
      const restore = {} as Partial<Record<GuardedActionKey, StoreAction>>;
      for (const key of GUARDED_ACTIONS) {
        if (wrappers[key] && current[key] === wrappers[key]) {
          restore[key] = originals[key];
        }
      }
      useRDashStore.setState(restore as Partial<StoreState>);
    };
  }, []);
}
