import type { RDashDatabase } from "./types";
import type { CreateDialogKind } from "./store/ui-types";

const GLOBAL_QUICK_CREATE_REQUIREMENTS: Readonly<Partial<Record<CreateDialogKind, readonly string[]>>> = Object.freeze({
  quotation: Object.freeze(["customers", "sites", "workRequired"]),
  visit: Object.freeze(["customers", "sites", "workRequired", "master.vendors", "master.contractors"]),
});

export interface WorkspaceCreateReadiness {
  ready: boolean;
  reason?: string;
}

/**
 * Global quick-create controls must not interpret an omitted or row-scoped
 * collection as an authoritative empty selector. General Tasks/Follow-ups are
 * safe from bootstrap; Quotation/Visit require complete relationship lookups in
 * the current module snapshot. Contextual entity actions are intentionally not
 * routed through this helper because they already carry explicit entity IDs.
 */
export function workspaceGlobalCreateReadiness(
  database: RDashDatabase,
  kind: CreateDialogKind,
): WorkspaceCreateReadiness {
  const required = GLOBAL_QUICK_CREATE_REQUIREMENTS[kind];
  if (!required?.length) return { ready: true };

  const metadata = database as unknown as Record<string, unknown>;
  const strategy = String(metadata._workspace_read_strategy || "");
  const declared = metadata._workspace_read_collections;
  if (strategy === "row" || strategy === "bootstrap" || !Array.isArray(declared)) {
    return {
      ready: false,
      reason: "Required Customer/Site data is still loading for this screen.",
    };
  }

  const represented = new Set(
    declared.map((value) => String(value || "").trim()).filter(Boolean),
  );
  const missing = required.filter((collection) => !represented.has(collection));
  if (missing.length) {
    return {
      ready: false,
      reason: "Open a Customer/Site, Workdesk, Sales, Quotation, or Field module before using this shortcut.",
    };
  }
  return { ready: true };
}
