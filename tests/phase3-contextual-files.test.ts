import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(path, "utf8");

describe("Phase 3 contextual files", () => {
  test("uses one simple direct-files component with canonical upload routing", async () => {
    const source = await read("src/components/rdash/EntityFilesCard.tsx");
    expectTokens(source, ["entityFiles(db, entityType, entityId)"]);
    expect(source).toContain("uploadPurposeForEntity(entityType)");
    expect(source).toContain("enqueueWorkflowFiles");
    expect(source).toContain("detachEntityFileAttachment");
    expect(source).not.toContain("OperationalMediaPanel");
  });

  test("customer overview and editor expose direct customer documents", async () => {
    const desk = await read("src/components/rdash/modules/CustomerDesk.tsx");
    const editor = await read("src/components/rdash/CustomerSitesDialog.tsx");
    expectTokens(desk, ['entityType="customer" entityId={customerId} title="Customer documents"']);
    expect(editor).toContain('entityType="customer"');
    expect(editor).toContain('entityId={editId}');
    expectTokens(editor, ['title="Customer documents"']);
    expect(editor).toContain('manage');
  });

  test("site, area, work required, quotation and work order surfaces show their own files", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    expectTokens(detail, ['entityType="site" entityId={site.id} title="Site photos & files"']);
    expectTokens(detail, ['entityType="room" entityId={area.id} title="Area photos & files" manage={!area.is_archived}']);
    expectTokens(detail, ['entityType="workRequired" entityId={work.id} title="Requirement files" manage']);
    expectTokens(detail, ['entityType="quotation" entityId={q.id} title="Quotation files & approvals" manage']);
    expectTokens(detail, ['entityType="workOrder" entityId={j.id} title="Work Order files" manage']);
  });

  test("measurement visit evidence is not mislabeled as one room revision", async () => {
    const measurement = await read("src/components/rdash/modules/SiteMeasurementModule.tsx");
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    expectTokens(measurement, ['entityType="visit" entityId={r.visitId} title="Measurement visit evidence & references"']);
    expectTokens(detail, ['entityType="measurement_revision" entityId={revision.id} title="Measurement files" manage={!area.is_archived && revision.id === latest?.id']);
  });

  test("accepted scope and variation records can own and manage their approval files", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    const variations = await read("src/components/rdash/WorkOrderVariationsPanel.tsx");
    expectTokens(detail, ['entityType="accepted_scope" entityId={scope.id}']);
    expectTokens(detail, ['title="Acceptance files" manage showEmpty']);
    expectTokens(variations, ['entityType="variation_request" entityId={variation.id} title="Variation files & approval" manage']);
  });

  test("work order overview exposes related drawing and execution context without duplicating its Variations tab", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    const wrapper = await read("src/components/rdash/DetailPanelWithHistory.tsx");
    expect(detail).toContain('label="Drawings"');
    expect(detail).toContain('setActiveModule("drawings")');
    expectTokens(detail, ['label="Execution logs"']);
    expect(detail).toContain('setActiveModule("executionLogs")');
    expect(detail).not.toContain('label="Variations"');
    expectTokens(wrapper, ['id: "variations" as const']);
  });

  test("site files attach only after the Site mutation is confirmed", async () => {
    const editor = await read("src/components/rdash/CustomerSitesDialog.tsx");
    const draft = await read("src/components/rdash/CustomerSiteDraftCard.tsx");
    const model = await read("src/components/rdash/customer-sites-form-model.ts");
    const save = await read("src/lib/rdash/customer-sites-save.ts");
    const editorSaveStart = editor.indexOf("saveCustomerWithSites({");
    expect(editorSaveStart).toBeGreaterThanOrEqual(0);
    expect(editor.indexOf("await awaitServerSync();", editorSaveStart))
      .toBeLessThan(editor.indexOf("commitBatches();", editorSaveStart));
    expect(editor).toContain("detachAttachmentIds,");
    expect(editor).toContain("setDetachAttachmentIds");
    expectTokens(draft, ['draft.existing ? entityFiles(db, "site", draft.id) : []']);
    expectTokens(draft, ['classified.role === "photo" ? { attachmentField: "photo_attachment_ids"']);
    expectTokens(model, ["photo_attachment_ids: confirmedPhotoAttachmentIds(draft.photoAttachmentIds)"]);
    expectNoTokens(model, ['draft.pendingPhotos.filter((file) => file.mimeType.startsWith("image/"))']);
    expectNoTokens(save, ["The selected file is not attached through this Site's photo/file field."]);
  });

  test("core customer, site, quotation and field scopes load file links and assets", async () => {
    const scopes = await read("src/lib/rdash/server/module-scoped-collections.ts");
    for (const scope of ["CUSTOMER_SCOPE_COLLECTIONS", "SITE_SCOPE_COLLECTIONS", "QUOTATION_SCOPE_COLLECTIONS", "FIELD_SCOPE_COLLECTIONS"]) {
      const start = scopes.indexOf(`export const ${scope}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = scopes.indexOf("] as const);", start);
      const block = scopes.slice(start, end);
      expect(block).toContain('"entityFileAttachments"');
      expect(block).toContain('"master.fileAssets"');
    }
    const plans = await read("src/lib/rdash/server/module-read-plans.ts");
    const measurementStart = plans.indexOf("siteMeasurement:");
    const measurementEnd = plans.indexOf("],", measurementStart);
    expect(plans.slice(measurementStart, measurementEnd)).toContain('"entityFileAttachments"');
  });

  test("site edit language treats uploads as files rather than photos only", async () => {
    const draft = await read("src/components/rdash/CustomerSiteDraftCard.tsx");
    expectTokens(draft, ["Site photos and files"]);
    expectTokens(draft, ['caption: "Site file"']);
  });
});

// Fresh Phase-3 audit: protect draft semantics, the broader contextual-file
// rollout, scoped reads, and specialized attachment-reference cleanup.
describe("Phase 3 re-audit", () => {
  test("Save/Cancel dialogs stage direct-file changes instead of mutating immediately", async () => {
    const card = await read("src/components/rdash/EntityFilesCard.tsx");
    const customerEditor = await read("src/components/rdash/CustomerSitesDialog.tsx");
    const customerDesk = await read("src/components/rdash/modules/CustomerDesk.tsx");
    expect(card).toContain("hiddenAttachmentIds");
    expect(card).toContain("registerBatch?.(queued.batchId)");
    expectTokens(card, ["onDetach ? onDetach(attachment.id) : detachEntityFileAttachment(attachment.id)"]);
    expect(card).toContain("allowDetach");
    expect(customerEditor).toContain("hiddenAttachmentIds={detachAttachmentIds}");
    expect(customerEditor).toContain("registerBatch={registerBatch}");
    expectTokens(customerEditor, ["onDetach={(attachmentId) => setDetachAttachmentIds"]);
    expect(customerDesk).toContain("useUploadDraft(true)");
    expectTokens(customerDesk, ["allowDetach={false} registerBatch={registerBatch}"]);
    expectTokens(customerDesk, ["if (saved) commitBatches()"]);
  });

  test("procurement, finance, contractor and operations records expose contextual files", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    const expected = [
      'entityType="purchase_order" entityId={po.id}',
      'entityType="grn" entityId={grn.id}',
      'entityType="dispatch" entityId={d.id}',
      'entityType="vendor_bill" entityId={b.id}',
      'entityType="vendor_payment" entityId={payment.id}',
      'entityType="contractor_bill" entityId={bill.id}',
      'entityType="contractor_payment" entityId={payment.id}',
      'entityType="payment" entityId={p.id}',
      'entityType="invoice" entityId={invoice.id}',
      'entityType="customer_receipt" entityId={receipt.id}',
      'entityType="task" entityId={t.id}',
      'entityType="followup" entityId={f.id}',
      'entityType="blocked" entityId={b.id}',
      'entityType="commission" entityId={c.id}',
      'entityType="inventory" entityId={inv.id}',
      'entityType="vendor" entityId={vendor.id}',
      'entityType="contractor" entityId={contractor.id}',
      'entityType="boq" entityId={b.id}',
    ];
    for (const snippet of expected) expect(detail).toContain(snippet);
  });

  test("remaining transaction owners have a natural contextual file surface", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    const procurement = await read("src/components/rdash/modules/ProcurementModule.tsx");
    const inventory = await read("src/components/rdash/modules/InventoryModule.tsx");
    expectTokens(detail, ['entityType="quotation_item" entityId={itemFilesId}']);
    expectTokens(detail, ['entityType="boq_item" entityId={boqItemFilesId}']);
    expectTokens(detail, ['entityType="vendor_rate" entityId={rate.id}']);
    expectTokens(detail, ['entityType="contractor_bid" entityId={bidFilesId}']);
    expectTokens(detail, ['entityType="contractor_settlement" entityId={s.id}']);
    expectTokens(procurement, ['entityType="vendor_rfq" entityId={rfq.id}']);
    expectTokens(procurement, ['entityType="vendor_bid" entityId={bid.id}']);
    expectTokens(inventory, ['entityType="stock_movement" entityId={movementFilesId}']);
  });

  test("partner compliance documents choose a real file instead of exposing attachment IDs", async () => {
    const governance = await read("src/components/rdash/modules/PartnerGovernanceModule.tsx");
    expectNoTokens(governance, ["Attachment ID (optional)"]);
    expectTokens(governance, ["entityFiles(db, mode, partner.id)"]);
    expectTokens(governance, ["No linked file"]);
    expect(governance).toContain('fileNameByAttachmentId.get(document.attachment_id)');
  });

  test("exact module and finance scoped reads include direct-file links", async () => {
    const plans = await read("src/lib/rdash/server/module-read-plans.ts");
    for (const moduleId of ["blockedRisks", "inventory", "dispatch", "payments", "invoices", "vendorBills", "contractorPayments", "commissions"]) {
      const start = plans.indexOf(`${moduleId}: Object.freeze([`);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = plans.indexOf("]),", start);
      expect(plans.slice(start, end)).toContain('"entityFileAttachments"');
    }
    const scopes = await read("src/lib/rdash/server/module-scoped-collections.ts");
    const start = scopes.indexOf("export const FINANCE_SCOPE_COLLECTIONS");
    const end = scopes.indexOf("] as const);", start);
    const finance = scopes.slice(start, end);
    expect(finance).toContain('"entityFileAttachments"');
    expect(finance).toContain('"master.fileAssets"');

    for (const moduleId of ["calendarRecurring", "gpsTracking", "vendorRates", "rateFinder"]) {
      const moduleStart = plans.indexOf(`${moduleId}: Object.freeze([`);
      expect(moduleStart).toBeGreaterThanOrEqual(0);
      const moduleEnd = plans.indexOf("]),", moduleStart);
      const modulePlan = plans.slice(moduleStart, moduleEnd);
      expect(modulePlan).toContain('"entityFileAttachments"');
    }

    const reportsStart = scopes.indexOf("export const REPORTS_SCOPE_COLLECTIONS");
    const reportsEnd = scopes.indexOf("export const SYSTEM_SCOPE_COLLECTIONS", reportsStart);
    const reports = scopes.slice(reportsStart, reportsEnd);
    expect(reports).toContain('"entityFileAttachments"');
    expect(reports).toContain('"master.fileAssets"');

    const driveStart = plans.indexOf("driveManager: Object.freeze([");
    const driveEnd = plans.indexOf("]),", driveStart);
    const drivePlan = plans.slice(driveStart, driveEnd);
    expect(drivePlan).toContain('"entityFileAttachments"');
    expect(drivePlan).toContain('"staffDocuments"');
    expect(drivePlan).toContain('"master.fileAssets"');
  });

  test("generic detach clears specialized attachment-id fields centrally", async () => {
    const files = await read("src/lib/rdash/store/slices/files.ts");
    for (const field of [
      "photo_attachment_ids",
      "proof_attachment_ids",
      "completion_proof_attachment_ids",
      "receiving_proof_attachment_ids",
      "delivery_challan_attachment_id",
      "primary_file_attachment_id",
      "contractor_confirmation_attachment_id",
      "attachment_ids",
      "proof_attachment_id",
      "business_card_attachment_id",
      "shop_attachment_id",
      "photo_attachment_id",
    ]) expect(files).toContain(`"${field}"`);
    expect(files).toContain("document.attachment_id");
    expect(files).toContain("item.entity_file_attachment_id");
    expect(files).toContain("clearAttachmentReferences({");
    expectTokens(files, ["entityFileAttachments: (s.db.entityFileAttachments || []).filter"]);

    const crm = await read("src/lib/rdash/store/slices/crm.ts");
    expectTokens(crm, ["requestFileAssetCleanupAfterSync(get, fileAssetId)"]);
    expect(crm).toContain("result.detachedAttachmentIds");
  });


  test("manual Drive linking enforces canonical file ownership at runtime", async () => {
    const [{ createFilesSlice }, { buildSeedDatabase }] = await Promise.all([
      import("@/lib/rdash/store/slices/files"),
      import("@/lib/rdash/seed"),
    ]);
    const db: any = buildSeedDatabase();
    const fileAsset = db.master.fileAssets[0];
    const site = db.sites[0];
    expect(fileAsset).toBeTruthy();
    expect(site).toBeTruthy();

    let state: any = {
      db,
      currentUser: () => ({ name: "Owner", role: "Owner" }),
      logAudit: () => undefined,
    };
    const slice = createFilesSlice({
      get: () => state,
      setBase: () => undefined,
      isNestedTransaction: () => false,
      commitState: (updater: any) => {
        const patch = typeof updater === "function" ? updater(state) : updater;
        state = { ...state, ...patch };
      },
    });
    state = { ...state, ...slice };

    expect(() => slice.attachFileAsset({
      file_asset_id: fileAsset.id,
      entity_type: "site",
      entity_id: "missing-site",
    })).toThrow(/does not exist/);

    const attachmentId = slice.attachFileAsset({
      file_asset_id: fileAsset.id,
      entity_type: "site",
      entity_id: site.id,
      role: "document",
    });
    expect(attachmentId).toBeTruthy();
    const attachment = state.db.entityFileAttachments.find((row: any) => row.id === attachmentId);
    expect(attachment?.entity_id).toBe(site.id);
    expect(attachment?.entity_label).toBe(site.name);
  });

  test("detaching a relationship removes stale specialized references at runtime", async () => {
    const [{ createFilesSlice }, { buildSeedDatabase }] = await Promise.all([
      import("@/lib/rdash/store/slices/files"),
      import("@/lib/rdash/seed"),
    ]);
    const attachmentId = "attach-phase3-detach";
    const db: any = buildSeedDatabase();
    db.entityFileAttachments = [{
      id: attachmentId,
      file_asset_id: "drive-phase3-detach",
      entity_type: "site",
      entity_id: "site-phase3",
      role: "photo",
      visibility: "internal",
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z",
    }];
    db.sites = [{ id: "site-phase3", photo_attachment_ids: [attachmentId], updated_at: "old" }];
    db.visits = [{ id: "visit-phase3", proof_attachment_ids: [attachmentId], updated_at: "old" }];
    db.tasks = [{ id: "task-phase3", completion_proof_attachment_ids: [attachmentId], updated_at: "old" }];
    db.grns = [{ id: "grn-phase3", receiving_proof_attachment_ids: [attachmentId], delivery_challan_attachment_id: attachmentId, updated_at: "old" }];
    db.drawings = [{ id: "drawing-phase3", primary_file_attachment_id: attachmentId, updated_at: "old" }];
    db.executionLogs = [{ id: "execution-phase3", photo_attachment_ids: [attachmentId], contractor_confirmation_attachment_id: attachmentId, updated_at: "old" }];
    db.commSends = [{ id: "comm-phase3", attachment_ids: [attachmentId] }];
    db.threads = [{ id: "thread-phase3", updated_at: "old", messages: [{ id: "message-phase3", proof_attachment_id: attachmentId, attachments: [{ id: "message-file", entity_file_attachment_id: attachmentId }] }] }];
    db.master.vendors = [{ id: "vendor-phase3", business_card_attachment_id: attachmentId, shop_attachment_id: attachmentId, updated_at: "old" }];
    db.master.contractors = [{ id: "contractor-phase3", photo_attachment_id: attachmentId, business_card_attachment_id: attachmentId, compliance_documents: [{ id: "doc-phase3", attachment_id: attachmentId }], updated_at: "old" }];

    let state: any = {
      db,
      currentUser: () => ({ name: "Owner", role: "Owner" }),
      logAudit: () => undefined,
    };
    const slice = createFilesSlice({
      get: () => state,
      setBase: () => undefined,
      isNestedTransaction: () => false,
      commitState: (updater: any) => {
        const patch = typeof updater === "function" ? updater(state) : updater;
        state = { ...state, ...patch };
      },
    });
    state = { ...state, ...slice };
    slice.detachEntityFileAttachment(attachmentId);

    expect(state.db.entityFileAttachments).toHaveLength(0);
    expect(state.db.sites[0].photo_attachment_ids).toEqual([]);
    expect(state.db.visits[0].proof_attachment_ids).toEqual([]);
    expect(state.db.tasks[0].completion_proof_attachment_ids).toEqual([]);
    expect(state.db.grns[0].receiving_proof_attachment_ids).toEqual([]);
    expect(state.db.grns[0].delivery_challan_attachment_id).toBeUndefined();
    expect(state.db.drawings[0].primary_file_attachment_id).toBeUndefined();
    expect(state.db.executionLogs[0].photo_attachment_ids).toEqual([]);
    expect(state.db.executionLogs[0].contractor_confirmation_attachment_id).toBeUndefined();
    expect(state.db.commSends[0].attachment_ids).toEqual([]);
    expect(state.db.threads[0].messages[0].proof_attachment_id).toBeUndefined();
    expect(state.db.threads[0].messages[0].attachments[0].entity_file_attachment_id).toBeUndefined();
    expect(state.db.master.vendors[0].business_card_attachment_id).toBeUndefined();
    expect(state.db.master.vendors[0].shop_attachment_id).toBeUndefined();
    expect(state.db.master.contractors[0].photo_attachment_id).toBeUndefined();
    expect(state.db.master.contractors[0].business_card_attachment_id).toBeUndefined();
    expect(state.db.master.contractors[0].compliance_documents[0].attachment_id).toBeUndefined();
  });
  test("draft-owned uploads stay local until Save and are discarded on Cancel or reload", async () => {
    const [store, draft, card, pending, status] = await Promise.all([
      read("src/lib/uploads/upload-store.ts"),
      read("src/lib/uploads/use-upload-draft.ts"),
      read("src/components/rdash/EntityFilesCard.tsx"),
      read("src/components/uploads/PendingUploadsPanel.tsx"),
      read("src/components/uploads/UploadStatusIndicator.tsx"),
    ]);
    expectTokens(store, ["if (item.deferred) return false"]);
    expectTokens(store, ['deferred: Boolean(input.deferProcessing)']);
    expect(store).toContain("releaseDeferredBatch");
    expect(store).toContain("discardDeferredBatch");
    expect(store).toContain("staleDraftItems");
    expectTokens(store, ["if (item.deferred) {"]);
    expect(draft).toContain("releaseDeferredBatch(batchId)");
    expect(draft).toContain("discardDeferredBatch(batchId)");
    expectTokens(card, ["deferProcessing: Boolean(registerBatch)"]);
    expect(pending).toContain("!item.deferred");
    expect(status).toContain("!item.deferred");

    const draftFiles = [
      "src/components/rdash/VendorFormDialog.tsx",
      "src/components/rdash/ContractorFormDialog.tsx",
      "src/components/rdash/CustomerSiteDraftCard.tsx",
      "src/components/rdash/modules/GRNModule.tsx",
      "src/components/rdash/modules/FieldModeModule.tsx",
      "src/components/rdash/modules/CommunicationCentreModule.tsx",
      "src/components/rdash/modules/SiteMeasurementModule.tsx",
      "src/components/rdash/modules/DrawingsExecutionModules.tsx",
    ];
    for (const path of draftFiles) {
      const source = await read(path);
      if (source.includes("registerBatch(queued.batchId)")) expectTokens(source, ["deferProcessing: true"]);
    }
  });

  test("profile drafts do not persist pre-upload attachment IDs or release uploads after a rejected save", async () => {
    const [contractor, vendor, store] = await Promise.all([
      read("src/components/rdash/ContractorFormDialog.tsx"),
      read("src/components/rdash/VendorFormDialog.tsx"),
      read("src/lib/rdash/raw-store.ts"),
    ]);
    expect(contractor).toContain("confirmedAttachmentId(contractorPhoto)");
    expect(contractor).toContain("confirmedAttachmentId(businessCard)");
    expect(vendor).toContain("confirmedAttachmentId(businessCard)");
    expect(vendor).toContain("confirmedAttachmentId(shopPhoto)");
    expectTokens(store, ["The server rejected this change before it could be confirmed."]);
  });

  test("manual Drive linking enforces the same canonical owner validation as direct upload", async () => {
    const files = await read("src/lib/rdash/store/slices/files.ts");
    expectTokens(files, ["resolveAttachmentEntityLabel, resolveEntityContext"]);
    expect(files.match(/resolveEntityContext\(get\(\)\.db, /g)?.length).toBeGreaterThanOrEqual(3);
    expect(files).toContain('"File attachment"');
  });

  test("vendor payments are first-class drill-through records and file links can navigate newer owners", async () => {
    const [detail, navigation, uiTypes, partner, persistence] = await Promise.all([
      read("src/components/rdash/DetailPanel.tsx"),
      read("src/lib/rdash/detail-navigation.ts"),
      read("src/lib/rdash/store/ui-types.ts"),
      read("src/components/rdash/modules/Partner360Module.tsx"),
      read("src/lib/rdash/server/direct-upload-persistence.ts"),
    ]);
    expect(uiTypes).toContain('"vendorPayment"');
    expectTokens(navigation, ["vendorPayment: db.vendorPayments"]);
    expectTokens(detail, ["function VendorPaymentEntityOverview"]);
    expectTokens(detail, ['entityType="vendor_payment" entityId={payment.id} title="Payment proof"']);
    expect(detail).toContain("attachmentOwnerPanelTarget");
    expectTokens(detail, ['case "measurement_revision"']);
    expectTokens(detail, ['case "thread_message"']);
    expectNoTokens(partner, ['openDetail(mode === "vendor" ? "purchaseOrder"']);
    expectTokens(partner, ['openDetail(mode === "vendor" ? "po" : "workOrder"']);
    expectTokens(persistence, ['boq: "boqs"']);
    expectTokens(persistence, ['commission: "commissions"']);
  });

});
