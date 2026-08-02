import type { RDashDatabase, VisitType, WorkRequired } from "./types";

export type VisitLeadWorkPlan = {
  workRequiredId?: string;
  createdWorkRequired?: WorkRequired;
  requiresSelection: boolean;
  reason?: string;
  source: "requested" | "existing" | "customer_interests" | "none";
};

type PlanVisitLeadWorkInput = {
  customerId: string;
  siteId: string;
  requestedWorkRequiredId?: string;
  visitType?: VisitType;
  locationTargetType?: "site" | "vendor";
  now: string;
  createId: () => string;
};

function activeSiteWork(db: RDashDatabase, customerId: string, siteId: string): WorkRequired[] {
  return db.workRequired
    .filter((work) =>
      work.customer_id === customerId &&
      work.site_id === siteId &&
      work.status !== "lost" &&
      work.status !== "completed")
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
}

function interestScope(db: RDashDatabase, customerId: string) {
  const customer = db.customers.find((row) => row.id === customerId);
  if (!customer) return { title: "General site scope" };

  const selectedSubcategories = (customer.interest_work_subcategory_ids || [])
    .map((id) => db.master.workSubcategories.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const selectedCategories = (customer.interest_category_ids || [])
    .map((id) => db.master.workCategories.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const names = selectedSubcategories.length
    ? selectedSubcategories.map((row) => row.name)
    : selectedCategories.map((row) => row.name);
  const shortNames = names.slice(0, 3);
  const suffix = names.length > 3 ? ` +${names.length - 3} more` : "";
  const title = shortNames.length
    ? `Site enquiry · ${shortNames.join(", ")}${suffix}`
    : "General site scope";

  const onlySubcategory = selectedSubcategories.length === 1 ? selectedSubcategories[0] : undefined;
  const onlyCategory = selectedCategories.length === 1 ? selectedCategories[0] : undefined;

  return {
    title,
    work_category_id: onlySubcategory?.category_id || onlyCategory?.id,
    work_subcategory_id: onlySubcategory?.id,
    source: customer.source_partner_name
      ? `Customer enquiry · ${customer.source_partner_name}`
      : "Customer enquiry",
  };
}

/**
 * Resolve the Work Required that owns a customer Site Visit / Measurement.
 *
 * Rules:
 * - respect an explicitly selected Work Required;
 * - auto-link the only active Work Required on the Site;
 * - when no Work Required exists, create a lightweight qualified scope using
 *   the Customer form's interest categories/subcategories;
 * - when multiple active scopes exist, require the user to select one rather
 *   than guessing which scope the Visit belongs to.
 */
export function planVisitLeadWork(db: RDashDatabase, input: PlanVisitLeadWorkInput): VisitLeadWorkPlan {
  if (input.requestedWorkRequiredId) {
    return {
      workRequiredId: input.requestedWorkRequiredId,
      requiresSelection: false,
      source: "requested",
    };
  }

  const visitType = input.visitType || "site_visit";
  const locationTargetType = input.locationTargetType || "site";
  const lifecycleVisit = locationTargetType === "site" && (visitType === "site_visit" || visitType === "measurement");
  if (!lifecycleVisit) {
    return { requiresSelection: false, source: "none" };
  }

  const active = activeSiteWork(db, input.customerId, input.siteId);
  if (active.length === 1) {
    return {
      workRequiredId: active[0].id,
      requiresSelection: false,
      source: "existing",
    };
  }
  if (active.length > 1) {
    return {
      requiresSelection: true,
      source: "none",
      reason: "This Site has multiple active Work Required records. Select the scope this Visit belongs to.",
    };
  }

  const scope = interestScope(db, input.customerId);
  const workRequiredId = input.createId();
  const createdWorkRequired: WorkRequired = {
    id: workRequiredId,
    customer_id: input.customerId,
    site_id: input.siteId,
    title: scope.title,
    work_category_id: scope.work_category_id,
    work_subcategory_id: scope.work_subcategory_id,
    area_ids: [],
    description: `Auto-created from Customer interests when scheduling a ${visitType.replaceAll("_", " ")}.`,
    structured_items: [],
    status: "contacted",
    source: scope.source,
    priority: "medium",
    created_at: input.now,
    updated_at: input.now,
  };

  return {
    workRequiredId,
    createdWorkRequired,
    requiresSelection: false,
    source: "customer_interests",
  };
}
