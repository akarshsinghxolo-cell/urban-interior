import type { ContextDetailTab, DetailPanelKind } from "./store/ui-types";

const DETAIL_TABS = new Set<ContextDetailTab>(["overview", "thread", "history"]);

export interface WorkspaceDetailTabRequest {
  tab: ContextDetailTab;
  explicit: boolean;
  invalid: boolean;
}

function searchParamsFrom(input: string | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  const raw = String(input || "").replace(/^\?/, "");
  return new URLSearchParams(raw);
}

/**
 * Customer workspaces have their own broader tab model. Stage 8 initially owns
 * only the shared record-detail tabs used by non-customer entity inspectors.
 */
export function supportsWorkspaceDetailTabs(kind: DetailPanelKind | undefined): boolean {
  return Boolean(kind && kind !== "customer");
}

export function workspaceDetailTabRequest(
  input: string | URLSearchParams,
  kind: DetailPanelKind | undefined,
): WorkspaceDetailTabRequest {
  const params = searchParamsFrom(input);
  const values = params.getAll("tab");
  if (!values.length) return { tab: "overview", explicit: false, invalid: false };
  if (!supportsWorkspaceDetailTabs(kind) || values.length !== 1) {
    return { tab: "overview", explicit: true, invalid: true };
  }
  const value = values[0] as ContextDetailTab;
  if (!DETAIL_TABS.has(value)) {
    return { tab: "overview", explicit: true, invalid: true };
  }
  return { tab: value, explicit: true, invalid: false };
}

/**
 * Produces the canonical URL for a detail-tab state. `overview` is represented
 * by the clean entity URL. Other query parameters are preserved only when the
 * caller is updating the same route.
 */
export function workspaceUrlWithDetailTab(
  pathname: string,
  currentSearch: string | URLSearchParams,
  kind: DetailPanelKind | undefined,
  tab: ContextDetailTab | undefined,
): string {
  const params = searchParamsFrom(currentSearch);
  params.delete("tab");
  if (supportsWorkspaceDetailTabs(kind) && tab && tab !== "overview") {
    params.set("tab", tab);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
