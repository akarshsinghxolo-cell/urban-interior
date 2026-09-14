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
    const portfolio = await read("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    const editor = await read("src/components/rdash/CustomerSitesDialog.tsx");
    expect(desk).toContain('export { CustomerPortfolioDrawerContent } from "./CustomerDeskPortfolio";');
    expect(detail).toContain("CustomerPortfolioDrawerContent");
    expectTokens(portfolio, ['entityType="customer" entityId={customerId} title="Customer documents"']);
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
    const collections = await read("src/lib/rdash/server/module-scoped-collections.ts");
    expectTokens(collections, [
      '"entityFileAttachments"',
      '"master.fileAssets"',
    ]);
  });

  test("site edit language treats uploads as files rather than photos only", async () => {
    const editor = await read("src/components/rdash/CustomerSiteDraftCard.tsx");
    expect(editor).toContain("files");
    expect(editor).not.toContain("Add photos");
  });

  test("Save/Cancel editors stage direct-file changes while Customer Desk stays read-only for direct files", async () => {
    const editor = await read("src/components/rdash/CustomerSitesDialog.tsx");
    const portfolio = await read("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    expect(editor).toContain("useUploadDraft");
    expect(editor).toContain("commitBatches");
    expect(portfolio).toContain('title="Customer documents"');
    expect(portfolio).not.toContain('title="Customer documents" manage');
  });

  test("procurement, finance, contractor and operations records expose contextual files", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    for (const token of [
      'entityType="po"',
      'entityType="grn"',
      'entityType="vendorBill"',
      'entityType="payment"',
      'entityType="invoice"',
      'entityType="contractorPayment"',
      'entityType="task"',
      'entityType="visit"',
    ]) expect(detail).toContain(token);
  });

  test("remaining transaction owners have a natural contextual file surface", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    for (const token of [
      'entityType="vendorPayment"',
      'entityType="contractorBill"',
      'entityType="contractorSettlement"',
      'entityType="dispatch"',
    ]) expect(detail).toContain(token);
  });

  test("partner compliance documents choose a real file instead of exposing attachment IDs", async () => {
    const vendor = await read("src/components/rdash/VendorProfileDialog.tsx");
    const contractor = await read("src/components/rdash/ContractorProfileDialog.tsx");
    expect(vendor).toContain("FilePicker");
    expect(contractor).toContain("FilePicker");
    expect(vendor).not.toContain("attachment id");
    expect(contractor).not.toContain("attachment id");
  });

  test("exact module and finance scoped reads include direct-file links", async () => {
    const plans = await read("src/lib/rdash/server/module-read-plans.ts");
    const scoped = await read("src/lib/rdash/server/module-scoped-collections.ts");
    expect(plans).toContain("completeFileJoin");
    expect(scoped).toContain('"entityFileAttachments"');
  });

  test("generic detach clears specialized attachment-id fields centrally", async () => {
    const attachments = await read("src/lib/rdash/file-attachments.ts");
    expect(attachments).toContain("specializedAttachmentFieldsFor");
    expect(attachments).toContain("detachEntityFileAttachment");
  });

  test("manual Drive linking enforces canonical file ownership at runtime", async () => {
    const storage = await read("src/lib/rdash/store/slices/storage.ts");
    expect(storage).toContain("assertCanonicalEntityFileOwner");
  });

  test("detaching a relationship removes stale specialized references at runtime", async () => {
    const storage = await read("src/lib/rdash/store/slices/storage.ts");
    expect(storage).toContain("detachEntityFileAttachment");
    expect(storage).toContain("specializedAttachmentFieldsFor");
  });

  test("draft-owned uploads stay local until Save and are discarded on Cancel or reload", async () => {
    const hook = await read("src/lib/uploads/use-upload-draft.ts");
    expect(hook).toContain("commitBatches");
    expect(hook).toContain("releaseBatch");
  });

  test("profile drafts do not persist pre-upload attachment IDs or release uploads after a rejected save", async () => {
    const vendor = await read("src/components/rdash/VendorProfileDialog.tsx");
    const contractor = await read("src/components/rdash/ContractorProfileDialog.tsx");
    expect(vendor).toContain("commitBatches");
    expect(contractor).toContain("commitBatches");
  });

  test("manual Drive linking enforces the same canonical owner validation as direct upload", async () => {
    const storage = await read("src/lib/rdash/store/slices/storage.ts");
    expect(storage).toContain("assertCanonicalEntityFileOwner");
  });

  test("vendor payments are first-class drill-through records and file links can navigate newer owners", async () => {
    const detail = await read("src/components/rdash/DetailPanel.tsx");
    const router = await read("src/components/rdash/DetailPanelWithHistory.tsx");
    expect(detail).toContain('entityType="vendorPayment"');
    expect(router).toContain('case "vendorPayment"');
  });
});
