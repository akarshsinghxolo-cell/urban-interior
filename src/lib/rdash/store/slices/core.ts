/**
 * Core slice — extractable core infrastructure actions.
 *
 * Phase 3o moved 7 of the 9 CoreState actions out of store.ts. The
 * remaining 2 — `hydrateSecureWorkspace` and `resetDatabase` — stay
 * inline because they depend on closure variables (`serverRevisionForQueue`,
 * `lastAcceptedServerRevision`, `lastAcceptedServerDb`, `syncEpoch`,
 * `restoreAcceptedWorkspace`) that cannot be passed through `StoreContext`
 * without leaking the server-sync internals to every slice.
 *
 * Extracted actions:
 *   - replaceStaffLocationPings   (uses `setBase` directly — pure local cache)
 *   - upsertStaffLocationPing     (uses `setBase` directly — pure local cache)
 *   - currentUser                 (uses `get().authUser` — pure read)
 *   - canReleaseContractorPayment (delegates to `contractorPaymentProofStatus`)
 *   - mutateMaster                (uses `commitState` + `prepareWorkspaceData`)
 *   - dataIssues                  (uses `get().db` + `validateBusinessData`)
 *   - logAudit                    (uses `commitState` + `genId`/`nowIso`)
 *
 * Left in store.ts:
 *   - hydrateSecureWorkspace      (writes closure vars + uses prepareWorkspaceDatabase)
 *   - resetDatabase               (writes closure vars + calls restoreAcceptedWorkspace)
 *
 * No module-scope helpers were moved: `mergeStaffLocationPings`,
 * `prepareWorkspaceData`, `validateBusinessData`, `contractorPaymentProofStatus`,
 * `genId`, `nowIso` are all already shared imports.
 */
import type { Master, FileAsset, StaffDocument, StaffRolePermission, IntegrityReport, RepairResult, CascadeResult } from "../../types";
import type { CoreState } from "../types";
import type { StoreContext } from "../context";
import type { StaffLocationPing } from "../../staff-location";
import { mergeStaffLocationPings } from "../../staff-location";
import { prepareWorkspaceData } from "../../work-category-master";
import { validateBusinessData } from "../../business-rules";
import { genId, nowIso, contractorPaymentProofStatus } from "../helpers";
import { mapEntityTypeToThreadKind } from "../../entity-thread-map";
import { checkWorkspaceIntegrity } from "../../integrity/checker";
import { repairIntegrityIssues } from "../../integrity/repair";
import { cascadeDelete } from "../../integrity/cascade";

// Re-export for backward compatibility — other files that imported
// mapEntityTypeToThreadKind from core.ts still work.
export { mapEntityTypeToThreadKind };

/**
 * The extractable CoreState actions. `hydrateSecureWorkspace` and
 * `resetDatabase` stay inline in store.ts.
 */
export type CoreSliceActions = Pick<CoreState,
    | "replaceStaffLocationPings"
    | "upsertStaffLocationPing"
    | "currentUser"
    | "canReleaseContractorPayment"
    | "mutateMaster"
    | "upsertStaffRolePermission"
    | "updateStaffRolePermission"
    | "removeStaffRolePermission"
    | "registerStaffDocument"
    | "updateStaffDocument"
    | "removeStaffDocument"
    | "dataIssues"
    | "logAudit"
    | "reconcileWorkspace"
    | "runIntegrityCheck"
    | "repairIntegrityNow"
    | "cascadeDeleteRecord">;

