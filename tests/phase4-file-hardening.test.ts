import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { validateBusinessData } from "@/lib/rdash/business-rules";
import { resolveAttachmentEntityLabel } from "@/lib/rdash/entity-context";
import { fileAssetHasReferences } from "@/lib/rdash/server/file-cleanup";
import { cascadeDelete } from "@/lib/rdash/integrity/cascade";
import { checkWorkspaceIntegrity } from "@/lib/rdash/integrity/checker";
import {
  collectionsForWorkspaceReadTarget,
} from "@/lib/rdash/server/module-read-plans";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";
import { testFile } from "./test-file";

const FILE_BACKED_EXACT_MODULES = [
  "tasks",
  "blockedRisks",
  "approvals",
  "calendarRecurring",
  "siteMeasurement",
  "visitProofs",
  "fieldMode",
  "gpsTracking",
  "grn",
  "inventory",
  "dispatch",
  "vendorRates",
  "rateFinder",
  "payments",
  "invoices",
  "vendorBills",
  "contractorPayments",
  "commissions",
  "driveManager",
  "communicationCentre",
] as const;

describe("phase 4 file-system hardening", () => {
  test("canonical seed passes business integrity after thread backfill", () => {
    const db = buildSeedDatabase();
    expect(validateBusinessData(db)).toEqual([]);
  });

  test("canonical seed also passes the generic FK and duplicate integrity checker", () => {
    const report = checkWorkspaceIntegrity(buildSeedDatabase());
    expect(report.healthScore).toBe(100);
    expect(report.issues).toEqual([]);
    expect(report.duplicateIds).toEqual([]);
  });

  test("seed attachments have canonical human-readable owner labels", () => {
    const db = buildSeedDatabase();
    for (const attachment of db.entityFileAttachments) {
      expect(attachment.entity_label).toBe(
        resolveAttachmentEntityLabel(db, attachment.entity_type, attachment.entity_id),
      );
    }
  });

  test("seed has no orphan FileAssets", () => {
    const db = buildSeedDatabase();
    const orphanIds = db.master.fileAssets
      .filter((asset) => !fileAssetHasReferences(db, asset.id))
      .map((asset) => asset.id);
    expect(orphanIds).toEqual([]);
  });

  test("every focused screen that opens file-backed records loads attachments and assets", () => {
    for (const moduleId of FILE_BACKED_EXACT_MODULES) {
      const collections = collectionsForWorkspaceReadTarget(
        workspaceReadTargetForModule(moduleId),
      );
      expect(collections, `${moduleId} attachments`).toContain("entityFileAttachments");
      expect(collections, `${moduleId} assets`).toContain("master.fileAssets");
    }
  });

  test("transaction labels prefer document numbers over descriptive titles", () => {
    const db = buildSeedDatabase();
    expect(resolveAttachmentEntityLabel(db, "purchase_order", "po-das-ceiling")).toBe("PO-2026-601");
    expect(resolveAttachmentEntityLabel(db, "quotation", "quote-das-ceiling")).toBe("Q-2026-201");
  });


  test("shared FileAssets remain referenced after one relationship is removed", () => {
    const db = buildSeedDatabase();
    const catalogueAssetId = "file-catalogue-gypsum-board";
    const withoutVendorAttachment = {
      ...db,
      entityFileAttachments: db.entityFileAttachments.filter(
        (attachment) => attachment.file_asset_id !== catalogueAssetId,
      ),
    };
    expect(fileAssetHasReferences(withoutVendorAttachment, catalogueAssetId)).toBe(true);

    const poAssetId = "file-po-das-ceiling";
    const withoutPoAttachment = {
      ...db,
      entityFileAttachments: db.entityFileAttachments.filter(
        (attachment) => attachment.file_asset_id !== poAssetId,
      ),
    };
    expect(fileAssetHasReferences(withoutPoAttachment, poAssetId)).toBe(false);
  });

  test("seed proof messages do not point at unrelated business attachments", async () => {
    const source = await testFile("src/lib/rdash/backfill-threads.ts").text();
    expect(source).not.toContain("db.entityFileAttachments[");
    expect(source).not.toContain("proof_attachment_id:");
  });

  test("GST monthly memo reacts to invoices, not quotations", async () => {
    const source = await testFile("src/components/rdash/modules/SalesExtraModules.tsx").text();
    expectTokens(source, ["}, [gstInvoices, db.vendorBills]);"]);
    expectNoTokens(source, ["}, [db.quotations, db.vendorBills]);"]);
  });

  test("Workdesk opens contractor-payment approvals as contractor payments", async () => {
    const source = await testFile("src/components/rdash/modules/DailyWork.tsx").text();
    expectTokens(source, ['openDetail("contractorPayment", approval.linked_record_id)']);
    expectNoTokens(source, ['openDetail("workOrder", approval.linked_record_id); } };']);
  });
  test("historical audit rows do not manufacture threads for deleted business records", () => {
    const db = buildSeedDatabase();
    const historical = db.auditLog.find((entry) => entry.id === "audit-vendor-rate-demo");
    expect(historical).toBeDefined();
    expect(historical?.thread_id).toBeUndefined();
    expect(db.threads.some((thread) => thread.record_id === "vr_ven-build_wia_fc_gyp_1")).toBe(false);
  });

  test("representative cascade deletes either preserve integrity or block historical references", () => {
    const db = buildSeedDatabase();

    const drawingDelete = cascadeDelete(db, "drawings", "drawing-das-ceiling-v1");
    expect(drawingDelete.result.success).toBe(true);
    expect(drawingDelete.db.drawings.some((drawing) => drawing.id === "drawing-das-ceiling-v1")).toBe(false);
    expect(drawingDelete.db.threads.some((thread) => thread.kind === "drawing" && thread.record_id === "drawing-das-ceiling-v1")).toBe(false);
    expect(validateBusinessData(drawingDelete.db)).toEqual([]);

    const workDelete = cascadeDelete(db, "workRequired", "work-das-office-ceiling");
    expect(workDelete.result.success).toBe(false);
    expect(workDelete.result.blocked.some((row) => row.reason.includes("Quotation"))).toBe(true);

    const measurementDelete = cascadeDelete(db, "measurementRevisions", "measure-office-reception-v1");
    expect(measurementDelete.result.success).toBe(false);
    expect(measurementDelete.result.blocked.some((row) => row.reason.includes("Quotation") || row.reason.includes("Measurement"))).toBe(true);
  });

  test("archived catalogue and reference metadata still protect their Drive assets", () => {
    const db = buildSeedDatabase();
    const withoutDirectLinks = {
      ...db,
      entityFileAttachments: db.entityFileAttachments.filter(
        (attachment) => !["file-catalogue-gypsum-board", "file-reference-ceiling-joint"].includes(attachment.file_asset_id),
      ),
      master: {
        ...db.master,
        catalogues: db.master.catalogues.map((row) => ({ ...row, status: "archived" as const })),
        referenceMedia: db.master.referenceMedia.map((row) => ({ ...row, status: "archived" as const })),
      },
    };
    expect(fileAssetHasReferences(withoutDirectLinks, "file-catalogue-gypsum-board")).toBe(true);
    expect(fileAssetHasReferences(withoutDirectLinks, "file-reference-ceiling-joint")).toBe(true);
  });

  test("specialized attachment fields resolve to attachments owned by the same record", () => {
    const db = buildSeedDatabase();
    const expected: Array<{ id: string; type: string; owner: string }> = [];
    for (const site of db.sites) for (const id of site.photo_attachment_ids || []) expected.push({ id, type: "site", owner: site.id });
    for (const visit of db.visits) for (const id of visit.proof_attachment_ids || []) expected.push({ id, type: "visit", owner: visit.id });
    for (const task of db.tasks) for (const id of task.completion_proof_attachment_ids || []) expected.push({ id, type: "task", owner: task.id });
    for (const grn of db.grns) {
      for (const id of grn.receiving_proof_attachment_ids || []) expected.push({ id, type: "grn", owner: grn.id });
      if (grn.delivery_challan_attachment_id) expected.push({ id: grn.delivery_challan_attachment_id, type: "grn", owner: grn.id });
    }
    for (const drawing of db.drawings) if (drawing.primary_file_attachment_id) expected.push({ id: drawing.primary_file_attachment_id, type: "drawing", owner: drawing.id });
    for (const log of db.executionLogs) {
      for (const id of log.photo_attachment_ids || []) expected.push({ id, type: "execution_log", owner: log.id });
      if (log.contractor_confirmation_attachment_id) expected.push({ id: log.contractor_confirmation_attachment_id, type: "execution_log", owner: log.id });
    }
    for (const vendor of db.master.vendors) {
      if (vendor.business_card_attachment_id) expected.push({ id: vendor.business_card_attachment_id, type: "vendor", owner: vendor.id });
      if (vendor.shop_attachment_id) expected.push({ id: vendor.shop_attachment_id, type: "vendor", owner: vendor.id });
    }
    for (const contractor of db.master.contractors) {
      if (contractor.photo_attachment_id) expected.push({ id: contractor.photo_attachment_id, type: "contractor", owner: contractor.id });
      if (contractor.business_card_attachment_id) expected.push({ id: contractor.business_card_attachment_id, type: "contractor", owner: contractor.id });
      for (const document of contractor.compliance_documents || []) if (document.attachment_id) expected.push({ id: document.attachment_id, type: "contractor", owner: contractor.id });
    }
    for (const item of expected) {
      const attachment = db.entityFileAttachments.find((row) => row.id === item.id);
      expect(attachment, item.id).toBeDefined();
      expect(attachment?.entity_type, item.id).toBe(item.type);
      expect(attachment?.entity_id, item.id).toBe(item.owner);
    }

    const corrupted = structuredClone(db);
    corrupted.drawings[0].primary_file_attachment_id = "file-link-po-das-ceiling";
    expect(validateBusinessData(corrupted).some((failure) => failure.includes("Drawing primary file") && failure.includes("purchase_order"))).toBe(true);
  });

});
