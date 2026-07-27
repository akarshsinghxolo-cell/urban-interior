import type { ReactNode } from "react";
import { WorkspaceRouteShell } from "@/components/urban-castle/WorkspaceRouteShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceRouteShell>{children}</WorkspaceRouteShell>;
}
