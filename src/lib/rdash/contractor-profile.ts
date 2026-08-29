import type { RDashDatabase } from "./types";
import { workTypesForSubcategory } from "./work-types";

export type ContractorLifecycleStatus = "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";

export type ContractorWorkTypeRate = {
  work_type_id: string;
  work_type_name?: string;
  unit_id?: string;
  material_rate?: number;
  labour_rate?: number;
  notes?: string;
};

export type ContractorCapability = {
  subcategory_id: string;
  subcategory_name?: string;
  work_type_rates?: ContractorWorkTypeRate[];
};

export type ContractorProfileRecord = {
  id?: string;
  name?: string;
  legal_name?: string;
  phone?: string;
  city?: string;
  locality?: string;
  address?: string;
  trade?: string;
  rating?: number;
  active_jobs?: number;
  outstanding?: number;
  reliability_score?: number;
  on_time_pct?: number;
  past_jobs_count?: number;
  specializations?: string[];
  latitude?: number;
  longitude?: number;
  photo_attachment_id?: string;
  business_card_attachment_id?: string;
  reliability_rating?: string;
  politeness_rating?: string;
  worker_count_range?: string;
  deadline_commitment?: string;
  source_partner_id?: string;
  source_partner_name?: string;
  status?: ContractorLifecycleStatus | string;
  categories?: string[];
  work_capabilities?: ContractorCapability[];
  available_workers?: number;
  service_radius_km?: number;
  notes?: string;
  compliance_documents?: Array<Record<string, unknown>>;
  duplicate_of_id?: string;
  duplicate_resolved_at?: string;
  duplicate_resolution_note?: string;
  performance_recomputed_at?: string;
};

export type ContractorDuplicateConflict = { id: string; name: string; reasons: string[]; hard: boolean };

const CONTRACTOR_PROFILE_KEYS = new Set<keyof ContractorProfileRecord>([
  "id", "name", "legal_name", "phone", "city", "locality", "address",
  "trade", "rating", "active_jobs", "outstanding", "reliability_score", "on_time_pct", "past_jobs_count", "specializations",
  "latitude", "longitude", "photo_attachment_id", "business_card_attachment_id", "reliability_rating", "politeness_rating",
  "worker_count_range", "deadline_commitment", "source_partner_id", "source_partner_name", "status", "categories",
  "work_capabilities", "available_workers", "service_radius_km", "notes", "compliance_documents", "duplicate_of_id",
  "duplicate_resolved_at", "duplicate_resolution_note", "performance_recomputed_at",
]);

function canonicalContractorInput(input: ContractorProfileRecord): ContractorProfileRecord {
  return Object.fromEntries(Object.entries(input).filter(([key]) => CONTRACTOR_PROFILE_KEYS.has(key as keyof ContractorProfileRecord)));
}

