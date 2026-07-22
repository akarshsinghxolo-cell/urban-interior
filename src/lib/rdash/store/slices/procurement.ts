// STAGE-3-FIX: Generate procurement numbers using current year + max suffix.
function nextProcurementNo(prefix: string, collection: { rfq_no?: string; po_no?: string; grn_no?: string; dispatch_no?: string }[]): string {
    const year = new Date().getFullYear();
    const field = prefix === "RFQ" ? "rfq_no" : prefix === "PO" ? "po_no" : prefix === "GRN" ? "grn_no" : "dispatch_no";
    let maxSeq = 0;
    for (const row of collection) {
        const no = (row as Record<string, string | undefined>)[field];
        if (!no) continue;
        const m = no.match(new RegExp(`^${prefix}-\\d{4}-(\\d+)$`));
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    return `${prefix}-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
}
/**
 * Procurement slice — vendor + staff master records, vendor RFQs/bids, purchase
 * orders (create/approve/send), goods received notes (GRN, including field-staff
 * receipt verification), inventory receipt/issue, and site dispatch.
 *
 * Phase 3i moved the 16 procurement actions out of store.ts. The shared helper
 * `isStoredMediaUrl` was moved to `../helpers` (used by fileGRN and by inline
 * store.ts execution/variation code), and `assertProcurementContext` was moved
 * here as a module-scope helper (used only by `createPO`).
 */
import type {
    RDashDatabase, Vendor, Staff, VendorRFQ, VendorBid, VendorBidLine,
    PurchaseOrder, GRN, InventoryItem, StockMovement, SiteDispatch, LineItem,
} from "../../types";
import type { ProcurementState } from "../types";
import type { StoreContext } from "../context";
import {
    assertRole, genId, nowIso, today, userForRole, userForAnyRole, addDays,
    googleFileIdFromUrl, isStoredMediaUrl,
} from "../helpers";
import { formatINR } from "../../format";
import { assertWorkOrderRelations, assertAreaBelongsToSite } from "../../business-rules";
import { eventMatchesPaymentTrigger } from "../finance-helpers";
import { createDefaultAttendancePolicy } from "../../attendance-policy";
import { normalizeRoleKey, roleLabel } from "../../staff-operations";

/**
 * Validate that the procurement input has an awarded Work Order, a matching
 * Site, an existing Vendor, and at least one fully-specified article line.
 *
 * The Work Order + Site are OPTIONAL for general/stock procurement (POs raised
 * without a project link). When a Work Order is supplied, all relational
 * checks (existence, site match, area ownership) still apply.
 * Returns the resolved WorkOrder or `undefined` when no Work Order was linked.
 */
function assertProcurementContext(db: RDashDatabase, input: {
    site_id?: string;
    work_order_id?: string;
    vendor_id?: string;
    items?: LineItem[];
}, label: string) {
    if (!input.vendor_id)
        throw new Error(`${label} requires a Vendor.`);
    if (!db.master.vendors.some((row) => row.id === input.vendor_id))
        throw new Error(`${label} Vendor was not found.`);
    if (!input.items?.length)
        throw new Error(`${label} requires at least one article line.`);
    if (input.items.some((item) => !item.article_id ||
        !Number.isFinite(item.rate) ||
        item.rate <= 0 ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0)) {
        throw new Error(`${label} needs a quoted article rate and quantity on every line.`);
    }
    if (!input.work_order_id) {
        // General / stock procurement — no Work Order link. Still validate any
        // area rows supplied belong to the (optional) site provided.
        if (input.site_id) {
            input.items.forEach((item) => {
                if (item.area_id)
                    assertAreaBelongsToSite(db, item.area_id, input.site_id!, label);
            });
        }
        return undefined;
    }
    const workOrder = db.workOrders.find((row) => row.id === input.work_order_id);
    if (!workOrder)
        throw new Error(`${label} Work Order was not found.`);
    assertWorkOrderRelations(db, workOrder, label);
    if (input.site_id && workOrder.site_id !== input.site_id)
        throw new Error(`${label} Site and Work Order do not match.`);
    input.items.forEach((item) => {
        if (item.area_id)
            assertAreaBelongsToSite(db, item.area_id, workOrder.site_id, label);
    });
    return workOrder;
}

export function createProcurementSlice(ctx: StoreContext): ProcurementState {
    const { commitState, get } = ctx;

    return {
        addVendor: (v) => {
            const id = v.id || genId("ven");
            const now = nowIso();
            const vendor: import("../../types").Vendor = {
                id,
                name: v.name || "New vendor",
                phone: v.phone,
                city: v.city,
                locality: v.locality,
                address: v.address,
                category: v.category,
                outstanding: 0,
                reliability_score: v.reliability_score,
                on_time_pct: v.on_time_pct,
                latitude: v.latitude,
                longitude: v.longitude,
                business_card_attachment_id: v.business_card_attachment_id,
                shop_attachment_id: v.shop_attachment_id,
                reliability_rating: v.reliability_rating,
                delivery_time_rating: v.delivery_time_rating,
                return_policy: v.return_policy,
                notes: v.notes,
                source_partner_id: v.source_partner_id,
                source_partner_name: v.source_partner_name,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: { ...s.db.master, vendors: [vendor, ...s.db.master.vendors] },
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created vendor "${vendor.name}"`,
                entity_type: "vendor",
                entity_id: id,
                kind: "create",
            });
            return id;
        },
        updateVendor: (id, patch) => {
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        vendors: s.db.master.vendors.map((v: any) => v.id === id ? { ...v, ...patch } : v),
                    },
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Updated vendor ${id}`,
                entity_type: "vendor",
                entity_id: id,
                kind: "update",
            });
        },
        addStaff: (s) => {
            const id = s.id || genId("stf");
            const roleKey = normalizeRoleKey(s.role_key || s.role || "FIELD_STAFF");
            const staff: import("../../types").Staff = {
                id,
                code: s.code || `STF-${Date.now().toString(36).toUpperCase().slice(-5)}`,
                name: s.name || "New Staff",
                phone: s.phone,
                email: s.email || s.login_email,
                role_key: roleKey,
                role: roleLabel(roleKey),
                department: s.department,
                designation: s.designation || roleLabel(roleKey),
                reporting_manager_id: s.reporting_manager_id,
                city: s.city,
                address: s.address,
                emergency_contact: s.emergency_contact,
                joining_date: s.joining_date,
                exit_date: s.exit_date,
                status: s.status || "active",
                salary_type: s.salary_type || "monthly",
                monthly_salary: s.monthly_salary,
                daily_wage: s.daily_wage,
                bank_details: s.bank_details,
                login_enabled: s.login_enabled,
                login_email: s.login_email || s.email,
                temporary_password: s.temporary_password,
                force_password_change: s.force_password_change,
                gps_tracking_enabled: s.gps_tracking_enabled !== false,
                attendance_policy: s.attendance_policy || createDefaultAttendancePolicy(),
            };
            commitState((st: any) => ({
                db: {
                    ...st.db,
                    master: { ...st.db.master, staff: [staff, ...st.db.master.staff] },
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created staff "${staff.name}"`,
                entity_type: "staff",
                entity_id: id,
                kind: "create",
            });
            return id;
        },
        updateStaff: (id, patch) => {
            const before = get().db.master.staff.find((st: any) => st.id === id);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        staff: s.db.master.staff.map((st: any) => st.id === id ? { ...st, ...patch } : st),
                    },
                },
            }));
            const actor = get().currentUser();
            const staffName = before?.name || id;
            // Audit log with change details — especially for financial fields (salary, daily_wage)
            const changes: any[] = [];
            if (before) {
                if (patch.monthly_salary !== undefined && patch.monthly_salary !== before.monthly_salary)
                    changes.push({ id: `ch-${Date.now()}-ms`, field: "monthly_salary", before: before.monthly_salary, after: patch.monthly_salary });
                if (patch.daily_wage !== undefined && patch.daily_wage !== before.daily_wage)
                    changes.push({ id: `ch-${Date.now()}-dw`, field: "daily_wage", before: before.daily_wage, after: patch.daily_wage });
                if (patch.salary_type !== undefined && patch.salary_type !== before.salary_type)
                    changes.push({ id: `ch-${Date.now()}-st`, field: "salary_type", before: before.salary_type, after: patch.salary_type });
                if (patch.name !== undefined && patch.name !== before.name)
                    changes.push({ id: `ch-${Date.now()}-n`, field: "name", before: before.name, after: patch.name });
                if (patch.role !== undefined && patch.role !== before.role)
                    changes.push({ id: `ch-${Date.now()}-r`, field: "role", before: before.role, after: patch.role });
                if (patch.status !== undefined && patch.status !== before.status)
                    changes.push({ id: `ch-${Date.now()}-s`, field: "status", before: before.status, after: patch.status });
            }
            const isFinancial = patch.monthly_salary !== undefined || patch.daily_wage !== undefined;
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Updated staff ${staffName}${isFinancial ? " (financial)" : ""}`,
                entity_type: "staff",
                entity_id: id,
                entity_label: staffName,
                kind: "update",
                source_module: "system",
                reason: isFinancial ? `Financial edit by ${actor.name} (${actor.role})` : `Edited by ${actor.name} (${actor.role})`,
                changes: changes.length > 0 ? changes : undefined,
            });
        },
        createVendorRFQ: (workOrderId, vendorIds) => {
            const state = get();
            const workOrder = state.db.workOrders.find((row: any) => row.id === workOrderId);
            if (!workOrder)
                throw new Error("Work Order not found — cannot create Vendor RFQ.");
            const boq = state.db.boqs.find((row: any) => row.work_order_id === workOrderId);
            if (!boq)
                throw new Error("No approved BOQ exists for this Work Order. Create and approve the BOQ first before requesting vendor quotes.");
            if (boq.status !== "approved")
                throw new Error(`BOQ status is "${boq.status}" — only an approved BOQ can be sent for vendor quotes.`);
            if (workOrder.material_responsibility === "contractor" || workOrder.with_material)
                throw new Error("This Work Order is contractor-supplied (with_material). The company does not procure materials for it, so no Vendor RFQ is needed.");
            const companyItemIds = boq.items
                .filter((item: any) => (item.supply_responsibility || "company") === "company")
                .map((item: any) => item.id);
            if (!companyItemIds.length)
                throw new Error("All BOQ items are contractor-supplied. There are no company-supplied items to request vendor quotes for.");
            const existing = state.db.vendorRfqs.find((row: any) => row.work_order_id === workOrderId &&
                row.boq_id === boq.id &&
                row.status !== "closed");
            if (existing)
                return existing.id;
            // E-1: Filter the vendor list to those who already have a vendorRate
            // covering at least one of the requested BOQ articles. Falls back to
            // ALL vendors when no vendorRates exist for any of the articles
            // (preserves the original "send to everyone" behaviour for fresh
            // matrices or new BOQ items).
            const companyItems = boq.items.filter((item: any) => (item.supply_responsibility || "company") === "company");
            const requestedArticleIds = new Set(companyItems.map((item: any) => item.article_id).filter(Boolean) as string[]);
            const requestedScopeIds = new Set(companyItems.map((item: any) => item.work_required_article_id).filter(Boolean) as string[]);
            const allVendorIds = state.db.master.vendors.map((vendor: any) => vendor.id);
            const candidateVendorIds = (vendorIds?.length
                ? vendorIds.filter((id: any) => state.db.master.vendors.some((vendor: any) => vendor.id === id))
                : allVendorIds);
            const vendorsWithRates = candidateVendorIds.filter((vendorId: string) => state.db.master.vendorRates.some((rate: any) => rate.vendor_id === vendorId &&
                (requestedScopeIds.has(rate.work_required_article_id) ||
                    requestedArticleIds.has(rate.article_id))));
            const eligibleVendorIds = vendorsWithRates.length > 0 ? vendorsWithRates : candidateVendorIds;
            if (!eligibleVendorIds.length)
                throw new Error("No eligible vendors found. Add vendors in Master Setup before creating an RFQ.");
            const id = genId("rfq");
            const now = nowIso();
            const rfq: import("../../types").VendorRFQ = {
                id,
                rfq_no: nextProcurementNo("RFQ", state.db.vendorRfqs),
                site_id: workOrder.site_id,
                work_order_id: workOrder.id,
                boq_id: boq.id,
                item_ids: companyItemIds,
                vendor_ids: eligibleVendorIds,
                status: "sent",
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: { ...s.db, vendorRfqs: [rfq, ...s.db.vendorRfqs] },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created ${rfq.rfq_no} for ${workOrder.work_order_no}`,
                entity_type: "vendor_rfq",
                entity_id: id,
                entity_label: rfq.rfq_no,
                kind: "create",
                cross_post: [
                    { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                    ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                    ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                    ...eligibleVendorIds.map((vid: string) => ({ entity_type: "vendor", entity_id: vid })),
                ],
            });
            return id;
        },
        addVendorBid: (input) => {
            const state = get();
            const rfq = state.db.vendorRfqs.find((row: any) => row.id === input.rfq_id);
            const vendor = state.db.master.vendors.find((row: any) => row.id === input.vendor_id);
            const boq = rfq
                ? state.db.boqs.find((row: any) => row.id === rfq.boq_id)
                : undefined;
            if (!rfq || !vendor || !boq || !rfq.vendor_ids.includes(vendor.id))
                return "";
            const existing = state.db.vendorBids.find((row: any) => row.rfq_id === rfq.id && row.vendor_id === vendor.id);
            if (existing)
                return existing.id;
            const lines = input.lines.map((line: any) => {
                const boqItem = boq.items.find((item: any) => item.id === line.boq_item_id && rfq.item_ids.includes(item.id));
                if (!boqItem || !Number.isFinite(line.rate) || line.rate <= 0)
                    throw new Error("Each vendor bid line needs a valid approved BOQ article rate.");
                const quantity = line.quantity || boqItem.quantity;
                if (!Number.isFinite(quantity) || quantity <= 0)
                    throw new Error("Each vendor bid line needs a valid quantity.");
                return {
                    boq_item_id: boqItem.id,
                    article_id: boqItem.article_id,
                    title: boqItem.title,
                    quantity,
                    unit_id: boqItem.unit_id,
                    unit_name: boqItem.unit_name,
                    rate: line.rate,
                    amount: Math.round(quantity * line.rate),
                    tax_rate: line.tax_rate ?? boqItem.tax_rate ?? 18,
                } satisfies import("../../types").VendorBidLine;
            });
            const missingLine = rfq.item_ids.some((itemId: any) => !lines.some((line: any) => line.boq_item_id === itemId));
            if (missingLine ||
                new Set(lines.map((line: any) => line.boq_item_id)).size !== lines.length) {
                throw new Error("A vendor bid must quote every requested BOQ article exactly once.");
            }
            const id = genId("vendorBid");
            const now = nowIso();
            const quotedAmount = lines.reduce((sum: any, line: any) => sum + line.amount, 0);
            const bid: import("../../types").VendorBid = {
                id,
                rfq_id: rfq.id,
                vendor_id: vendor.id,
                vendor_name: vendor.name,
                lines,
                quoted_amount: quotedAmount,
                delivery_days: input.delivery_days,
                status: "received",
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    vendorBids: [bid, ...s.db.vendorBids],
                    vendorRfqs: s.db.vendorRfqs.map((row: any) => row.id === rfq.id
                        ? {
                            ...row,
                            status: "responses_received" as const,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Received article-wise vendor bid from ${vendor.name} for ${rfq.rfq_no}`,
                entity_type: "vendor_bid",
                entity_id: id,
                entity_label: vendor.name,
                kind: "create",
                cross_post: [
                    { entity_type: "vendor", entity_id: vendor.id, entity_label: vendor.name },
                    ...(rfq.work_order_id ? [{ entity_type: "workOrder", entity_id: rfq.work_order_id }] : []),
                    ...(rfq.site_id ? [{ entity_type: "site", entity_id: rfq.site_id }] : []),
                    { entity_type: "vendorRfq", entity_id: rfq.id, entity_label: rfq.rfq_no },
                ],
            });
            return id;
        },
        selectVendorBid: (bidId) => {
            const state = get();
            const bid = state.db.vendorBids.find((row: any) => row.id === bidId);
            const rfq = bid
                ? state.db.vendorRfqs.find((row: any) => row.id === bid.rfq_id)
                : undefined;
            if (!bid || !rfq)
                return;
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    vendorBids: s.db.vendorBids.map((row: any) => row.rfq_id === rfq.id
                        ? {
                            ...row,
                            status: row.id === bid.id
                                ? ("selected" as const)
                                : ("declined" as const),
                            updated_at: now,
                        }
                        : row),
                    vendorRfqs: s.db.vendorRfqs.map((row: any) => row.id === rfq.id
                        ? { ...row, status: "awarded" as const, updated_at: now }
                        : row),
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Selected ${bid.vendor_name} for ${rfq.rfq_no}`,
                entity_type: "vendor_bid",
                entity_id: bid.id,
                entity_label: bid.vendor_name,
                kind: "decision",
                cross_post: [
                    { entity_type: "vendor", entity_id: bid.vendor_id, entity_label: bid.vendor_name },
                    ...(rfq.work_order_id ? [{ entity_type: "workOrder", entity_id: rfq.work_order_id }] : []),
                    ...(rfq.site_id ? [{ entity_type: "site", entity_id: rfq.site_id }] : []),
                    { entity_type: "vendorRfq", entity_id: rfq.id, entity_label: rfq.rfq_no },
                ],
            });
        },
        createPOFromVendorBid: (bidId) => {
            const state = get();
            const bid = state.db.vendorBids.find((row: any) => row.id === bidId && row.status === "selected");
            const rfq = bid
                ? state.db.vendorRfqs.find((row: any) => row.id === bid.rfq_id && row.status === "awarded")
                : undefined;
            const workOrder = rfq
                ? state.db.workOrders.find((row: any) => row.id === rfq.work_order_id)
                : undefined;
            const boq = rfq
                ? state.db.boqs.find((row: any) => row.id === rfq.boq_id)
                : undefined;
            if (!bid || !rfq || !workOrder || !boq)
                return "";
            const existing = state.db.purchaseOrders.find((row: any) => row.rfq_id === rfq.id);
            if (existing)
                return existing.id;
            const items = rfq.item_ids.map((boqItemId: any) => {
                const boqItem = boq.items.find((item: any) => item.id === boqItemId);
                const bidLine = bid.lines.find((line: any) => line.boq_item_id === boqItemId);
                if (!boqItem || !bidLine)
                    throw new Error("Selected vendor bid is missing an approved BOQ article price.");
                return {
                    ...boqItem,
                    quantity: bidLine.quantity,
                    rate: bidLine.rate,
                    rate_basis: "vendor_bid" as const,
                    amount: bidLine.amount,
                    tax_rate: bidLine.tax_rate ?? boqItem.tax_rate,
                    source_kind: "po" as const,
                    source_item_id: boqItem.id,
                    ordered_qty: bidLine.quantity,
                    received_qty: 0,
                    issued_qty: 0,
                    consumed_qty: 0,
                };
            });
            return get().createPO({
                rfq_id: rfq.id,
                work_order_id: workOrder.id,
                work_order_no: workOrder.work_order_no,
                site_id: workOrder.site_id,
                vendor_id: bid.vendor_id,
                vendor_name: bid.vendor_name,
                expected_delivery: bid.delivery_days
                    ? addDays(today(), bid.delivery_days)
                    : today(),
                items,
            });
        },
        createPO: (po) => {
            const workOrder = assertProcurementContext(get().db, po, "Purchase Order");
            const financeUser = userForAnyRole(get().db, ["Finance", "Accounts"], "Finance");
            const id = genId("po");
            const poNo = nextProcurementNo("PO", get().db.purchaseOrders);
            const threadId = get().openThreadFor("po", id, `${poNo} · ${po.vendor_name || ""}`, [financeUser.name, "Owner", po.vendor_name || ""]);
            const items = po.items || [];
            const subtotal = items.reduce((n: any, i: any) => n + i.amount, 0);
            const tax = Math.round(items.reduce((n: any, i: any) => n + (i.amount * (i.tax_rate ?? 0)) / 100, 0) *
                100) / 100;
            const totalAmount = Math.round((subtotal + tax) * 100) / 100;
            const newPO: PurchaseOrder = {
                id,
                po_no: poNo,
                rfq_id: po.rfq_id,
                work_order_id: workOrder?.id,
                work_order_no: workOrder?.work_order_no,
                site_id: workOrder?.site_id,
                vendor_id: po.vendor_id || "",
                vendor_name: po.vendor_name || "",
                status: "pending_approval",
                items,
                subtotal,
                tax_amount: tax,
                total_amount: totalAmount,
                expected_delivery: po.expected_delivery || today(),
                thread_id: threadId,
                grn_ids: [],
                bill_ids: [],
                // Provenance: POs created with an rfq_id came through the formal
                // competitive-bid path; POs without one are either direct awards
                // (tagged separately via createDirectAwardPO) or repeat POs.
                award_basis: po.rfq_id ? "competitive" : (po.award_basis || "direct"),
                direct_award: po.rfq_id ? false : (po.direct_award ?? false),
                created_at: nowIso(),
                updated_at: nowIso(),
            };
            commitState((s: any) => ({
                db: { ...s.db, purchaseOrders: [newPO, ...s.db.purchaseOrders] },
            }));
            get().logAudit({
                actor: financeUser.name,
                actor_role: financeUser.role,
                action: `Created ${poNo} to ${po.vendor_name} (${formatINR(totalAmount)})`,
                entity_type: "po",
                entity_id: id,
                entity_label: poNo,
                kind: "create",
                source_module: "procurement",
                // Cross-post to the conversation graph: PO creation is relevant to
                // the Work Order, Site, Customer, and Vendor threads.
                cross_post: [
                    ...(workOrder ? [
                        { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                        ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                    ] : []),
                    { entity_type: "vendor", entity_id: po.vendor_id, entity_label: po.vendor_name },
                ],
            });
            const policy = get().requiresApproval("po_amount", totalAmount);
            if (policy) {
                get().addTask({
                    title: `Approve ${poNo} · ${po.vendor_name} (${formatINR(totalAmount)})`,
                    customer_id: workOrder?.customer_id,
                    po_id: id,
                    task_scope: "office",
                    task_type: "po_approval",
                    assignee_name: policy.approver_name || "Owner",
                    auto_generated: true,
                    due_date: today(),
                });
                commitState((s: any) => ({
                    db: {
                        ...s.db,
                        actions: [
                            {
                                id: genId("appr"),
                                title: `Approve ${poNo} · ${po.vendor_name}`,
                                type: "po",
                                status: "pending",
                                amount: totalAmount,
                                requested_by: financeUser.name,
                                due_date: today(),
                                linked_record_id: id,
                                linked_record_type: "po",
                                created_at: nowIso(),
                            },
                            ...s.db.actions,
                        ],
                    },
                }));
                get().logAudit({
                    actor: "System",
                    action: `Auto-created approval task for ${poNo} — policy "${policy.name}" matched (rule: auto-003)`,
                    entity_type: "po",
                    entity_id: id,
                    entity_label: poNo,
                    kind: "system",
                    cross_post: [
                        ...(workOrder ? [
                            { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                            ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                            ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                        ] : []),
                        ...(po.vendor_id ? [{ entity_type: "vendor", entity_id: po.vendor_id, entity_label: po.vendor_name }] : []),
                    ],
                });
            }
            else {
                get().updatePO(id, {
                    status: "approved",
                    approved_by: "System (below threshold)",
                    approved_at: nowIso(),
                });
                get().logAudit({
                    actor: "System",
                    action: `Auto-approved ${poNo} — below policy threshold (no approval required)`,
                    entity_type: "po",
                    entity_id: id,
                    entity_label: poNo,
                    kind: "system",
                    cross_post: [
                        ...(workOrder ? [
                            { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                            ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                            ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                        ] : []),
                        ...(po.vendor_id ? [{ entity_type: "vendor", entity_id: po.vendor_id, entity_label: po.vendor_name }] : []),
                    ],
                });
            }
            return id;
        },
        createDirectAwardPO: (input) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager", "Procurement Staff"], "create direct-award purchase orders");
            const state = get();
            const actor = state.currentUser();
            const trimmedReason = (input.award_reason || "").trim();
            if (!trimmedReason)
                throw new Error("A direct-award reason is required so the exception is auditable.");
            if (!input.vendor_id || !input.vendor_name)
                throw new Error("Vendor is required for a direct award.");
            if (!input.items || !input.items.length)
                throw new Error("At least one line item is required for a direct award.");
            // Build a Partial<PurchaseOrder> and delegate to createPO, then patch
            // the new PO with the direct-award provenance fields + audit entry.
            const poId = state.createPO({
                work_order_id: input.work_order_id,
                site_id: input.site_id,
                vendor_id: input.vendor_id,
                vendor_name: input.vendor_name,
                items: input.items,
                expected_delivery: input.expected_delivery,
            });
            if (!poId) throw new Error("Failed to create direct-award PO.");
            const created = get().db.purchaseOrders.find((row: any) => row.id === poId);
            const poNo = created?.po_no || "PO";
            get().updatePO(poId, {
                direct_award: true,
                award_basis: "direct",
                award_reason: trimmedReason,
                award_approved_by: actor.name,
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Direct-award ${poNo} to ${input.vendor_name} (no formal RFQ/bid round) — reason: "${trimmedReason}"`,
                entity_type: "po",
                entity_id: poId,
                entity_label: poNo,
                kind: "decision",
                cross_post: [
                    ...(created?.work_order_id ? [{ entity_type: "workOrder", entity_id: created.work_order_id, entity_label: created.work_order_no }] : []),
                    ...(created?.site_id ? [{ entity_type: "site", entity_id: created.site_id }] : []),
                    ...(input.vendor_id ? [{ entity_type: "vendor", entity_id: input.vendor_id, entity_label: input.vendor_name }] : []),
                ],
            });
            if (input.note) {
                const threadId = created?.thread_id;
                if (threadId) {
                    get().addThreadReply(threadId, {
                        author: actor.name,
                        role: actor.role,
                        body: `Direct award to ${input.vendor_name}. Reason: "${trimmedReason}". ${input.note}`,
                        kind: "decision",
                    });
                }
            }
            return poId;
        },
        updatePO: (id, patch) => commitState((s: any) => ({
            db: {
                ...s.db,
                purchaseOrders: s.db.purchaseOrders.map((p: any) => p.id === id ? { ...p, ...patch, updated_at: nowIso() } : p),
            },
        })),
        approvePO: (id) => {
            assertRole(get().currentUser().role, ["Owner"], "approve purchase orders");
            const actor = get().currentUser();
            const po = get().db.purchaseOrders.find((row: any) => row.id === id);
            if (!po)
                throw new Error("Purchase Order not found.");
            if (po.status !== "pending_approval")
                throw new Error(`${po.po_no} is ${po.status} and cannot be approved again.`);
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    purchaseOrders: snapshot.db.purchaseOrders.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: "approved",
                            approved_by: actor.name,
                            approved_at: nowIso(),
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            get().addThreadReply(po.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: "PO approved. It may now be sent to the vendor.",
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Approved ${po.po_no}`,
                entity_type: "po",
                entity_id: id,
                entity_label: po.po_no,
                kind: "approve",
                cross_post: [
                    ...(po.work_order_id ? [{ entity_type: "workOrder", entity_id: po.work_order_id, entity_label: po.work_order_no }] : []),
                    ...(po.site_id ? [{ entity_type: "site", entity_id: po.site_id }] : []),
                    ...(po.vendor_id ? [{ entity_type: "vendor", entity_id: po.vendor_id, entity_label: po.vendor_name }] : []),
                ],
            });
        },
        sendPO: (id) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "send purchase orders");
            const state = get();
            const actor = state.currentUser();
            const po = state.db.purchaseOrders.find((row: any) => row.id === id);
            if (!po)
                throw new Error("Purchase Order not found.");
            if (po.status !== "approved")
                throw new Error(`${po.po_no} must be approved before it can be sent to the vendor.`);
            const threadId = po.thread_id ||
                state.openThreadFor("po", id, `${po.po_no} · ${po.vendor_name}`, [
                    actor.name,
                    po.vendor_name,
                ]);
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    purchaseOrders: snapshot.db.purchaseOrders.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: "sent",
                            thread_id: row.thread_id || threadId,
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `PO ${po.po_no} sent to ${po.vendor_name}. Goods can now be received through GRN.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Sent ${po.po_no} to ${po.vendor_name}`,
                entity_type: "po",
                entity_id: id,
                entity_label: po.po_no,
                kind: "send",
                cross_post: [
                    ...(po.work_order_id ? [{ entity_type: "workOrder", entity_id: po.work_order_id, entity_label: po.work_order_no }] : []),
                    ...(po.site_id ? [{ entity_type: "site", entity_id: po.site_id }] : []),
                    ...(po.vendor_id ? [{ entity_type: "vendor", entity_id: po.vendor_id, entity_label: po.vendor_name }] : []),
                ],
            });
        },
        fileGRN: (grn) => {
            const state = get();
            const actor = state.currentUser();
            assertRole(actor.role, ["Owner", "Operations Manager", "Field Staff"], "file goods receipts");
            if (actor.role === "Field Staff" && !actor.staffId) {
                throw new Error("Field Staff GRN submissions require a server-assigned staff identity.");
            }
            const po = state.db.purchaseOrders.find((row: any) => row.id === grn.po_id);
            if (!po)
                throw new Error("Goods Received Note requires a Purchase Order.");
            if (po.status !== "sent" && po.status !== "partially_received")
                throw new Error(`${po.po_no} must be approved and sent to the vendor before goods can be received.`);
            if (!grn.items?.length)
                throw new Error("Goods Received Note requires received article lines.");
            const receivingFiles = (grn.receiving_files || []).filter((proof: any) => proof.url && isStoredMediaUrl(proof.url));
            if (!receivingFiles.length)
                throw new Error("At least one actual receiving photo/proof is required before stock can be updated.");
            if (!grn.delivery_challan_no?.trim())
                throw new Error("Delivery challan number is required for a GRN.");
            if (!grn.delivery_challan_file?.url || !isStoredMediaUrl(grn.delivery_challan_file.url))
                throw new Error("A Google Drive delivery challan proof is required for a GRN.");
            if (!grn.inspection_status)
                throw new Error("Record the receiving inspection outcome before filing the GRN.");
            if (grn.inspection_status !== "accepted" &&
                !(grn.damage_shortage_notes ||
                    grn.mismatch_notes ||
                    grn.inspection_notes)?.trim()) {
                throw new Error("Describe the shortage, damage, or inspection observation before filing an exception GRN.");
            }
            const priorGRNs = state.db.grns.filter((row: any) => row.po_id === po.id);
            const alreadyReceived = (orderedId: string) => priorGRNs.reduce((sum: any, note: any) => sum +
                note.items
                    .filter((line: any) => line.source_item_id === orderedId)
                    .reduce((lineSum: any, line: any) => lineSum + line.quantity, 0), 0);
            const items = grn.items.map((received: any) => {
                const ordered = po.items.find((item: any) => item.id === received.source_item_id ||
                    item.article_id === received.article_id);
                if (!ordered)
                    throw new Error(`Received article ${received.title} is not on ${po.po_no}.`);
                const remaining = Math.max(0, ordered.quantity - alreadyReceived(ordered.id));
                if (!Number.isFinite(received.quantity) ||
                    received.quantity <= 0 ||
                    received.quantity > remaining + 0.0001) {
                    throw new Error(`Received quantity for ${ordered.title} must be between 1 and its remaining PO quantity (${remaining}).`);
                }
                return {
                    ...ordered,
                    ...received,
                    rate: ordered.rate,
                    amount: Math.round(received.quantity * ordered.rate * 100) / 100,
                    source_kind: "grn" as const,
                    source_item_id: ordered.id,
                };
            });
            const id = genId("grn");
            const grnNo = nextProcurementNo("GRN", state.db.grns);
            const threadId = state.openThreadFor("grn", id, `${grnNo} · ${po.vendor_name}`, [actor.name, po.vendor_name]);
            const isPhysicalException = grn.inspection_status !== "accepted" ||
                Boolean(grn.mismatch_notes?.trim() || grn.damage_shortage_notes?.trim());
            const status: GRN["status"] = actor.role === "Field Staff"
                ? "pending_receipt_verification"
                : isPhysicalException
                    ? "mismatched"
                    : "received_pending_invoice_match";
            const now = nowIso();
            const newGRN: GRN = {
                id,
                grn_no: grnNo,
                po_id: po.id,
                po_no: po.po_no,
                vendor_id: po.vendor_id,
                vendor_name: po.vendor_name,
                site_id: po.site_id,
                work_order_id: po.work_order_id,
                work_order_no: po.work_order_no,
                status,
                items,
                received_at: now,
                received_by: actor.name,
                received_by_staff_id: actor.staffId,
                receipt_verified_by: actor.role === "Field Staff" ? undefined : actor.name,
                receipt_verified_at: actor.role === "Field Staff" ? undefined : now,
                receiving_proof_attachment_ids: [],
                delivery_challan_no: grn.delivery_challan_no.trim(),
                delivery_challan_attachment_id: undefined,
                inspection_status: grn.inspection_status,
                inspection_notes: grn.inspection_notes?.trim() || undefined,
                damage_shortage_notes: grn.damage_shortage_notes?.trim() || undefined,
                batch_serial_details: grn.batch_serial_details?.trim() || undefined,
                mismatch_notes: grn.mismatch_notes?.trim() || undefined,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            if (actor.role === "Field Staff") {
                commitState((snapshot: any) => ({
                    db: {
                        ...snapshot.db,
                        grns: [newGRN, ...snapshot.db.grns],
                    },
                }));
                const receivingProofAttachmentIds = receivingFiles.map((proof: any) => get().createFileAssetAndAttach({ file_name: proof.file_name, web_view_link: proof.url, google_file_id: proof.file_asset_id || googleFileIdFromUrl(proof.url), mime_type: proof.mime_type, kind: "site_proof", storage_provider: "google_drive", storage_mode: "managed", sync_status: "uploaded", tags: ["grn", "receiving-proof"] }, { entity_type: "grn", entity_id: id, role: "proof", visibility: "internal", customer_shareable: false, caption: proof.caption || "Receiving proof", created_by: actor.name }));
                const deliveryChallanAttachmentId = grn.delivery_challan_file
                    ? get().createFileAssetAndAttach({ file_name: grn.delivery_challan_file.file_name, web_view_link: grn.delivery_challan_file.url, google_file_id: grn.delivery_challan_file.file_asset_id || googleFileIdFromUrl(grn.delivery_challan_file.url), mime_type: grn.delivery_challan_file.mime_type, kind: "site_proof", storage_provider: "google_drive", storage_mode: "managed", sync_status: "uploaded", tags: ["grn", "delivery-challan"] }, { entity_type: "grn", entity_id: id, role: "delivery", visibility: "internal", customer_shareable: false, caption: `Challan ${newGRN.delivery_challan_no}`, created_by: actor.name })
                    : undefined;
                commitState((snapshot: any) => ({
                    db: {
                        ...snapshot.db,
                        grns: snapshot.db.grns.map((row: any) => row.id === id
                            ? { ...row, receiving_proof_attachment_ids: receivingProofAttachmentIds, delivery_challan_attachment_id: deliveryChallanAttachmentId }
                            : row),
                    },
                }));
                get().addThreadReply(threadId, {
                    author: actor.name,
                    role: actor.role,
                    body: `GRN submitted with ${receivingProofAttachmentIds.length} receiving proof(s) and challan ${newGRN.delivery_challan_no}. Receipt verification is pending; stock and PO receipt status have not been updated.`,
                    kind: "decision",
                    proof_attachment_id: receivingProofAttachmentIds[0],
                });
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Submitted ${grnNo} against ${po.po_no} for receipt verification.`,
                    entity_type: "grn",
                    entity_id: id,
                    entity_label: grnNo,
                    kind: "create",
                    source_module: "procurement",
                    // Cross-post: GRN is relevant to the PO, Work Order, and Vendor threads.
                    cross_post: [
                        { entity_type: "po", entity_id: po.id, entity_label: po.po_no },
                        ...(po.work_order_id ? [{ entity_type: "workOrder", entity_id: po.work_order_id }] : []),
                        { entity_type: "vendor", entity_id: po.vendor_id, entity_label: po.vendor_name },
                    ],
                });
                return id;
            }
            const cumulative = (orderedId: string) => alreadyReceived(orderedId) +
                items
                    .filter((line: any) => line.source_item_id === orderedId)
                    .reduce((sum: any, line: any) => sum + line.quantity, 0);
            const fullyReceived = po.items.every((item: any) => cumulative(item.id) >= item.quantity - 0.0001);
            const newPOStatus: PurchaseOrder["status"] = fullyReceived
                ? "received"
                : "partially_received";
            const inventoryRows: InventoryItem[] = items.map((item: any, index: any) => ({
                id: `inv-${id}-${index + 1}`,
                article_id: item.article_id,
                work_required_article_id: item.work_required_article_id,
                name: item.title,
                unit_id: item.unit_id,
                unit_name: item.unit_name,
                quantity: item.quantity,
                reserved_qty: 0,
                received_qty: item.quantity,
                rate: item.rate,
                work_order_id: newGRN.work_order_id,
                work_order_no: newGRN.work_order_no,
                grn_id: id,
                location: "Site Store",
                min_qty: 0,
                thread_id: get().openThreadFor("inventory", `inv-${id}-${index + 1}`, `Inventory · ${item.title}`, ["Site Store", "Owner"]),
                created_at: now,
                updated_at: now,
            }));
            const movements: StockMovement[] = items.map((item: any, index: any) => ({
                id: genId("sm"),
                inventory_id: inventoryRows[index].id,
                article_id: item.article_id,
                work_required_article_id: item.work_required_article_id,
                name: item.title,
                type: "receipt",
                quantity: item.quantity,
                unit_name: item.unit_name,
                rate: item.rate,
                work_order_id: newGRN.work_order_id,
                work_order_no: newGRN.work_order_no,
                po_id: newGRN.po_id,
                grn_id: id,
                notes: `Received via ${grnNo} · challan ${newGRN.delivery_challan_no}`,
                created_at: now,
            }));
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    grns: [newGRN, ...snapshot.db.grns],
                    inventory: [...inventoryRows, ...snapshot.db.inventory],
                    stockMovements: [...movements, ...snapshot.db.stockMovements],
                    purchaseOrders: snapshot.db.purchaseOrders.map((row: any) => row.id === po.id
                        ? {
                            ...row,
                            status: newPOStatus,
                            grn_ids: [...row.grn_ids, id],
                            actual_delivery: today(),
                            updated_at: now,
                        }
                        : row),
                },
            }));
            const receivingProofAttachmentIds = receivingFiles.map((proof: any) => get().createFileAssetAndAttach({ file_name: proof.file_name, web_view_link: proof.url, google_file_id: proof.file_asset_id || googleFileIdFromUrl(proof.url), mime_type: proof.mime_type, kind: "site_proof", storage_provider: "google_drive", storage_mode: "managed", sync_status: "uploaded", tags: ["grn", "receiving-proof"] }, { entity_type: "grn", entity_id: id, role: "proof", visibility: "internal", customer_shareable: false, caption: proof.caption || "Receiving proof", created_by: actor.name }));
            const deliveryChallanAttachmentId = grn.delivery_challan_file
                ? get().createFileAssetAndAttach({ file_name: grn.delivery_challan_file.file_name, web_view_link: grn.delivery_challan_file.url, google_file_id: grn.delivery_challan_file.file_asset_id || googleFileIdFromUrl(grn.delivery_challan_file.url), mime_type: grn.delivery_challan_file.mime_type, kind: "site_proof", storage_provider: "google_drive", storage_mode: "managed", sync_status: "uploaded", tags: ["grn", "delivery-challan"] }, { entity_type: "grn", entity_id: id, role: "delivery", visibility: "internal", customer_shareable: false, caption: `Challan ${newGRN.delivery_challan_no}`, created_by: actor.name })
                : undefined;
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    grns: snapshot.db.grns.map((row: any) => row.id === id ? { ...row, receiving_proof_attachment_ids: receivingProofAttachmentIds, delivery_challan_attachment_id: deliveryChallanAttachmentId } : row),
                },
            }));
            if (newGRN.status === "mismatched") {
                get().createBlocked({
                    title: `${grnNo} delivery exception — ${po.vendor_name}`,
                    reason: newGRN.damage_shortage_notes ||
                        newGRN.mismatch_notes ||
                        newGRN.inspection_notes ||
                        "Inspection exception recorded on GRN",
                    linked_po_id: po.id,
                    linked_grn_id: id,
                });
            }
            get().addThreadReply(threadId, {
                author: newGRN.received_by || actor.name,
                role: actor.role,
                body: `GRN filed with ${receivingProofAttachmentIds.length} receiving proof(s), challan ${newGRN.delivery_challan_no}, and inspection ${newGRN.inspection_status}. PO cumulative receipt is now ${fullyReceived ? "complete" : "partial"}. Vendor invoice matching is still pending.`,
                kind: "decision",
                proof_attachment_id: receivingProofAttachmentIds[0],
            });
            get()
                .db.payments.filter((payment: any) => payment.work_order_id === newGRN.work_order_id &&
                payment.schedule_state === "awaiting_event" &&
                eventMatchesPaymentTrigger(payment.due_event, "material_delivery"))
                .forEach((payment: any) => get().triggerPaymentMilestone(payment.id, {
                reason: `${grnNo} delivery received and inspected`,
            }));
            get().logAudit({
                actor: newGRN.received_by || actor.name,
                actor_role: actor.role,
                action: `Filed ${grnNo} against ${po.po_no}; inspection ${newGRN.inspection_status}; PO is now ${newPOStatus}.`,
                entity_type: "grn",
                entity_id: id,
                entity_label: grnNo,
                kind: "receive",
                cross_post: [
                    { entity_type: "po", entity_id: po.id, entity_label: po.po_no },
                    ...(newGRN.work_order_id ? [{ entity_type: "workOrder", entity_id: newGRN.work_order_id, entity_label: newGRN.work_order_no }] : []),
                    ...(newGRN.site_id ? [{ entity_type: "site", entity_id: newGRN.site_id }] : []),
                    ...(newGRN.vendor_id ? [{ entity_type: "vendor", entity_id: newGRN.vendor_id, entity_label: newGRN.vendor_name }] : []),
                ],
            });
            return id;
        },
        verifyGRNReceipt: (id) => {
            const state = get();
            const actor = state.currentUser();
            assertRole(actor.role, ["Owner", "Operations Manager"], "verify GRN receipts and post stock");
            const grn = state.db.grns.find((row: any) => row.id === id);
            if (!grn)
                throw new Error("Goods Received Note not found.");
            if (grn.status !== "pending_receipt_verification") {
                throw new Error("Only Field Staff GRNs pending receipt verification can post stock.");
            }
            if (!grn.received_by_staff_id) {
                throw new Error("This GRN is missing the submitting Field Staff identity.");
            }
            if (!grn.receiving_proof_attachment_ids?.length || !grn.delivery_challan_attachment_id) {
                throw new Error("Receiving proofs and delivery challan must be attached before stock can be posted.");
            }
            const po = state.db.purchaseOrders.find((row: any) => row.id === grn.po_id);
            if (!po)
                throw new Error("Purchase Order not found for this GRN.");
            if (po.status !== "sent" && po.status !== "partially_received") {
                throw new Error(`${po.po_no} is not awaiting a receivable delivery.`);
            }
            const priorGRNs = state.db.grns.filter((row: any) => row.po_id === po.id &&
                row.id !== grn.id &&
                row.status !== "pending_receipt_verification" &&
                row.status !== "draft");
            const alreadyReceived = (orderedId: string) => priorGRNs.reduce((sum: any, note: any) => sum + note.items
                .filter((line: any) => line.source_item_id === orderedId)
                .reduce((lineSum: any, line: any) => lineSum + line.quantity, 0), 0);
            const items = grn.items.map((received: any) => {
                const ordered = po.items.find((item: any) => item.id === received.source_item_id || item.article_id === received.article_id);
                if (!ordered)
                    throw new Error(`Received article ${received.title} is not on ${po.po_no}.`);
                const remaining = Math.max(0, ordered.quantity - alreadyReceived(ordered.id));
                if (!Number.isFinite(received.quantity) || received.quantity <= 0 || received.quantity > remaining + 0.0001) {
                    throw new Error(`Received quantity for ${ordered.title} must be between 1 and its remaining PO quantity (${remaining}).`);
                }
                return {
                    ...ordered,
                    ...received,
                    rate: ordered.rate,
                    amount: Math.round(received.quantity * ordered.rate * 100) / 100,
                    source_kind: "grn" as const,
                    source_item_id: ordered.id,
                };
            });
            const cumulative = (orderedId: string) => alreadyReceived(orderedId) + items
                .filter((line: any) => line.source_item_id === orderedId)
                .reduce((sum: any, line: any) => sum + line.quantity, 0);
            const fullyReceived = po.items.every((item: any) => cumulative(item.id) >= item.quantity - 0.0001);
            const isPhysicalException = grn.inspection_status !== "accepted" || Boolean(grn.mismatch_notes?.trim() || grn.damage_shortage_notes?.trim());
            const verifiedStatus: GRN["status"] = isPhysicalException ? "mismatched" : "received_pending_invoice_match";
            const newPOStatus: PurchaseOrder["status"] = fullyReceived ? "received" : "partially_received";
            const now = nowIso();
            const threadId = grn.thread_id || state.openThreadFor("grn", grn.id, `${grn.grn_no} · ${po.vendor_name}`, [grn.received_by || "Field Staff", actor.name, po.vendor_name]);
            const inventoryRows: InventoryItem[] = items.map((item: any, index: any) => ({
                id: `inv-${grn.id}-${index + 1}`,
                article_id: item.article_id,
                // C: Back-fill work_required_article_id from the verified PO line
                // mapping. Previously this row was created WITHOUT this field — so
                // Field-Staff-submitted GRNs that were later verified produced
                // inventory rows that lost their scoped-material link, breaking
                // vendor-rate scope resolution downstream. The operational-repair
                // helper self-heals this on workspace load, but in-session the
                // link was broken. Now we set it at the source.
                work_required_article_id: item.work_required_article_id,
                name: item.title,
                unit_id: item.unit_id,
                unit_name: item.unit_name,
                quantity: item.quantity,
                reserved_qty: 0,
                received_qty: item.quantity,
                rate: item.rate,
                work_order_id: grn.work_order_id,
                work_order_no: grn.work_order_no,
                grn_id: grn.id,
                location: "Site Store",
                min_qty: 0,
                thread_id: get().openThreadFor("inventory", `inv-${grn.id}-${index + 1}`, `Inventory · ${item.title}`, ["Site Store", actor.name]),
                created_at: now,
                updated_at: now,
            }));
            const movements: StockMovement[] = items.map((item: any, index: any) => ({
                id: genId("sm"),
                inventory_id: inventoryRows[index].id,
                article_id: item.article_id,
                work_required_article_id: item.work_required_article_id,
                name: item.title,
                type: "receipt",
                quantity: item.quantity,
                unit_name: item.unit_name,
                rate: item.rate,
                work_order_id: grn.work_order_id,
                work_order_no: grn.work_order_no,
                po_id: grn.po_id,
                grn_id: grn.id,
                notes: `Received via ${grn.grn_no} · challan ${grn.delivery_challan_no || "—"}`,
                created_at: now,
            }));
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    grns: snapshot.db.grns.map((row: any) => row.id === grn.id ? {
                        ...row,
                        items,
                        status: verifiedStatus,
                        thread_id: threadId,
                        receipt_verified_by: actor.name,
                        receipt_verified_at: now,
                        updated_at: now,
                    } : row),
                    inventory: [...inventoryRows, ...snapshot.db.inventory],
                    stockMovements: [...movements, ...snapshot.db.stockMovements],
                    purchaseOrders: snapshot.db.purchaseOrders.map((row: any) => row.id === po.id ? {
                        ...row,
                        status: newPOStatus,
                        grn_ids: row.grn_ids.includes(grn.id) ? row.grn_ids : [...row.grn_ids, grn.id],
                        actual_delivery: today(),
                        updated_at: now,
                    } : row),
                },
            }));
            if (verifiedStatus === "mismatched") {
                get().createBlocked({
                    title: `${grn.grn_no} delivery exception — ${po.vendor_name}`,
                    reason: grn.damage_shortage_notes || grn.mismatch_notes || grn.inspection_notes || "Inspection exception recorded on GRN",
                    linked_po_id: po.id,
                    linked_grn_id: grn.id,
                });
            }
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Receipt verified. ${grn.grn_no} posted ${items.length} item line(s) to stock; PO cumulative receipt is now ${fullyReceived ? "complete" : "partial"}. Vendor invoice matching is still pending.`,
                kind: "decision",
                proof_attachment_id: grn.receiving_proof_attachment_ids[0],
            });
            get().db.payments.filter((payment: any) => payment.work_order_id === grn.work_order_id &&
                payment.schedule_state === "awaiting_event" &&
                eventMatchesPaymentTrigger(payment.due_event, "material_delivery")).forEach((payment: any) => get().triggerPaymentMilestone(payment.id, {
                reason: `${grn.grn_no} delivery receipt verified`,
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Verified ${grn.grn_no} and posted stock against ${po.po_no}; PO is now ${newPOStatus}.`,
                entity_type: "grn",
                entity_id: grn.id,
                entity_label: grn.grn_no,
                kind: "receive",
                cross_post: [
                    { entity_type: "po", entity_id: po.id, entity_label: po.po_no },
                    ...(grn.work_order_id ? [{ entity_type: "workOrder", entity_id: grn.work_order_id, entity_label: grn.work_order_no }] : []),
                    ...(grn.site_id ? [{ entity_type: "site", entity_id: grn.site_id }] : []),
                    ...(grn.vendor_id ? [{ entity_type: "vendor", entity_id: grn.vendor_id, entity_label: grn.vendor_name }] : []),
                ],
            });
            // J: Recompute the vendor's performance score after a GRN verify
            // (it may change on-time delivery %). Best-effort — never throw.
            if (grn.vendor_id) {
                try { get().recomputeVendorPerformance(grn.vendor_id); }
                catch (err) { console.warn("[verifyGRNReceipt] recomputeVendorPerformance failed", err); }
            }
        },
        issueDispatch: (d) => {
            const fieldUser = userForRole(get().db, "Field Staff");
            const id = genId("disp");
            const dispNo = nextProcurementNo("DISP", get().db.dispatches);
            const threadId = get().openThreadFor("dispatch", id, `${dispNo} · site issue`, [fieldUser.name]);
            const items = d.items || [];
            const newDisp: SiteDispatch = {
                id,
                dispatch_no: dispNo,
                work_order_id: d.work_order_id || "",
                work_order_no: d.work_order_no || "",
                site_id: d.site_id,
                site_address: d.site_address,
                status: "issued",
                items,
                issued_at: nowIso(),
                issued_by: d.issued_by || fieldUser.name,
                thread_id: threadId,
                created_at: nowIso(),
                updated_at: nowIso(),
            };
            commitState((s: any) => ({
                db: { ...s.db, dispatches: [newDisp, ...s.db.dispatches] },
            }));
            items.forEach((di: any) => {
                const inv = get().db.inventory.find((i: any) => i.id === di.source_item_id);
                if (inv) {
                    commitState((s: any) => ({
                        db: {
                            ...s.db,
                            inventory: s.db.inventory.map((i: any) => i.id === inv.id
                                ? {
                                    ...i,
                                    quantity: Math.max(0, i.quantity - di.quantity),
                                    issued_qty: (i.issued_qty || 0) + di.quantity,
                                    updated_at: nowIso(),
                                }
                                : i),
                        },
                    }));
                }
                const mv: StockMovement = {
                    id: genId("sm"),
                    inventory_id: di.source_item_id || "",
                    article_id: di.article_id,
                    name: di.title,
                    type: "issue",
                    quantity: -di.quantity,
                    unit_name: di.unit_name,
                    rate: di.rate,
                    work_order_id: newDisp.work_order_id,
                    work_order_no: newDisp.work_order_no,
                    dispatch_id: id,
                    notes: "Issued to site",
                    created_at: nowIso(),
                };
                commitState((s: any) => ({
                    db: { ...s.db, stockMovements: [mv, ...s.db.stockMovements] },
                }));
            });
            get().logAudit({
                actor: newDisp.issued_by || fieldUser.name,
                actor_role: fieldUser.role,
                action: `Issued ${dispNo} (${items.length} items) to ${newDisp.customer_name || "Customer"}`,
                entity_type: "dispatch",
                entity_id: id,
                entity_label: dispNo,
                kind: "create",
                cross_post: [
                    ...(newDisp.work_order_id ? [{ entity_type: "workOrder", entity_id: newDisp.work_order_id, entity_label: newDisp.work_order_no }] : []),
                    ...(newDisp.site_id ? [{ entity_type: "site", entity_id: newDisp.site_id }] : []),
                ],
            });
            get().logAudit({
                actor: "System",
                action: `Auto-reduced allocated inventory. Actual material cost remains posted once from the approved vendor invoice.`,
                entity_type: "dispatch",
                entity_id: id,
                entity_label: dispNo,
                kind: "system",
                cross_post: [
                    ...(newDisp.work_order_id ? [{ entity_type: "workOrder", entity_id: newDisp.work_order_id, entity_label: newDisp.work_order_no }] : []),
                    ...(newDisp.site_id ? [{ entity_type: "site", entity_id: newDisp.site_id }] : []),
                ],
            });
            return id;
        },
        acknowledgeDispatch: (id) => commitState((s: any) => ({
            db: {
                ...s.db,
                dispatches: s.db.dispatches.map((d: any) => d.id === id
                    ? {
                        ...d,
                        status: "acknowledged",
                        acknowledged_at: nowIso(),
                        updated_at: nowIso(),
                    }
                    : d),
            },
        })),

        // J: Recompute a vendor's reliability_score, on_time_pct, and rating
        // from actual GRN + bill performance. Previously these were static
        // master fields set at vendor creation and never updated — so a
        // vendor with 100 perfect GRNs kept whatever score was entered at
        // creation. Now we derive a 0-100 score from:
        //   • on-time delivery: po.actual_delivery <= po.expected_delivery
        //   • bill-match rate: matched bills vs disputed bills
        //   • disputed-bill penalty
        // We then write the recomputed fields back to the vendor master so
        // the VendorPerformanceModule leaderboard reflects reality.
        recomputeVendorPerformance: (vendorId) => {
            const state = get();
            const actor = state.currentUser();
            const vendor = state.db.master.vendors.find((v: any) => v.id === vendorId);
            if (!vendor)
                throw new Error("Vendor not found.");
            const vendorPOs = state.db.purchaseOrders.filter((po: any) => po.vendor_id === vendorId);
            // On-time delivery: POs with both actual + expected delivery dates.
            const deliveredPOs = vendorPOs.filter((po: any) => po.actual_delivery && po.expected_delivery);
            const onTimeCount = deliveredPOs.filter((po: any) => po.actual_delivery <= po.expected_delivery).length;
            const onTimePct = deliveredPOs.length > 0
                ? Math.round((onTimeCount / deliveredPOs.length) * 100)
                : 0;
            // Bill-match rate: matched bills vs disputed bills (excluding draft).
            const vendorBills = state.db.vendorBills.filter((b: any) => b.vendor_id === vendorId && b.status !== "draft");
            const matchedBills = vendorBills.filter((b: any) => b.matched === true || b.status === "approved" || b.status === "paid" || b.status === "partly_paid").length;
            const disputedBills = vendorBills.filter((b: any) => b.status === "disputed").length;
            const matchRate = vendorBills.length > 0
                ? Math.round((matchedBills / vendorBills.length) * 100)
                : 100;
            // Composite reliability score: weighted blend of on-time + match rate,
            // penalised for disputes.
            const disputePenalty = Math.min(30, disputedBills * 10);
            const reliabilityScore = Math.max(0, Math.min(100, Math.round(onTimePct * 0.55 + matchRate * 0.45) - disputePenalty));
            // Rating: 1-5 stars derived from the reliability score.
            const rating = reliabilityScore >= 90 ? 5
                : reliabilityScore >= 75 ? 4
                    : reliabilityScore >= 60 ? 3
                        : reliabilityScore >= 40 ? 2
                            : 1;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        vendors: s.db.master.vendors.map((v: any) => v.id === vendorId
                            ? {
                                ...v,
                                reliability_score: reliabilityScore,
                                on_time_pct: onTimePct,
                                rating,
                                performance_recomputed_at: nowIso(),
                            }
                            : v),
                    },
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Recomputed vendor performance for ${vendor.name}: reliability=${reliabilityScore}, on-time=${onTimePct}%, rating=${rating} (${deliveredPOs.length} POs, ${vendorBills.length} bills, ${disputedBills} disputed)`,
                entity_type: "vendor",
                entity_id: vendorId,
                entity_label: vendor.name,
                kind: "system",
                source_module: "procurement",
            });
        },
        // E-3: "Lowest bid → PO" quick action. Auto-selects the lowest-
        // quoted vendor bid on an RFQ and creates a PO from it. Requires at
        // least one received bid; if not all expected bids are in, the
        // caller is responsible for deciding whether to proceed.
        createPOFromLowestBid: (rfqId) => {
            const state = get();
            const rfq = state.db.vendorRfqs.find((row: any) => row.id === rfqId);
            if (!rfq)
                throw new Error("Vendor RFQ not found.");
            const bids = state.db.vendorBids.filter((bid: any) => bid.rfq_id === rfqId && bid.status === "received");
            if (!bids.length)
                throw new Error("No received bids for this RFQ — record at least one vendor bid first.");
            const lowest = [...bids].sort((a: any, b: any) => (a.quoted_amount || 0) - (b.quoted_amount || 0))[0];
            get().selectVendorBid(lowest.id);
            const poId = get().createPOFromVendorBid(lowest.id);
            if (!poId)
                throw new Error("Could not create PO from the lowest bid.");
            get().logAudit({
                actor: state.currentUser().name,
                actor_role: state.currentUser().role,
                action: `Auto-created PO ${poId} from lowest bid by ${lowest.vendor_name} (${formatINR(lowest.quoted_amount)}) on ${rfq.rfq_no}`,
                entity_type: "vendor_rfq",
                entity_id: rfqId,
                entity_label: rfq.rfq_no,
                kind: "decision",
                source_module: "procurement",
                cross_post: [
                    { entity_type: "vendor_bid", entity_id: lowest.id, entity_label: lowest.vendor_name },
                    ...(rfq.work_order_id ? [{ entity_type: "workOrder", entity_id: rfq.work_order_id }] : []),
                ],
            });
            return poId;
        },
    };
}
