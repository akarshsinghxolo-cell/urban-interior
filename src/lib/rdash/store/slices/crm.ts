/**
 * CRM slice — customers, sites, areas, work required, measurements,
 * and structured work capture.
 *
 * Phase 3n moved the 14 CRM actions out of store.ts in 6 groups:
 *   Group 1: addWorkRequired, updateWorkRequired
 *   Group 2: saveCustomerWithSites, mergeCustomers
 *   Group 3: archiveSite
 *   Group 4: addArea, updateArea, archiveArea
 *   Group 5: addMeasurementRevision
 *   Group 6: captureStructuredWorkRequired
 *
 * No module-scope helpers were moved: all CRM action helpers
 * (`assertSiteExists`, `assertSiteBelongsToCustomer`,
 * `assertAreasBelongToSite`, `assertAreaBelongsToSite`,
 * `assertMeasurementRevisionRelations`, `assertWorkRequiredMatchesContext`,
 * `assertWorkCategoryId`, `assertWorkSubcategoryId`,
 * `areaDependencySummary`, `replaceAreaId`)
 * were already imported in store.ts from `../../business-rules` and
 * `../../customer-identity`. The shared `genId` / `nowIso` / `businessDate`
 * helpers were already in `../helpers`.
 */
import type { Customer, Site, Area, LineItem } from "../../types";
import type { CrmState } from "../types";
import type { StoreContext } from "../context";
import { advanceWorkRequiredLifecycleStatus, evaluateWorkRequiredTransition } from "../../work-required-lifecycle";
import { primaryWorkType, workTypesForSubcategory } from "../../work-types";
import { contractorWorkTypeAverages } from "../../contractor-profile";
import { assertRole, genId, nowIso } from "../helpers";
import {
    assertAreaBelongsToSite, assertAreasBelongToSite,
    assertCustomerExists, assertSiteExists, assertSiteBelongsToCustomer,
    assertMeasurementRevisionRelations, assertWorkRequiredMatchesContext,
    assertWorkCategoryId, assertWorkSubcategoryId,
    areaDependencySummary, replaceAreaId,
} from "../../business-rules";
import { applyCustomerWithSitesSave } from "../../customer-sites-save";
import { requestFileAssetCleanupAfterSync } from "./files";

