export const WORKSPACE_TASK_SCOPES = [
  "all",
  "today",
  "daily",
  "weekly",
  "client",
  "site",
  "staff",
  "completed",
] as const;

export type WorkspaceTaskScope = (typeof WORKSPACE_TASK_SCOPES)[number];

const WORKSPACE_TASK_SCOPE_SET = new Set<string>(WORKSPACE_TASK_SCOPES);

export function isWorkspaceTaskScope(value: unknown): value is WorkspaceTaskScope {
  return typeof value === "string" && WORKSPACE_TASK_SCOPE_SET.has(value);
}

export interface WorkspaceTaskScopeRequest {
  scope: WorkspaceTaskScope;
  explicit: boolean;
  valid: boolean;
}

/**
 * Parse the Tasks & Follow-ups scope from a query string.
 *
 * Repeated, empty and unsupported values are treated as invalid and safely
 * canonicalize to the default All scope.
 */
export function workspaceTaskScopeRequest(search: string): WorkspaceTaskScopeRequest {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const values = params.getAll("scope");
  if (values.length === 0) return { scope: "all", explicit: false, valid: true };
  if (values.length !== 1 || !isWorkspaceTaskScope(values[0])) {
    return { scope: "all", explicit: true, valid: false };
  }
  return { scope: values[0], explicit: true, valid: true };
}

/**
 * Build the canonical Tasks URL for a selected scope while preserving unrelated
 * query parameters. The default All scope is omitted from the URL.
 */
export function workspaceUrlWithTaskScope(
  pathname: string,
  search: string,
  scope: WorkspaceTaskScope,
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("scope");

  if (pathname === "/workspace/tasks" && scope !== "all") {
    params.set("scope", scope);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
