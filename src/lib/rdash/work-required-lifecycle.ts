import type {
  QuotationStatus,
  RDashDatabase,
  WorkOrderStatus,
  WorkRequired,
  WorkRequiredStatus,
} from "./types";

export const SALES_WORK_REQUIRED_STAGES: readonly WorkRequiredStatus[] = [
  "new",
  "contacted",
  "visit_scheduled",
  "measurement_done",
  "quotation_in_progress",
  "quotation_sent",
  "negotiation",
  "on_hold",
  "lost",
] as const;

const PROGRESS_STAGES: readonly WorkRequiredStatus[] = [
  "new",
  "contacted",
  "visit_scheduled",
  "measurement_done",
  "quotation_in_progress",
  "quotation_sent",
  "negotiation",
  "accepted",
  "contractor_bidding",
  "awarded",
  "in_progress",
  "completed",
] as const;

const WORKFLOW_OWNED_STAGES = new Set<WorkRequiredStatus>([
  "accepted",
  "contractor_bidding",
  "awarded",
  "in_progress",
  "completed",
]);

const ACTIVE_QUOTATION_STATUSES = new Set<QuotationStatus>(["draft", "sent", "accepted"]);

export interface WorkRequiredTransitionDecision {
  allowed: boolean;
  requiresReason: boolean;
  reason?: string;
}

function stageIndex(status: WorkRequiredStatus): number {
  return PROGRESS_STAGES.indexOf(status);
}

/**
 * Apply an automatic workflow milestone without allowing a later lifecycle
 * state to move backwards. Hold/lost require an explicit user transition and
 * are therefore never resumed implicitly by creating a visit, measurement, or
 * quotation.
 */
export function advanceWorkRequiredLifecycleStatus(
  current: WorkRequiredStatus,
  target: WorkRequiredStatus,
): WorkRequiredStatus {
  if (current === target) return current;
  const currentIndex = stageIndex(current);
  const targetIndex = stageIndex(target);
  if (currentIndex < 0 || targetIndex < 0) return current;
  return targetIndex > currentIndex ? target : current;
}

export function workRequiredStatusAfterQuotationChange(
  db: RDashDatabase,
  work: WorkRequired,
  quotationId: string,
  nextStatus: QuotationStatus,
): WorkRequiredStatus {
  if (nextStatus === "draft") {
    return advanceWorkRequiredLifecycleStatus(work.status, "quotation_in_progress");
  }
  if (nextStatus === "sent") {
    return advanceWorkRequiredLifecycleStatus(work.status, "quotation_sent");
  }
  if (nextStatus === "accepted") {
    return advanceWorkRequiredLifecycleStatus(work.status, "accepted");
  }

  // A rejected/expired/cancelled quotation must not put accepted or executing
  // work back on hold, and must not override another active quotation covering
  // the same work requirement.
  if (WORKFLOW_OWNED_STAGES.has(work.status) || work.status === "lost") return work.status;
  const hasAcceptedScope = db.acceptedScopes.some(
    (scope) => scope.work_required_id === work.id && scope.status !== "cancelled",
  );
  const hasActiveWorkOrder = db.workOrders.some(
    (order) =>
      order.work_required_ids.includes(work.id) &&
      order.status !== "cancelled" &&
      order.status !== "abandoned",
  );
  const hasOtherActiveQuotation = db.quotations.some(
    (quotation) =>
      quotation.id !== quotationId &&
      ACTIVE_QUOTATION_STATUSES.has(quotation.status) &&
      quotation.coverage.some((coverage) => coverage.work_required_id === work.id),
  );
  if (hasAcceptedScope || hasActiveWorkOrder || hasOtherActiveQuotation) return work.status;
  return "on_hold";
}

const WORK_ORDER_STATUS_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  scheduled: ["in_progress", "on_hold", "cancelled", "abandoned"],
  in_progress: ["on_hold", "completed", "cancelled", "abandoned"],
  on_hold: ["scheduled", "in_progress", "cancelled", "abandoned"],
  completed: [],
  cancelled: [],
  abandoned: [],
};

