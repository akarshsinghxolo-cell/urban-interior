import { redirect } from "next/navigation";
import { resolveWorkspaceLocation } from "@/lib/rdash/workspace-entity-routes";
import { WORKSPACE_ROOT_PATH } from "@/lib/rdash/workspace-routes";

type WorkspaceRoutePageProps = {
  params: Promise<{ segments?: string[] }>;
};

export default async function WorkspaceRoutePage({ params }: WorkspaceRoutePageProps) {
  const { segments = [] } = await params;
  const pathname = segments.length
    ? `${WORKSPACE_ROOT_PATH}/${segments.map(encodeURIComponent).join("/")}`
    : WORKSPACE_ROOT_PATH;
  const match = resolveWorkspaceLocation(pathname);

  if (!match) redirect(WORKSPACE_ROOT_PATH);
  if (match.isAlias) redirect(match.canonicalPath);

  // The persistent layout owns the application shell. The leaf page validates
  // module and core entity locations but intentionally mounts no second app.
  return null;
}