export function createCrmSlice(ctx: StoreContext): CrmState {
    const { commitState, get } = ctx;

    return {
        addWorkRequired: (work) => {
            if (!work.customer_id) throw new Error("Work Required requires a Customer.");
            assertCustomerExists(get().db, work.customer_id, "Work Required");
            if (work.site_id) {
                assertSiteBelongsToCustomer(get().db, work.site_id, work.customer_id, "Work Required");
                assertAreasBelongToSite(get().db, work.area_ids || [], work.site_id, "Work Required");
            } else if (work.area_ids?.length) throw new Error("Customer-level Work Required cannot include Site Areas.");
            const id = work.id || genId("workRequired");
            const now = nowIso();
            const row: import("../../types").WorkRequired = {
                id,
                customer_id: work.customer_id,
                site_id: work.site_id || "",
                title: work.title || "New work required",
                work_category_id: work.work_category_id,
                work_subcategory_ids: work.work_subcategory_ids || [],
                work_type_ids: work.work_type_ids || [],
                area_ids: work.area_ids || [],
                description: work.description,
                structured_items: work.structured_items || [],
                status: work.status || "new",
                source: work.source,
                priority: work.priority || "medium",
                budget: work.budget,
                created_at: now,
                updated_at: now,
            };
            (row.structured_items || []).forEach((item: any) => {
                if (item.area_id && row.site_id)
                    assertAreaBelongsToSite(get().db, item.area_id, row.site_id, "Work Required");
            });
            commitState((s: any) => ({
                db: { ...s.db, workRequired: [row, ...s.db.workRequired] },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Added work required ${row.title}`,
                entity_type: "workRequired",
                entity_id: id,
                entity_label: row.title,
                kind: "create",
                cross_post: [
                    ...(row.customer_id ? [{ entity_type: "customer", entity_id: row.customer_id }] : []),
                    ...(row.site_id ? [{ entity_type: "site", entity_id: row.site_id }] : []),
                ],
            });
            return id;
        },
        updateWorkRequired: (id, patch) => {
            const before = get().db.workRequired.find((row: any) => row.id === id);
            if (!before)
                throw new Error("Work Required not found.");
            if (patch.status !== undefined && patch.status !== before.status) {
                throw new Error("Work Required status must be changed through transitionWorkRequiredStatus so lifecycle rules are enforced.");
            }
            const next = { ...before, ...patch };
            assertCustomerExists(get().db, next.customer_id, "Work Required");
            if (next.site_id) {
                assertSiteBelongsToCustomer(get().db, next.site_id, next.customer_id, "Work Required");
                assertAreasBelongToSite(get().db, next.area_ids, next.site_id, "Work Required");
            } else if (next.area_ids.length) throw new Error("Customer-level Work Required cannot include Site Areas.");
            (next.structured_items || []).forEach((item: any) => {
                if (item.area_id)
                    assertAreaBelongsToSite(get().db, item.area_id, next.site_id, "Work Required");
            });
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    workRequired: s.db.workRequired.map((row: any) => row.id === id ? { ...row, ...patch, updated_at: nowIso() } : row),
                },
            }));
        },
        transitionWorkRequiredStatus: (id, status, options) => {
            const before = get().db.workRequired.find((row: any) => row.id === id);
            if (!before)
                throw new Error("Work Required not found.");
            const decision = evaluateWorkRequiredTransition(get().db, before, status);
            if (!decision.allowed)
                throw new Error(decision.reason || "This lifecycle transition is not allowed.");
            const reason = options?.reason?.trim();
            if (decision.requiresReason && !reason)
                throw new Error("A reason is required for this lifecycle transition.");
            const changedAt = nowIso();
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    workRequired: state.db.workRequired.map((row: any) => row.id === id
                        ? { ...row, status, updated_at: changedAt }
                        : row),
                },
            }));
            const actor = get().currentUser();
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Moved work required "${before.title}" from ${before.status} to ${status}`,
                entity_type: "workRequired",
                entity_id: id,
                entity_label: before.title,
                kind: "update",
                reason: reason || `Lifecycle transition via ${options?.source || "system"}`,
                cross_post: [
                    { entity_type: "customer", entity_id: before.customer_id },
                    { entity_type: "site", entity_id: before.site_id },
                ],
            });
        },
        saveCustomerWithSites: (input) => {
            const beforeDatabase = get().db;
            const result = applyCustomerWithSitesSave(beforeDatabase, input, {
                now: nowIso(),
                createId: (prefix) => genId(prefix),
            });
            if (!result.changed) {
                return {
                    customerId: result.customerId,
                    siteIds: result.siteIds,
                    areaIds: result.areaIds,
                    workRequiredIds: result.workRequiredIds,
                    changed: false,
                };
            }
            const detachedFileAssetIds = [...new Set(result.detachedAttachmentIds
                .map((attachmentId) => beforeDatabase.entityFileAttachments.find((row) => row.id === attachmentId)?.file_asset_id)
                .filter((fileAssetId): fileAssetId is string => Boolean(fileAssetId)))];
            commitState({ db: result.db });
            for (const fileAssetId of detachedFileAssetIds) {
                requestFileAssetCleanupAfterSync(get, fileAssetId);
            }
            const actor = get().currentUser();
            const customer = result.db.customers.find((row: Customer) => row.id === result.customerId)!;
            if (result.customerCreated || result.customerChanges.length) get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: result.customerCreated
                    ? `Created customer "${customer.name}" with ${result.siteIds.length} Site${result.siteIds.length === 1 ? "" : "s"}`
                    : `Updated customer "${customer.name}"${result.customerChanges.length ? ` (${result.customerChanges.map((change) => String(change.field)).join(", ")})` : ""}`,
                entity_type: "customer",
                entity_id: customer.id,
                entity_label: customer.name,
                kind: result.customerCreated ? "create" : "update",
                before: result.customerCreated ? undefined : beforeDatabase.customers.find((row: Customer) => row.id === customer.id),
                after: customer,
                changes: result.customerChanges.map((change) => ({
                    field: String(change.field),
                    before: change.before,
                    after: change.after,
                })),
                cross_post: result.siteIds.map((siteId) => ({
                    entity_type: "site",
                    entity_id: siteId,
                    entity_label: result.db.sites.find((site: Site) => site.id === siteId)?.name,
                })),
            });
            for (const change of result.siteChanges) {
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `${change.kind === "create" ? "Created" : "Updated"} Site "${change.after.name}" for ${customer.name}`,
                    entity_type: "site",
                    entity_id: change.siteId,
                    entity_label: change.after.name,
                    kind: change.kind,
                    before: change.before,
                    after: change.after,
                    cross_post: [{ entity_type: "customer", entity_id: customer.id, entity_label: customer.name }],
                });
            }
            for (const change of result.areaChanges) {
                const site = result.db.sites.find((row: Site) => row.id === change.after.site_id);
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `${change.kind === "create" ? "Created" : "Updated"} Area "${change.after.name}" for ${site?.name || "Site"}`,
                    entity_type: "area",
                    entity_id: change.areaId,
                    entity_label: change.after.name,
                    kind: change.kind,
                    before: change.before,
                    after: change.after,
                    cross_post: [
                        { entity_type: "customer", entity_id: customer.id, entity_label: customer.name },
                        { entity_type: "site", entity_id: change.after.site_id, entity_label: site?.name },
                    ],
                });
            }
            for (const change of result.workRequiredChanges) {
                const site = result.db.sites.find((row: Site) => row.id === change.after.site_id);
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `${change.kind === "create" ? "Created" : "Updated"} Work Required "${change.after.title}" for ${site?.name || customer.name}`,
                    entity_type: "workRequired",
                    entity_id: change.workRequiredId,
                    entity_label: change.after.title,
                    kind: change.kind,
                    before: change.before,
                    after: change.after,
                    cross_post: [
                        { entity_type: "customer", entity_id: customer.id, entity_label: customer.name },
                        ...(change.after.site_id ? [{ entity_type: "site", entity_id: change.after.site_id, entity_label: site?.name }] : []),
                    ],
                });
            }
            for (const attachmentId of result.detachedAttachmentIds) {
                const attachment = beforeDatabase.entityFileAttachments.find((row) => row.id === attachmentId);
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Detached file while saving ${customer.name}`,
                    entity_type: "entityFileAttachment",
                    entity_id: attachmentId,
                    entity_label: attachment?.entity_label,
                    kind: "delete",
                    before: attachment,
                    cross_post: [{ entity_type: "customer", entity_id: customer.id, entity_label: customer.name }],
                });
            }
            return {
                customerId: result.customerId,
                siteIds: result.siteIds,
                areaIds: result.areaIds,
                workRequiredIds: result.workRequiredIds,
                changed: true,
            };
        },
        mergeCustomers: (survivingCustomerId, duplicateCustomerId) => {
            const actor = get().currentUser();
            assertRole(actor.role, ["Owner", "Operations Manager"], "merge customers");
            if (!survivingCustomerId || !duplicateCustomerId || survivingCustomerId === duplicateCustomerId) {
                throw new Error("Choose two different Customer records to merge.");
            }
            const surviving = get().db.customers.find((customer: any) => customer.id === survivingCustomerId);
            const duplicate = get().db.customers.find((customer: any) => customer.id === duplicateCustomerId);
            if (!surviving || !duplicate)
                throw new Error("Both Customer records must exist before they can be merged.");
            const moveCustomerLink = <T extends {
                customer_id?: string;
            }>(rows: T[]) => rows.map((row: any) => row.customer_id === duplicateCustomerId ? { ...row, customer_id: survivingCustomerId } : row);
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    customers: state.db.customers.filter((customer: any) => customer.id !== duplicateCustomerId),
                    sites: moveCustomerLink(state.db.sites),
                    workRequired: moveCustomerLink(state.db.workRequired),
                    quotations: moveCustomerLink(state.db.quotations),
                    acceptedScopes: moveCustomerLink(state.db.acceptedScopes),
                    workOrders: moveCustomerLink(state.db.workOrders),
                    visits: moveCustomerLink(state.db.visits),
                    tasks: moveCustomerLink(state.db.tasks),
                    followups: moveCustomerLink(state.db.followups),
                    actions: moveCustomerLink(state.db.actions),
                    risks: moveCustomerLink(state.db.risks),
                    blocked: moveCustomerLink(state.db.blocked),
                    payments: moveCustomerLink(state.db.payments),
                    invoices: moveCustomerLink(state.db.invoices),
                    customerReceipts: moveCustomerLink(state.db.customerReceipts),
                    contractorBills: moveCustomerLink(state.db.contractorBills),
                    commissions: moveCustomerLink(state.db.commissions),
                    variationRequests: moveCustomerLink(state.db.variationRequests),
                    commSends: moveCustomerLink(state.db.commSends),
                    entityFileAttachments: state.db.entityFileAttachments.map((attachment: any) => attachment.entity_type === "customer" && attachment.entity_id === duplicateCustomerId
                        ? { ...attachment, entity_id: survivingCustomerId, entity_label: surviving.name, updated_at: nowIso() }
                        : attachment),
                    entityReferenceAssignments: state.db.entityReferenceAssignments.map((assignment: any) => ({
                        ...assignment,
                        ...(assignment.customer_id === duplicateCustomerId ? { customer_id: survivingCustomerId } : {}),
                        ...(assignment.entity_type === "customer" && assignment.entity_id === duplicateCustomerId
                            ? { entity_id: survivingCustomerId, entity_label: surviving.name }
                            : {}),
                        updated_at: assignment.customer_id === duplicateCustomerId || (assignment.entity_type === "customer" && assignment.entity_id === duplicateCustomerId)
                            ? nowIso()
                            : assignment.updated_at,
                    })),
                    threads: state.db.threads.map((thread: any) => thread.record_id === `customer-conversation:${duplicateCustomerId}`
                        ? { ...thread, record_id: `customer-conversation:${survivingCustomerId}` }
                        : thread),
                    auditLog: state.db.auditLog.map((entry: any) => entry.entity_type === "customer" && entry.entity_id === duplicateCustomerId
                        ? { ...entry, entity_id: survivingCustomerId, entity_label: surviving.name }
                        : entry),
                },
                selectedCustomerId: state.selectedCustomerId === duplicateCustomerId ? survivingCustomerId : state.selectedCustomerId,
                detailPanel: state.detailPanel.kind === "customer" && state.detailPanel.recordId === duplicateCustomerId
                    ? { ...state.detailPanel, recordId: survivingCustomerId }
                    : state.detailPanel,
                contextHistory: state.contextHistory.map((entry: any) => ({
                    ...entry,
                    customerId: entry.customerId === duplicateCustomerId ? survivingCustomerId : entry.customerId,
                    recordId: entry.kind === "customer" && entry.recordId === duplicateCustomerId ? survivingCustomerId : entry.recordId,
                })),
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Merged duplicate customer "${duplicate.name}" into "${surviving.name}"`,
                entity_type: "customer",
                entity_id: survivingCustomerId,
                entity_label: surviving.name,
                kind: "update",
                cross_post: [
                    { entity_type: "customer", entity_id: duplicateCustomerId, entity_label: duplicate.name },
                ],
            });
        },
        archiveSite: (id, options) => {
            const site = get().db.sites.find((row: any) => row.id === id);
            if (!site)
                throw new Error("Site not found.");
            if (site.is_archived)
                return;
            const reason = options.reason.trim();
            if (!reason)
                throw new Error("An archive reason is required for a Site.");
            const actor = get().currentUser();
            const now = nowIso();
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    sites: state.db.sites.map((row: any) => row.id === id
                        ? {
                            ...row,
                            is_archived: true,
                            archived_at: now,
                            archived_by: actor.name,
                            archive_reason: reason,
                            stage: options.cancelled ? "cancelled" : row.stage,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Archived site ${site.name}: ${reason}`,
                entity_type: "site",
                entity_id: id,
                entity_label: site.name,
                kind: "update",
                cross_post: [
                    ...(site.customer_id ? [{ entity_type: "customer", entity_id: site.customer_id }] : []),
                ],
            });
        },
        addArea: (input) => {
            if (!input.site_id)
                throw new Error("Area requires a Site.");
            assertSiteExists(get().db, input.site_id, "Area");
            const id = input.id || genId("area");
            const now = nowIso();
            const area: Area = {
                id,
                site_id: input.site_id,
                name: input.name || "New area",
                area_type: input.area_type || "other",
                stage: input.stage || "unmeasured",
                length: input.length,
                width: input.width,
                height: input.height,
                unit: input.unit || "ft",
                floor_area: input.floor_area != null
                    ? input.floor_area
                    : input.length && input.width
                        ? input.length * input.width
                        : undefined,
                perimeter: input.perimeter != null
                    ? input.perimeter
                    : input.length && input.width
                        ? 2 * (input.length + input.width)
                        : undefined,
                notes: input.notes,
                created_at: now,
                updated_at: now,
            };
            commitState((state: any) => ({
                db: { ...state.db, areas: [area, ...state.db.areas] },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created area ${area.name}`,
                entity_type: "area",
                entity_id: id,
                entity_label: area.name,
                kind: "create",
                cross_post: [
                    { entity_type: "site", entity_id: area.site_id },
                ],
            });
            return id;
        },
        updateArea: (id, patch) => {
            const before = get().db.areas.find((area: any) => area.id === id);
            if (!before)
                throw new Error("Area not found.");
            if (before.is_archived)
                throw new Error("Archived Areas cannot be edited. Reopen or create a new Area instead.");
            if (patch.site_id && patch.site_id !== before.site_id) {
                throw new Error("An Area cannot be moved to another Site. Use an explicit reassignment workflow.");
            }
            assertSiteExists(get().db, before.site_id, "Area");
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    areas: state.db.areas.map((area: any) => area.id === id
                        ? {
                            ...area,
                            ...patch,
                            site_id: before.site_id,
                            updated_at: nowIso(),
                        }
                        : area),
                },
            }));
        },
        archiveArea: (id, options) => {
            const state = get();
            const source = state.db.areas.find((area: any) => area.id === id);
            if (!source)
                throw new Error("Area not found.");
            if (source.is_archived)
                return;
            const reason = options.reason.trim();
            if (!reason)
                throw new Error("An archive reason is required for an Area.");
            const dependencies = areaDependencySummary(state.db, id);
            const replacementId = options.replacementAreaId;
            if (dependencies.total > 0 && !replacementId) {
                throw new Error(`Area "${source.name}" has ${dependencies.total} linked record(s). Select a replacement Area before archiving it.`);
            }
            const replacement = replacementId
                ? assertAreaBelongsToSite(state.db, replacementId, source.site_id, "Area reassignment")
                : undefined;
            if (replacement?.id === source.id)
                throw new Error("Choose a different replacement Area.");
            const actor = state.currentUser();
            const now = nowIso();
            const replaceLine = (line: LineItem) => line.area_id === id && replacement
                ? { ...line, area_id: replacement.id, area_name: replacement.name }
                : line;
            commitState((current: any) => ({
                db: {
                    ...current.db,
                    areas: current.db.areas.map((area: any) => area.id === id
                        ? {
                            ...area,
                            is_archived: true,
                            archived_at: now,
                            archived_by: actor.name,
                            archive_reason: reason,
                            replaced_by_area_id: replacement?.id,
                            updated_at: now,
                        }
                        : area),
                    workRequired: current.db.workRequired.map((work: any) => ({
                        ...work,
                        area_ids: replacement
                            ? replaceAreaId(work.area_ids, id, replacement.id)
                            : work.area_ids,
                        structured_items: replacement
                            ? (work.structured_items || []).map(replaceLine)
                            : work.structured_items,
                        updated_at: replacement &&
                            (work.area_ids.includes(id) ||
                                (work.structured_items || []).some((item: any) => item.area_id === id))
                            ? now
                            : work.updated_at,
                    })),
                    measurementRevisions: current.db.measurementRevisions.map((revision: any) => revision.area_id === id && replacement
                        ? { ...revision, area_id: replacement.id }
                        : revision),
                    quotations: current.db.quotations.map((quotation: any) => ({
                        ...quotation,
                        coverage: replacement
                            ? quotation.coverage.map((coverage: any) => ({
                                ...coverage,
                                area_ids: replaceAreaId(coverage.area_ids, id, replacement.id),
                            }))
                            : quotation.coverage,
                        scope_lines: replacement
                            ? quotation.scope_lines.map(replaceLine)
                            : quotation.scope_lines,
                        items: replacement
                            ? quotation.items?.map(replaceLine)
                            : quotation.items,
                        updated_at: replacement &&
                            (quotation.coverage.some((coverage: any) => coverage.area_ids.includes(id)) ||
                                quotation.scope_lines.some((line: any) => line.area_id === id) ||
                                quotation.items?.some((line: any) => line.area_id === id))
                            ? now
                            : quotation.updated_at,
                    })),
                    acceptedScopes: current.db.acceptedScopes.map((scope: any) => replacement && scope.area_ids.includes(id)
                        ? {
                            ...scope,
                            area_ids: replaceAreaId(scope.area_ids, id, replacement.id),
                        }
                        : scope),
                    workOrders: current.db.workOrders.map((workOrder: any) => replacement && workOrder.area_ids.includes(id)
                        ? {
                            ...workOrder,
                            area_ids: replaceAreaId(workOrder.area_ids, id, replacement.id),
                            updated_at: now,
                        }
                        : workOrder),
                    boqs: current.db.boqs.map((boq: any) => replacement && boq.items.some((item: any) => item.area_id === id)
                        ? { ...boq, items: boq.items.map(replaceLine), updated_at: now }
                        : boq),
                    purchaseOrders: current.db.purchaseOrders.map((po: any) => replacement && po.items.some((item: any) => item.area_id === id)
                        ? { ...po, items: po.items.map(replaceLine), updated_at: now }
                        : po),
                    grns: current.db.grns.map((grn: any) => replacement && grn.items.some((item: any) => item.area_id === id)
                        ? { ...grn, items: grn.items.map(replaceLine), updated_at: now }
                        : grn),
                    dispatches: current.db.dispatches.map((dispatch: any) => replacement && dispatch.items.some((item: any) => item.area_id === id)
                        ? {
                            ...dispatch,
                            items: dispatch.items.map(replaceLine),
                            updated_at: now,
                        }
                        : dispatch),
                    payments: current.db.payments.map((payment: any) => replacement && payment.area_ids?.includes(id)
                        ? {
                            ...payment,
                            area_ids: replaceAreaId(payment.area_ids, id, replacement.id),
                            updated_at: now,
                        }
                        : payment),
                    invoices: current.db.invoices.map((invoice: any) => replacement && invoice.area_ids?.includes(id)
                        ? {
                            ...invoice,
                            area_ids: replaceAreaId(invoice.area_ids, id, replacement.id),
                            updated_at: now,
                        }
                        : invoice),
                    customerReceipts: current.db.customerReceipts.map((receipt: any) => replacement && receipt.area_ids?.includes(id)
                        ? {
                            ...receipt,
                            area_ids: replaceAreaId(receipt.area_ids, id, replacement.id),
                            updated_at: now,
                        }
                        : receipt),
                    contractorBills: current.db.contractorBills.map((bill: any) => replacement && bill.area_ids?.includes(id)
                        ? {
                            ...bill,
                            area_ids: replaceAreaId(bill.area_ids, id, replacement.id),
                            updated_at: now,
                        }
                        : bill),
                    drawings: current.db.drawings.map((drawing: any) => replacement && drawing.area_id === id
                        ? {
                            ...drawing,
                            area_id: replacement.id,
                            area_name: replacement.name,
                            updated_at: now,
                        }
                        : drawing),
                    entityReferenceAssignments: current.db.entityReferenceAssignments.map((assignment: any) => replacement && assignment.area_id === id
                        ? { ...assignment, area_id: replacement.id, updated_at: now }
                        : assignment),
                    entityFileAttachments: current.db.entityFileAttachments.map((attachment: any) => replacement &&
                        attachment.entity_type === "room" &&
                        attachment.entity_id === id
                        ? {
                            ...attachment,
                            entity_id: replacement.id,
                            entity_label: replacement.name,
                            updated_at: now,
                        }
                        : attachment),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Archived area ${source.name}${replacement ? ` and reassigned ${dependencies.total} linked record(s) to ${replacement.name}` : ""}: ${reason}`,
                entity_type: "area",
                entity_id: id,
                entity_label: source.name,
                kind: "update",
                cross_post: [
                    { entity_type: "site", entity_id: source.site_id },
                    ...(replacement ? [{ entity_type: "area", entity_id: replacement.id, entity_label: replacement.name }] : []),
                ],
            });
        },
        addMeasurementRevision: (revision) => {
            const state = get();
            assertMeasurementRevisionRelations(state.db, revision, "Measurement revision");
            const site = state.db.sites.find((row: any) => row.id === revision.site_id)!;
            const area = state.db.areas.find((row: any) => row.id === revision.area_id)!;
            const work = revision.work_required_id
                ? state.db.workRequired.find((row: any) => row.id === revision.work_required_id)
                : undefined;
            const now = nowIso();
            const id = revision.id || genId("measurement");
            const previous = state.db.measurementRevisions.filter((row: any) =>
                row.area_id === area.id &&
                row.site_id === site.id &&
                row.work_required_id === work?.id
            );
            const unit = revision.unit || area.unit || "ft";
            const length = revision.length ?? area.length;
            const width = revision.width ?? area.width;
            const height = revision.height ?? area.height;
            const calculatedArea = revision.calculated_area ??
                (length != null && width != null
                    ? Number((length * width).toFixed(2))
                    : undefined);
            const calculatedPerimeter = revision.calculated_perimeter ??
                (length != null && width != null
                    ? Number((2 * (length + width)).toFixed(2))
                    : undefined);
            const row: import("../../types").MeasurementRevision = {
                id,
                site_id: site.id,
                area_id: area.id,
                work_required_id: work?.id,
                visit_id: revision.visit_id,
                revision_no: previous.length + 1,
                length,
                width,
                height,
                unit,
                calculated_area: calculatedArea,
                calculated_perimeter: calculatedPerimeter,
                notes: revision.notes,
                captured_by: revision.captured_by || get().currentUser().name,
                captured_at: revision.captured_at || now,
                photo_count: revision.photo_count ?? 0,
                drawing_id: revision.drawing_id,
                status: revision.status || "verified",
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    measurementRevisions: [
                        row,
                        ...s.db.measurementRevisions.map((existing: any) => existing.site_id === site.id &&
                            existing.area_id === area.id &&
                            existing.work_required_id === work?.id &&
                            existing.status === "verified"
                            ? { ...existing, status: "superseded" as const }
                            : existing),
                    ],
                    areas: s.db.areas.map((existing: any) => existing.id === area.id
                        ? {
                            ...existing,
                            length,
                            width,
                            height,
                            unit,
                            floor_area: calculatedArea,
                            perimeter: calculatedPerimeter,
                            stage: "measured" as const,
                            updated_at: now,
                        }
                        : existing),
                    workRequired: work
                        ? s.db.workRequired.map((existing: any) => existing.id === work.id &&
                            ["new", "contacted", "visit_scheduled"].includes(existing.status)
                            ? {
                                ...existing,
                                status: advanceWorkRequiredLifecycleStatus(existing.status, "measurement_done"),
                                updated_at: now,
                            }
                            : existing)
                        : s.db.workRequired,
                    sites: s.db.sites.map((existing: any) => existing.id === site.id && existing.stage === "enquiry"
                        ? { ...existing, stage: "planning" as const, updated_at: now }
                        : existing),
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Captured measurement revision ${row.revision_no} for ${site.name} → ${area.name}`,
                entity_type: "measurement",
                entity_id: id,
                entity_label: `${site.name} · ${area.name}`,
                kind: "create",
                cross_post: [
                    { entity_type: "site", entity_id: site.id, entity_label: site.name },
                    { entity_type: "area", entity_id: area.id, entity_label: area.name },
                    ...(work?.id ? [{ entity_type: "workRequired", entity_id: work.id, entity_label: work.title }] : []),
                    ...(site.customer_id ? [{ entity_type: "customer", entity_id: site.customer_id }] : []),
                ],
            });
            return id;
        },
        captureStructuredWorkRequired: (workRequiredId, lines, options) => {
            const state = get();
            const removedItemIds = new Set(options?.removedItemIds || []);
            const workRequired = state.db.workRequired.find((row: any) => row.id === workRequiredId);
            if (!workRequired)
                throw new Error("Work Required not found.");
            if (!lines.length && removedItemIds.size === 0)
                throw new Error("Capture at least one structured work line.");
            const context = "Structured Work Required";
            assertWorkRequiredMatchesContext(state.db, workRequired.id, workRequired.customer_id, workRequired.site_id, context);
            const now = nowIso();
            const normaliseAreaName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
            const createdAreas: Area[] = [];
            const knownAreas = [...state.db.areas];
            const areaIdByName = new Map(knownAreas
                .filter((area: any) => area.site_id === workRequired.site_id)
                .map((area: any) => [normaliseAreaName(area.name), area.id]));
            const lineKeys = new Set<string>();
            const scopeKey = (item: Pick<LineItem, "area_id" | "category_id" | "work_required_article_id" | "subcategory_id" | "work_type_id" | "variant_id" | "unit_id">) => [item.area_id || "", item.category_id || "", item.work_required_article_id || item.subcategory_id || "", item.work_type_id || "", item.variant_id || "", item.unit_id || ""].join("::");
            // Removals are applied first: kept items still block duplicate captures.
            const keptItems = (workRequired.structured_items || []).filter((item: any) => !removedItemIds.has(item.id));
            const existingKeys = new Set(keptItems.map(scopeKey));
            const resolvedItems: LineItem[] = lines.map((line: any, index: any) => {
                if (line.site_id !== workRequired.site_id) {
                    throw new Error(`${context}: line ${index + 1} must stay on Site "${state.db.sites.find((site: any) => site.id === workRequired.site_id)?.name || workRequired.site_id}".`);
                }
                assertSiteBelongsToCustomer(state.db, line.site_id, workRequired.customer_id, context);
                if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
                    throw new Error(`${context}: line ${index + 1} requires a wall area/length greater than zero.`);
                }
                if (!line.category_id || !line.subcategory_id) {
                    throw new Error(`${context}: line ${index + 1} requires Area, Category, and Subcategory.`);
                }
                const category = assertWorkCategoryId(state.db, line.category_id, context)!;
                const subcategory = assertWorkSubcategoryId(state.db, line.subcategory_id, context)!;
                if (subcategory.category_id !== category.id) {
                    throw new Error(`${context}: line ${index + 1} has a Subcategory outside its selected Category.`);
                }
                const workType = line.work_type_id
                    ? workTypesForSubcategory(subcategory).find((row) => row.id === line.work_type_id)
                    : undefined;
                if (line.work_type_id && !workType) {
                    throw new Error(`${context}: line ${index + 1} work type does not belong to the selected Subcategory.`);
                }
                // Detailed-area capture: Article/Variant are optional (dimensions replaced
                // catalog picks). Unit is derived from the dimensions: wall height present
                // → sqft, height empty (e.g. roof railing) → running feet. sqft/rft are
                // always present in the master catalog.
                const article = line.article_id
                    ? state.db.master.articles.find((row: any) => row.id === line.article_id)
                    : undefined;
                if (line.article_id && !article)
                    throw new Error(`${context}: line ${index + 1} article does not exist.`);
                const mapping = article
                    ? state.db.master.subcategoryArticleMap.find((row: any) => row.work_required_id === subcategory.id && row.article_id === article.id)
                    : undefined;
                if (article && !mapping) {
                    throw new Error(`${context}: line ${index + 1} article is not available under the selected Subcategory.`);
                }
                const unitId = line.unit_id || (Number(line.height_ft) > 0 ? "sqft" : "rft");
                const unit = state.db.master.units.find((row: { id: string }) => row.id === unitId);
                const variant = line.variant_id
                    ? state.db.master.articleVariants.find((row: any) => row.id === line.variant_id)
                    : undefined;
                if (line.variant_id && (!variant || (article && variant.article_id !== article.id))) {
                    throw new Error(`${context}: line ${index + 1} variant does not belong to the selected Article.`);
                }
                let areaId = line.area_id;
                let area: Area | undefined;
                if (areaId) {
                    area = assertAreaBelongsToSite(state.db, areaId, workRequired.site_id, context);
                }
                else {
                    const areaName = line.area_name?.trim().replace(/\s+/g, " ");
                    if (!line.create_area || !areaName) {
                        throw new Error(`${context}: line ${index + 1} requires an existing Area or an explicit new Area.`);
                    }
                    const key = normaliseAreaName(areaName);
                    const existingAreaId = areaIdByName.get(key);
                    if (existingAreaId) {
                        const alreadyCreated = createdAreas.find((row: any) => row.id === existingAreaId);
                        if (!alreadyCreated) {
                            throw new Error(`${context}: Area "${areaName}" already exists. Select it instead of creating a duplicate.`);
                        }
                        area = alreadyCreated;
                        areaId = area.id;
                    }
                    else {
                        area = {
                            id: genId("area"),
                            site_id: workRequired.site_id,
                            name: areaName,
                            area_type: line.area_type || "other",
                            stage: "unmeasured",
                            unit: "ft",
                            notes: "Created during structured work capture.",
                            created_at: now,
                            updated_at: now,
                        };
                        createdAreas.push(area);
                        knownAreas.push(area);
                        areaIdByName.set(key, area.id);
                        areaId = area.id;
                    }
                }
                const duplicateKey = [areaId, category.id, mapping?.id || subcategory.id, workType?.id || "", variant?.id || "", unit?.id || ""].join("::");
                if (lineKeys.has(duplicateKey) || existingKeys.has(duplicateKey)) {
                    throw new Error(`${context}: line ${index + 1} duplicates an existing detailed area line. Edit the existing line instead.`);
                }
                lineKeys.add(duplicateKey);
                const primaryRate = workType || primaryWorkType(subcategory);
                const contractorAverage = contractorWorkTypeAverages(state.db.master.contractorRates, subcategory.id, primaryRate.id);
                const rate = mapping?.reference_rate || article?.base_rate || contractorAverage.total_rate || 0;
                const title = `${area.name} · ${article?.name || subcategory.name}${workType && workType.name !== "Standard" ? ` · ${workType.name}` : ""}`;
                const num = (value: unknown) => {
                    const parsed = Number(value);
                    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
                };
                return {
                    id: genId("req-line"),
                    title,
                    description: line.notes?.trim() || undefined,
                    article_id: article?.id,
                    category_id: category.id,
                    subcategory_id: subcategory.id,
                    work_type_id: workType?.id,
                    work_required_id: workRequired.id,
                    work_required_article_id: mapping?.id,
                    variant_id: variant?.id,
                    length_ft: num(line.length_ft),
                    breadth_ft: num(line.breadth_ft),
                    height_ft: num(line.height_ft),
                    floor_ceiling_area: num(line.floor_area),
                    site_id: workRequired.site_id,
                    area_id: area.id,
                    site_name: state.db.sites.find((site: any) => site.id === workRequired.site_id)?.name,
                    area_name: area.name,
                    quantity: line.quantity,
                    unit_id: unit?.id,
                    unit_name: unit?.name,
                    rate,
                    amount: Math.round(line.quantity * rate * 100) / 100,
                    tax_rate: rate > 0 ? 18 : undefined,
                    status: "active",
                };
            });
            // Bidirectional sync with the Add/Edit customer form: the capture view is
            // the per-area master, so adds and removals flow back into the ticked
            // subcategory / work-type / area lists of the same Work Required record.
            // ponytail invariant: a Work Required always keeps its Work Category paired
            // with at least one Work Subcategory (assertWorkRequiredCatalogRelations),
            // so pruning stops at the last tick instead of emptying the record.
            const removedItems = (workRequired.structured_items || []).filter((item: any) => removedItemIds.has(item.id));
            const keptSubcategoryIds = new Set(keptItems.map((item: any) => item.subcategory_id).filter(Boolean));
            const keptWorkTypeIds = new Set(keptItems.map((item: any) => item.work_type_id).filter(Boolean));
            const keptAreaIds = new Set(keptItems.map((item: any) => item.area_id).filter(Boolean));
            const declaredSubcategoryIds = workRequired.work_subcategory_ids || [];
            const removedSubcategoryIds = Array.from(new Set(removedItems
                .map((item: any) => item.subcategory_id)
                .filter((id: string | undefined): id is string => Boolean(id) && !keptSubcategoryIds.has(id))));
            const survivingSubcategoryIds = declaredSubcategoryIds.filter((id) => !removedSubcategoryIds.includes(id));
            const subcategoryPruneIds = survivingSubcategoryIds.length
                ? removedSubcategoryIds
                // Only tick left: keep it — the declaration outlives its captures.
                : removedSubcategoryIds.filter((id) => !declaredSubcategoryIds.includes(id));
            const removedWorkTypeIds = Array.from(new Set(removedItems
                .map((item: any) => item.work_type_id)
                .filter((id: string | undefined): id is string => Boolean(id) && !keptWorkTypeIds.has(id))));
            const declaredAreaIds = workRequired.area_ids || [];
            const removedAreaIdsRaw = Array.from(new Set(removedItems
                .map((item: any) => item.area_id)
                .filter((id: string | undefined): id is string => Boolean(id) && !keptAreaIds.has(id))));
            const survivingAreaIds = declaredAreaIds.filter((id) => !removedAreaIdsRaw.includes(id));
            const removedAreaIds = survivingAreaIds.length
                ? removedAreaIdsRaw
                : removedAreaIdsRaw.filter((id) => !declaredAreaIds.includes(id));
            const nextSubcategoryIds = Array.from(new Set([
                ...(workRequired.work_subcategory_ids || []).filter((id) => !subcategoryPruneIds.includes(id)),
                ...resolvedItems.map((item: any) => item.subcategory_id).filter(Boolean),
            ]));
            const nextWorkTypeIds = Array.from(new Set([
                ...(workRequired.work_type_ids || []).filter((id) => !removedWorkTypeIds.includes(id)),
                ...resolvedItems.map((item: any) => item.work_type_id).filter(Boolean),
            ]));
            const workAreaIds = Array.from(new Set([
                ...workRequired.area_ids.filter((id) => !removedAreaIds.includes(id)),
                ...resolvedItems.map((item: any) => item.area_id!).filter(Boolean),
            ]));
            const summary = [
                ...resolvedItems
                    .map((item: any) => `${item.area_name} → ${item.title.replace(`${item.area_name} · `, "")} → ${item.quantity}${item.unit_name ? ` ${item.unit_name}` : ""}`),
                ...removedItems
                    .filter((item: any) => !resolvedItems.some((fresh: any) => fresh.subcategory_id === item.subcategory_id && fresh.area_id === item.area_id))
                    .map((item: any) => `Removed ${item.area_name ? `${item.area_name} · ` : ""}${item.title}`),
            ].join("\n");
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    areas: [...createdAreas, ...snapshot.db.areas],
                    workRequired: snapshot.db.workRequired.map((row: any) => row.id === workRequiredId
                        ? {
                            ...row,
                            area_ids: workAreaIds,
                            work_subcategory_ids: nextSubcategoryIds,
                            work_type_ids: nextWorkTypeIds,
                            structured_items: [...(row.structured_items || []).filter((item: any) => !removedItemIds.has(item.id)), ...resolvedItems],
                            updated_at: now,
                        }
                        : row),
                },
            }));
            const actor = get().currentUser();
            const captureHeadline = resolvedItems.length && removedItems.length
                ? `Updated detailed area work for ${workRequired.title}`
                : resolvedItems.length
                    ? `Structured work captured for ${workRequired.title}`
                    : `Detailed area work updated for ${workRequired.title}`;
            const workThreadId = get().openThreadFor("workRequired", workRequired.id, `Work Required · ${workRequired.title}`, [actor.name]);
            const customer = get().db.customers.find((row: any) => row.id === workRequired.customer_id);
            const customerThreadId = get().openThreadFor("generic", `customer-conversation:${workRequired.customer_id}`, `Customer Conversation · ${customer?.name || "Customer"}`, [customer?.name || "Customer", actor.name]);
            get().addThreadReply(workThreadId, {
                author: actor.name,
                role: actor.role,
                body: `${captureHeadline}:\n${summary}`,
                kind: "decision",
                related_thread_id: customerThreadId,
            });
            get().addThreadReply(customerThreadId, {
                author: actor.name,
                role: actor.role,
                body: `${captureHeadline} at ${get().db.sites.find((site: any) => site.id === workRequired.site_id)?.name || "the selected Site"}:\n${summary}`,
                kind: "decision",
                related_thread_id: workThreadId,
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: resolvedItems.length && removedItems.length
                    ? `Captured ${resolvedItems.length} and removed ${removedItems.length} detailed area line(s) for ${workRequired.title}`
                    : resolvedItems.length
                        ? `Captured ${resolvedItems.length} structured work line(s) for ${workRequired.title}`
                        : `Removed ${removedItems.length} detailed area line(s) from ${workRequired.title}`,
                entity_type: "workRequired",
                entity_id: workRequired.id,
                entity_label: workRequired.title,
                kind: "update",
                cross_post: [
                    ...(workRequired.customer_id ? [{ entity_type: "customer", entity_id: workRequired.customer_id }] : []),
                    ...(workRequired.site_id ? [{ entity_type: "site", entity_id: workRequired.site_id }] : []),
                ],
            });
        },
    };
}
