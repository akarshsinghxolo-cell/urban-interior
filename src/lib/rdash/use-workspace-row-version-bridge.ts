"use client";

import * as React from "react";
import { useRDashStore } from "./store";
import { workspaceRowVersionState } from "./workspace-row-version-state";

/**
 * Installs before passive workspace-loading effects. Every authoritative
 * hydration replaces the mirrored row-version map; delta hydration can then
 * merge remote versions without weakening the store's private CAS cache.
 */
export function useInstallWorkspaceRowVersionBridge(): void {
  React.useLayoutEffect(() => {
    const original = useRDashStore.getState().hydrateSecureWorkspace;
    const wrapped: typeof original = (input) => {
      workspaceRowVersionState.replace(input.rowVersions);
      original(input);
    };

    useRDashStore.setState({ hydrateSecureWorkspace: wrapped });
    return () => {
      if (useRDashStore.getState().hydrateSecureWorkspace === wrapped) {
        useRDashStore.setState({ hydrateSecureWorkspace: original });
      }
      workspaceRowVersionState.replace(undefined);
    };
  }, []);
}
