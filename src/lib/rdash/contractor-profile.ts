import type { RDashDatabase } from "./types";
import { defaultWorkTypeId, workTypesForSubcategory } from "./work-types";

export type ContractorLifecycleStatus =
  | "onboarding"
  | "active"
  | "on_hold"
  | "blacklisted"
  | "inactive";

export type ContractorCapability = {
  subcategory_id: string;
  subcategory_name?: string;
  work_type_rates?: ContractorWorkTypeRate[];
  unit_id?: string;
  crew_required?: number;
  max_daily_capacity?: number;
  preferred?: boolean;
  status?: "active" | "inactive";
  notes?: string;
};

export type ContractorWorkTypeRate = {
  work_type_id: string;
  work_type_name?: string;
  labour_rate?: number;
};

export type ContractorProfileRecord = {
  id?: string;
  name?: string;
  legal_name?: string;
  phone?: string;
  whatsapp?: string;
  alternate_phone?: string;
  email?: string;
  city?: string;
  locality?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  source_partner_id?: string;
  source_partner_name?: string;
  photo_attachment_id?: string;
  business_card_attachment_id?: string;
  reliability_rating?: string;
  politeness_rating?: string;
  worker_count_range?: string;
  deadline_commitment?: string;
  business_gst?: string;
  pan?: string;
  bank_account?: string;
  ifsc?: string;
  status?: ContractorLifecycleStatus | string;
  categories?: string[];
  work_capabilities?: ContractorCapability[];
  supervisor_name?: string;
  supervisor_phone?: string;
  available_workers?: number;
  concurrent_site_limit?: number;
  earliest_mobilisation_date?: string;
  service_radius_km?: number;
  labour_registration_no?: string;
  insurance_expiry?: string;
  pf_no?: string;
  esi_no?: string;
  notes?: string;
  bank_verified?: boolean;
  compliance_documents?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ContractorDuplicateConflict = {
  id: string;
  name: string;
  reasons: string[];
  hard: boolean;
};

// Only current Contractor-domain fields are allowed to survive normalization.
// Unknown payload keys are discarded rather than maintained as compatibility
// fields. Operational/performance fields remain explicitly preserved.
const CONTRACTOR_PROFILE_KEYS = new Set([
  "id",
  "name",
  "legal_name",
  "phone",
  "whatsapp",
  "alternate_phone",
  "email",
  "city",
  "locality",
  "address",
  "trade",
  "rating",
  "active_jobs",
  "outstanding",
  "reliability_score",
  "on_time_pct",
  "past_jobs_count",
  "specializations",
  "latitude",
  "longitude",
  "photo_attachment_id",
  "business_card_attachment_id",
  "reliability_rating",
  "politeness_rating",
  "worker_count_range",
  "deadline_commitment",
  "source_partner_id",
  "source_partner_name",
  "work_capabilities",
  "business_gst",
  "pan",
  "bank_account",
  "ifsc",
  "categories",
  "supervisor_name",
  "supervisor_phone",
  "available_workers",
  "concurrent_site_limit",
  "earliest_mobilisation_date",
  "service_radius_km",
  "labour_registration_no",
  "insurance_expiry",
  "pf_no",
  "esi_no",
  "notes",
  "bank_verified",
  "compliance_documents",
  "duplicate_of_id",
  "duplicate_resolved_at",
  "duplicate_resolution_note",
  "status",
  "performance_recomputed_at",
]);

function canonicalContractorInput(input: ContractorProfileRecord): ContractorProfileRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => CONTRACTOR_PROFILE_KEYS.has(key)),
  ) as ContractorProfileRecord;
}

const PROFILE_DOCUMENT_SOURCE = "contractor_profile";
const PROFILE_DOCUMENT_TIMESTAMP = new Date(0).toISOString();

type ContractorProfileDocumentSpec = {
  kind: string;
  label: string;
  documentNo?: string;
  expiryDate?: string;
  mandatory: boolean;
};

