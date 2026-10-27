import { describe, expect, test } from "vitest";
import { createEmptyWorkspaceDatabase } from "../src/lib/rdash/workspace-session-merge";
import { checkWorkspaceIntegrity } from "../src/lib/rdash/integrity/checker";
import { repairIntegrityIssues } from "../src/lib/rdash/integrity/repair";
import { introducedFkIntegrityIssues } from "../src/lib/rdash/server/integrity-delta";
import { validateBusinessData } from "../src/lib/rdash/business-rules";
import { cascadeDelete } from "../src/lib/rdash/integrity/cascade";
import type { RDashDatabase } from "../src/lib/rdash/types";

function fixture(partial: Record<string, unknown>): RDashDatabase {
  return { ...createEmptyWorkspaceDatabase(), ...partial } as RDashDatabase;
}

describe("all live polymorphic registry parents", () => {
  test("customer deletion follows the canonical customer-conversation identity", () => {
    const db = fixture({ customers: [{ id: "customer", name: "Customer" }], threads: [{ id: "thread", kind: "generic", record_type: "generic", record_id: "customer-conversation:customer", messages: [{ id: "message", thread_id: "thread", body: "Customer history" }] }] });
    const deletion = cascadeDelete(db, "customers", "customer");
    expect(deletion.result.success).toBe(true);
    expect(deletion.db.customers).toEqual([]);
    expect(deletion.db.threads).toEqual([]);
    expect(db.threads).toHaveLength(1);
  });

  test("reports a broken thread parent without advertising deletion of its messages", () => {
    const db = fixture({ threads: [{ id: "thread", kind: "generic", record_type: "generic", record_id: "customer-conversation:missing", messages: [{ id: "message", thread_id: "thread", body: "Preserve this history" }] }] });
    expect(checkWorkspaceIntegrity(db).issues).toContainEqual(expect.objectContaining({ collection: "threads", field: "record_id", autoFixable: false, severity: "critical" }));
    expect(repairIntegrityIssues(db).db.threads).toEqual(db.threads);
  });

  test.each([
    ["quotation", "quotations"], ["po", "purchaseOrders"], ["payment", "payments"],
    ["contractor_payment", "contractorPayments"], ["vendor_bill", "vendorBills"],
  ])("resolves %s approval links to their own collection", (type, target) => {
    const db = fixture({ actions: [{ id: "approval", linked_record_type: type, linked_record_id: "missing" }] });
    expect(checkWorkspaceIntegrity(db).issues).toContainEqual(expect.objectContaining({ collection: "actions", field: "linked_record_id", targetCollection: target, autoFixable: false }));
    expect(introducedFkIntegrityIssues(fixture({}), db, ["actions", target])).toHaveLength(1);
    expect(introducedFkIntegrityIssues(fixture({}), db, ["actions"])).toEqual([]);
  });

  test("checks resource existence in both the dashboard and business validator", () => {
    const db = fixture({ entityReferenceAssignments: [{ id: "reference", entity_type: "general", entity_id: "library", resource_type: "catalogue", resource_id: "missing" }] });
    expect(checkWorkspaceIntegrity(db).issues).toContainEqual(expect.objectContaining({ collection: "entityReferenceAssignments", field: "resource_id", targetCollection: "master.catalogues", autoFixable: false }));
    expect(validateBusinessData(db)).toContain("Reference assignment reference: Reference assignment: references a missing or unsupported resource.");
  });

  test("file owners must exist while general library contexts stay valid", () => {
    const db = fixture({ entityFileAttachments: [{ id: "attachment", entity_type: "customer", entity_id: "missing", file_asset_id: "asset" }] });
    const ownerIssues = () => checkWorkspaceIntegrity(db).issues.filter((issue) => issue.field === "entity_id");
    expect(ownerIssues()).toHaveLength(1);
    db.entityFileAttachments[0].entity_type = "general";
    expect(ownerIssues()).toEqual([]);
  });

  test("communication attachment arrays are real links and can be safely cleared", () => {
    const db = fixture({ customers: [{ id: "customer" }], commSends: [{ id: "send", customer_id: "customer", attachment_ids: ["missing"] }] });
    expect(checkWorkspaceIntegrity(db).issues).toContainEqual(expect.objectContaining({ collection: "commSends", field: "attachment_ids", targetCollection: "entityFileAttachments", autoFixable: true }));
    expect(repairIntegrityIssues(db).db.commSends[0].attachment_ids).toEqual([]);
  });

  test("historical cost provenance does not become a fabricated live dependency", () => {
    const db = fixture({ workOrderCostLines: [{ id: "cost", work_order_id: "missing-work", source_kind: "manual", source_id: "historical-note" }] });
    expect(checkWorkspaceIntegrity(db).issues.filter((issue) => issue.field === "source_id")).toEqual([]);
  });
});
