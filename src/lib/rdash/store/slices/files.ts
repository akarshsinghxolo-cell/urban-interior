import type {
  FileAsset, FileAssetCreateInput, EntityFileAttachment, EntityReferenceAssignment, RDashDatabase,
} from "../../types";
import type { FilesState } from "../types";
import type { StoreContext } from "../context";
import { genId, nowIso, googleFileIdFromUrl } from "../helpers";

function inferAttachmentRole(kind: FileAsset["kind"]): EntityFileAttachment["role"] {
    if (kind === "drawing")
        return "drawing";
    if (kind === "catalogue")
        return "catalogue";
    if (kind === "site_proof")
        return "proof";
    if (kind === "media")
        return "photo";
    return "document";
}

function resolveAttachmentEntityLabel(db: RDashDatabase, type: EntityFileAttachment["entity_type"], id: string): string {
    const lookup: Record<string, Array<{ id: string; [key: string]: unknown }>> = {
        customer: db.customers as any,
        site: db.sites as any,
        room: db.areas as any,
        workRequired: db.workRequired as any,
        quotation: db.quotations as any,
        workOrder: db.workOrders as any,
        boq: db.boqs as any,
        purchase_order: db.purchaseOrders as any,
        grn: db.grns as any,
        vendor_bill: db.vendorBills as any,
        dispatch: db.dispatches as any,
        inventory: db.inventory as any,
        drawing: db.drawings as any,
        execution_log: db.executionLogs as any,
        visit: db.visits as any,
        task: db.tasks as any,
        followup: db.followups as any,
        payment: db.payments as any,
        invoice: db.invoices as any,
        vendor: db.master.vendors as any,
        contractor: db.master.contractors as any,
        commission: db.commissions as any,
        blocked: db.blocked as any,
    };
    const row = lookup[type]?.find((item) => item.id === id) as Record<string, unknown> | undefined;
    if (!row)
        return `${type.replace(/_/g, " ")} · ${id}`;
    return String(row.name ||
        row.title ||
        row.invoice_no ||
        row.quotation_no ||
        row.work_order_no ||
        row.po_no ||
        row.grn_no ||
        row.bill_no ||
        row.dispatch_no ||
        row.drawing_no ||
        row.log_no ||
        row.location_name ||
        row.customer_name ||
        id);
}

