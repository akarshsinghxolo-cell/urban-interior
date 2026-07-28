"use client";

import * as React from "react";
import { useDirtyFormRegistrySnapshot } from "@/lib/rdash/use-dirty-form-guard";
import { useWorkspaceOutbox } from "./use-workspace-outbox";
import {
  consumeWorkspaceExitBypass,
  workspaceExitRisk,
} from "./workspace-exit-guard";

/**
 * Uses the browser's native unload confirmation for locally queued operations
 * and registered forms that still contain changes not submitted to the outbox.
 */
export function useWorkspaceExitGuard(): void {
  const outbox = useWorkspaceOutbox();
  const dirtyForms = useDirtyFormRegistrySnapshot();
  const risk = React.useMemo(() => workspaceExitRisk(outbox), [outbox]);
  const shouldWarn = risk.shouldWarn || dirtyForms.dirtyForms.length > 0;

  React.useEffect(() => {
    if (!shouldWarn) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (consumeWorkspaceExitBypass()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldWarn]);
}