export function assertWorkOrderStatusTransition(current: WorkOrderStatus, target: WorkOrderStatus): void {
  if (current === target) return;
  if (!WORK_ORDER_STATUS_TRANSITIONS[current].includes(target)) {
    throw new Error(`Work Order cannot move from ${current} to ${target}.`);
  }
}

export function workRequiredStatusForQuotationRevision(
  db: RDashDatabase,
  work: WorkRequired,
  quotationId: string,
): WorkRequiredStatus {
  // The caller cancels scopes belonging to the superseded quotation. Preserve
  // any independent accepted scope or Work Order that still owns this work.
  const activeWorkOrderStatuses = db.workOrders
    .filter(
      (order) =>
        order.work_required_ids.includes(work.id) &&
        order.status !== "cancelled" &&
        order.status !== "abandoned",
    )
    .map((order) => order.status);
  const workOrderStatus = workRequiredStatusFromWorkOrderStatuses(activeWorkOrderStatuses);
  if (workOrderStatus) return workOrderStatus;

  const otherScopes = db.acceptedScopes.filter(
    (scope) =>
      scope.work_required_id === work.id &&
      scope.quotation_id !== quotationId &&
      scope.status !== "cancelled",
  );
  if (otherScopes.some((scope) => scope.status === "completed")) return "completed";
  if (otherScopes.some((scope) => scope.status === "awarded" || scope.status === "in_work_order")) return "awarded";
  if (otherScopes.some((scope) => scope.status === "accepted" || scope.status === "contractor_bidding")) {
    return "contractor_bidding";
  }

  // Defensive compatibility for legacy records whose operational relation is
  // missing but whose lifecycle has already advanced.
  if (work.status === "awarded" || work.status === "in_progress" || work.status === "completed") {
    return work.status;
  }
  return "quotation_in_progress";
}

export function workRequiredStatusAfterQuotationAcceptance(current: WorkRequiredStatus): WorkRequiredStatus {
  if (current === "awarded" || current === "in_progress" || current === "completed") return current;
  return "contractor_bidding";
}

export function workRequiredStatusAfterContractorAward(current: WorkRequiredStatus): WorkRequiredStatus {
  if (current === "in_progress" || current === "completed") return current;
  return "awarded";
}

function workRequiredStatusFromWorkOrderStatuses(
  statuses: readonly WorkOrderStatus[],
): WorkRequiredStatus | null {
  if (statuses.includes("completed")) return "completed";
  if (statuses.includes("in_progress")) return "in_progress";
  if (statuses.includes("scheduled")) return "awarded";
  if (statuses.includes("on_hold")) return "on_hold";
  return null;
}

export function workRequiredStatusAfterWorkOrderChange(
  db: RDashDatabase,
  work: WorkRequired,
  workOrderId: string,
  nextStatus: WorkOrderStatus,
): WorkRequiredStatus {
  const statuses = [
    nextStatus,
    ...db.workOrders
      .filter((order) => order.id !== workOrderId && order.work_required_ids.includes(work.id))
      .map((order) => order.status),
  ];
  return workRequiredStatusFromWorkOrderStatuses(statuses) || "on_hold";
}

function linkedQuotations(db: RDashDatabase, workRequiredId: string) {
  return db.quotations.filter((quotation) =>
    quotation.coverage.some((coverage) => coverage.work_required_id === workRequiredId),
  );
}

function hasActiveVisit(db: RDashDatabase, workRequiredId: string): boolean {
  return db.visits.some(
    (visit) =>
      visit.work_required_id === workRequiredId &&
      visit.status !== "cancelled" &&
      visit.status !== "missed",
  );
}

function hasVerifiedMeasurement(db: RDashDatabase, work: WorkRequired): boolean {
  const linkedAreaIds = new Set(work.area_ids || []);
  return db.measurementRevisions.some(
    (revision) =>
      revision.status === "verified" &&
      (revision.work_required_id === work.id || linkedAreaIds.has(revision.area_id)),
  );
}

