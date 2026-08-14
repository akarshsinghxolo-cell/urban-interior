import type {
  FileAsset, FileAssetCreateInput, EntityFileAttachment, EntityReferenceAssignment, RDashDatabase,
} from "../../types";
import type { FilesState } from "../types";
import type { StoreContext } from "../context";
import { genId, nowIso, googleFileIdFromUrl } from "../helpers";
import { resolveAttachmentEntityLabel, resolveEntityContext } from "../../entity-context";

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

function clearArrayAttachmentReference<T extends object>(
    row: T,
    field: keyof T,
    attachmentId: string,
    updatedAt?: string,
): T {
    const values = row[field];
    if (!Array.isArray(values) || !values.includes(attachmentId)) return row;
    return {
        ...row,
        [field]: values.filter((value: unknown) => value !== attachmentId),
        ...(updatedAt && "updated_at" in row ? { updated_at: updatedAt } : {}),
    } as T;
}

function clearSingleAttachmentReference<T extends object>(
    row: T,
    field: keyof T,
    attachmentId: string,
    updatedAt?: string,
): T {
    if (row[field] !== attachmentId) return row;
    return {
        ...row,
        [field]: undefined,
        ...(updatedAt && "updated_at" in row ? { updated_at: updatedAt } : {}),
    } as T;
}

function clearAttachmentReferences(db: RDashDatabase, attachmentId: string): RDashDatabase {
    const updatedAt = nowIso();
    return {
        ...db,
        sites: db.sites.map((site) => clearArrayAttachmentReference(site, "photo_attachment_ids", attachmentId, updatedAt)),
        visits: db.visits.map((visit) => clearArrayAttachmentReference(visit, "proof_attachment_ids", attachmentId, updatedAt)),
        tasks: db.tasks.map((task) => clearArrayAttachmentReference(task, "completion_proof_attachment_ids", attachmentId, updatedAt)),
        grns: db.grns.map((grn) => {
            const withoutProof = clearArrayAttachmentReference(grn, "receiving_proof_attachment_ids", attachmentId, updatedAt);
            return clearSingleAttachmentReference(withoutProof, "delivery_challan_attachment_id", attachmentId, updatedAt);
        }),
        drawings: db.drawings.map((drawing) => clearSingleAttachmentReference(drawing, "primary_file_attachment_id", attachmentId, updatedAt)),
        executionLogs: db.executionLogs.map((log) => {
            const withoutPhoto = clearArrayAttachmentReference(log, "photo_attachment_ids", attachmentId, updatedAt);
            return clearSingleAttachmentReference(withoutPhoto, "contractor_confirmation_attachment_id", attachmentId, updatedAt);
        }),
        commSends: db.commSends.map((send) => clearArrayAttachmentReference(send, "attachment_ids", attachmentId)),
        threads: db.threads.map((thread) => {
            let changed = false;
            const messages = thread.messages.map((message) => {
                const next = clearSingleAttachmentReference(message, "proof_attachment_id", attachmentId);
                if (next !== message) changed = true;
                if (!Array.isArray(next.attachments)) return next;
                let attachmentChanged = false;
                const attachments = next.attachments.map((item) => {
                    if (item.entity_file_attachment_id !== attachmentId) return item;
                    attachmentChanged = true;
                    return { ...item, entity_file_attachment_id: undefined };
                });
                if (!attachmentChanged) return next;
                changed = true;
                return { ...next, attachments };
            });
            return changed ? { ...thread, messages, updated_at: updatedAt } : thread;
        }),
        master: {
            ...db.master,
            vendors: db.master.vendors.map((vendor) => {
                const withoutCard = clearSingleAttachmentReference(vendor, "business_card_attachment_id", attachmentId, updatedAt);
                return clearSingleAttachmentReference(withoutCard, "shop_attachment_id", attachmentId, updatedAt);
            }),
            contractors: db.master.contractors.map((contractor) => {
                let next = clearSingleAttachmentReference(contractor, "photo_attachment_id", attachmentId, updatedAt);
                next = clearSingleAttachmentReference(next, "business_card_attachment_id", attachmentId, updatedAt);
                if (!Array.isArray(next.compliance_documents)) return next;
                let changed = false;
                const complianceDocuments = next.compliance_documents.map((document) => {
                    if (document.attachment_id !== attachmentId) return document;
                    changed = true;
                    return { ...document, attachment_id: undefined, updated_at: updatedAt };
                });
                return changed ? { ...next, compliance_documents: complianceDocuments, updated_at: updatedAt } : next;
            }),
        },
    };
}

