import type {
  EntityFileAttachment,
  FileAsset,
  FileAttachmentEntityType,
  RDashDatabase,
  StorageFolderInstance,
} from "../types";
import type { WorkspaceOperation } from "../workspace-operations";

const ENTITY_COLLECTIONS: Partial<Record<FileAttachmentEntityType, string>> = {
  customer: "customers",
  site: "sites",
  room: "areas",
  workRequired: "workRequired",
  quotation: "quotations",
  workOrder: "workOrders",
  purchase_order: "purchaseOrders",
  grn: "grns",
  vendor_bill: "vendorBills",
  dispatch: "dispatches",
  inventory: "inventory",
  drawing: "drawings",
  execution_log: "executionLogs",
  visit: "visits",
  task: "tasks",
  followup: "followups",
  payment: "payments",
  invoice: "invoices",
  vendor: "master.vendors",
  vendor_rate: "master.vendorRates",
  contractor: "master.contractors",
  contractor_bid: "contractorBids",
  contractor_settlement: "contractorSettlements",
  blocked: "blocked",
  communication: "commSends",
};

function collectionRows(workspace: RDashDatabase, collection: string): Array<Record<string, unknown>> {
  const value = collection.startsWith("master.")
    ? (workspace.master as unknown as Record<string, unknown>)[collection.slice("master.".length)]
    : (workspace as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

export function buildAtomicUploadMetadataOperations(input: {
  workspace: RDashDatabase;
  folderInstance: StorageFolderInstance;
  asset: FileAsset;
  attachment: EntityFileAttachment;
  targetEntityType: FileAttachmentEntityType;
  targetEntityId: string;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
}): WorkspaceOperation[] {
  const operations: WorkspaceOperation[] = [
    { collection: "master.storageFolderInstances", upsert: [input.folderInstance as unknown as Record<string, unknown>] },
    { collection: "master.fileAssets", upsert: [input.asset as unknown as Record<string, unknown>] },
    { collection: "entityFileAttachments", upsert: [input.attachment as unknown as Record<string, unknown>] },
  ];

  if (!input.attachmentField) return operations;
  const collection = ENTITY_COLLECTIONS[input.targetEntityType];
  if (!collection) {
    throw new Error(`Attachment field updates are not configured for ${input.targetEntityType}.`);
  }
  const target = collectionRows(input.workspace, collection)
    .find((row) => String(row.id || "") === input.targetEntityId);
  if (!target) {
    throw new Error(`TARGET_NOT_READY:The related ${input.targetEntityType} record is not synchronized yet.`);
  }

  const patchedTarget = { ...target };
  if (input.attachmentFieldMode === "append") {
    const current = Array.isArray(target[input.attachmentField])
      ? target[input.attachmentField] as unknown[]
      : [];
    patchedTarget[input.attachmentField] = Array.from(new Set([
      ...current.map(String),
      input.attachment.id,
    ]));
  } else {
    patchedTarget[input.attachmentField] = input.attachment.id;
  }
  operations.push({ collection, upsert: [patchedTarget] });
  return operations;
}
