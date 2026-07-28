"use client";

import * as React from "react";
import { useWorkspaceOutbox } from "./use-workspace-outbox";
import {
  consumeWorkspaceExitBypass,
  workspaceExitRisk,
} from "./workspace-exit-guard";

/**
 * Uses the browser's native unload confirmation only for document exits.
 * In-app module/detail navigation is intentionally unaffected because the
 * workspace outbox is durable and the persistent shell remains mounted.
 */
export function useWorkspaceExitGuard(): void {
  const outbox = useWorkspaceOutbox();
  const risk = React.useMemo(() => workspaceExitRisk(outbox), [outbox]);

  React.useEffect(() => {
    if (!risk.shouldWarn) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (consumeWorkspaceExitBypass()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [risk.shouldWarn]);
}
