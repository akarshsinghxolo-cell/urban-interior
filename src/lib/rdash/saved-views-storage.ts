import type { SavedView } from "./store/ui-types";

export const SAVED_VIEWS_STORAGE_KEY = "uc_saved_views_v1";
const MAX_SAVED_VIEWS = 100;

function isSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<SavedView>;
  return typeof view.id === "string" && typeof view.workspaceKey === "string" &&
    typeof view.label === "string" && typeof view.search === "string" &&
    typeof view.createdAt === "number" && !!view.extra && typeof view.extra === "object";
}

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isSavedView).slice(-MAX_SAVED_VIEWS) : [];
  } catch {
    return [];
  }
}

export function persistSavedViews(views: readonly SavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views.slice(-MAX_SAVED_VIEWS)));
  } catch {
    // Preferences are non-critical; storage may be unavailable in private mode.
  }
}
