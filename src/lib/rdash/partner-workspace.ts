import type { Contractor, RDashDatabase, Vendor } from "./types";
import type { DetailPanelKind } from "./store/ui-types";
import { contractorOutstanding, vendorBalance } from "./store/selectors";
import { canonicalContractorCapabilities } from "./contractor-profile";
import { canonicalVendorCapabilities } from "./vendor-profile";
import { indiaBusinessDate } from "./format";

export type PartnerKind = "vendor" | "contractor";
export type PartnerRecord = Vendor | Contractor;
export type PartnerSection = "overview" | "profile" | "capabilities" | "work" | "finance" | "tasks" | "files" | "activity";
export type PartnerAction = {
  id: string;
  title: string;
  description: string;
  section: PartnerSection;
  kind?: DetailPanelKind;
  recordId?: string;
};

const liveWork = new Set(["scheduled", "in_progress", "on_hold"]);
const openPO = new Set(["draft", "pending_approval", "approved", "sent", "partially_received"]);
const payable = new Set(["verified", "approved", "partly_paid"]);

/** Partner ownership follows explicit record links, never a shared customer or site. */
export function partnerPortfolio(db: RDashDatabase, kind: PartnerKind, partner: PartnerRecord, today = indiaBusinessDate()) {
  const id = partner.id;
  const purchaseOrders = kind === "vendor" ? db.purchaseOrders.filter((row) => row.vendor_id === id) : [];
  const rfqs = kind === "vendor" ? db.vendorRfqs.filter((row) => row.vendor_ids.includes(id)) : [];
  const vendorBids = kind === "vendor" ? db.vendorBids.filter((row) => row.vendor_id === id) : [];
  const contractorBids = kind === "contractor" ? db.contractorBids.filter((row) => row.contractor_id === id) : [];
  const settlements = kind === "contractor" ? db.contractorSettlements.filter((row) => row.contractor_id === id) : [];
  const bills = kind === "vendor"
    ? db.vendorBills.filter((row) => row.vendor_id === id)
    : db.contractorBills.filter((row) => row.contractor_id === id);
  const payments = kind === "vendor"
    ? db.vendorPayments.filter((row) => row.vendor_id === id)
    : db.contractorPayments.filter((row) => row.contractor_id === id);
  const poIds = new Set(purchaseOrders.map((row) => row.id));
  const grns = kind === "vendor" ? db.grns.filter((row) => row.vendor_id === id && poIds.has(row.po_id)) : [];
  const relatedWorkIds = new Set([...purchaseOrders, ...rfqs, ...bills, ...contractorBids, ...settlements].map((row) => row.work_order_id).filter(Boolean));
  const workOrders = db.workOrders.filter((row) => kind === "contractor"
    ? row.contractor_id === id || row.abandoned_contractor_id === id
    : relatedWorkIds.has(row.id));
  const workIds = new Set(workOrders.map((row) => row.id));
  const tasks = db.tasks.filter((row) => (row.work_order_id && workIds.has(row.work_order_id)) || (row.po_id && poIds.has(row.po_id)));
  const siteIds = new Set([...workOrders, ...purchaseOrders, ...rfqs, ...bills, ...contractorBids, ...settlements].map((row) => row.site_id).filter(Boolean));
  const sites = db.sites.filter((row) => siteIds.has(row.id));
  const relatedIds = new Set([id, ...[...purchaseOrders, ...rfqs, ...vendorBids, ...contractorBids, ...settlements, ...bills, ...payments, ...grns, ...tasks].map((row) => row.id)]);
  // Vendor activity stays on their purchasing records, not another supplier's site work.
  if (kind === "contractor") workIds.forEach((workId) => relatedIds.add(workId));
  const activity = db.auditLog.filter((row) => Boolean(row.entity_id && relatedIds.has(row.entity_id)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const files = db.entityFileAttachments.filter((row) => row.entity_type === kind && row.entity_id === id);
  const contractorCapabilities = kind === "contractor" ? canonicalContractorCapabilities(partner as Contractor, db) : [];
  const vendorCapabilities = kind === "vendor" ? canonicalVendorCapabilities(partner as Vendor, db) : [];
  const capabilityNames = kind === "contractor"
    ? contractorCapabilities.flatMap((row) => [row.subcategory_name, ...(row.work_type_rates || []).map((rate) => rate.work_type_name)]).filter(Boolean)
    : vendorCapabilities.map((row) => row.article_name).filter(Boolean);
  const capabilityCount = kind === "contractor" ? contractorCapabilities.length : vendorCapabilities.length;
  const rates = kind === "vendor"
    ? db.master.vendorRates.filter((row) => row.vendor_id === id && (!row.status || row.status === "active"))
    : db.master.contractorRates.filter((row) => row.contractor_id === id);
  const activeOrders = kind === "vendor" ? purchaseOrders.filter((row) => openPO.has(row.status)).length
    : workOrders.filter((row) => row.contractor_id === id && liveWork.has(row.status)).length;
  const outstanding = kind === "vendor" ? vendorBalance(db, id).outstanding : contractorOutstanding(db, id);
  const paid = payments.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amount, 0);
  const committed = payments.filter((row) => row.status === "pending" || row.status === "approved").reduce((sum, row) => sum + row.amount, 0);
  const actions: PartnerAction[] = [];
  if (!partner.phone || !partner.city || !capabilityCount) actions.push({ id: "profile", title: "Complete partner profile", description: [!partner.phone && "mobile number", !partner.city && "city", !capabilityCount && "capabilities"].filter(Boolean).join(", "), section: "profile" });
  if (capabilityCount && !rates.length) actions.push({ id: "rates", title: "Add agreed rates", description: "Capabilities are recorded, but no rates are available yet.", section: "capabilities" });
  if (partner.status === "onboarding") actions.push({ id: "onboarding", title: "Review onboarding", description: "Confirm the profile and capabilities, then set the partner's status in Edit profile.", section: "profile" });
  for (const row of purchaseOrders) {
    if (row.status === "pending_approval") actions.push({ id: row.id, title: `${row.po_no} needs approval`, description: "Review the purchase order before sending it.", section: "work", kind: "po", recordId: row.id });
    else if ((row.status === "sent" || row.status === "partially_received") && row.expected_delivery && row.expected_delivery.slice(0, 10) < today) actions.push({ id: row.id, title: `${row.po_no} delivery overdue`, description: `Expected ${row.expected_delivery.slice(0, 10)}`, section: "work", kind: "po", recordId: row.id });
  }
  for (const row of bills) {
    const billKind = kind === "vendor" ? "vendorBill" : "contractorBill";
    if (row.status === "disputed" || row.status === "held") actions.push({ id: row.id, title: `${row.bill_no} is ${row.status}`, description: "Resolve the hold before arranging payment.", section: "finance", kind: billKind, recordId: row.id });
    else if (payable.has(row.status) && row.balance_amount > 0 && row.due_date && row.due_date.slice(0, 10) < today) actions.push({ id: row.id, title: `${row.bill_no} payment overdue`, description: `Due ${row.due_date.slice(0, 10)}`, section: "finance", kind: billKind, recordId: row.id });
  }
  for (const row of tasks) {
    if (row.status !== "completed" && row.status !== "cancelled" && row.due_date && row.due_date.slice(0, 10) < today) actions.push({ id: row.id, title: row.title, description: `Task overdue since ${row.due_date.slice(0, 10)}`, section: "tasks", kind: "task", recordId: row.id });
  }
  return { partner, kind, purchaseOrders, rfqs, vendorBids, contractorBids, settlements, workOrders, sites, grns, bills, payments, tasks, activity, files, contractorCapabilities, vendorCapabilities, capabilityNames, capabilityCount, rates, activeOrders, outstanding, paid, committed, actions };
}

export function partnerMatchesQuery(model: ReturnType<typeof partnerPortfolio>, query: string) {
  const partner = model.partner;
  const haystack = [partner.name, partner.legal_name, partner.phone, partner.city, partner.locality, partner.address,
    ...(partner.categories || []), ...model.capabilityNames, ...(model.kind === "vendor" ? (partner as Vendor).brands || [] : [])].filter(Boolean).join(" ").toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}