const digits = (value?: string) => String(value || "").replace(/\D/g, "");
const mobile = (value?: string) => {
  const valueDigits = digits(value);
  return valueDigits.length > 10 ? valueDigits.slice(-10) : valueDigits;
};
const normalizedName = (value?: string) => String(value || "").toLowerCase()
  .replace(/\b(pvt|private|ltd|limited|llp|company|co|enterprises|enterprise|traders|trading|contractor|contractors)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const finiteNonNegative = (value: unknown): number | undefined => {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
};

function normalizeCapability(row: ContractorCapability): ContractorCapability | null {
  const subcategoryId = String(row.subcategory_id || "").trim();
  if (!subcategoryId) return null;
  const rates = new Map<string, ContractorWorkTypeRate>();
  for (const source of Array.isArray(row.work_type_rates) ? row.work_type_rates : []) {
    const workTypeId = String(source.work_type_id || "").trim();
    const workTypeName = String(source.work_type_name || "").trim();
    if (!workTypeId || !workTypeName) continue;
    rates.set(workTypeId, {
      work_type_id: workTypeId,
      work_type_name: workTypeName,
      unit_id: String(source.unit_id || "").trim() || undefined,
      material_rate: finiteNonNegative(source.material_rate),
      labour_rate: finiteNonNegative(source.labour_rate),
      notes: String(source.notes || "").trim() || undefined,
    });
  }
  return {
    subcategory_id: subcategoryId,
    subcategory_name: String(row.subcategory_name || "").trim() || undefined,
    work_type_rates: Array.from(rates.values()),
  };
}

export function canonicalContractorCapabilities(
  contractor: Pick<ContractorProfileRecord, "work_capabilities"> & { id?: string },
  db?: Pick<RDashDatabase, "master">,
): ContractorCapability[] {
  const merged = new Map<string, ContractorCapability>();
  for (const source of Array.isArray(contractor.work_capabilities) ? contractor.work_capabilities : []) {
    const normalized = normalizeCapability(source);
    if (!normalized) continue;
    const previous = merged.get(normalized.subcategory_id);
    const rates = new Map<string, ContractorWorkTypeRate>();
    for (const rate of [...(previous?.work_type_rates || []), ...(normalized.work_type_rates || [])]) rates.set(rate.work_type_id, rate);
    const subcategory = db?.master.workSubcategories.find((row) => row.id === normalized.subcategory_id);
    const catalog = new Map((subcategory ? workTypesForSubcategory(subcategory) : []).map((row) => [row.id, row]));
    merged.set(normalized.subcategory_id, {
      subcategory_id: normalized.subcategory_id,
      subcategory_name: subcategory?.name || normalized.subcategory_name || previous?.subcategory_name,
      work_type_rates: Array.from(rates.values()).map((rate) => ({
        ...rate,
        work_type_name: rate.work_type_name || catalog.get(rate.work_type_id)?.name,
        unit_id: rate.unit_id || catalog.get(rate.work_type_id)?.unit_id || subcategory?.unit_id,
      })),
    });
  }
  return Array.from(merged.values());
}

export function contractorGovernanceCapabilityProjection(contractorId: string, capabilities: ContractorCapability[]): Array<Record<string, unknown>> {
  return capabilities.map((capability) => ({
    id: `ccap-${contractorId}-${capability.subcategory_id}`,
    work_subcategory_id: capability.subcategory_id,
    work_subcategory_name: capability.subcategory_name,
    work_type_rates: capability.work_type_rates,
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

export function contractorMasterRecordForCreate(input: ContractorProfileRecord, id: string): ContractorProfileRecord {
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
    compliance_documents: Array.isArray(input.compliance_documents)
      ? input.compliance_documents.filter((document) => document.source !== "contractor_profile")
      : [],
    status: input.status || "onboarding",
  };
}

export function derivedContractorCategoryNames(db: Pick<RDashDatabase, "master">, capabilities: ContractorCapability[]): string[] {
  const categoryIds = new Set(capabilities.map((capability) => db.master.workSubcategories.find((row) => row.id === capability.subcategory_id)?.category_id).filter(Boolean));
  return db.master.workCategories.filter((category) => categoryIds.has(category.id)).map((category) => category.name);
}

export function contractorRateProjection(
  db: Pick<RDashDatabase, "master">,
  contractor: Pick<ContractorProfileRecord, "id" | "name" | "work_capabilities">,
): RDashDatabase["master"]["contractorRates"] {
  if (!contractor.id) return db.master.contractorRates || [];
  const contractorId = contractor.id;
  const existing = db.master.contractorRates || [];
  const otherContractors = existing.filter((rate) => rate.contractor_id !== contractorId);
  const projected = canonicalContractorCapabilities(contractor, db).flatMap((capability) => {
    const subcategory = db.master.workSubcategories.find((row) => row.id === capability.subcategory_id);
    const catalog = new Map((subcategory ? workTypesForSubcategory(subcategory) : []).map((row) => [row.id, row]));
    return (capability.work_type_rates || []).flatMap((workTypeRate) => {
      if (workTypeRate.material_rate === undefined && workTypeRate.labour_rate === undefined) return [];
      const previous = existing.find((rate) => rate.contractor_id === contractorId
        && rate.work_subcategory_id === capability.subcategory_id && rate.work_type_id === workTypeRate.work_type_id);
      const catalogRow = catalog.get(workTypeRate.work_type_id);
      const workTypeName = workTypeRate.work_type_name || catalogRow?.name || "Work type";
      const materialRate = workTypeRate.material_rate;
      const labourRate = workTypeRate.labour_rate;
      return [{
        id: previous?.id || `crate-${contractorId}-${capability.subcategory_id}-${workTypeRate.work_type_id}`,
        contractor_id: contractorId,
        trade: `${capability.subcategory_name || previous?.work_subcategory_name || "Contractor rate"} · ${workTypeName}`,
        rate: (materialRate || 0) + (labourRate || 0),
        unit_id: workTypeRate.unit_id || catalogRow?.unit_id || subcategory?.unit_id || previous?.unit_id,
        work_subcategory_id: capability.subcategory_id,
        work_subcategory_name: capability.subcategory_name || subcategory?.name || previous?.work_subcategory_name,
        work_type_id: workTypeRate.work_type_id,
        work_type_name: workTypeName,
        material_rate: materialRate,
        labour_rate: labourRate,
        notes: workTypeRate.notes,
      }];
    });
  });
  return [...projected, ...otherContractors];
}

export function contractorWorkTypeAverages(
  rates: RDashDatabase["master"]["contractorRates"],
  subcategoryId: string,
  workTypeId: string,
  excludeContractorId?: string,
) {
  const rows = rates.filter((row) => row.work_subcategory_id === subcategoryId
    && row.work_type_id === workTypeId && row.contractor_id !== excludeContractorId);
  const average = (key: "material_rate" | "labour_rate") => {
    const values = rows.map((row) => row[key]).filter((value): value is number => Number.isFinite(value));
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : undefined;
  };
  const materialRate = average("material_rate");
  const labourRate = average("labour_rate");
  return {
    material_rate: materialRate,
    labour_rate: labourRate,
    total_rate: materialRate === undefined && labourRate === undefined ? undefined : (materialRate || 0) + (labourRate || 0),
    contractor_count: new Set(rows.map((row) => row.contractor_id)).size,
  };
}

export function contractorDuplicateConflicts(
  db: Pick<RDashDatabase, "master">,
  candidate: ContractorProfileRecord,
  excludeId?: string,
): ContractorDuplicateConflict[] {
  const result: ContractorDuplicateConflict[] = [];
  const candidatePhone = mobile(candidate.phone);
  const candidateName = normalizedName(candidate.legal_name || candidate.name);
  const candidateCity = String(candidate.city || "").trim().toLowerCase();
  for (const row of db.master.contractors as ContractorProfileRecord[]) {
    if (!row.id || row.id === excludeId || row.duplicate_of_id) continue;
    if (candidatePhone && candidatePhone === mobile(row.phone)) {
      result.push({ id: row.id, name: String(row.name || row.id), reasons: ["same phone"], hard: true });
      continue;
    }
    if (candidateName && candidateName === normalizedName(row.legal_name || row.name)
      && candidateCity && candidateCity === String(row.city || "").trim().toLowerCase()) {
      result.push({ id: row.id, name: String(row.name || row.id), reasons: ["same normalized name and city"], hard: false });
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
  for (const value of [candidate.available_workers, candidate.service_radius_km]) {
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) return "Contractor capacity values must be valid non-negative numbers.";
  }
  for (const capability of candidate.work_capabilities || []) {
    for (const rate of capability.work_type_rates || []) {
      if (!String(rate.work_type_name || "").trim()) return "Every contractor rate row requires a work type.";
      if (!String(rate.unit_id || "").trim()) return "Every contractor rate row requires an execution unit.";
      for (const value of [rate.material_rate, rate.labour_rate]) {
        if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) return "Contractor rates must be valid non-negative numbers.";
      }
    }
  }
  if (options.isCreate || options.activating) {
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
  const sourcePartner = input.source_partner_id ? db.master.sourcePartners.find((row) => row.id === input.source_partner_id) : undefined;
  if (input.source_partner_id && !sourcePartner) throw new Error("Choose a valid Source Partner for the contractor referral.");
  return {
    ...canonicalContractorInput(input),
    id,
    name: String(input.name || "").trim(),
    legal_name: String(input.legal_name || "").trim() || undefined,
    phone: mobile(input.phone) || undefined,
    city: String(input.city || "").trim() || undefined,
    locality: String(input.locality || "").trim() || undefined,
    address: String(input.address || "").trim() || undefined,
    source_partner_id: sourcePartner?.id,
    source_partner_name: sourcePartner?.name,
    available_workers: finiteNonNegative(input.available_workers),
    service_radius_km: finiteNonNegative(input.service_radius_km),
    notes: String(input.notes || "").trim() || undefined,
    status: input.status || "onboarding",
    work_capabilities: capabilities,
    categories: derivedContractorCategoryNames(db, capabilities),
    compliance_documents: (input.compliance_documents || []).filter((document) => document.source !== "contractor_profile"),
  };
}

export function contractorFormProjection(record: ContractorProfileRecord): ContractorProfileRecord {
  const keys: Array<keyof ContractorProfileRecord> = [
    "name", "legal_name", "phone", "city", "locality", "address", "latitude", "longitude",
    "source_partner_id", "source_partner_name", "photo_attachment_id", "business_card_attachment_id", "reliability_rating",
    "politeness_rating", "worker_count_range", "deadline_commitment", "status", "work_capabilities", "available_workers",
    "service_radius_km", "notes",
  ];
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}
