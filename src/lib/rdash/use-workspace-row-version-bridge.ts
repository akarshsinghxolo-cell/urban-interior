"use client";

import * as React from "react";
import { useRDashStore } from "./store";
import { workspaceRowVersionState } from "./workspace-row-version-state";
import { workspaceSnapshotRemovedRowVersionKeys } from "./workspace-session-merge";

/**
 * Installs before passive workspace-loading effects. Every authoritative
 * hydration merges authoritative row versions into the session mirror without
 * discarding versions retained from the bootstrap or previously loaded modules.
 */
export function useInstallWorkspaceRowVersionBridge(): void {
  React.useLayoutEffect(() => {
    const original = useRDashStore.getState().hydrateSecureWorkspace;
    const wrapped: typeof original = (input) => {
      const removedVersionKeys = [
        ...workspaceSnapshotRemovedRowVersionKeys(useRDashStore.getState().db, input.db),
        ...(input.deletedRowVersionKeys || []),
      ];
      const accepted = original(input);
      if (accepted) {
        workspaceRowVersionState.merge(input.rowVersions);
        workspaceRowVersionState.remove(removedVersionKeys);
      }
      return accepted;
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
