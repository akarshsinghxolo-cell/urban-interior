import type { AuthenticatedUser } from "./auth";
import type {
  EntityFileAttachment,
  FileAsset,
  FileAttachmentEntityType,
  StorageFolderInstance,
} from "../types";
import type { WorkspaceOperation } from "../workspace-operations";
import { commitWorkspaceOperations, getWorkspaceSubset } from "./workspace";

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

function collectionRows(data: unknown, collection: string): Array<Record<string, unknown>> {
  const workspace = data as Record<string, unknown> & { master?: Record<string, unknown> };
  const value = collection.startsWith("master.")
    ? workspace.master?.[collection.slice("master.".length)]
    : workspace[collection];
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

function updatedTargetRow(
  data: unknown,
  collection: string,
  entityId: string,
  field: string,
  mode: "set" | "append" | undefined,
  attachmentId: string,
): Record<string, unknown> {
  const current = collectionRows(data, collection).find((row) => String(row.id || "") === entityId);
  if (!current) throw new Error(`TARGET_NOT_READY:The related record is not synchronized yet.`);

  const next = { ...current };
  if (mode === "append") {
    const values = Array.isArray(current[field]) ? current[field] as unknown[] : [];
    next[field] = Array.from(new Set([...values.map(String), attachmentId]));
  } else {
    next[field] = attachmentId;
  }
  return next;
}

export async function commitFinalizedUploadWorkspace(input: {
  user: AuthenticatedUser;
  folderInstance: StorageFolderInstance;
  asset: FileAsset;
  attachment: EntityFileAttachment;
  entityType: FileAttachmentEntityType;
  entityId: string;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
}): Promise<void> {
  const targetCollection = ENTITY_COLLECTIONS[input.entityType];
  if (input.attachmentField && !targetCollection) {
    throw new Error(`Attachment field updates are not configured for ${input.entityType}.`);
  }

  const rowsByCollection: Record<string, string[]> = {
    "master.storageFolderInstances": [input.folderInstance.id],
    "master.fileAssets": [input.asset.id],
    entityFileAttachments: [input.attachment.id],
  };
  if (input.attachmentField && targetCollection) rowsByCollection[targetCollection] = [input.entityId];

  const snapshot = await getWorkspaceSubset({ rowsByCollection });
  const operations: WorkspaceOperation[] = [
    { collection: "master.storageFolderInstances", upsert: [input.folderInstance as unknown as Record<string, unknown>] },
    { collection: "master.fileAssets", upsert: [input.asset as unknown as Record<string, unknown>] },
    { collection: "entityFileAttachments", upsert: [input.attachment as unknown as Record<string, unknown>] },
  ];

  if (input.attachmentField && targetCollection) {
    operations.push({
      collection: targetCollection,
      upsert: [updatedTargetRow(
        snapshot.data,
        targetCollection,
        input.entityId,
        input.attachmentField,
        input.attachmentFieldMode,
        input.attachment.id,
      )],
    });
  }

  // Upload finalization participates in the same atomic row-CAS + workspace
  // revision/change-journal transaction as ordinary workspace saves. Replaying
  // an already-partially-written upload is intentional: the canonical commit
  // records those rows in the delta journal and makes the retry self-healing.
  await commitWorkspaceOperations(snapshot.revision, operations, snapshot.rowVersions || {});
}
