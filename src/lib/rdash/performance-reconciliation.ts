import type { Master, RDashDatabase } from "./types";

type PerformanceFields = {
  reliability_score: number;
  on_time_pct: number;
  rating: number;
};

type PerformanceRecord = {
  reliability_score?: number;
  on_time_pct?: number;
};

function ratingForScore(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

export function deriveVendorPerformance(
  db: Pick<RDashDatabase, "purchaseOrders" | "vendorBills">,
  vendorId: string,
): PerformanceFields {
  const purchaseOrders = db.purchaseOrders.filter((row) => row.vendor_id === vendorId);
  const delivered = purchaseOrders.filter(
    (row) => Boolean(row.actual_delivery && row.expected_delivery),
  );
  const onTime = delivered.filter(
    (row) => row.actual_delivery! <= row.expected_delivery,
  ).length;
  const onTimePct = delivered.length
    ? Math.round((onTime / delivered.length) * 100)
    : 0;

  const bills = db.vendorBills.filter(
    (row) => row.vendor_id === vendorId && row.status !== "draft",
  );
  const matched = bills.filter(
    (row) =>
      row.matched === true ||
      row.status === "approved" ||
      row.status === "paid" ||
      row.status === "partly_paid",
  ).length;
  const disputed = bills.filter((row) => row.status === "disputed").length;
  const matchRate = bills.length ? Math.round((matched / bills.length) * 100) : 100;
  const disputePenalty = Math.min(30, disputed * 10);
  const reliabilityScore = Math.max(
    0,
    Math.min(100, Math.round(onTimePct * 0.55 + matchRate * 0.45) - disputePenalty),
  );

  return {
    reliability_score: reliabilityScore,
    on_time_pct: onTimePct,
    rating: ratingForScore(reliabilityScore),
  };
}

export function deriveContractorPerformance(
  db: Pick<RDashDatabase, "workOrders" | "contractorBills">,
  contractorId: string,
): PerformanceFields {
  const workOrders = db.workOrders.filter(
    (row) => row.contractor_id === contractorId,
  );
  const completed = workOrders.filter(
    (row) => Boolean(row.actual_end && row.expected_end),
  );
  const onTime = completed.filter(
    (row) => row.actual_end! <= row.expected_end!,
  ).length;
  const onTimePct = completed.length
    ? Math.round((onTime / completed.length) * 100)
    : 0;

  const bills = db.contractorBills.filter(
    (row) => row.contractor_id === contractorId && row.status !== "held",
  );
  const settled = bills.filter(
    (row) => row.status === "paid" || row.status === "partly_paid",
  ).length;
  const disputed = bills.filter((row) => row.status === "disputed").length;
  const settlementRate = bills.length
    ? Math.round((settled / bills.length) * 100)
    : 100;
  const disputePenalty = Math.min(30, disputed * 10);
  const reliabilityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(onTimePct * 0.55 + settlementRate * 0.45) - disputePenalty,
    ),
  );

  return {
    reliability_score: reliabilityScore,
    on_time_pct: onTimePct,
    rating: ratingForScore(reliabilityScore),
  };
}

function withPerformance<T extends PerformanceRecord>(
  row: T,
  performance: PerformanceFields,
): T & PerformanceFields {
  const currentRating = (row as T & { rating?: number }).rating;
  if (
    row.reliability_score === performance.reliability_score &&
    row.on_time_pct === performance.on_time_pct &&
    currentRating === performance.rating
  ) {
    return row as T & PerformanceFields;
  }
  return { ...row, ...performance };
}

/**
 * Rebuild persisted partner scores from operational evidence. This is pure and
 * idempotent, so the UI reconciliation agent can compare current values without
 * adding audit noise or relying on a user to press a button.
 */
export function reconcilePartnerPerformance(db: RDashDatabase): Master {
  const vendors = db.master.vendors.map((vendor) =>
    withPerformance(vendor, deriveVendorPerformance(db, vendor.id)),
  );
  const contractors = db.master.contractors.map((contractor) =>
    withPerformance(contractor, deriveContractorPerformance(db, contractor.id)),
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
