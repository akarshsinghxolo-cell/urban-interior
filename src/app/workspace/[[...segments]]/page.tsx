import { redirect } from "next/navigation";
import { resolveWorkspacePath, WORKSPACE_ROOT_PATH } from "@/lib/rdash/workspace-routes";

type WorkspaceRoutePageProps = {
  params: Promise<{ segments?: string[] }>;
};

export default async function WorkspaceRoutePage({ params }: WorkspaceRoutePageProps) {
  const { segments = [] } = await params;
  const pathname = segments.length
    ? `${WORKSPACE_ROOT_PATH}/${segments.map(encodeURIComponent).join("/")}`
    : WORKSPACE_ROOT_PATH;
  const match = resolveWorkspacePath(pathname);

  // Entity deep links are not active in this stage. Unknown workspace paths
  // return to the safe Workdesk route instead of mounting an ambiguous screen.
  if (!match) redirect(WORKSPACE_ROOT_PATH);
  if (match.isAlias) redirect(match.canonicalPath);

  // The persistent layout owns the application shell. The leaf page is only a
  // validated route marker and intentionally renders no second application.
  return null;
}
