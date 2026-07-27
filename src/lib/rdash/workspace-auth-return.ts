export const WORKSPACE_RETURN_COOKIE = "uc_workspace_return_to";
export const WORKSPACE_RETURN_MAX_AGE_SECONDS = 10 * 60;

/**
 * Accepts only same-origin paths inside the workspace namespace. This helper is
 * intentionally independent from the full module registry so it stays safe and
 * lightweight in middleware. Unknown workspace paths are still handled by the
 * route adapter, which redirects them to Workdesk.
 */
export function safeWorkspaceReturnTo(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return undefined;

  try {
    const base = new URL("https://urban-castle.invalid");
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin) return undefined;
    if (parsed.pathname !== "/workspace" && !parsed.pathname.startsWith("/workspace/")) {
      return undefined;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

export function encodeWorkspaceReturnTo(value: string): string {
  return encodeURIComponent(value);
}

export function decodeWorkspaceReturnTo(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return safeWorkspaceReturnTo(decodeURIComponent(value));
  } catch {
    return undefined;
  }
}