export function createFilesSlice(ctx: StoreContext): FilesState {
    const { commitState, get, setBase } = ctx;

    return {
        // Adds a FileAsset + Attachment that were uploaded to Google Drive.
        // FIX-E2E-003: The upload route no longer calls saveWorkspace (it only
        // UPSERTs the storageFolderInstance). The FileAsset and Attachment must
        // be committed by the client via commitState so they persist server-side
        // and survive page reloads. Previously used setBase (no server commit),
        // which meant files appeared in the UI immediately but vanished on reload.
        addServerFileAsset: (fileAsset: FileAsset, attachment: EntityFileAttachment) => {
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    master: {
                        ...state.db.master,
                        fileAssets: [...(state.db.master.fileAssets || []), fileAsset],
                    },
                    entityFileAttachments: [...(state.db.entityFileAttachments || []), attachment],
                },
            }));
        },
        createFileAssetAndAttach: (file: FileAssetCreateInput, link: Partial<EntityFileAttachment> & {
            entity_type: EntityFileAttachment["entity_type"]; entity_id: string;
        }) => {
            const linkValue = file.web_view_link || "";
            const isDriveLink = /^https:\/\/drive\.google\.com\//.test(linkValue);
            const isLocalLink = /^\/api\/local-file\//.test(linkValue);
            if (!isDriveLink && !isLocalLink) {
                throw new Error("Operational files must use a Google Drive file link or a locally uploaded file link.");
            }
            if (/^(data:|blob:)/i.test(linkValue)) {
                throw new Error("Embedded or temporary file data cannot be saved. Upload the file first.");
            }
            const existingFile = get().db.master.fileAssets.find((candidate: FileAsset) => candidate.status === "active" &&
                ((file.google_file_id && candidate.google_file_id === file.google_file_id) ||
                    (!file.google_file_id && candidate.web_view_link === file.web_view_link)));
            if (existingFile) {
                return get().attachFileAsset({ ...link, file_asset_id: existingFile.id });
            }
            const timestamp = nowIso();
            const id = file.id || genId("drive");
            const attachmentId = genId("attach");
            commitState((s: any) => {
                const storageAccountId = file.storage_account_id;
                const suppliedInstance = file.storage_folder_instance;
                const isLocalAccount = storageAccountId === "local";
                const knownAccount = storageAccountId
                    ? (isLocalAccount ? undefined : s.db.master.storageAccounts.find((account: any) => account.id === storageAccountId))
                    : undefined;
                if (storageAccountId && !knownAccount && !isLocalAccount) {
                    throw new Error("The selected Drive account is no longer connected.");
                }
                const folderInstanceId = file.storage_folder_instance_id || suppliedInstance?.id;
                const knownFolder = folderInstanceId
                    ? s.db.master.storageFolderInstances.find((folder: any) => folder.id === folderInstanceId)
                    : undefined;
                if (folderInstanceId && !knownFolder && !suppliedInstance) {
                    throw new Error("The upload folder could not be resolved in the connected Drive account.");
                }
                if (suppliedInstance && suppliedInstance.storage_account_id !== storageAccountId) {
                    throw new Error("The file folder must belong to the same connected Drive account as the file.");
                }
                const storageMode = isLocalAccount ? "managed" as const : (file.storage_mode === "managed" && knownAccount && folderInstanceId ? "managed" as const : "external_reference" as const);
                const driveFile: FileAsset = {
                    id,
                    storage_account_id: storageAccountId,
                    storage_folder_instance_id: folderInstanceId,
                    google_file_id: file.google_file_id || googleFileIdFromUrl(file.web_view_link),
                    file_name: file.file_name.trim(),
                    mime_type: file.mime_type,
                    kind: file.kind || "document",
                    web_view_link: file.web_view_link.trim(),
                    thumbnail_url: file.thumbnail_url,
                    file_size_bytes: file.file_size_bytes,
                    storage_provider: isLocalAccount ? "local" : "google_drive",
                    storage_mode: storageMode,
                    sync_status: "uploaded",
                    tags: file.tags || [],
                    status: "active",
                    created_at: timestamp,
                    updated_at: timestamp,
                };
                const attachment: EntityFileAttachment = {
                    id: attachmentId,
                    file_asset_id: id,
                    entity_type: link.entity_type,
                    entity_id: link.entity_id,
                    entity_label: link.entity_label || resolveAttachmentEntityLabel(s.db, link.entity_type, link.entity_id),
                    role: link.role || inferAttachmentRole(file.kind || "document"),
                    caption: link.caption,
                    customer_shareable: link.customer_shareable ?? false,
                    visibility: link.visibility || "internal",
                    created_by: link.created_by || "Owner",
                    created_at: timestamp,
                    updated_at: timestamp,
                };
                return {
                    db: {
                        ...s.db,
                        master: {
                            ...s.db.master,
                            storageFolderInstances: suppliedInstance && !knownFolder
                                ? [...s.db.master.storageFolderInstances, { ...suppliedInstance, status: "active", created_at: timestamp, updated_at: timestamp }]
                                : s.db.master.storageFolderInstances,
                            fileAssets: [...s.db.master.fileAssets, driveFile],
                        },
                        entityFileAttachments: [...(s.db.entityFileAttachments || []), attachment],
                    },
                };
            });
            get().logAudit({
                actor: link.created_by || "Owner",
                actor_role: "Owner",
                action: `Linked Drive file ${file.file_name} to ${link.entity_type}`,
                entity_type: link.entity_type,
                entity_id: link.entity_id,
                entity_label: file.file_name,
                kind: "create",
            });
            return attachmentId;
        },

        attachFileAsset: (link: Partial<EntityFileAttachment> & {
            file_asset_id: string; entity_type: EntityFileAttachment["entity_type"]; entity_id: string;
        }) => {
            const timestamp = nowIso();
            const attachmentId = genId("attach");
            const source = get().db.master.fileAssets.find((file: FileAsset) => file.id === link.file_asset_id);
            if (!source)
                return "";
            const duplicate = get().db.entityFileAttachments.find((attachment: EntityFileAttachment) => attachment.file_asset_id === link.file_asset_id &&
                attachment.entity_type === link.entity_type &&
                attachment.entity_id === link.entity_id &&
                attachment.role === (link.role || inferAttachmentRole(source.kind)));
            if (duplicate)
                return duplicate.id;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    entityFileAttachments: [
                        ...(s.db.entityFileAttachments || []),
                        {
                            id: attachmentId,
                            file_asset_id: link.file_asset_id,
                            entity_type: link.entity_type,
                            entity_id: link.entity_id,
                            entity_label: link.entity_label ||
                                resolveAttachmentEntityLabel(s.db, link.entity_type, link.entity_id),
                            role: link.role || inferAttachmentRole(source.kind),
                            caption: link.caption,
                            customer_shareable: link.customer_shareable ?? false,
                            visibility: link.visibility || "internal",
                            created_by: link.created_by || "Owner",
                            created_at: timestamp,
                            updated_at: timestamp,
                        },
                    ],
                },
            }));
            get().logAudit({
                actor: link.created_by || "Owner",
                actor_role: "Owner",
                action: `Attached existing Drive file ${source.file_name} to ${link.entity_type}`,
                entity_type: link.entity_type,
                entity_id: link.entity_id,
                entity_label: source.file_name,
                kind: "create",
            });
            return attachmentId;
        },

        updateEntityFileAttachment: (id, patch) => commitState((s: any) => ({
            db: {
                ...s.db,
                entityFileAttachments: (s.db.entityFileAttachments || []).map((attachment: EntityFileAttachment) => attachment.id === id
                    ? { ...attachment, ...patch, updated_at: nowIso() }
                    : attachment),
            },
        })),

        detachEntityFileAttachment: (id) => {
            const attachment = get().db.entityFileAttachments?.find((row: EntityFileAttachment) => row.id === id);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    entityFileAttachments: (s.db.entityFileAttachments || []).filter((row: EntityFileAttachment) => row.id !== id),
                },
            }));
            if (attachment)
                get().logAudit({
                    actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                    action: `Detached Drive file from ${attachment.entity_type}`,
                    entity_type: attachment.entity_type,
                    entity_id: attachment.entity_id,
                    entity_label: attachment.entity_label,
                    kind: "update",
                });
        },

        assignReferenceResource: (assignment: Partial<EntityReferenceAssignment> & {
            resource_type: EntityReferenceAssignment["resource_type"]; resource_id: string;
            entity_type: EntityReferenceAssignment["entity_type"]; entity_id: string;
        }) => {
            const timestamp = nowIso();
            const id = genId("refassign");
            const exists = (get().db.entityReferenceAssignments || []).find((row: EntityReferenceAssignment) => row.resource_type === assignment.resource_type &&
                row.resource_id === assignment.resource_id &&
                row.entity_type === assignment.entity_type &&
                row.entity_id === assignment.entity_id &&
                row.status === "active");
            if (exists)
                return exists.id;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    entityReferenceAssignments: [
                        ...(s.db.entityReferenceAssignments || []),
                        {
                            id,
                            resource_type: assignment.resource_type,
                            resource_id: assignment.resource_id,
                            entity_type: assignment.entity_type,
                            entity_id: assignment.entity_id,
                            entity_label: assignment.entity_label ||
                                resolveAttachmentEntityLabel(s.db, assignment.entity_type, assignment.entity_id),
                            customer_id: assignment.customer_id,
                            work_required_id: assignment.work_required_id,
                            quotation_id: assignment.quotation_id,
                            work_order_id: assignment.work_order_id,
                            site_id: assignment.site_id,
                            area_id: assignment.area_id,
                            article_id: assignment.article_id,
                            variant_id: assignment.variant_id,
                            vendor_id: assignment.vendor_id,
                            purpose: assignment.purpose || "design_reference",
                            note: assignment.note,
                            status: "active",
                            created_by: assignment.created_by || "Owner",
                            created_at: timestamp,
                            updated_at: timestamp,
                        },
                    ],
                },
            }));
            get().logAudit({
                actor: assignment.created_by || "Owner",
                actor_role: "Owner",
                action: `Assigned ${assignment.resource_type} to ${assignment.entity_type}`,
                entity_type: assignment.entity_type,
                entity_id: assignment.entity_id,
                entity_label: assignment.entity_label,
                kind: "create",
            });
            return id;
        },

        archiveReferenceAssignment: (id) => commitState((s: any) => ({
            db: {
                ...s.db,
                entityReferenceAssignments: (s.db.entityReferenceAssignments || []).map((row: EntityReferenceAssignment) => row.id === id
                    ? { ...row, status: "archived", updated_at: nowIso() }
                    : row),
            },
        })),
    };
}
