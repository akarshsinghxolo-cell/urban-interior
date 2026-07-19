/**
 * CRM slice — customers, sites, areas, work required, measurements,
 * and structured work capture.
 *
 * Phase 3n moved the 14 CRM actions out of store.ts in 6 groups:
 *   Group 1: addWorkRequired, updateWorkRequired
 *   Group 2: addCustomer, createCustomerWithFirstSite, updateCustomer, mergeCustomers
 *   Group 3: addSite, updateSite, archiveSite
 *   Group 4: addArea, updateArea, archiveArea
 *   Group 5: addMeasurementRevision
 *   Group 6: captureStructuredWorkRequired
 *
 * No module-scope helpers were moved: all CRM action helpers
 * (`assertCustomerExists`, `assertSiteExists`, `assertSiteBelongsToCustomer`,
 * `assertAreasBelongToSite`, `assertAreaBelongsToSite`,
 * `assertMeasurementRevisionRelations`, `assertWorkRequiredMatchesContext`,
 * `assertWorkCategoryId`, `assertWorkSubcategoryId`,
 * `areaDependencySummary`, `replaceAreaId`,
 * `assertUniqueCustomerIdentity`, `normalizeCustomerSegments`)
 * were already imported in store.ts from `../../business-rules` and
 * `../../customer-identity`. The shared `genId` / `nowIso` / `businessDate`
 * helpers were already in `../helpers`.
 */
import type { Customer, Site, Area, LineItem } from "../../types";
import type { CrmState } from "../types";
import type { StoreContext } from "../context";
import { assertRole, genId, nowIso } from "../helpers";
import {
    assertAreaBelongsToSite, assertAreasBelongToSite,
    assertCustomerExists, assertSiteExists, assertSiteBelongsToCustomer,
    assertMeasurementRevisionRelations, assertWorkRequiredMatchesContext,
    assertWorkCategoryId, assertWorkSubcategoryId,
    areaDependencySummary, replaceAreaId,
} from "../../business-rules";
import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "../../customer-identity";

