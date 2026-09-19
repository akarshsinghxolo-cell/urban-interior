import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { partnerMatchesQuery, partnerPortfolio } from "../src/lib/rdash/partner-workspace";
import { workspaceModuleReadPlan } from "../src/lib/rdash/server/module-read-plans";
import { workspaceReadTargetForModule } from "../src/lib/rdash/workspace-read-scope";

describe("partner workspace", () => {
  test("isolates vendor records at a shared site and uses actual payment states", () => {
    const db = buildSeedDatabase();
    const vendor = db.master.vendors[0];
    const other = db.master.vendors[1];
    const site = db.sites[0];
    db.purchaseOrders = [
      { id: "ours", vendor_id: vendor.id, site_id: site.id, status: "sent", po_no: "PO-1", expected_delivery: "2026-09-17" },
      { id: "theirs", vendor_id: other.id, site_id: site.id, status: "sent", po_no: "PO-2", expected_delivery: "2026-09-17" },
    ] as typeof db.purchaseOrders;
    db.vendorRfqs = []; db.vendorBids = []; db.vendorBills = []; db.workOrders = []; db.grns = [];
    db.vendorPayments = [
      { id: "paid", vendor_id: vendor.id, status: "paid", amount: 100 },
      { id: "pending", vendor_id: vendor.id, status: "pending", amount: 200 },
      { id: "cancelled", vendor_id: vendor.id, status: "cancelled", amount: 300 },
      { id: "other-paid", vendor_id: other.id, status: "paid", amount: 999 },
    ] as typeof db.vendorPayments;
    db.tasks = [
      { id: "ours-task", po_id: "ours", site_id: site.id, title: "Receive", status: "pending", due_date: "2026-09-17" },
      { id: "other-task", po_id: "theirs", site_id: site.id, title: "Other", status: "pending", due_date: "2026-09-17" },
      { id: "today-task", po_id: "ours", title: "Today", status: "pending", due_date: "2026-09-18" },
      { id: "done-task", po_id: "ours", title: "Done", status: "completed", due_date: "2026-09-17" },
    ] as typeof db.tasks;
    db.auditLog = [
      { id: "our-audit", entity_id: "ours", timestamp: "2026-09-17" },
      { id: "their-audit", entity_id: "theirs", timestamp: "2026-09-17" },
    ] as typeof db.auditLog;
    const model = partnerPortfolio(db, "vendor", vendor, "2026-09-18");
    expect(model.purchaseOrders.map((row) => row.id)).toEqual(["ours"]);
    expect(model.sites.map((row) => row.id)).toEqual([site.id]);
    expect(model.activity.map((row) => row.id)).toEqual(["our-audit"]);
    expect(model.tasks.map((row) => row.id)).not.toContain("other-task");
    expect(model.paid).toBe(100);
    expect(model.committed).toBe(200);
    expect(model.activeOrders).toBe(1);
    expect(model.actions.filter((row) => row.kind).map((row) => row.id)).toEqual(["ours", "ours-task"]);
    expect(partnerMatchesQuery(model, vendor.name.toUpperCase())).toBe(true);
    expect(partnerMatchesQuery(model, "no-such-partner-xyz")).toBe(false);
  });

  test("keeps a replaced contractor's history without counting the replacement's active job", () => {
    const db = buildSeedDatabase();
    const contractor = db.master.contractors[0];
    db.workOrders = [
      { id: "current", contractor_id: contractor.id, status: "in_progress" },
      { id: "replaced", contractor_id: "replacement", abandoned_contractor_id: contractor.id, status: "in_progress" },
      { id: "unrelated", contractor_id: "replacement", status: "in_progress" },
    ] as typeof db.workOrders;
    db.contractorBills = [
      { id: "approved", contractor_id: contractor.id, status: "approved", amount: 1000, balance_amount: 700 },
      { id: "held", contractor_id: contractor.id, status: "held", amount: 900, balance_amount: 900 },
    ] as typeof db.contractorBills;
    db.contractorPayments = [{ contractor_id: contractor.id, status: "paid", amount: 300 }] as typeof db.contractorPayments;
    db.contractorSettlements = [];
    const model = partnerPortfolio(db, "contractor", contractor);
    expect(model.workOrders.map((row) => row.id)).toEqual(["current", "replaced"]);
    expect(model.activeOrders).toBe(1);
    expect(model.outstanding).toBe(700);
  });

  test("loads the relations needed by partner drawers on direct navigation", () => {
    for (const [module, collections] of [
      ["vendors", ["purchaseOrders", "vendorBills", "vendorPayments", "vendorRfqs", "grns", "master.vendorRates"]],
      ["contractorDetail", ["workOrders", "contractorBids", "contractorBills", "contractorPayments", "contractorSettlements", "acceptedScopes"]],
    ] as const) {
      const plan = workspaceModuleReadPlan(workspaceReadTargetForModule(module));
      expect(plan.strategy).toBe("module");
      expect(plan.collections).toEqual(expect.arrayContaining([...collections, "customers", "sites", "tasks", "entityFileAttachments", "master.sourcePartners"]));
      for (const collection of collections) expect(plan.limitsByCollection?.[collection]).toBeUndefined();
    }
  });
});