type FileCleanupStore = {
    awaitServerSync?: () => Promise<unknown>;
};

export function requestFileAssetCleanupAfterSync(get: () => FileCleanupStore, fileAssetId: string) {
    if (typeof window === "undefined") return;
    queueMicrotask(() => {
        const awaitServerSync = get().awaitServerSync;
        if (typeof awaitServerSync !== "function") return;
        void awaitServerSync()
            .then(async () => {
                const response = await fetch("/api/google-drive/cleanup", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fileAssetId }),
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({})) as { error?: string };
                    throw new Error(payload.error || `Drive cleanup failed (${response.status}).`);
                }
            })
            .catch((error: unknown) => console.error("[FileCleanup] Could not clean detached Drive file", error));
    });
}

export function createFilesSlice(ctx: StoreContext): FilesState {
    const { commitState, get } = ctx;

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
            if (!isDriveLink) {
                throw new Error("Operational files must use a Google Drive file link.");
            }
            if (/^(data:|blob:)/i.test(linkValue)) {
                throw new Error("Embedded or temporary file data cannot be saved. Upload the file first.");
            }
            resolveEntityContext(get().db, link.entity_type, link.entity_id, "File attachment");
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
                const knownAccount = storageAccountId
                    ? s.db.master.storageAccounts.find((account: any) => account.id === storageAccountId)
                    : undefined;
                if (storageAccountId && !knownAccount) {
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
                const storageMode = file.storage_mode === "managed" && knownAccount && folderInstanceId
                    ? "managed" as const
                    : "external_reference" as const;
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
                    storage_provider: "google_drive",
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
            resolveEntityContext(get().db, link.entity_type, link.entity_id, "File attachment");
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

        updateEntityFileAttachment: (id, patch) => {
            const current = get().db.entityFileAttachments.find((attachment: EntityFileAttachment) => attachment.id === id);
            if (!current) return;
            const entityType = patch.entity_type || current.entity_type;
            const entityId = patch.entity_id || current.entity_id;
            resolveEntityContext(get().db, entityType, entityId, "File attachment");
            const targetChanged = entityType !== current.entity_type || entityId !== current.entity_id;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    entityFileAttachments: (s.db.entityFileAttachments || []).map((attachment: EntityFileAttachment) => attachment.id === id
                        ? {
                            ...attachment,
                            ...patch,
                            entity_label: patch.entity_label || (targetChanged
                                ? resolveAttachmentEntityLabel(s.db, entityType, entityId)
                                : attachment.entity_label),
                            updated_at: nowIso(),
                        }
                        : attachment),
                },
            }));
        },

        detachEntityFileAttachment: (id) => {
            const attachment = get().db.entityFileAttachments?.find((row: EntityFileAttachment) => row.id === id);
            commitState((s: any) => ({
                db: clearAttachmentReferences({
                    ...s.db,
                    entityFileAttachments: (s.db.entityFileAttachments || []).filter((row: EntityFileAttachment) => row.id !== id),
                }, id),
            }));
            if (attachment) {
                get().logAudit({
                    actor: get().currentUser().name,
                    actor_role: get().currentUser().role,
                    action: `Detached Drive file from ${attachment.entity_type}`,
                    entity_type: attachment.entity_type,
                    entity_id: attachment.entity_id,
                    entity_label: attachment.entity_label,
                    kind: "update",
                });
                requestFileAssetCleanupAfterSync(get, attachment.file_asset_id);
            }
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
