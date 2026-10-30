import type { RDashDatabase } from "./types";
import { attachCustomerLabels } from "./customer";
import { contractorRateProjection } from "./contractor-profile";

export function canonicalMasterRow(collection: string, input: Record<string, unknown>) {
    if (collection !== "master.vendors" && collection !== "master.contractors") return input;
    const row = { ...input };
    delete row.outstanding;
    if (collection === "master.contractors") delete row.active_jobs;
    return row;
}

/** Current labels and rates are derived from canonical records, never independent writes. */
export function attachWorkspaceDerivedFields(db: RDashDatabase): RDashDatabase {
    db.master.vendors = db.master.vendors.map(v => canonicalMasterRow("master.vendors", v as unknown as Record<string, unknown>) as unknown as typeof v);
    db.master.contractors = db.master.contractors.map(c => canonicalMasterRow("master.contractors", c as unknown as Record<string, unknown>) as unknown as typeof c);
    for (const contractor of db.master.contractors) {
        db.master.contractorRates = contractorRateProjection(db, contractor);
    }
    return attachCustomerLabels(db);
}