const digits = (value?: string) => String(value || "").replace(/\D/g, "");
const mobile = (value?: string) => {
  const valueDigits = digits(value);
  return valueDigits.length > 10 ? valueDigits.slice(-10) : valueDigits;
};
const upperId = (value?: string) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const bankDigits = (value?: string) => digits(value);
const normalizedName = (value?: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|company|co|enterprises|enterprise|traders|trading|contractor|contractors)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const finiteNonNegative = (value: unknown): number | undefined => {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
};

function normalizeCapability(row: Record<string, unknown>): ContractorCapability | null {
  const subcategoryId = String(row.subcategory_id || row.work_subcategory_id || "").trim();
  if (!subcategoryId) return null;
  const workTypeRatesById = new Map<string, ContractorWorkTypeRate>();
  if (Array.isArray(row.work_type_rates)) {
    for (const source of row.work_type_rates as Array<Record<string, unknown>>) {
      const workTypeId = String(source.work_type_id || "").trim();
      if (!workTypeId) continue;
      workTypeRatesById.set(workTypeId, {
        work_type_id: workTypeId,
        work_type_name: String(source.work_type_name || "").trim() || undefined,
        labour_rate: finiteNonNegative(source.labour_rate),
      });
    }
  }
  const legacyLabourRate = finiteNonNegative(row.labour_rate);
  if (!workTypeRatesById.size && legacyLabourRate !== undefined) {
    const workTypeId = defaultWorkTypeId(subcategoryId);
    workTypeRatesById.set(workTypeId, {
      work_type_id: workTypeId,
      work_type_name: "Standard",
      labour_rate: legacyLabourRate,
    });
  }
  return {
    subcategory_id: subcategoryId,
    subcategory_name: String(row.subcategory_name || row.work_subcategory_name || "").trim() || undefined,
    work_type_rates: Array.from(workTypeRatesById.values()),
    unit_id: String(row.unit_id || "").trim() || undefined,
    crew_required: finiteNonNegative(row.crew_required),
    max_daily_capacity: finiteNonNegative(row.max_daily_capacity),
    preferred: row.preferred === true,
    status: row.status === "inactive" ? "inactive" : "active",
    notes: String(row.notes || "").trim() || undefined,
  };
}

export function canonicalContractorCapabilities(
  contractor: Pick<ContractorProfileRecord, "id" | "work_capabilities">,
  db?: Pick<RDashDatabase, "master">,
): ContractorCapability[] {
  const rows = Array.isArray(contractor.work_capabilities)
    ? contractor.work_capabilities as Array<Record<string, unknown>>
    : [];

  const bySubcategory = new Map<string, ContractorCapability>();
  for (const source of rows) {
    const normalized = normalizeCapability(source);
    if (!normalized) continue;
    const previous = bySubcategory.get(normalized.subcategory_id);
    const workTypeRatesById = new Map<string, ContractorWorkTypeRate>();
    for (const rate of [...(previous?.work_type_rates || []), ...(normalized.work_type_rates || [])]) {
      workTypeRatesById.set(rate.work_type_id, { ...workTypeRatesById.get(rate.work_type_id), ...rate });
    }
    const subcategory = db?.master.workSubcategories.find((row) => row.id === normalized.subcategory_id);
    const validWorkTypes = subcategory ? new Map(workTypesForSubcategory(subcategory).map((row) => [row.id, row])) : undefined;
    const workTypeRates = Array.from(workTypeRatesById.values()).flatMap((rate) => {
      const workType = validWorkTypes?.get(rate.work_type_id);
      if (validWorkTypes && !workType) return [];
      return [{
        ...rate,
        work_type_name: workType?.name || rate.work_type_name,
      }];
    });
    bySubcategory.set(normalized.subcategory_id, {
      ...previous,
      ...normalized,
      subcategory_name: subcategory?.name || normalized.subcategory_name || previous?.subcategory_name,
      unit_id: subcategory?.unit_id || normalized.unit_id || previous?.unit_id,
      work_type_rates: workTypeRates,
    });
  }
  return Array.from(bySubcategory.values());
}