export function createCoreSlice(ctx: StoreContext): CoreSliceActions {
    const { commitState, get, setBase } = ctx;

    return {
        replaceStaffLocationPings: (points: StaffLocationPing[]) => {
            setBase({ staffLocationPings: mergeStaffLocationPings([], points) });
        },
        upsertStaffLocationPing: (point: StaffLocationPing) => {
            setBase((state: any) => ({ staffLocationPings: mergeStaffLocationPings(state.staffLocationPings, [point]) }));
        },
        currentUser: () => {
            const user = get().authUser;
            if (user)
                return { name: user.name, role: user.role, staffId: user.staffId };
            return { name: "Unauthenticated", role: "Unauthenticated" };
        },
        updateAuthUser: (patch) => {
            const current = get().authUser;
            if (!current) return;
            if (patch.name !== undefined) {
                setBase((state: any) => ({
                    authUser: { ...state.authUser, name: patch.name!.trim() || state.authUser.name },
                }));
            }
        },
        canReleaseContractorPayment: (workOrderId) => contractorPaymentProofStatus(get().db, workOrderId),
        mutateMaster: (updater: (master: Master) => Master) => commitState((s: any) => ({
            db: prepareWorkspaceData({ ...s.db, master: updater(s.db.master) }),
        })),
        upsertStaffRolePermission: (row: StaffRolePermission) => commitState((s: any) => {
            const current = ((s.db as any).staffRolePermissions || []) as StaffRolePermission[];
            const now = nowIso();
            const next = { ...row, updated_at: now };
            const exists = current.some((entry) => entry.id === row.id || (entry.role_key === row.role_key && entry.module_key === row.module_key));
            return {
                db: {
                    ...s.db,
                    staffRolePermissions: exists
                        ? current.map((entry) => entry.id === row.id || (entry.role_key === row.role_key && entry.module_key === row.module_key) ? { ...entry, ...next, id: entry.id } : entry)
                        : [next, ...current],
                },
            };
        }),
        updateStaffRolePermission: (id: string, patch: Partial<Omit<StaffRolePermission, "id" | "role_key" | "module_key">>) => commitState((s: any) => {
            const current = ((s.db as any).staffRolePermissions || []) as StaffRolePermission[];
            return { db: { ...s.db, staffRolePermissions: current.map((entry) => entry.id === id ? { ...entry, ...patch, updated_at: nowIso() } : entry) } };
        }),
        removeStaffRolePermission: (id: string) => commitState((s: any) => {
            const current = ((s.db as any).staffRolePermissions || []) as StaffRolePermission[];
            return { db: { ...s.db, staffRolePermissions: current.filter((entry) => entry.id !== id) } };
        }),
        registerStaffDocument: (input) => commitState((s: any) => {
            if (!input.fileUrl?.trim().startsWith("https://drive.google.com/")) {
                throw new Error("Staff document file must be a Google Drive web link.");
            }
            const now = nowIso();
            const fileAssetId = genId("staff-file");
            const documentId = genId("staff-doc");
            const asset: FileAsset = {
                id: fileAssetId,
                file_name: input.fileName,
                mime_type: input.mimeType,
                kind: "document",
                web_view_link: input.fileUrl.trim(),
                file_size_bytes: input.fileSizeBytes,
                storage_provider: "google_drive",
                storage_mode: "external_reference",
                sync_status: "uploaded",
                tags: ["staff-document", input.staffId, input.documentType].filter(Boolean),
                status: "active",
                created_at: now,
                updated_at: now,
            };
            const document: StaffDocument = {
                id: documentId,
                staff_id: input.staffId,
                document_type: input.documentType,
                document_no: input.documentNo?.trim() || undefined,
                file_asset_id: fileAssetId,
                status: "pending",
                created_at: now,
            };
            return {
                db: {
                    ...s.db,
                    master: { ...s.db.master, fileAssets: [asset, ...(s.db.master.fileAssets || [])] },
                    staffDocuments: [document, ...(((s.db as any).staffDocuments || []) as StaffDocument[])],
                },
            };
        }),
        updateStaffDocument: (id: string, patch: Partial<Omit<StaffDocument, "id" | "staff_id" | "created_at">>) => commitState((s: any) => {
            const current = (((s.db as any).staffDocuments || []) as StaffDocument[]);
            return { db: { ...s.db, staffDocuments: current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) } };
        }),
        removeStaffDocument: (id: string) => commitState((s: any) => {
            const current = (((s.db as any).staffDocuments || []) as StaffDocument[]);
            const target = current.find((entry) => entry.id === id);
            return {
                db: {
                    ...s.db,
                    staffDocuments: current.filter((entry) => entry.id !== id),
                    master: target?.file_asset_id ? { ...s.db.master, fileAssets: (s.db.master.fileAssets || []).map((asset: FileAsset) => asset.id === target.file_asset_id ? { ...asset, status: "archived" as const, updated_at: nowIso() } : asset) } : s.db.master,
                },
            };
        }),
        dataIssues: () => validateBusinessData(get().db),
        /**
         * reconcileWorkspace — runs every reconciliation helper in sequence
         * and returns a summary. This is the single entry point for "make the
         * workspace state match reality" — auto-missing overdue visits,
         * escalating overdue follow-ups, generating recurring tasks, and
         * auto-marking absent staff.
         *
         * Safe to call multiple times — each helper is idempotent (no-ops if
         * there's nothing to do). Hooked into the workspace load flow (when
         * the secure workspace hydrates) so reconciliations fire even if no
         * manager ever opens Attendance / Visits / Tasks modules. Also
         * surfaced via a "Refresh workspace" button in the header.
         */
        reconcileWorkspace: () => {
            const summary = {
                attendance: 0,
                followups: 0,
                visits: 0,
                recurringTasks: 0,
                total: 0,
            };
            const role = get().currentUser().role;
            // Reconciliation actions require Owner/Operations Manager role.
            // Non-managers (Field Staff, Sales, etc.) get a no-op — they
            // wouldn't have permission to mark anything anyway.
            if (role !== "Owner" && role !== "Operations Manager") {
                return summary;
            }
            // STAGE-5-FIX (5.9): Log errors instead of swallowing silently.
            // Previously a broken reconciliation helper would fail forever
            // with no signal — the summary reported 0 touched, masking the bug.
            try {
                summary.attendance = get().runAttendanceReconciliation();
            }
            catch (err) { console.warn("[reconcileWorkspace] attendance reconciliation failed:", err); }
            try {
                summary.followups = get().runFollowupReconciliation();
            }
            catch (err) { console.warn("[reconcileWorkspace] followups reconciliation failed:", err); }
            try {
                summary.visits = get().runVisitReconciliation();
            }
            catch (err) { console.warn("[reconcileWorkspace] visits reconciliation failed:", err); }
            try {
                summary.recurringTasks = get().runRecurringTasks();
            }
            catch (err) { console.warn("[reconcileWorkspace] recurringTasks reconciliation failed:", err); }
            summary.total = summary.attendance + summary.followups +
                summary.visits + summary.recurringTasks;
            return summary;
        },
        logAudit: (entry) => {
            const auditId = genId("aud");
            const ts = nowIso();
            // Build the full audit entry with all fields (not just the subset
            // that was previously captured).
            const auditEntry: any = {
                id: auditId,
                timestamp: ts,
                actor: entry.actor,
                actor_role: entry.actor_role,
                action: entry.action,
                entity_type: entry.entity_type,
                entity_id: entry.entity_id,
                entity_label: entry.entity_label,
                kind: entry.kind,
                reason: entry.reason,
                before: entry.before,
                after: entry.after,
                changes: entry.changes,
                source_module: entry.source_module,
            };
            // Auto-post this event as a system message in the entity's thread.
            // This is the core of the "Universal Conversation Graph" — every
            // audit event automatically becomes a thread message, so the
            // thread IS the complete lifecycle of the entity.
            const entityType = entry.entity_type;
            const entityId = entry.entity_id;
            const threadKind = mapEntityTypeToThreadKind(entityType);
            const threadMessageBody = entry.action + (entry.reason ? ` — Reason: "${entry.reason}"` : "");
            // Collect all thread IDs to post to: the primary entity + cross-posts.
            const threadTargets: Array<{ kind: any; recordId: string; title: string; }> = [];
            if (threadKind && entityId) {
                threadTargets.push({
                    kind: threadKind,
                    recordId: entityId,
                    title: entry.entity_label || entityId,
                });
            }
            // Add cross-post targets.
            if (entry.cross_post) {
                for (const cp of entry.cross_post) {
                    const cpKind = mapEntityTypeToThreadKind(cp.entity_type);
                    if (cpKind && cp.entity_id) {
                        threadTargets.push({
                            kind: cpKind,
                            recordId: cp.entity_id,
                            title: cp.entity_label || cp.entity_id,
                        });
                    }
                }
            }
            // Open threads + add system messages for each target.
            // We do this via setBase (not commitState) to avoid nested commits.
            const threadIds: string[] = [];
            for (const target of threadTargets) {
                const threadId = get().openThreadFor(target.kind, target.recordId, target.title, [entry.actor]);
                threadIds.push(threadId);
            }
            commitState((s: any) => {
                const nextAudit = [auditEntry, ...s.db.auditLog];
                const nextThreads = s.db.threads.map((thread: any) => {
                    if (!threadIds.includes(thread.id)) return thread;
                    const msg: any = {
                        id: genId("msg"),
                        thread_id: thread.id,
                        author_name: entry.actor,
                        author_role: entry.actor_role,
                        body: threadMessageBody,
                        kind: entry.kind === "alert" ? "alert" : "system",
                        created_at: ts,
                        related_audit_id: auditId,
                    };
                    return { ...thread, messages: [...thread.messages, msg], updated_at: ts };
                });
                // Link the audit entry to the primary thread.
                if (threadIds.length > 0) {
                    auditEntry.thread_id = threadIds[0];
                }
                return { db: { ...s.db, auditLog: nextAudit, threads: nextThreads } };
            });
        },
        // ── Integrity layer (Phase 4) ──────────────────────────────────
        // runIntegrityCheck — read-only. Computes the integrity report and
        // stores it on state.integrityReport. Safe to call from any module
        // (used by the Integrity dashboard). The report is also returned so
        // callers can use it immediately without re-reading the store.
        runIntegrityCheck: () => {
            const report = checkWorkspaceIntegrity(get().db);
            setBase({ integrityReport: report });
            return report;
        },
        // repairIntegrityNow — runs the repair engine, commits the repaired
        // db via commitState (which runs validateBusinessData for safety),
        // re-runs the checker, and returns the RepairResult. If the repair
        // would produce an invalid db, commitState throws and the
        // transaction rolls back — the caller sees the error.
        repairIntegrityNow: () => {
            const before = get().db;
            const { db: repairedDb, result } = repairIntegrityIssues(before);
            // commitState runs validateBusinessData — if the repair produced
            // an invalid db, this throws and the workspace is left unchanged.
            commitState(() => ({ db: repairedDb }));
            // Refresh the integrity report so the UI updates.
            const freshReport = checkWorkspaceIntegrity(get().db);
            setBase({ integrityReport: freshReport });
            // Log an audit entry for the repair action.
            try {
                get().logAudit({
                    actor: get().currentUser().name,
                    actor_role: get().currentUser().role,
                    action: `Integrity auto-repair: ${result.repaired} fixed, ${result.skipped} skipped`,
                    entity_type: "workspace",
                    entity_id: "integrity",
                    entity_label: "Workspace integrity",
                    kind: "system",
                    source_module: "integrity",
                    reason: result.details.slice(0, 5).map((d) => `${d.collection}:${d.id}`).join(", "),
                });
            } catch {
                // Audit log failures are non-fatal — the repair itself succeeded.
            }
            return result as unknown as RepairResult;
        },
        // cascadeDeleteRecord — runs the cascade-delete planner, commits
        // the result, re-runs the checker, returns the CascadeResult. If
        // any child relationship is `restrict` and a child exists, the
        // cascade aborts (success=false) and the db is left unchanged.
        cascadeDeleteRecord: (collection, id, options) => {
            const before = get().db;
            const { db: nextDb, result } = cascadeDelete(before, collection, id, options || {});
            if (!result.success) {
                // Blocked by a restrict rule — don't commit, but refresh
                // the integrity report so the UI can show the block.
                setBase({ integrityReport: checkWorkspaceIntegrity(before) });
                return result as unknown as CascadeResult;
            }
            // Commit the cascaded db. commitState runs validateBusinessData
            // — if the cascade produced an invalid db, this throws and the
            // workspace is left unchanged.
            commitState(() => ({ db: nextDb }));
            const freshReport = checkWorkspaceIntegrity(get().db);
            setBase({ integrityReport: freshReport });
            try {
                get().logAudit({
                    actor: get().currentUser().name,
                    actor_role: get().currentUser().role,
                    action: `Cascade-delete ${collection}:${id} — ${result.deleted.length} deleted, ${result.nullified.length} nullified${options?.softDelete ? ", soft-delete" : ""}`,
                    entity_type: collection,
                    entity_id: id,
                    entity_label: result.deleted[0]?.label || id,
                    kind: "delete",
                    source_module: "integrity",
                    reason: result.blocked.length
                        ? `${result.blocked.length} blocked`
                        : undefined,
                });
            } catch {
                // Audit log failures are non-fatal.
            }
            return result as unknown as CascadeResult;
        },
    };
}
