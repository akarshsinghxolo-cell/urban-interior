"use client";

import * as React from "react";
import { workspaceOutboxStore } from "./workspace-outbox";

export function useWorkspaceOutbox() {
  return React.useSyncExternalStore(
    workspaceOutboxStore.subscribe,
    workspaceOutboxStore.getSnapshot,
    workspaceOutboxStore.getSnapshot,
  );
}
