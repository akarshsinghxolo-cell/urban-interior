import type {
  ContextHistoryEntry,
  DetailPanelState,
  WorkspaceNavigationSnapshot,
  WorkspaceOverlaySnapshot,
} from "./store/ui-types";

const ROOT_MODULE = "workdesk";
const HISTORY_MARKER = "urban-castle-navigation-v3" as const;

type NavigationLayer =
  | { type: "root" }
  | { type: "module"; moduleId: string }
  | { type: "detail"; kind: string; recordId: string; panelTab?: string }
  | { type: "overlay"; overlay: WorkspaceOverlaySnapshot };

export interface BrowserNavigationState {
  marker: typeof HISTORY_MARKER;
  entryId: string;
  depth: number;
  layers: NavigationLayer[];
  snapshot: WorkspaceNavigationSnapshot;
}

const ROOT_LAYER: NavigationLayer = { type: "root" };

function overlayKey(overlay: WorkspaceOverlaySnapshot): string {
  switch (overlay.type) {
    case "commandPalette":
    case "mobileNav":
    case "moreMenu":
    case "quickAdd":
    case "keyboardShortcuts":
      return overlay.type;
    case "actionDialog":
      return `${overlay.type}:${overlay.value.type || "none"}:${overlay.value.customerId || ""}`;
    case "createDialog":
      return `${overlay.type}:${overlay.value.kind}:${overlay.value.customerId || ""}:${overlay.value.siteId || ""}:${overlay.value.workRequiredId || ""}`;
    case "quotationAcceptance":
      return `${overlay.type}:${overlay.quotationId}`;
    case "editDialog":
      return `${overlay.type}:${overlay.value.type}:${overlay.value.entityId}`;
  }
}

function layersEqual(left: NavigationLayer, right: NavigationLayer): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "module" && right.type === "module") return left.moduleId === right.moduleId;
  if (left.type === "detail" && right.type === "detail") {
    return left.kind === right.kind && left.recordId === right.recordId && left.panelTab === right.panelTab;
  }
  if (left.type === "overlay" && right.type === "overlay") {
    return overlayKey(left.overlay) === overlayKey(right.overlay);
  }
  return true;
}

export function navigationLayerListsEqual(left: NavigationLayer[], right: NavigationLayer[]): boolean {
  return left.length === right.length && left.every((layer, index) => layersEqual(layer, right[index]));
}

export function commonPrefixLength(left: NavigationLayer[], right: NavigationLayer[]): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && layersEqual(left[index], right[index])) index += 1;
  return index;
}

export function navigationLayers(snapshot: WorkspaceNavigationSnapshot): NavigationLayer[] {
  const layers: NavigationLayer[] = [ROOT_LAYER];
  if (snapshot.moduleId !== ROOT_MODULE) layers.push({ type: "module", moduleId: snapshot.moduleId });
  if (snapshot.detailPanel.kind && snapshot.detailPanel.recordId) {
    layers.push({
      type: "detail",
      kind: snapshot.detailPanel.kind,
      recordId: snapshot.detailPanel.recordId,
      panelTab: snapshot.detailPanel.panelTab,
    });
  }
  snapshot.overlays.forEach((overlay) => layers.push({ type: "overlay", overlay }));
  return layers;
}

function snapshotForLayers(
  desired: WorkspaceNavigationSnapshot,
  layers: NavigationLayer[],
): WorkspaceNavigationSnapshot {
  const moduleLayer = [...layers].reverse().find(
    (layer): layer is Extract<NavigationLayer, { type: "module" }> => layer.type === "module",
  );
  const detailLayer = [...layers].reverse().find(
    (layer): layer is Extract<NavigationLayer, { type: "detail" }> => layer.type === "detail",
  );
  const overlays = layers
    .filter((layer): layer is Extract<NavigationLayer, { type: "overlay" }> => layer.type === "overlay")
    .map((layer) => layer.overlay);
  const moduleId = moduleLayer?.moduleId || ROOT_MODULE;
  const keepDesiredDetail = Boolean(
    detailLayer &&
    desired.detailPanel.kind === detailLayer.kind &&
    desired.detailPanel.recordId === detailLayer.recordId,
  );

  return {
    moduleId,
    activeTabId: moduleId === desired.moduleId ? desired.activeTabId : `tab-${moduleId}`,
    moduleHistoryIndex: desired.moduleHistoryIndex,
    moduleHistoryLength: desired.moduleHistoryLength,
    selectedCustomerId: keepDesiredDetail ? desired.selectedCustomerId : null,
    detailPanel: keepDesiredDetail ? desired.detailPanel : { kind: null, recordId: null },
    contextHistory: keepDesiredDetail ? desired.contextHistory : [],
    contextHistoryIndex: keepDesiredDetail ? desired.contextHistoryIndex : -1,
    overlays,
  };
}

