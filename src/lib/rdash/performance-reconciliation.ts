import type { Master, RDashDatabase } from "./types";

type PerformanceFields = {
  reliability_score: number;
  on_time_pct: number;
  rating: number;
};

type PerformanceRecord = {
  reliability_score?: number;
  on_time_pct?: number;
  rating?: number;
};

type PerformanceEvidence = PerformanceFields & {
  evidenceCount: number;
};

const TERMINAL_EXCLUDED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "void",
  "rejected",
  "deleted",
]);

const BILL_EXCLUDED_STATUSES = new Set([
  "draft",
  ...TERMINAL_EXCLUDED_STATUSES,
]);

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function sameId(value: unknown, expected: string): boolean {
  return String(value || "").trim() === expected;
}

function validTimestamp(value: unknown): number | null {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentage(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return clampPercent((numerator / denominator) * 100);
}

function weightedScore(parts: Array<{ value: number | null; weight: number }>): number {
  const available = parts.filter(
    (part): part is { value: number; weight: number } =>
      part.value !== null && Number.isFinite(part.value) && part.weight > 0,
  );
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  if (!totalWeight) return 0;
  return clampPercent(
    available.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight,
  );
}

function ratingForScore(score: number): number {
  const normalized = clampPercent(score);
  if (normalized >= 90) return 5;
  if (normalized >= 75) return 4;
  if (normalized >= 60) return 3;
  if (normalized >= 40) return 2;
  return 1;
}

function buildPerformance(
  onTimePct: number | null,
  qualityPct: number | null,
  disputeRate: number | null,
  evidenceCount: number,
): PerformanceEvidence {
  const baseScore = weightedScore([
    { value: onTimePct, weight: 0.55 },
    { value: qualityPct, weight: 0.45 },
  ]);
  const disputePenalty = disputeRate === null
    ? 0
    : Math.min(30, Math.round(disputeRate * 0.3));
  const reliabilityScore = clampPercent(baseScore - disputePenalty);
  return {
    reliability_score: reliabilityScore,
    on_time_pct: onTimePct ?? 0,
    rating: ratingForScore(reliabilityScore),
    evidenceCount,
  };
}

export function deriveVendorPerformance(
  db: Pick<RDashDatabase, "purchaseOrders" | "vendorBills">,
  vendorIdInput: string,
): PerformanceFields {
  return deriveVendorPerformanceEvidence(db, vendorIdInput);
}

/**
 * Evidence-bearing variant for store actions: evidenceCount === 0 means there
 * is nothing to reconcile, so the persisted scorecard must stay untouched.
 */
export function deriveVendorPerformanceEvidenceExport(
  db: Pick<RDashDatabase, "purchaseOrders" | "vendorBills">,
  vendorIdInput: string,
): PerformanceEvidence {
  return deriveVendorPerformanceEvidence(db, vendorIdInput);
}

function deriveVendorPerformanceEvidence(
  db: Pick<RDashDatabase, "purchaseOrders" | "vendorBills">,
  vendorIdInput: string,
): PerformanceEvidence {
  const vendorId = String(vendorIdInput || "").trim();
  if (!vendorId) return buildPerformance(null, null, null, 0);

  const delivered = db.purchaseOrders.filter((row) => {
    if (!sameId(row.vendor_id, vendorId)) return false;
    if (TERMINAL_EXCLUDED_STATUSES.has(normalizeStatus(row.status))) return false;
    return validTimestamp(row.actual_delivery) !== null &&
      validTimestamp(row.expected_delivery) !== null;
  });
  const onTime = delivered.filter((row) => {
    const actual = validTimestamp(row.actual_delivery);
    const expected = validTimestamp(row.expected_delivery);
    return actual !== null && expected !== null && actual <= expected;
  }).length;
  const onTimePct = percentage(onTime, delivered.length);

  const bills = db.vendorBills.filter((row) => {
    if (!sameId(row.vendor_id, vendorId)) return false;
    return !BILL_EXCLUDED_STATUSES.has(normalizeStatus(row.status));
  });
  const disputed = bills.filter((row) => normalizeStatus(row.status) === "disputed").length;
  const qualityEligible = bills.filter((row) => normalizeStatus(row.status) !== "disputed");
  const matched = qualityEligible.filter((row) => {
    const status = normalizeStatus(row.status);
    return row.matched === true ||
      status === "approved" ||
      status === "paid" ||
      status === "partly_paid";
  }).length;
  const matchRate = percentage(matched, qualityEligible.length);
  const disputeRate = percentage(disputed, bills.length);

  return buildPerformance(
    onTimePct,
    matchRate,
    disputeRate,
    delivered.length + bills.length,
  );
}

export function deriveContractorPerformance(
  db: Pick<RDashDatabase, "workOrders" | "contractorBills">,
  contractorIdInput: string,
): PerformanceFields {
  return deriveContractorPerformanceEvidence(db, contractorIdInput);
}

/** Evidence-bearing variant — see deriveVendorPerformanceEvidenceExport. */
export function deriveContractorPerformanceEvidenceExport(
  db: Pick<RDashDatabase, "workOrders" | "contractorBills">,
  contractorIdInput: string,
): PerformanceEvidence {
  return deriveContractorPerformanceEvidence(db, contractorIdInput);
}

function deriveContractorPerformanceEvidence(
  db: Pick<RDashDatabase, "workOrders" | "contractorBills">,
  contractorIdInput: string,
): PerformanceEvidence {
  const contractorId = String(contractorIdInput || "").trim();
  if (!contractorId) return buildPerformance(null, null, null, 0);

  const completed = db.workOrders.filter((row) => {
    if (!sameId(row.contractor_id, contractorId)) return false;
    if (TERMINAL_EXCLUDED_STATUSES.has(normalizeStatus(row.status))) return false;
    return validTimestamp(row.actual_end) !== null &&
      validTimestamp(row.expected_end) !== null;
  });
  const onTime = completed.filter((row) => {
    const actual = validTimestamp(row.actual_end);
    const expected = validTimestamp(row.expected_end);
    return actual !== null && expected !== null && actual <= expected;
  }).length;
  const onTimePct = percentage(onTime, completed.length);

  // Contractor quality must not be reduced because Urban Castle has not paid a
  // valid bill yet. Only held/disputed evidence reflects a contractor-side
  // quality or documentation problem; payment timing is a company obligation.
  const bills = db.contractorBills.filter((row) => {
    if (!sameId(row.contractor_id, contractorId)) return false;
    return !BILL_EXCLUDED_STATUSES.has(normalizeStatus(row.status));
  });
  const disputedOrHeld = bills.filter((row) => {
    const status = normalizeStatus(row.status);
    return status === "disputed" || status === "held";
  }).length;
  const accepted = bills.length - disputedOrHeld;
  const acceptanceRate = percentage(accepted, bills.length);
  const disputeRate = percentage(disputedOrHeld, bills.length);

  return buildPerformance(
    onTimePct,
    acceptanceRate,
    disputeRate,
    completed.length + bills.length,
  );
}

function withPerformance<T extends PerformanceRecord>(
  row: T,
  performance: PerformanceEvidence,
): T & PerformanceFields {
  if (performance.evidenceCount === 0) {
    return row as T & PerformanceFields;
  }
  if (
    clampPercent(Number(row.reliability_score)) === performance.reliability_score &&
    clampPercent(Number(row.on_time_pct)) === performance.on_time_pct &&
    Number(row.rating) === performance.rating
  ) {
    return row as T & PerformanceFields;
  }
  return {
    ...row,
    reliability_score: performance.reliability_score,
    on_time_pct: performance.on_time_pct,
    rating: performance.rating,
  };
}

/**
 * Rebuild persisted partner scores from operational evidence. This is pure and
 * idempotent, so the UI reconciliation agent can compare current values without
 * adding audit noise or relying on a user to press a button.
 */
export function reconcilePartnerPerformance(db: RDashDatabase): Master {
  const vendors = db.master.vendors.map((vendor) =>
    withPerformance(vendor, deriveVendorPerformanceEvidence(db, vendor.id)),
  );
  const contractors = db.master.contractors.map((contractor) =>
    withPerformance(contractor, deriveContractorPerformanceEvidence(db, contractor.id)),
  );

  const vendorsChanged = vendors.some(
    (vendor, index) => vendor !== db.master.vendors[index],
  );
  const contractorsChanged = contractors.some(
    (contractor, index) => contractor !== db.master.contractors[index],
  );

  if (!vendorsChanged && !contractorsChanged) return db.master;
  return { ...db.master, vendors, contractors };
}