function hasQuotationAtLeastDraft(db: RDashDatabase, workRequiredId: string): boolean {
  return linkedQuotations(db, workRequiredId).some((quotation) =>
    quotation.status === "draft" || quotation.status === "sent" || quotation.status === "accepted",
  );
}

function hasSentQuotation(db: RDashDatabase, workRequiredId: string): boolean {
  return linkedQuotations(db, workRequiredId).some((quotation) =>
    quotation.status === "sent" || quotation.status === "accepted",
  );
}

function hasAcceptedCommercialScope(db: RDashDatabase, workRequiredId: string): boolean {
  return (
    db.acceptedScopes.some(
      (scope) => scope.work_required_id === workRequiredId && scope.status !== "cancelled",
    ) ||
    db.workOrders.some((workOrder) => workOrder.work_required_ids.includes(workRequiredId))
  );
}

export function evaluateWorkRequiredTransition(
  db: RDashDatabase,
  work: WorkRequired,
  target: WorkRequiredStatus,
): WorkRequiredTransitionDecision {
  if (target === work.status) return { allowed: true, requiresReason: false };

  if (!SALES_WORK_REQUIRED_STAGES.includes(target)) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "This stage is owned by quotation acceptance, contractor award, or execution workflows.",
    };
  }

  if (WORKFLOW_OWNED_STAGES.has(work.status) || hasAcceptedCommercialScope(db, work.id)) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "Accepted or operational work cannot be moved from the sales board. Use its lifecycle workflow instead.",
    };
  }

  if (target === "lost" || target === "on_hold") {
    return { allowed: true, requiresReason: true };
  }

  const currentIndex = stageIndex(work.status);
  const targetIndex = stageIndex(target);
  const isResuming = work.status === "lost" || work.status === "on_hold";
  const isBackward = currentIndex >= 0 && targetIndex >= 0 && targetIndex < currentIndex;

  if (targetIndex < 0) {
    return { allowed: false, requiresReason: false, reason: "Unsupported sales stage." };
  }

  const activeVisitExists = hasActiveVisit(db, work.id);
  const verifiedMeasurementExists = hasVerifiedMeasurement(db, work);
  const quotationExists = hasQuotationAtLeastDraft(db, work.id);
  const sentQuotationExists = hasSentQuotation(db, work.id);

  if (targetIndex < stageIndex("quotation_sent") && sentQuotationExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "A sent quotation exists, so this work cannot move behind Quote sent.",
    };
  }
  if (targetIndex < stageIndex("quotation_in_progress") && quotationExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "A linked active quotation exists, so this work cannot move behind Quoting.",
    };
  }
  if (targetIndex < stageIndex("measurement_done") && verifiedMeasurementExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "A verified measurement exists, so this work cannot move behind Measured.",
    };
  }
  if (targetIndex < stageIndex("visit_scheduled") && activeVisitExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "A linked visit exists, so this work cannot move behind Visit planned.",
    };
  }

  if (targetIndex >= stageIndex("visit_scheduled") && !activeVisitExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "Schedule a linked visit before moving this work to Visit planned.",
    };
  }

  if (targetIndex >= stageIndex("measurement_done") && !verifiedMeasurementExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "Capture and verify a linked measurement before moving this work to Measured.",
    };
  }

  if (targetIndex >= stageIndex("quotation_in_progress") && !quotationExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "Create a linked active quotation before moving this work to Quoting.",
    };
  }

  if (targetIndex >= stageIndex("quotation_sent") && !sentQuotationExists) {
    return {
      allowed: false,
      requiresReason: false,
      reason: "Send the linked quotation before moving this work to Quote sent or Negotiation.",
    };
  }

  if (isBackward) {
    return { allowed: true, requiresReason: true };
  }

  return { allowed: true, requiresReason: isResuming };
}
