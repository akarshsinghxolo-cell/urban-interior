import type { ID } from "./types";

export type PartnerGovernanceMode = "vendor" | "contractor";

export type PartnerDocumentStatus = "valid" | "expiring" | "expired" | "unverified";

export type PartnerDocumentKind =
  | "gst_registration"
  | "pan_card"
  | "bank_proof"
  | "udyam_registration"
  | "address_proof"
  | "vendor_authorization"
  | "agreement"
  | "insurance"
  | "labour_license"
  | "pf_registration"
  | "esi_registration"
  | "identity_proof"
  | "safety_certificate"
  | "other";

export interface PartnerComplianceDocument {
  id: ID;
  kind: PartnerDocumentKind;
  label: string;
  document_no?: string;
  issue_date?: string;
  expiry_date?: string;
  verified: boolean;
  verified_at?: string;
  verified_by?: string;
  attachment_id?: ID;
  mandatory?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VendorArticleCapability {
  id: ID;
  article_id: ID;
  article_name?: string;
  variant_id?: ID;
  variant_name?: string;
  brand?: string;
  grade?: string;
  unit_id?: ID;
  supply_mode?: "stocked" | "on_order" | "special_order";
  lead_time_days?: number;
  minimum_order_qty?: number;
  preferred?: boolean;
  status: "active" | "inactive";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ContractorTradeCapability {
  id: ID;
  work_subcategory_id: ID;
  work_subcategory_name?: string;
  unit_id?: ID;
  labour_rate?: number;
  with_material_rate?: number;
  crew_required?: number;
  max_daily_capacity?: number;
  preferred?: boolean;
  status: "active" | "inactive";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type PartnerCapability = VendorArticleCapability | ContractorTradeCapability;

export interface PartnerDuplicateCandidate {
  leftId: ID;
  rightId: ID;
  score: number;
  reasons: string[];
}

export interface PartnerPaymentReadiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  validDocuments: number;
  expiringDocuments: number;
  expiredDocuments: number;
  unverifiedDocuments: number;
}

export const DOCUMENT_KIND_LABELS: Record<PartnerDocumentKind, string> = {
  gst_registration: "GST registration",
  pan_card: "PAN card",
  bank_proof: "Bank proof / cancelled cheque",
  udyam_registration: "Udyam / MSME registration",
  address_proof: "Business address proof",
  vendor_authorization: "Brand / distributor authorization",
  agreement: "Commercial agreement",
  insurance: "Insurance",
  labour_license: "Labour licence",
  pf_registration: "PF registration",
  esi_registration: "ESI registration",
  identity_proof: "Identity proof",
  safety_certificate: "Safety certificate",
  other: "Other document",
};

const VENDOR_MANDATORY_DOCUMENTS: PartnerDocumentKind[] = ["gst_registration", "pan_card", "bank_proof"];

export function governanceId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePartnerName(value?: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|company|co|enterprises|enterprise|traders|trading|contractor|contractors)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePhone(value?: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeTaxId(value?: string): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeBankAccount(value?: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function partnerDocuments(partner: Record<string, unknown>): PartnerComplianceDocument[] {
  return Array.isArray(partner.compliance_documents)
    ? (partner.compliance_documents as PartnerComplianceDocument[])
    : [];
}

export function partnerCapabilities(partner: Record<string, unknown>): PartnerCapability[] {
  const governed = Array.isArray(partner.capabilities_v2)
    ? (partner.capabilities_v2 as PartnerCapability[])
    : [];
  if (governed.length) return governed;
  if (!Array.isArray(partner.work_capabilities)) return [];

  const partnerId = String(partner.id || "contractor");
  return (partner.work_capabilities as Array<Record<string, unknown>>).flatMap((row) => {
    const subcategoryId = String(row.subcategory_id || row.work_subcategory_id || "").trim();
    if (!subcategoryId) return [];
    return [{
      ...row,
      id: String(row.id || `ccap-${partnerId}-${subcategoryId}`),
      work_subcategory_id: subcategoryId,
      work_subcategory_name: row.subcategory_name || row.work_subcategory_name,
      status: row.status === "inactive" ? "inactive" : "active",
      created_at: String(row.created_at || new Date(0).toISOString()),
      updated_at: String(row.updated_at || new Date(0).toISOString()),
    } as PartnerCapability];
  });
}

export function documentStatus(document: PartnerComplianceDocument, at = new Date()): PartnerDocumentStatus {
  if (!document.verified) return "unverified";
  if (!document.expiry_date) return "valid";
  const expiry = new Date(`${document.expiry_date}T23:59:59`);
  if (Number.isNaN(expiry.getTime())) return "unverified";
  const remainingDays = Math.ceil((expiry.getTime() - at.getTime()) / 86_400_000);
  if (remainingDays < 0) return "expired";
  if (remainingDays <= 30) return "expiring";
  return "valid";
}

export function daysUntilExpiry(document: PartnerComplianceDocument, at = new Date()): number | null {
  if (!document.expiry_date) return null;
  const expiry = new Date(`${document.expiry_date}T23:59:59`);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - at.getTime()) / 86_400_000);
}

export function vendorPaymentReadiness(
  partner: Record<string, unknown>,
  at = new Date(),
): PartnerPaymentReadiness {
  const documents = partnerDocuments(partner);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const mandatory = new Set(VENDOR_MANDATORY_DOCUMENTS);

  for (const kind of mandatory) {
    const matching = documents.filter((document) => document.kind === kind);
    if (!matching.length) {
      blockers.push(`Missing ${DOCUMENT_KIND_LABELS[kind]}`);
      continue;
    }
    const usable = matching.find((document) => documentStatus(document, at) === "valid" || documentStatus(document, at) === "expiring");
    if (!usable) {
      const statuses = matching.map((document) => documentStatus(document, at));
      blockers.push(`${DOCUMENT_KIND_LABELS[kind]} is ${statuses.includes("expired") ? "expired" : "not verified"}`);
    }
  }

  for (const document of documents) {
    const status = documentStatus(document, at);
    if (status === "expiring") {
      const days = daysUntilExpiry(document, at);
      warnings.push(`${document.label} expires in ${days ?? "few"} day${days === 1 ? "" : "s"}`);
    }
    if (document.mandatory && status === "expired" && !mandatory.has(document.kind)) {
      blockers.push(`${document.label} is expired`);
    }
    if (document.mandatory && status === "unverified" && !mandatory.has(document.kind)) {
      blockers.push(`${document.label} is not verified`);
    }
  }

  const statuses = documents.map((document) => documentStatus(document, at));
  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    validDocuments: statuses.filter((status) => status === "valid").length,
    expiringDocuments: statuses.filter((status) => status === "expiring").length,
    expiredDocuments: statuses.filter((status) => status === "expired").length,
    unverifiedDocuments: statuses.filter((status) => status === "unverified").length,
  };
}

export function detectPartnerDuplicates(partners: Array<Record<string, any>>): PartnerDuplicateCandidate[] {
  const candidates: PartnerDuplicateCandidate[] = [];
  for (let leftIndex = 0; leftIndex < partners.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < partners.length; rightIndex += 1) {
      const left = partners[leftIndex];
      const right = partners[rightIndex];
      if (!left?.id || !right?.id || left.duplicate_of_id || right.duplicate_of_id) continue;

      let score = 0;
      const reasons: string[] = [];
      const leftGst = normalizeTaxId(left.gstin || left.business_gst);
      const rightGst = normalizeTaxId(right.gstin || right.business_gst);
      const leftPan = normalizeTaxId(left.pan);
      const rightPan = normalizeTaxId(right.pan);
      const leftPhone = normalizePhone(left.phone || left.whatsapp);
      const rightPhone = normalizePhone(right.phone || right.whatsapp);
      const leftBank = normalizeBankAccount(left.bank_account);
      const rightBank = normalizeBankAccount(right.bank_account);
      const leftName = normalizePartnerName(left.legal_name || left.name);
      const rightName = normalizePartnerName(right.legal_name || right.name);
      const sameCity = String(left.city || "").trim().toLowerCase() === String(right.city || "").trim().toLowerCase();

      if (leftGst && leftGst === rightGst) { score += 100; reasons.push("Same GSTIN"); }
      if (leftPan && leftPan === rightPan) { score += 90; reasons.push("Same PAN"); }
      if (leftBank && leftBank === rightBank) { score += 95; reasons.push("Same bank account"); }
      if (leftPhone && leftPhone === rightPhone) { score += 70; reasons.push("Same phone"); }
      if (leftName && leftName === rightName) { score += sameCity ? 60 : 45; reasons.push(sameCity ? "Same normalized name and city" : "Same normalized name"); }

      if (score >= 55) {
        candidates.push({ leftId: left.id, rightId: right.id, score, reasons });
      }
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

export function partnerMergePlan(
  mode: PartnerGovernanceMode,
  db: Record<string, any>,
  canonicalId: string,
  duplicateId: string,
) {
  const collections = mode === "vendor"
    ? [
        ["vendorRfqs", "vendor_ids"],
        ["vendorBids", "vendor_id"],
        ["purchaseOrders", "vendor_id"],
        ["vendorBills", "vendor_id"],
        ["vendorPayments", "vendor_id"],
      ]
    : [
        ["workOrders", "contractor_id"],
        ["contractorBids", "contractor_id"],
        ["contractorBills", "contractor_id"],
        ["contractorPayments", "contractor_id"],
        ["contractorSettlements", "contractor_id"],
      ];

  const impacted = collections.map(([collection, field]) => {
    const rows = Array.isArray(db[collection]) ? db[collection] : [];
    const count = rows.filter((row: Record<string, any>) => Array.isArray(row[field])
      ? row[field].includes(duplicateId)
      : row[field] === duplicateId).length;
    return { collection, field, count };
  }).filter((row) => row.count > 0);

  return {
    canonicalId,
    duplicateId,
    impacted,
    totalReferences: impacted.reduce((sum, row) => sum + row.count, 0),
    safeToQuarantine: true,
    safeToMergeAutomatically: false,
    reason: "The workspace transaction pipeline does not yet expose an atomic cross-collection partner merge action. Quarantine prevents new use while preserving historical references.",
  };
}