export function createCrmSlice(ctx: StoreContext): CrmState {
    const { commitState, get } = ctx;

    return {
        addWorkRequired: (work) => {
            if (!work.customer_id || !work.site_id)
                throw new Error("Work Required requires a Customer and Site.");
            assertSiteBelongsToCustomer(get().db, work.site_id, work.customer_id, "Work Required");
            assertAreasBelongToSite(get().db, work.area_ids || [], work.site_id, "Work Required");
            const id = work.id || genId("workRequired");
            const now = nowIso();
            const row: import("../../types").WorkRequired = {
                id,
                customer_id: work.customer_id,
                site_id: work.site_id,
                title: work.title || "New work required",
                work_category_id: work.work_category_id,
                work_subcategory_id: work.work_subcategory_id,
                system_name: work.system_name,
                specification: work.specification,
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
                if (item.area_id)
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
            const next = { ...before, ...patch };
            assertSiteBelongsToCustomer(get().db, next.site_id, next.customer_id, "Work Required");
            assertAreasBelongToSite(get().db, next.area_ids, next.site_id, "Work Required");
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
        addCustomer: (p) => {
            assertUniqueCustomerIdentity(get().db.customers, p);
            const id = genId("cust");
            commitState((s: any) => {
                const now = nowIso();
                const customerRecord: Customer = {
                    id,
                    name: p.name || "New customer",
                    phone: p.phone || "",
                    whatsapp: p.whatsapp || p.phone,
                    alternate_phone: p.alternate_phone,
                    email: p.email,
                    customer_segments: normalizeCustomerSegments(p.customer_segments),
                    status: p.status || "active",
                    interest_category_ids: p.interest_category_ids || [],
                    interest_work_subcategory_ids: p.interest_work_subcategory_ids || [],
                    source_partner_id: p.source_partner_id,
                    source_partner_name: p.source_partner_name,
                    notes: p.notes,
                    created_at: now,
                    updated_at: now,
                };
                return { db: { ...s.db, customers: [customerRecord, ...s.db.customers] } };
            });
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created customer "${p.name || "New customer"}"`,
                entity_type: "customer",
                entity_id: id,
                kind: "create",
            });
            return id;
        },
        createCustomerWithFirstSite: (customer, firstSite) => {
            assertUniqueCustomerIdentity(get().db.customers, customer);
            const customerId = genId("cust");
            const siteId = firstSite?.name?.trim() ? genId("site") : undefined;
            const now = nowIso();
            const customerRecord: Customer = {
                id: customerId,
                name: customer.name || "New customer",
                phone: customer.phone || "",
                whatsapp: customer.whatsapp || customer.phone,
                alternate_phone: customer.alternate_phone,
                email: customer.email,
                customer_segments: normalizeCustomerSegments(customer.customer_segments),
                status: customer.status || "active",
                interest_category_ids: customer.interest_category_ids || [],
                interest_work_subcategory_ids: customer.interest_work_subcategory_ids || [],
                source_partner_id: customer.source_partner_id,
                source_partner_name: customer.source_partner_name,
                notes: customer.notes,
                created_at: now,
                updated_at: now,
            };
            const site: Site | undefined = siteId && firstSite
                ? {
                    id: siteId,
                    customer_id: customerId,
                    name: firstSite.name!.trim(),
                    building_name: firstSite.building_name,
                    site_type: firstSite.site_type || "other",
                    stage: firstSite.stage || "enquiry",
                    address: firstSite.address,
                    city: firstSite.city,
                    locality: firstSite.locality,
                    latitude: firstSite.latitude,
                    longitude: firstSite.longitude,
                    map_url: firstSite.map_url,
                    photo_attachment_ids: firstSite.photo_attachment_ids || [],
                    source_partner_id: firstSite.source_partner_id || customer.source_partner_id,
                    source_partner_name: firstSite.source_partner_name || customer.source_partner_name,
                    notes: firstSite.notes,
                    created_at: now,
                    updated_at: now,
                }
                : undefined;
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    customers: [customerRecord, ...state.db.customers],
                    sites: site ? [site, ...state.db.sites] : state.db.sites,
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created customer "${customerRecord.name}"${site ? ` with first Site "${site.name}"` : ""}`,
                entity_type: "customer",
                entity_id: customerId,
                entity_label: customerRecord.name,
                kind: "create",
                cross_post: [
                    ...(site ? [{ entity_type: "site", entity_id: site.id, entity_label: site.name }] : []),
                ],
            });
            if (site)
                get().logAudit({
                    actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                    action: `Created Site "${site.name}" for ${customerRecord.name}`,
                    entity_type: "site",
                    entity_id: site.id,
                    entity_label: site.name,
                    kind: "create",
                    cross_post: [
                        { entity_type: "customer", entity_id: customerId, entity_label: customerRecord.name },
                    ],
                });
            return { customerId, siteId };
        },
        updateCustomer: (id, patch) => {
            const before = get().db.customers.find((p: any) => p.id === id);
            if (!before)
                throw new Error("Customer not found.");
            assertUniqueCustomerIdentity(get().db.customers, { ...before, ...patch, whatsapp: patch.whatsapp ?? patch.phone ?? before.whatsapp }, { excludeCustomerId: id });
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    customers: s.db.customers.map((p: any) => p.id === id
                        ? {
                            ...p,
                            ...patch,
                            whatsapp: patch.whatsapp ?? patch.phone ?? p.whatsapp,
                            updated_at: nowIso(),
                        }
                        : p),
                },
            }));
            const after = get().db.customers.find((p: any) => p.id === id);
            if (before && after) {
                const changes: string[] = [];
                if (before.name !== after.name)
                    changes.push(`name → "${after.name}"`);
                if (before.phone !== after.phone)
                    changes.push(`phone → ${after.phone}`);
                if (before.email !== after.email)
                    changes.push(`email → ${after.email || "—"}`);
                if (before.status !== after.status)
                    changes.push(`status → ${after.status}`);
                if (before.whatsapp !== after.whatsapp)
                    changes.push(`WhatsApp → ${after.whatsapp || "—"}`);
                if (before.alternate_phone !== after.alternate_phone)
                    changes.push(`alternate phone → ${after.alternate_phone || "—"}`);
                if (before.interest_category_ids?.join(",") !==
                    after.interest_category_ids?.join(","))
                    changes.push("work interests updated");
                if (changes.length > 0) {
                    const actor = get().currentUser();
                    get().logAudit({
                        actor: actor.name,
                        actor_role: actor.role,
                        action: `Updated customer "${after.name}": ${changes.join(", ")}`,
                        entity_type: "customer",
                        entity_id: id,
                        entity_label: after.name,
                        kind: "update",
                        reason: `Edited by ${actor.name} (${actor.role})`,
                        cross_post: [
                            ...(after.source_partner_id ? [{ entity_type: "vendor", entity_id: after.source_partner_id, entity_label: after.source_partner_name }] : []),
                        ],
                    });
                }
            }
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
        addSite: (s) => {
            if (!s.customer_id)
                throw new Error("Site requires a Customer.");
            const id = s.id || genId("site");
            const now = nowIso();
            const site: Site = {
                id,
                customer_id: s.customer_id,
                name: s.name || "New site",
                building_name: s.building_name,
                site_type: s.site_type || "other",
                stage: s.stage || "enquiry",
                address: s.address,
                city: s.city,
                locality: s.locality,
                latitude: s.latitude,
                longitude: s.longitude,
                map_url: s.map_url,
                photo_attachment_ids: s.photo_attachment_ids || [],
                source_partner_id: s.source_partner_id,
                source_partner_name: s.source_partner_name,
                notes: s.notes,
                created_at: now,
                updated_at: now,
            };
            assertCustomerExists(get().db, site.customer_id, "Site");
            commitState((state: any) => ({
                db: { ...state.db, sites: [site, ...state.db.sites] },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created site ${site.name}`,
                entity_type: "site",
                entity_id: id,
                entity_label: site.name,
                kind: "create",
                cross_post: [
                    ...(site.customer_id ? [{ entity_type: "customer", entity_id: site.customer_id }] : []),
                ],
            });
            return id;
        },
        updateSite: (id, patch) => {
            const before = get().db.sites.find((site: any) => site.id === id);
            if (!before)
                throw new Error("Site not found.");
            if (before.is_archived)
                throw new Error("Archived Sites cannot be edited. Reopen the Site before changing it.");
            if (patch.customer_id && patch.customer_id !== before.customer_id) {
                throw new Error("A Site cannot be moved to another Customer. Create a correctly linked Site instead.");
            }
            assertSiteBelongsToCustomer(get().db, id, before.customer_id, "Site");
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    sites: state.db.sites.map((site: any) => site.id === id
                        ? {
                            ...site,
                            ...patch,
                            customer_id: before.customer_id,
                            updated_at: nowIso(),
                        }
                        : site),
                },
            }));
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
            const previous = state.db.measurementRevisions.filter((row: any) => row.area_id === area.id && row.site_id === site.id);
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
                                status: "measurement_done" as const,
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
        captureStructuredWorkRequired: (workRequiredId, lines) => {
            const state = get();
            const workRequired = state.db.workRequired.find((row: any) => row.id === workRequiredId);
            if (!workRequired)
                throw new Error("Work Required not found.");
            if (!lines.length)
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
            const existingKeys = new Set((workRequired.structured_items || []).map((item: any) => [item.area_id || "", item.category_id || "", item.work_required_article_id || "", item.variant_id || "", item.unit_id || ""].join("::")));
            const resolvedItems: LineItem[] = lines.map((line: any, index: any) => {
                if (line.site_id !== workRequired.site_id) {
                    throw new Error(`${context}: line ${index + 1} must stay on Site "${state.db.sites.find((site: any) => site.id === workRequired.site_id)?.name || workRequired.site_id}".`);
                }
                assertSiteBelongsToCustomer(state.db, line.site_id, workRequired.customer_id, context);
                if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
                    throw new Error(`${context}: line ${index + 1} requires a quantity greater than zero.`);
                }
                if (!line.category_id || !line.subcategory_id || !line.article_id || !line.unit_id) {
                    throw new Error(`${context}: line ${index + 1} requires Area, Category, Subcategory, Article, Quantity, and Unit.`);
                }
                const category = assertWorkCategoryId(state.db, line.category_id, context)!;
                const subcategory = assertWorkSubcategoryId(state.db, line.subcategory_id, context)!;
                if (subcategory.category_id !== category.id) {
                    throw new Error(`${context}: line ${index + 1} has a Subcategory outside its selected Category.`);
                }
                const article = state.db.master.articles.find((row: any) => row.id === line.article_id);
                if (!article)
                    throw new Error(`${context}: line ${index + 1} article does not exist.`);
                const mapping = state.db.master.subcategoryArticleMap.find((row: any) => row.work_required_id === subcategory.id && row.article_id === article.id);
                if (!mapping) {
                    throw new Error(`${context}: line ${index + 1} article is not available under the selected Subcategory.`);
                }
                const unit = state.db.master.units.find((row: any) => row.id === line.unit_id);
                if (!unit)
                    throw new Error(`${context}: line ${index + 1} unit does not exist.`);
                const variant = line.variant_id
                    ? state.db.master.articleVariants.find((row: any) => row.id === line.variant_id)
                    : undefined;
                if (line.variant_id && (!variant || variant.article_id !== article.id)) {
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
                const duplicateKey = [areaId, category.id, mapping.id, variant?.id || "", unit.id].join("::");
                if (lineKeys.has(duplicateKey) || existingKeys.has(duplicateKey)) {
                    throw new Error(`${context}: line ${index + 1} duplicates an existing structured work line. Edit the existing line instead.`);
                }
                lineKeys.add(duplicateKey);
                const rate = mapping.reference_rate || article.base_rate || (subcategory.material_rate || 0) + (subcategory.labour_rate || 0) || 0;
                const title = `${area.name} · ${article.name}`;
                return {
                    id: genId("req-line"),
                    title,
                    description: line.notes?.trim() || undefined,
                    article_id: article.id,
                    category_id: category.id,
                    work_required_id: workRequired.id,
                    work_required_article_id: mapping.id,
                    variant_id: variant?.id,
                    site_id: workRequired.site_id,
                    area_id: area.id,
                    site_name: state.db.sites.find((site: any) => site.id === workRequired.site_id)?.name,
                    area_name: area.name,
                    quantity: line.quantity,
                    unit_id: unit.id,
                    unit_name: unit.name,
                    rate,
                    amount: Math.round(line.quantity * rate * 100) / 100,
                    tax_rate: rate > 0 ? 18 : undefined,
                    status: "active",
                };
            });
            const workAreaIds = Array.from(new Set([...workRequired.area_ids, ...resolvedItems.map((item: any) => item.area_id!).filter(Boolean)]));
            const summary = resolvedItems
                .map((item: any) => `${item.area_name} → ${item.title.replace(`${item.area_name} · `, "")} → ${item.quantity} ${item.unit_name || ""}`)
                .join("\n");
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    areas: [...createdAreas, ...snapshot.db.areas],
                    workRequired: snapshot.db.workRequired.map((row: any) => row.id === workRequiredId
                        ? {
                            ...row,
                            area_ids: workAreaIds,
                            structured_items: [...(row.structured_items || []), ...resolvedItems],
                            updated_at: now,
                        }
                        : row),
                },
            }));
            const actor = get().currentUser();
            const workThreadId = get().openThreadFor("workRequired", workRequired.id, `Work Required · ${workRequired.title}`, [actor.name]);
            const customer = get().db.customers.find((row: any) => row.id === workRequired.customer_id);
            const customerThreadId = get().openThreadFor("generic", `customer-conversation:${workRequired.customer_id}`, `Customer Conversation · ${customer?.name || "Customer"}`, [customer?.name || "Customer", actor.name]);
            get().addThreadReply(workThreadId, {
                author: actor.name,
                role: actor.role,
                body: `Structured work captured for ${workRequired.title}:\n${summary}`,
                kind: "decision",
                related_thread_id: customerThreadId,
            });
            get().addThreadReply(customerThreadId, {
                author: actor.name,
                role: actor.role,
                body: `Structured work captured for ${workRequired.title} at ${get().db.sites.find((site: any) => site.id === workRequired.site_id)?.name || "the selected Site"}:\n${summary}`,
                kind: "decision",
                related_thread_id: workThreadId,
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Captured ${resolvedItems.length} structured work line(s) for ${workRequired.title}`,
                entity_type: "workRequired",
                entity_id: workRequired.id,
                entity_label: workRequired.title,
                kind: "create",
                cross_post: [
                    ...(workRequired.customer_id ? [{ entity_type: "customer", entity_id: workRequired.customer_id }] : []),
                    ...(workRequired.site_id ? [{ entity_type: "site", entity_id: workRequired.site_id }] : []),
                ],
            });
        },
    };
}