export function contractorGovernanceCapabilityProjection(
  contractorId: string,
  capabilities: ContractorCapability[],
): Array<Record<string, unknown>> {
  return capabilities.map((capability) => ({
    id: `ccap-${contractorId}-${capability.subcategory_id}`,
    work_subcategory_id: capability.subcategory_id,
    work_subcategory_name: capability.subcategory_name,
    unit_id: capability.unit_id,
    work_type_rates: capability.work_type_rates,
    crew_required: capability.crew_required,
    max_daily_capacity: capability.max_daily_capacity,
    preferred: capability.preferred,
    status: capability.status || "active",
    notes: capability.notes,
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

export function contractorCapabilitiesFromGovernance(
  capabilities: Array<Record<string, unknown>>,
): ContractorCapability[] {
  return canonicalContractorCapabilities({
    work_capabilities: capabilities as unknown as ContractorCapability[],
  });
}

export function contractorProfileComplianceDocuments(
  record: ContractorProfileRecord,
): Array<Record<string, unknown>> {
  const existing = Array.isArray(record.compliance_documents)
    ? record.compliance_documents
    : [];
  const stableId = String(record.id || "draft");
  const specs: ContractorProfileDocumentSpec[] = [
    {
      kind: "gst_registration",
      label: "GST registration",
      documentNo: String(record.business_gst || "").trim() || undefined,
      mandatory: false,
    },
    {
      kind: "pan_card",
      label: "PAN card",
      documentNo: String(record.pan || "").trim() || undefined,
      mandatory: false,
    },
    {
      kind: "bank_proof",
      label: "Bank proof / cancelled cheque",
      documentNo: [record.bank_account, record.ifsc].filter(Boolean).join(" · ") || undefined,
      mandatory: false,
    },
    {
      kind: "labour_license",
      label: "Labour licence",
      documentNo: String(record.labour_registration_no || "").trim() || undefined,
      mandatory: false,
    },
    {
      kind: "insurance",
      label: "Insurance",
      expiryDate: String(record.insurance_expiry || "").trim() || undefined,
      mandatory: false,
    },
    {
      kind: "pf_registration",
      label: "PF registration",
      documentNo: String(record.pf_no || "").trim() || undefined,
      mandatory: false,
    },
    {
      kind: "esi_registration",
      label: "ESI registration",
      documentNo: String(record.esi_no || "").trim() || undefined,
      mandatory: false,
    },
  ];

  const profileKinds = new Set(specs.map((spec) => spec.kind));
  const retained = existing.filter((document) => {
    if (document.source !== PROFILE_DOCUMENT_SOURCE) return true;
    if (!profileKinds.has(String(document.kind || ""))) return true;
    const spec = specs.find((candidate) => candidate.kind === document.kind);
    return Boolean(spec?.documentNo || spec?.expiryDate || document.attachment_id || document.verified);
  });

  for (const spec of specs) {
    if (!spec.documentNo && !spec.expiryDate) continue;
    const manual = retained.find(
      (document) => document.kind === spec.kind && document.source !== PROFILE_DOCUMENT_SOURCE,
    );
    if (manual) continue;
    const currentIndex = retained.findIndex(
      (document) => document.kind === spec.kind && document.source === PROFILE_DOCUMENT_SOURCE,
    );
    const current = currentIndex >= 0 ? retained[currentIndex] : undefined;
    const evidenceChanged = Boolean(
      current &&
      (String(current.document_no || "") !== String(spec.documentNo || "") ||
        String(current.expiry_date || "") !== String(spec.expiryDate || "")),
    );
    const next = {
      ...current,
      id: current?.id || `pdoc-profile-${stableId}-${spec.kind}`,
      kind: spec.kind,
      label: spec.label,
      document_no: spec.documentNo,
      expiry_date: spec.expiryDate,
      mandatory: spec.mandatory,
      verified: evidenceChanged ? false : Boolean(current?.verified),
      verified_at: evidenceChanged ? undefined : current?.verified_at,
      verified_by: evidenceChanged ? undefined : current?.verified_by,
      source: PROFILE_DOCUMENT_SOURCE,
      notes: current?.notes || "Optional profile details recorded for reference.",
      created_at: current?.created_at || PROFILE_DOCUMENT_TIMESTAMP,
      updated_at: evidenceChanged ? PROFILE_DOCUMENT_TIMESTAMP : current?.updated_at || PROFILE_DOCUMENT_TIMESTAMP,
    };
    if (currentIndex >= 0) retained[currentIndex] = next;
    else retained.push(next);
  }

  return retained;
}

export function contractorMasterRecordForCreate(
  input: ContractorProfileRecord,
  id: string,
): ContractorProfileRecord {
  const canonicalInput = canonicalContractorInput(input);
  return {
    ...canonicalInput,
    id,
    name: String(input.name || "New contractor"),
    active_jobs: Number.isFinite(Number(input.active_jobs)) ? Number(input.active_jobs) : 0,
    outstanding: Number.isFinite(Number(input.outstanding)) ? Number(input.outstanding) : 0,
    past_jobs_count: Number.isFinite(Number(input.past_jobs_count)) ? Number(input.past_jobs_count) : 0,
    specializations: Array.isArray(input.specializations) ? input.specializations : [],
    work_capabilities: Array.isArray(input.work_capabilities) ? input.work_capabilities : [],
    categories: Array.isArray(input.categories) ? input.categories : [],
    compliance_documents: Array.isArray(input.compliance_documents) ? input.compliance_documents : [],
    status: input.status || "onboarding",
  };
}

export function derivedContractorCategoryNames(
  db: Pick<RDashDatabase, "master">,
  capabilities: ContractorCapability[],
): string[] {
  const categoryIds = new Set<string>();
  for (const capability of capabilities) {
    const subcategory = db.master.workSubcategories.find((row) => row.id === capability.subcategory_id);
    if (subcategory?.category_id) categoryIds.add(subcategory.category_id);
  }
  return db.master.workCategories
    .filter((category) => categoryIds.has(category.id))
    .map((category) => category.name);
}

export function contractorRateProjection(
  db: Pick<RDashDatabase, "master">,
  contractor: Pick<ContractorProfileRecord, "id" | "name" | "work_capabilities">,
): RDashDatabase["master"]["contractorRates"] {
  if (!contractor.id) return db.master.contractorRates || [];
  const existing = db.master.contractorRates || [];
  const otherContractors = existing.filter((rate) => rate.contractor_id !== contractor.id);
  const capabilities = canonicalContractorCapabilities(contractor, db);
  const projected = capabilities.flatMap((capability) => {
    const subcategory = db.master.workSubcategories.find((row) => row.id === capability.subcategory_id);
    const workTypes = new Map((subcategory ? workTypesForSubcategory(subcategory) : []).map((row) => [row.id, row]));
    return (capability.work_type_rates || []).flatMap((workTypeRate) => {
      if (workTypeRate.labour_rate === undefined) return [];
      const workType = workTypes.get(workTypeRate.work_type_id);
      if (subcategory && !workType) return [];
      const previous = existing.find(
        (rate) => rate.contractor_id === contractor.id
          && rate.work_subcategory_id === capability.subcategory_id
          && rate.work_type_id === workTypeRate.work_type_id,
      );
      const workTypeName = workType?.name || workTypeRate.work_type_name || "Standard";
      return [{
        id: previous?.id || `crate-${contractor.id}-${capability.subcategory_id}-${workTypeRate.work_type_id}`,
        contractor_id: contractor.id!,
        trade: `${capability.subcategory_name || previous?.work_subcategory_name || "Contractor rate"} · ${workTypeName}`,
        rate: workTypeRate.labour_rate,
        unit_id: workType?.unit_id || capability.unit_id || subcategory?.unit_id || previous?.unit_id,
        work_subcategory_id: capability.subcategory_id,
        work_subcategory_name: capability.subcategory_name || previous?.work_subcategory_name,
        work_type_id: workTypeRate.work_type_id,
        work_type_name: workTypeName,
        labour_rate: workTypeRate.labour_rate,
      }];
    });
  });
  return [...projected, ...otherContractors];
}

export function contractorDuplicateConflicts(
  db: Pick<RDashDatabase, "master">,
  candidate: ContractorProfileRecord,
  excludeId?: string,
): ContractorDuplicateConflict[] {
  const result: ContractorDuplicateConflict[] = [];
  const candidateGst = upperId(candidate.business_gst);
  const candidatePan = upperId(candidate.pan);
  const candidatePhone = mobile(candidate.phone || candidate.whatsapp);
  const candidateBank = bankDigits(candidate.bank_account);
  const candidateName = normalizedName(candidate.legal_name || candidate.name);
  const candidateCity = String(candidate.city || "").trim().toLowerCase();

  for (const row of db.master.contractors as ContractorProfileRecord[]) {
    if (!row.id || row.id === excludeId || row.duplicate_of_id) continue;
    const hardReasons: string[] = [];
    if (candidateGst && candidateGst === upperId(row.business_gst)) hardReasons.push("same GSTIN");
    if (candidatePan && candidatePan === upperId(row.pan)) hardReasons.push("same PAN");
    if (candidatePhone && candidatePhone === mobile(row.phone || row.whatsapp)) hardReasons.push("same phone");
    if (candidateBank && candidateBank === bankDigits(row.bank_account)) hardReasons.push("same bank account");
    if (hardReasons.length) {
      result.push({ id: row.id, name: String(row.name || row.id), reasons: hardReasons, hard: true });
      continue;
    }
    const rowName = normalizedName(row.legal_name || row.name);
    const rowCity = String(row.city || "").trim().toLowerCase();
    if (candidateName && candidateName === rowName && candidateCity && candidateCity === rowCity) {
      result.push({
        id: row.id,
        name: String(row.name || row.id),
        reasons: ["same normalized name and city"],
        hard: false,
      });
    }
  }
  return result;
}

export function contractorProfileValidationError(
  candidate: ContractorProfileRecord,
  options: { isCreate?: boolean; activating?: boolean } = {},
): string | null {
  if (!String(candidate.name || "").trim()) return "Contractor name is required.";
  const phone = mobile(candidate.phone);
  if (candidate.phone && !/^[6-9]\d{9}$/.test(phone)) return "Enter a valid 10-digit Indian contractor mobile number.";
  const whatsapp = mobile(candidate.whatsapp);
  if (candidate.whatsapp && !/^[6-9]\d{9}$/.test(whatsapp)) return "Enter a valid WhatsApp number.";
  const alternatePhone = mobile(candidate.alternate_phone);
  if (candidate.alternate_phone && !/^[6-9]\d{9}$/.test(alternatePhone)) return "Enter a valid alternate phone number.";
  const supervisorPhone = mobile(candidate.supervisor_phone);
  if (candidate.supervisor_phone && !/^[6-9]\d{9}$/.test(supervisorPhone)) return "Enter a valid supervisor phone number.";
  if (candidate.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(candidate.email).trim())) return "Enter a valid contractor email address.";
  if (candidate.business_gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(upperId(candidate.business_gst))) return "Enter a valid 15-character GSTIN.";
  if (candidate.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(upperId(candidate.pan))) return "Enter a valid PAN.";
  if (candidate.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(upperId(candidate.ifsc))) return "Enter a valid IFSC code.";

  for (const value of [candidate.available_workers, candidate.concurrent_site_limit, candidate.service_radius_km]) {
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return "Contractor capacity values must be valid non-negative numbers.";
    }
  }
  for (const capability of candidate.work_capabilities || []) {
    const rateValues = (capability.work_type_rates || []).map((rate) => rate.labour_rate);
    for (const value of rateValues) {
      if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        return "Contractor rates must be valid non-negative numbers.";
      }
    }
  }

  const requiresOperationalMinimum = options.isCreate || options.activating;
  if (requiresOperationalMinimum) {
    if (!phone) return "Mobile number is required for a new or newly activated contractor.";
    if (!String(candidate.city || "").trim()) return "City is required for a new or newly activated contractor.";
    if (!(candidate.work_capabilities || []).length) return "Select at least one work capability for the contractor.";
  }
  return null;
}

export function normalizeContractorForWrite(
  input: ContractorProfileRecord,
  db: Pick<RDashDatabase, "master">,
  options: { id?: string; capabilitiesOverride?: ContractorCapability[] } = {},
): ContractorProfileRecord {
  const id = options.id || input.id;
  const capabilities = options.capabilitiesOverride || canonicalContractorCapabilities(input, db);
  const sourcePartner = input.source_partner_id
    ? db.master.sourcePartners.find((row) => row.id === input.source_partner_id)
    : undefined;
  if (input.source_partner_id && !sourcePartner) {
    throw new Error("Choose a valid Source Partner for the contractor referral.");
  }
  const normalized: ContractorProfileRecord = {
    ...canonicalContractorInput(input),
    id,
    name: String(input.name || "").trim(),
    legal_name: String(input.legal_name || "").trim() || undefined,
    phone: mobile(input.phone) || undefined,
    whatsapp: mobile(input.whatsapp) || undefined,
    alternate_phone: mobile(input.alternate_phone) || undefined,
    email: String(input.email || "").trim().toLowerCase() || undefined,
    city: String(input.city || "").trim() || undefined,
    locality: String(input.locality || "").trim() || undefined,
    address: String(input.address || "").trim() || undefined,
    source_partner_id: sourcePartner?.id,
    source_partner_name: sourcePartner?.name,
    business_gst: upperId(input.business_gst) || undefined,
    pan: upperId(input.pan) || undefined,
    bank_account: bankDigits(input.bank_account) || undefined,
    ifsc: upperId(input.ifsc) || undefined,
    supervisor_name: String(input.supervisor_name || "").trim() || undefined,
    supervisor_phone: mobile(input.supervisor_phone) || undefined,
    available_workers: finiteNonNegative(input.available_workers),
    concurrent_site_limit: finiteNonNegative(input.concurrent_site_limit),
    service_radius_km: finiteNonNegative(input.service_radius_km),
    earliest_mobilisation_date: String(input.earliest_mobilisation_date || "").trim() || undefined,
    labour_registration_no: String(input.labour_registration_no || "").trim() || undefined,
    insurance_expiry: String(input.insurance_expiry || "").trim() || undefined,
    pf_no: String(input.pf_no || "").trim() || undefined,
    esi_no: String(input.esi_no || "").trim() || undefined,
    notes: String(input.notes || "").trim() || undefined,
    status: input.status || "onboarding",
    work_capabilities: capabilities,
    categories: derivedContractorCategoryNames(db, capabilities),
  };
  normalized.compliance_documents = contractorProfileComplianceDocuments(normalized);
  normalized.bank_verified = verifiedContractorBankProof(normalized);
  return normalized;
}

export function contractorFormProjection(record: ContractorProfileRecord): ContractorProfileRecord {
  const keys = [
    "name", "legal_name", "phone", "whatsapp", "alternate_phone", "email",
    "city", "locality", "address", "latitude", "longitude",
    "source_partner_id", "source_partner_name", "photo_attachment_id", "business_card_attachment_id",
    "reliability_rating", "politeness_rating", "worker_count_range", "deadline_commitment",
    "business_gst", "pan", "bank_account", "ifsc", "status", "work_capabilities",
    "supervisor_name", "supervisor_phone", "available_workers", "concurrent_site_limit",
    "earliest_mobilisation_date", "service_radius_km", "labour_registration_no",
    "insurance_expiry", "pf_no", "esi_no", "notes",
  ] as const;
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as ContractorProfileRecord;
}

export function verifiedContractorBankProof(record: ContractorProfileRecord): boolean {
  return (record.compliance_documents || []).some(
    (document) => document.kind === "bank_proof" && document.verified === true,
  );
}
