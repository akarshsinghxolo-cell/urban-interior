"use client";

import * as React from "react";
import { reconcilePartnerPerformance } from "@/lib/rdash/performance-reconciliation";
import { useRDashStore } from "@/lib/rdash/store";

function differs(
  current: { reliability_score?: number; on_time_pct?: number; rating?: number },
  derived: { reliability_score?: number; on_time_pct?: number; rating?: number },
) {
  return (
    current.reliability_score !== derived.reliability_score ||
    current.on_time_pct !== derived.on_time_pct ||
    current.rating !== derived.rating
  );
}

/**
 * Keeps vendor and contractor scorecards derived from operational records.
 * The dependency signature excludes the score fields themselves, preventing a
 * reconciliation commit from triggering an endless follow-up reconciliation.
 */
export function PerformanceReconciliationAgent() {
  const db = useRDashStore((state) => state.db);
  const recomputeVendorPerformance = useRDashStore(
    (state) => state.recomputeVendorPerformance,
  );
  const recomputeContractorPerformance = useRDashStore(
    (state) => state.recomputeContractorPerformance,
  );

  const operationalSignature = React.useMemo(
    () =>
      JSON.stringify({
        purchaseOrders: db.purchaseOrders.map((row) => [
          row.id,
          row.vendor_id,
          row.expected_delivery,
          row.actual_delivery,
          row.status,
        ]),
        vendorBills: db.vendorBills.map((row) => [
          row.id,
          row.vendor_id,
          row.status,
          row.matched,
          row.paid_amount,
          row.balance_amount,
        ]),
        workOrders: db.workOrders.map((row) => [
          row.id,
          row.contractor_id,
          row.status,
          row.expected_end,
          row.actual_end,
        ]),
        contractorBills: db.contractorBills.map((row) => [
          row.id,
          row.contractor_id,
          row.status,
          row.paid_amount,
          row.balance_amount,
        ]),
        contractorPayments: db.contractorPayments.map((row) => [
          row.id,
          row.contractor_id,
          row.status,
          row.paid_at,
        ]),
      }),
    [
      db.contractorBills,
      db.contractorPayments,
      db.purchaseOrders,
      db.vendorBills,
      db.workOrders,
    ],
  );

  React.useEffect(() => {
    const derivedMaster = reconcilePartnerPerformance(db);

    db.master.vendors.forEach((vendor, index) => {
      const derived = derivedMaster.vendors[index];
      if (!derived || !differs(vendor, derived)) return;
      try {
        recomputeVendorPerformance(vendor.id);
      } catch (error) {
        console.warn(
          `[PerformanceReconciliationAgent] vendor ${vendor.id} reconciliation failed`,
          error,
        );
      }
    });

    db.master.contractors.forEach((contractor, index) => {
      const derived = derivedMaster.contractors[index];
      if (!derived || !differs(contractor, derived)) return;
      try {
        recomputeContractorPerformance(contractor.id);
      } catch (error) {
        console.warn(
          `[PerformanceReconciliationAgent] contractor ${contractor.id} reconciliation failed`,
          error,
        );
      }
    });
  }, [
    db,
    operationalSignature,
    recomputeContractorPerformance,
    recomputeVendorPerformance,
  ]);

  return null;
}
