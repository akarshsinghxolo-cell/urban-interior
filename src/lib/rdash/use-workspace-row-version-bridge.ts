"use client";

import * as React from "react";
import { useRDashStore } from "./store";
import { workspaceRowVersionState } from "./workspace-row-version-state";

/**
 * Installs before passive workspace-loading effects. Every authoritative
 * hydration merges authoritative row versions into the session mirror without
 * discarding versions retained from the bootstrap or previously loaded modules.
 */
export function useInstallWorkspaceRowVersionBridge(): void {
  React.useLayoutEffect(() => {
    const original = useRDashStore.getState().hydrateSecureWorkspace;
    const wrapped: typeof original = (input) => {
      workspaceRowVersionState.merge(input.rowVersions);
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
