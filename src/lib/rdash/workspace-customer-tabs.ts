import type { ContextCustomerTab } from "./store/ui-types";

const CUSTOMER_TABS = new Set<ContextCustomerTab>([
  "overview",
  "sites",
  "tasks",
  "quotations",
  "payments",
  "invoices",
  "advances",
  "liabilities",
  "visits",
  "activity",
]);

export interface WorkspaceCustomerTabRequest {
  tab: ContextCustomerTab;
  explicit: boolean;
  invalid: boolean;
}

function searchParamsFrom(input: string | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  return new URLSearchParams(String(input || "").replace(/^\?/, ""));
}

export function workspaceCustomerTabRequest(
  input: string | URLSearchParams,
): WorkspaceCustomerTabRequest {
  const params = searchParamsFrom(input);
  const values = params.getAll("tab");
  if (!values.length) return { tab: "overview", explicit: false, invalid: false };
  if (values.length !== 1) return { tab: "overview", explicit: true, invalid: true };
  const value = values[0] as ContextCustomerTab;
  if (!CUSTOMER_TABS.has(value)) {
    return { tab: "overview", explicit: true, invalid: true };
  }
  return { tab: value, explicit: true, invalid: false };
}

/**
 * Produces the canonical Customer workspace URL. Overview is represented by the
 * clean Customer URL; durable non-default views use the shared `tab` key.
 */
export function workspaceUrlWithCustomerTab(
  pathname: string,
  currentSearch: string | URLSearchParams,
  tab: ContextCustomerTab | undefined,
): string {
  const params = searchParamsFrom(currentSearch);
  params.delete("tab");
  if (tab && tab !== "overview") params.set("tab", tab);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export const WORKSPACE_CUSTOMER_TABS = Object.freeze([...CUSTOMER_TABS]);