export function browserNavigationState(
  layers: NavigationLayer[],
  desired: WorkspaceNavigationSnapshot,
  entryId: string,
): BrowserNavigationState {
  return {
    marker: HISTORY_MARKER,
    entryId,
    depth: layers.length - 1,
    layers,
    snapshot: snapshotForLayers(desired, layers),
  };
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isDetailPanel(value: unknown): value is DetailPanelState {
  if (!value || typeof value !== "object") return false;
  const panel = value as Partial<DetailPanelState>;
  if (!isNullableString(panel.kind) || !isNullableString(panel.recordId)) return false;
  if ((panel.kind === null) !== (panel.recordId === null)) return false;
  return isOptionalString(panel.panelTab) && isOptionalString(panel.fromModule);
}

function isContextHistoryEntry(value: unknown): value is ContextHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ContextHistoryEntry>;
  return (
    typeof entry.kind === "string" &&
    typeof entry.recordId === "string" &&
    isOptionalString(entry.customerId) &&
    isOptionalString(entry.sourceModule) &&
    isOptionalString(entry.customerTab) &&
    isOptionalString(entry.detailTab)
  );
}

function isOverlaySnapshot(value: unknown): value is WorkspaceOverlaySnapshot {
  if (!value || typeof value !== "object") return false;
  const overlay = value as { type?: unknown; value?: unknown; quotationId?: unknown };
  if (typeof overlay.type !== "string") return false;
  if (["commandPalette", "mobileNav", "moreMenu", "quickAdd", "keyboardShortcuts"].includes(overlay.type)) return true;
  if (overlay.type === "quotationAcceptance") return typeof overlay.quotationId === "string";
  if (!overlay.value || typeof overlay.value !== "object") return false;
  const nested = overlay.value as Record<string, unknown>;
  if (overlay.type === "actionDialog") {
    return (nested.type === null || typeof nested.type === "string") && isOptionalString(nested.customerId);
  }
  if (overlay.type === "createDialog") {
    return (
      typeof nested.kind === "string" &&
      isOptionalString(nested.customerId) &&
      isOptionalString(nested.siteId) &&
      isOptionalString(nested.workRequiredId) &&
      isOptionalString(nested.visitType)
    );
  }
  if (overlay.type === "editDialog") {
    return typeof nested.type === "string" && typeof nested.entityId === "string";
  }
  return false;
}

function isNavigationLayer(value: unknown): value is NavigationLayer {
  if (!value || typeof value !== "object") return false;
  const layer = value as { type?: unknown; moduleId?: unknown; kind?: unknown; recordId?: unknown; panelTab?: unknown; overlay?: unknown };
  if (layer.type === "root") return true;
  if (layer.type === "module") return typeof layer.moduleId === "string";
  if (layer.type === "detail") {
    return typeof layer.kind === "string" && typeof layer.recordId === "string" && isOptionalString(layer.panelTab);
  }
  if (layer.type === "overlay") return isOverlaySnapshot(layer.overlay);
  return false;
}

export function isBrowserNavigationState(value: unknown): value is BrowserNavigationState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BrowserNavigationState>;
  const snapshot = candidate.snapshot as Partial<WorkspaceNavigationSnapshot> | undefined;
  const contextHistoryIndex = snapshot?.contextHistoryIndex;
  if (
    candidate.marker !== HISTORY_MARKER ||
    typeof candidate.entryId !== "string" ||
    !candidate.entryId ||
    !Number.isInteger(candidate.depth) ||
    !Array.isArray(candidate.layers) ||
    candidate.layers.length === 0 ||
    candidate.depth !== candidate.layers.length - 1 ||
    !candidate.layers.every(isNavigationLayer) ||
    candidate.layers[0]?.type !== "root" ||
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof snapshot.moduleId !== "string" ||
    !isNullableString(snapshot.activeTabId) ||
    !Number.isInteger(snapshot.moduleHistoryIndex) ||
    !Number.isInteger(snapshot.moduleHistoryLength) ||
    (snapshot.moduleHistoryLength as number) < 0 ||
    (snapshot.moduleHistoryIndex as number) < -1 ||
    (snapshot.moduleHistoryIndex as number) >= (snapshot.moduleHistoryLength as number) ||
    !isNullableString(snapshot.selectedCustomerId) ||
    !isDetailPanel(snapshot.detailPanel) ||
    !Array.isArray(snapshot.contextHistory) ||
    !snapshot.contextHistory.every(isContextHistoryEntry) ||
    !Number.isInteger(contextHistoryIndex) ||
    !Array.isArray(snapshot.overlays) ||
    !snapshot.overlays.every(isOverlaySnapshot)
  ) {
    return false;
  }
  return (contextHistoryIndex as number) >= -1 && (contextHistoryIndex as number) < snapshot.contextHistory.length;
}
