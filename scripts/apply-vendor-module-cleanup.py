from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact marker, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex marker: {pattern[:120]!r}")
    write(path, updated)


write(
    "src/lib/rdash/partner-form-consistency.ts",
    '''const NON_FORM_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "outstanding",
  "reliability_score",
  "on_time_pct",
  "active_jobs",
  "past_jobs_count",
  "performance_recomputed_at",
  "status",
  "category",
  "trade",
  "rating",
  "specializations",
]);

function stableValue(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    const normalized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !NON_FORM_KEYS.has(key))
        .map(([key, entry]) => [key, stableValue(entry)] as const)
        .filter(([, entry]) => entry !== null)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    return Object.keys(normalized).length ? normalized : null;
  }
  return value;
}

export function partnerFormFingerprint(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function partnerChangedPatch<T extends Record<string, unknown>>(
  before: T,
  after: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) =>
        partnerFormFingerprint(before[key]) !== partnerFormFingerprint(value),
    ),
  ) as Partial<T>;
}

function normalizedVendorName(value: unknown): string {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedPhone(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizedTaxId(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function vendorDuplicateError(
  vendors: Array<Record<string, unknown>>,
  candidate: Record<string, unknown>,
  excludeId?: string,
): string | null {
  const candidateName = normalizedVendorName(candidate.name);
  const candidatePhone = normalizedPhone(candidate.phone);
  const candidateGstin = normalizedTaxId(candidate.gstin);
  const candidatePan = normalizedTaxId(candidate.pan);

  for (const vendor of vendors) {
    if (String(vendor.id || "") === String(excludeId || "")) continue;
    if (candidateGstin && normalizedTaxId(vendor.gstin) === candidateGstin) {
      return "Another Vendor already uses this GSTIN.";
    }
    if (candidatePan && normalizedTaxId(vendor.pan) === candidatePan) {
      return "Another Vendor already uses this PAN.";
    }
    if (candidatePhone && normalizedPhone(vendor.phone) === candidatePhone) {
      return "Another Vendor already uses this contact number.";
    }
    if (candidateName && normalizedVendorName(vendor.name) === candidateName) {
      return "A Vendor with the same firm name already exists.";
    }
  }
  return null;
}

export function contractorCapabilityRateError(
  capabilities: unknown,
): string | null {
  if (!Array.isArray(capabilities)) return null;
  for (const capability of capabilities) {
    if (!capability || typeof capability !== "object") continue;
    const row = capability as Record<string, unknown>;
    for (const field of ["labour_rate", "with_material_rate"] as const) {
      const value = row[field];
      if (value === undefined || value === null || value === "") continue;
      if (!Number.isFinite(Number(value)) || Number(value) < 0) {
        return "Contractor rates must be valid non-negative numbers.";
      }
    }
  }
  return null;
}

export function optionalIndianMobileError(value: string): string | null {
  if (!value) return null;
  return /^[6-9]\d{9}$/.test(value)
    ? null
    : "Enter a valid 10-digit Indian mobile number.";
}

export function optionalGstinError(value: string): string | null {
  if (!value) return null;
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(value)
    ? null
    : "Enter a valid 15-character GSTIN.";
}

export function optionalPanError(value: string): string | null {
  if (!value) return null;
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(value)
    ? null
    : "Enter a valid PAN.";
}

export function optionalIfscError(value: string): string | null {
  if (!value) return null;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value)
    ? null
    : "Enter a valid IFSC code.";
}

export function fieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ field: string; before: unknown; after: unknown }> {
  return Object.entries(partnerChangedPatch(before, after)).map(
    ([field, value]) => ({ field, before: before[field], after: value }),
  );
}
''',
)

write(
    "src/lib/rdash/partner-form-store-bridge.ts",
    '''import { useRDashStore } from "./store";
import {
  contractorCapabilityRateError,
  fieldChanges,
} from "./partner-form-consistency";

type PartnerType = "vendor" | "contractor";

const activeScopes = new Map<string, number>();
const activeCreateTypes = new Map<PartnerType, number>();
let consumers = 0;
let uninstallCurrent: (() => void) | null = null;

const scopeKey = (type: PartnerType, id: string) => `${type}:${id}`;
const isActiveScope = (type: PartnerType, id: string) =>
  activeScopes.has(scopeKey(type, id));
const isActiveCreate = (type: PartnerType) =>
  (activeCreateTypes.get(type) || 0) > 0;

function withSuppressedGenericAudit<T>(run: () => T): T {
  const originalLogAudit = useRDashStore.getState().logAudit;
  const suppressed = () => undefined;
  useRDashStore.setState({ logAudit: suppressed as never });
  try {
    return run();
  } finally {
    if (useRDashStore.getState().logAudit === suppressed) {
      useRDashStore.setState({ logAudit: originalLogAudit });
    }
  }
}

function detailedAudit(
  entityType: PartnerType,
  id: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  const changes = fieldChanges(before, after);
  if (!changes.length) return;
  const state = useRDashStore.getState();
  const actor = state.currentUser();
  state.logAudit({
    actor: actor.name,
    actor_role: actor.role,
    action: `Updated ${entityType} ${String(after.name || id)}`,
    entity_type: entityType,
    entity_id: id,
    entity_label: String(after.name || before.name || id),
    kind: "update",
    reason: `Changed fields: ${changes.map((change) => change.field).join(", ")}`,
    before,
    after,
    changes: changes.map((change) => ({
      id: `${entityType}-${id}-${change.field}`,
      field: change.field,
      before: change.before,
      after: change.after,
    })),
  });
}

function install(): () => void {
  const initial = useRDashStore.getState();
  const originalAddContractor = initial.addContractor;
  const originalUpdateVendor = initial.updateVendor;
  const originalUpdateContractor = initial.updateContractor;

  const addContractor = (input: Record<string, unknown>) => {
    if (isActiveCreate("contractor")) {
      const error = contractorCapabilityRateError(input.work_capabilities);
      if (error) throw new Error(error);
    }
    return originalAddContractor(input as never);
  };

  const updateVendor = (id: string, patch: Record<string, unknown>) => {
    if (!isActiveScope("vendor", id)) {
      return originalUpdateVendor(id, patch as never);
    }
    const before = useRDashStore
      .getState()
      .db.master.vendors.find((row) => row.id === id) as
      | Record<string, unknown>
      | undefined;
    if (!before) return originalUpdateVendor(id, patch as never);
    const after = { ...before, ...patch };
    if (!fieldChanges(before, after).length) return;
    withSuppressedGenericAudit(() => originalUpdateVendor(id, patch as never));
    detailedAudit("vendor", id, before, after);
  };

  const updateContractor = (
    id: string,
    patch: Record<string, unknown>,
  ) => {
    if (!isActiveScope("contractor", id)) {
      return originalUpdateContractor(id, patch as never);
    }
    const before = useRDashStore
      .getState()
      .db.master.contractors.find((row) => row.id === id) as
      | Record<string, unknown>
      | undefined;
    if (!before) return originalUpdateContractor(id, patch as never);
    const after = { ...before, ...patch };
    const error = contractorCapabilityRateError(after.work_capabilities);
    if (error) throw new Error(error);
    if (!fieldChanges(before, after).length) return;
    withSuppressedGenericAudit(() =>
      originalUpdateContractor(id, patch as never),
    );
    detailedAudit("contractor", id, before, after);
  };

  useRDashStore.setState({
    addContractor: addContractor as never,
    updateVendor: updateVendor as never,
    updateContractor: updateContractor as never,
  });

  return () => {
    const current = useRDashStore.getState();
    useRDashStore.setState({
      addContractor:
        current.addContractor === addContractor
          ? originalAddContractor
          : current.addContractor,
      updateVendor:
        current.updateVendor === updateVendor
          ? originalUpdateVendor
          : current.updateVendor,
      updateContractor:
        current.updateContractor === updateContractor
          ? originalUpdateContractor
          : current.updateContractor,
    });
  };
}

export function retainPartnerFormStoreBridge(
  type: PartnerType,
  editId?: string,
): () => void {
  consumers += 1;
  if (editId) {
    const key = scopeKey(type, editId);
    activeScopes.set(key, (activeScopes.get(key) || 0) + 1);
  } else {
    activeCreateTypes.set(type, (activeCreateTypes.get(type) || 0) + 1);
  }
  if (consumers === 1) uninstallCurrent = install();

  return () => {
    if (editId) {
      const key = scopeKey(type, editId);
      const next = (activeScopes.get(key) || 1) - 1;
      if (next <= 0) activeScopes.delete(key);
      else activeScopes.set(key, next);
    } else {
      const next = (activeCreateTypes.get(type) || 1) - 1;
      if (next <= 0) activeCreateTypes.delete(type);
      else activeCreateTypes.set(type, next);
    }
    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) {
      uninstallCurrent?.();
      uninstallCurrent = null;
      activeScopes.clear();
      activeCreateTypes.clear();
    }
  };
}
''',
)

# Canonical Vendor and Contractor capability types.
regex_once(
    "src/lib/rdash/types.ts",
    r'export interface Vendor \{.*?\n\}\nexport interface Contractor \{',
    '''export type VendorStatus = "onboarding" | "active" | "on_hold" | "blocked" | "inactive";
export interface Vendor {
    id: ID;
    name: string;
    legal_name?: string;
    phone?: string;
    whatsapp?: string;
    alternate_phone?: string;
    email?: string;
    city?: string;
    locality?: string;
    address?: string;
    category?: string;
    article_ids?: ID[];
    status?: VendorStatus;
    outstanding?: number;
    reliability_score?: number;
    on_time_pct?: number;
    latitude?: number;
    longitude?: number;
    business_card_attachment_id?: ID;
    shop_attachment_id?: ID;
    reliability_rating?: "good" | "very_good" | "average" | "bad";
    delivery_time_rating?: "good" | "very_good" | "average" | "bad";
    return_policy?: "available" | "not_available";
    notes?: string;
    source_partner_id?: ID;
    source_partner_name?: string;
    gstin?: string;
    pan?: string;
    bank_account?: string;
    ifsc?: string;
    payment_terms?: string;
    credit_days?: number;
    credit_limit?: number;
    minimum_order_value?: number;
    standard_lead_time_days?: number;
    warranty_terms?: string;
    udyam_no?: string;
    verified_bank?: boolean;
    service_regions?: string[];
}
export interface Contractor {''',
)
replace_once(
    "src/lib/rdash/types.ts",
    '''        labour_rate?: number;
        with_material_rate?: number;
    }>;''',
    '''        labour_rate?: number;
        with_material_rate?: number;
        article_ids?: ID[];
    }>;''',
)

# Unified Vendor form: no legacy parsing, category selector, duplicate guard, atomic create.
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''  legacyVendorArticleNames,
  optionalGstinError,''',
    '''  optionalGstinError,''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''  partnerChangedPatch,
  partnerFormFingerprint,
  vendorNotesWithoutLegacyArticles,
} from "@/lib/rdash/partner-form-consistency";''',
    '''  partnerChangedPatch,
  vendorDuplicateError,
} from "@/lib/rdash/partner-form-consistency";''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''  const [vendorNotes, setVendorNotes] = React.useState("");
  const [vendorArticleIds, setVendorArticleIds] = React.useState<string[]>([]);''',
    '''  const [vendorNotes, setVendorNotes] = React.useState("");
  const [vendorCategory, setVendorCategory] = React.useState("");
  const [vendorArticleIds, setVendorArticleIds] = React.useState<string[]>([]);''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''  const baselineRef = React.useRef<Payload>({});
  const [baselineKey, setBaselineKey] = React.useState("");''',
    '''  const baselineRef = React.useRef<Payload>({});''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''        return_policy: vendorReturn,
        notes: vendorNotes.trim() || undefined,
        article_ids: [...vendorArticleIds],''',
    '''        return_policy: vendorReturn,
        category: vendorCategory.trim() || undefined,
        notes: vendorNotes.trim() || undefined,
        article_ids: [...vendorArticleIds],''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''    vendorArticleIds,
    vendorDelivery,
    vendorNotes,''',
    '''    vendorArticleIds,
    vendorCategory,
    vendorDelivery,
    vendorNotes,''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''        setVendorReturn(String(payload.return_policy || "available"));
        setVendorNotes(String(payload.notes || ""));
        setVendorArticleIds((payload.article_ids as string[]) || []);''',
    '''        setVendorReturn(String(payload.return_policy || "available"));
        setVendorCategory(String(payload.category || ""));
        setVendorNotes(String(payload.notes || ""));
        setVendorArticleIds((payload.article_ids as string[]) || []);''',
)
regex_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    r'''      if \(record\) \{\n        const structured = \(record as any\)\.article_ids as string\[\] \| undefined;\n        const legacy = legacyVendorArticleNames\(record\.notes\).*?\n        payload = \{\n          \.\.\.record,\n          notes: vendorNotesWithoutLegacyArticles\(record\.notes\) \|\| undefined,\n          article_ids: structured\?\.length \? structured : legacy,\n        \};\n      \} else \{''',
    '''      if (record) {
        payload = {
          ...record,
          article_ids: record.article_ids || [],
        };
      } else {''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''          delivery_time_rating: "average",
          return_policy: "available",
          article_ids: [],''',
    '''          delivery_time_rating: "average",
          return_policy: "available",
          category: "",
          article_ids: [],''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''    baselineRef.current = payload;
    setBaselineKey(partnerFormFingerprint(payload));
    setReferralOpen(false);''',
    '''    baselineRef.current = payload;
    setReferralOpen(false);''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''  const currentPayload = buildPayload();
  const dirty = open && partnerFormFingerprint(currentPayload) !== baselineKey;
  const validationError =
    (!String(currentPayload.name || "").trim() && "Name is required.") ||
    optionalIndianMobileError(String(currentPayload.phone || "")) ||
    coordinateInputError(coordinates) ||
    (type === "contractor"''',
    '''  const currentPayload = buildPayload();
  const currentPatch = partnerChangedPatch(baselineRef.current, currentPayload);
  const dirty = open && Object.keys(currentPatch).length > 0;
  const validationError =
    (!String(currentPayload.name || "").trim() && "Name is required.") ||
    optionalIndianMobileError(String(currentPayload.phone || "")) ||
    coordinateInputError(coordinates) ||
    (type === "vendor"
      ? vendorDuplicateError(
          db.master.vendors as unknown as Array<Record<string, unknown>>,
          currentPayload,
          editId,
        )
      : null) ||
    (type === "contractor"''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''    const patch = partnerChangedPatch(baselineRef.current, currentPayload);
    if (isEdit && Object.keys(patch).length === 0) return true;''',
    '''    const patch = currentPatch;
    if (isEdit && Object.keys(patch).length === 0) return true;''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''        else {
          id = addVendor({ ...(currentPayload as any), id: reservedId });
          updateVendor(id, { article_ids: currentPayload.article_ids } as any);
        }''',
    '''        else id = addVendor({ ...(currentPayload as any), id: reservedId });''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''      baselineRef.current = currentPayload;
      setBaselineKey(partnerFormFingerprint(currentPayload));
      dirtyFormRegistry.markClean(formId);''',
    '''      baselineRef.current = currentPayload;
      dirtyFormRegistry.markClean(formId);''',
)
replace_once(
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    '''            {type === "vendor" ? (
              <>
                <div className="grid grid-cols-2 gap-3">''',
    '''            {type === "vendor" ? (
              <>
                <select
                  value={vendorCategory}
                  onChange={(event) => setVendorCategory(event.target.value)}
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Vendor category</option>
                  <option value="General supplier">General supplier</option>
                  {allCategories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">''',
)

# Procurement persistence, duplicate protection, and article-aware RFQ selection.
replace_once(
    "src/lib/rdash/store/slices/procurement.ts",
    '''import { normalizeRoleKey, roleLabel } from "../../staff-operations";''',
    '''import { normalizeRoleKey, roleLabel } from "../../staff-operations";
import { vendorDuplicateError } from "../../partner-form-consistency";''',
)
regex_once(
    "src/lib/rdash/store/slices/procurement.ts",
    r'''        addVendor: \(v\) => \{.*?\n        \},\n        updateVendor: \(id, patch\) => \{.*?\n        \},\n        addStaff:''',
    '''        addVendor: (v) => {
            const duplicateError = vendorDuplicateError(
                get().db.master.vendors as unknown as Array<Record<string, unknown>>,
                v as Record<string, unknown>,
            );
            if (duplicateError)
                throw new Error(duplicateError);
            const id = v.id || genId("ven");
            const vendor: import("../../types").Vendor = {
                id,
                name: v.name || "New vendor",
                legal_name: v.legal_name,
                phone: v.phone,
                whatsapp: v.whatsapp,
                alternate_phone: v.alternate_phone,
                email: v.email,
                city: v.city,
                locality: v.locality,
                address: v.address,
                category: v.category,
                article_ids: v.article_ids || [],
                status: v.status || "active",
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
                gstin: v.gstin,
                pan: v.pan,
                bank_account: v.bank_account,
                ifsc: v.ifsc,
                payment_terms: v.payment_terms,
                credit_days: v.credit_days,
                credit_limit: v.credit_limit,
                minimum_order_value: v.minimum_order_value,
                standard_lead_time_days: v.standard_lead_time_days,
                warranty_terms: v.warranty_terms,
                udyam_no: v.udyam_no,
                verified_bank: v.verified_bank,
                service_regions: v.service_regions,
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
            const before = get().db.master.vendors.find((vendor) => vendor.id === id);
            if (!before)
                throw new Error("Vendor was not found.");
            const after = { ...before, ...patch };
            const duplicateError = vendorDuplicateError(
                get().db.master.vendors as unknown as Array<Record<string, unknown>>,
                after as Record<string, unknown>,
                id,
            );
            if (duplicateError)
                throw new Error(duplicateError);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        vendors: s.db.master.vendors.map((vendor: any) => vendor.id === id ? after : vendor),
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
        addStaff:''',
)
replace_once(
    "src/lib/rdash/store/slices/procurement.ts",
    '''            // E-1: Filter the vendor list to those who already have a vendorRate
            // covering at least one of the requested BOQ articles. Falls back to
            // ALL vendors when no vendorRates exist for any of the articles
            // (preserves the original "send to everyone" behaviour for fresh
            // matrices or new BOQ items).''',
    '''            // Prefer Vendors whose structured supplied-article links or Vendor
            // Rates cover at least one requested BOQ article. Falls back to all
            // candidates only when no structured coverage exists yet.''',
)
replace_once(
    "src/lib/rdash/store/slices/procurement.ts",
    '''            const vendorsWithRates = candidateVendorIds.filter((vendorId: string) => state.db.master.vendorRates.some((rate: any) => rate.vendor_id === vendorId &&
                (requestedScopeIds.has(rate.work_required_article_id) ||
                    requestedArticleIds.has(rate.article_id))));
            const eligibleVendorIds = vendorsWithRates.length > 0 ? vendorsWithRates : candidateVendorIds;''',
    '''            const vendorsWithCoverage = candidateVendorIds.filter((vendorId: string) => {
                const vendor = state.db.master.vendors.find((row: any) => row.id === vendorId);
                const suppliesRequestedArticle = vendor?.article_ids?.some((articleId: string) =>
                    requestedArticleIds.has(articleId));
                const hasMatchingRate = state.db.master.vendorRates.some((rate: any) =>
                    rate.vendor_id === vendorId &&
                    (requestedScopeIds.has(rate.work_required_article_id) ||
                        requestedArticleIds.has(rate.article_id)));
                return Boolean(suppliesRequestedArticle || hasMatchingRate);
            });
            const eligibleVendorIds = vendorsWithCoverage.length > 0 ? vendorsWithCoverage : candidateVendorIds;''',
)

# Vendor 360 search/display and safe Business Details workflow.
replace_once(
    "src/components/rdash/modules/Partner360Module.tsx",
    '''import { OperationalMediaPanel } from "../OperationalMediaPanel";''',
    '''import { OperationalMediaPanel } from "../OperationalMediaPanel";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import {
  partnerChangedPatch,
  vendorDuplicateError,
} from "@/lib/rdash/partner-form-consistency";
import { retainPartnerFormStoreBridge } from "@/lib/rdash/partner-form-store-bridge";''',
)
replace_once(
    "src/components/rdash/modules/Partner360Module.tsx",
    '''  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return partners;
    return partners.filter((partner) => [
      partner.name,
      partner.phone,
      partner.city,
      partner.locality,
      partner.category,
      partner.trade,
      partner.legal_name,
      partner.email,
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [partners, query]);''',
    '''  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return partners;
    return partners.filter((partner) => {
      const suppliedArticleNames = mode === "vendor"
        ? db.master.articles
            .filter((article) => partner.article_ids?.includes(article.id))
            .map((article) => article.name)
            .join(" ")
        : "";
      return [
        partner.name,
        partner.phone,
        partner.city,
        partner.locality,
        partner.category,
        partner.trade,
        partner.legal_name,
        partner.email,
        suppliedArticleNames,
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [db.master.articles, mode, partners, query]);''',
)
replace_once(
    "src/components/rdash/modules/Partner360Module.tsx",
    '''            <InfoCell label="Standard lead time" value={selected.standard_lead_time_days ? `${selected.standard_lead_time_days} days` : "—"} />
            <InfoCell label="Service regions" value={selected.service_regions?.join(", ")} />
          </div>''',
    '''            <InfoCell label="Standard lead time" value={selected.standard_lead_time_days ? `${selected.standard_lead_time_days} days` : "—"} />
            <InfoCell label="Service regions" value={selected.service_regions?.join(", ")} />
          </div>
          <div className="mt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Articles supplied</p>
            <div className="flex flex-wrap gap-1.5">
              {model.suppliedArticles.map((article: any) => (
                <span key={article.id} className="rounded-full border border-border bg-muted/30 px-2 py-1 text-[11px]">
                  {article.name}
                </span>
              ))}
              {!model.suppliedArticles.length && <span className="text-xs text-muted-foreground">No supplied articles selected.</span>}
            </div>
          </div>''',
)
replace_once(
    "src/components/rdash/modules/Partner360Module.tsx",
    '''    const rates = (db.master.vendorRates || []).filter((row: any) => row.vendor_id === partner.id);
    const sites = (db.sites || []).filter((row: any) => siteIds.has(row.id));''',
    '''    const rates = (db.master.vendorRates || []).filter((row: any) => row.vendor_id === partner.id);
    const suppliedArticles = (db.master.articles || []).filter((row: any) => partner.article_ids?.includes(row.id));
    const sites = (db.sites || []).filter((row: any) => siteIds.has(row.id));''',
)
replace_once(
    "src/components/rdash/modules/Partner360Module.tsx",
    '''    return { purchaseOrders, rfqs, bids, bills, payments, grns, rates, sites, workOrders, customers, activity, compliance, committedValue, totalBilled, totalPaid, outstanding, onTime, workCount: purchaseOrders.length };''',
    '''    return { purchaseOrders, rfqs, bids, bills, payments, grns, rates, suppliedArticles, sites, workOrders, customers, activity, compliance, committedValue, totalBilled, totalPaid, outstanding, onTime, workCount: purchaseOrders.length };''',
)
regex_once(
    "src/components/rdash/modules/Partner360Module.tsx",
    r'function PartnerBusinessDialog\(\{ mode, partner, open, onClose \}: \{ mode: Partner360Mode; partner: PartnerRecord; open: boolean; onClose: \(\) => void \}\) \{.*\Z',
    '''function PartnerBusinessDialog({ mode, partner, open, onClose }: { mode: Partner360Mode; partner: PartnerRecord; open: boolean; onClose: () => void }) {
  const db = useRDashStore((state) => state.db);
  const updateVendor = useRDashStore((state) => state.updateVendor);
  const updateContractor = useRDashStore((state) => state.updateContractor);
  const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  const [saving, setSaving] = React.useState(false);
  const baselineRef = React.useRef<Record<string, any>>({});
  const formId = `partner-business:${mode}:${partner.id}`;

  const numberOrUndefined = (value: any) => value === "" || value == null ? undefined : Number(value);
  const payloadFromDraft = React.useCallback((value: Record<string, any>) => {
    const common = {
      legal_name: String(value.legal_name || "").trim() || undefined,
      email: String(value.email || "").trim() || undefined,
      whatsapp: String(value.whatsapp || "").trim() || undefined,
      alternate_phone: String(value.alternate_phone || "").trim() || undefined,
      status: value.status || "active",
      notes: String(value.notes || "").trim() || undefined,
    };
    return mode === "vendor"
      ? {
          ...common,
          gstin: String(value.gstin || "").trim() || undefined,
          pan: String(value.pan || "").trim() || undefined,
          bank_account: String(value.bank_account || "").trim() || undefined,
          ifsc: String(value.ifsc || "").trim() || undefined,
          payment_terms: String(value.payment_terms || "").trim() || undefined,
          credit_days: numberOrUndefined(value.credit_days),
          credit_limit: numberOrUndefined(value.credit_limit),
          minimum_order_value: numberOrUndefined(value.minimum_order_value),
          standard_lead_time_days: numberOrUndefined(value.standard_lead_time_days),
          warranty_terms: String(value.warranty_terms || "").trim() || undefined,
          udyam_no: String(value.udyam_no || "").trim() || undefined,
          verified_bank: Boolean(value.verified_bank),
        }
      : {
          ...common,
          business_gst: String(value.gstin || "").trim() || undefined,
          pan: String(value.pan || "").trim() || undefined,
          bank_account: String(value.bank_account || "").trim() || undefined,
          ifsc: String(value.ifsc || "").trim() || undefined,
          supervisor_name: String(value.supervisor_name || "").trim() || undefined,
          supervisor_phone: String(value.supervisor_phone || "").trim() || undefined,
          available_workers: numberOrUndefined(value.available_workers),
          concurrent_site_limit: numberOrUndefined(value.concurrent_site_limit),
          earliest_mobilisation_date: value.earliest_mobilisation_date || undefined,
          service_radius_km: numberOrUndefined(value.service_radius_km),
          labour_registration_no: String(value.labour_registration_no || "").trim() || undefined,
          insurance_expiry: value.insurance_expiry || undefined,
          pf_no: String(value.pf_no || "").trim() || undefined,
          esi_no: String(value.esi_no || "").trim() || undefined,
          bank_verified: Boolean(value.bank_verified),
        };
  }, [mode]);

  React.useEffect(() => {
    if (!open) return;
    const initial = {
      legal_name: partner.legal_name || "",
      email: partner.email || "",
      whatsapp: partner.whatsapp || partner.phone || "",
      alternate_phone: partner.alternate_phone || "",
      status: partner.status || "active",
      gstin: partner.gstin || partner.business_gst || "",
      pan: partner.pan || "",
      bank_account: partner.bank_account || "",
      ifsc: partner.ifsc || "",
      payment_terms: partner.payment_terms || "",
      credit_days: partner.credit_days ?? "",
      credit_limit: partner.credit_limit ?? "",
      minimum_order_value: partner.minimum_order_value ?? "",
      standard_lead_time_days: partner.standard_lead_time_days ?? "",
      warranty_terms: partner.warranty_terms || "",
      udyam_no: partner.udyam_no || "",
      verified_bank: Boolean(partner.verified_bank),
      supervisor_name: partner.supervisor_name || "",
      supervisor_phone: partner.supervisor_phone || "",
      available_workers: partner.available_workers ?? "",
      concurrent_site_limit: partner.concurrent_site_limit ?? "",
      earliest_mobilisation_date: partner.earliest_mobilisation_date || "",
      service_radius_km: partner.service_radius_km ?? "",
      labour_registration_no: partner.labour_registration_no || "",
      insurance_expiry: partner.insurance_expiry || "",
      pf_no: partner.pf_no || "",
      esi_no: partner.esi_no || "",
      bank_verified: Boolean(partner.bank_verified),
      notes: partner.notes || "",
    };
    setDraft(initial);
    baselineRef.current = payloadFromDraft(initial);
    // Partner object changes from background sync must not reset an active edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, partner.id, payloadFromDraft]);

  React.useEffect(() => {
    if (!open) return;
    return retainPartnerFormStoreBridge(mode, partner.id);
  }, [open, mode, partner.id]);

  const currentPayload = payloadFromDraft(draft);
  const patch = partnerChangedPatch(baselineRef.current, currentPayload);
  const dirty = open && Object.keys(patch).length > 0;
  const duplicateError = mode === "vendor"
    ? vendorDuplicateError(
        db.master.vendors as unknown as Array<Record<string, unknown>>,
        { ...partner, ...currentPayload },
        partner.id,
      )
    : null;

  const set = (key: string, value: any) => setDraft((current) => ({ ...current, [key]: value }));

  async function discard(): Promise<boolean> {
    const baseline = baselineRef.current;
    setDraft((current) => ({ ...current, ...baseline }));
    return true;
  }

  async function save(): Promise<boolean> {
    if (saving || !dirty) return !saving;
    if (duplicateError) {
      toast.error(duplicateError);
      return false;
    }
    setSaving(true);
    try {
      if (mode === "vendor") updateVendor(partner.id, patch as any);
      else updateContractor(partner.id, patch as any);
      await awaitServerSync();
      baselineRef.current = currentPayload;
      dirtyFormRegistry.markClean(formId);
      toast.success(`${mode === "vendor" ? "Vendor" : "Contractor"} business details updated`, {
        description: "The workspace server confirmed the change.",
      });
      onClose();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Business details could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useDirtyFormRegistration({
    id: formId,
    label: `${mode === "vendor" ? "Vendor" : "Contractor"} business details`,
    dirty,
    save,
    discard,
  });

  const requestClose = () =>
    dirtyFormRegistry.requestNavigation(onClose, { reason: "close business details" });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && requestClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4"><DialogTitle>{mode === "vendor" ? "Vendor business details" : "Contractor business details"}</DialogTitle><DialogDescription>Structured identity, tax, banking, commercial and operational readiness fields used by the 360° workspace.</DialogDescription></DialogHeader>
        <div className="rd-scroll max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Identity and lifecycle</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.legal_name || ""} onChange={(e) => set("legal_name", e.target.value)} placeholder="Legal / registered name" /><Input value={draft.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="Email" type="email" /><Input value={draft.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="WhatsApp number" /><Input value={draft.alternate_phone || ""} onChange={(e) => set("alternate_phone", e.target.value)} placeholder="Alternate phone" /><select value={draft.status || "active"} onChange={(e) => set("status", e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="on_hold">On hold</option><option value={mode === "vendor" ? "blocked" : "blacklisted"}>{mode === "vendor" ? "Blocked" : "Blacklisted"}</option><option value="inactive">Inactive</option></select></div></section>
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tax and banking</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.gstin || ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="GSTIN" /><Input value={draft.pan || ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} placeholder="PAN" /><Input value={draft.bank_account || ""} onChange={(e) => set("bank_account", e.target.value)} placeholder="Bank account number" /><Input value={draft.ifsc || ""} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} placeholder="IFSC" /></div><label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(mode === "vendor" ? draft.verified_bank : draft.bank_verified)} onChange={(e) => set(mode === "vendor" ? "verified_bank" : "bank_verified", e.target.checked)} />Bank details independently verified</label></section>
          {mode === "vendor" ? <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Commercial terms</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.payment_terms || ""} onChange={(e) => set("payment_terms", e.target.value)} placeholder="Payment terms" /><Input value={draft.credit_days ?? ""} onChange={(e) => set("credit_days", e.target.value)} placeholder="Credit days" type="number" /><Input value={draft.credit_limit ?? ""} onChange={(e) => set("credit_limit", e.target.value)} placeholder="Credit limit" type="number" /><Input value={draft.minimum_order_value ?? ""} onChange={(e) => set("minimum_order_value", e.target.value)} placeholder="Minimum order value" type="number" /><Input value={draft.standard_lead_time_days ?? ""} onChange={(e) => set("standard_lead_time_days", e.target.value)} placeholder="Standard lead time (days)" type="number" /><Input value={draft.udyam_no || ""} onChange={(e) => set("udyam_no", e.target.value)} placeholder="MSME / Udyam number" /><Input value={draft.warranty_terms || ""} onChange={(e) => set("warranty_terms", e.target.value)} placeholder="Warranty terms" className="sm:col-span-2" /></div></section> : <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Capacity and compliance</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.supervisor_name || ""} onChange={(e) => set("supervisor_name", e.target.value)} placeholder="Supervisor / foreman name" /><Input value={draft.supervisor_phone || ""} onChange={(e) => set("supervisor_phone", e.target.value)} placeholder="Supervisor phone" /><Input value={draft.available_workers ?? ""} onChange={(e) => set("available_workers", e.target.value)} placeholder="Workers currently available" type="number" /><Input value={draft.concurrent_site_limit ?? ""} onChange={(e) => set("concurrent_site_limit", e.target.value)} placeholder="Concurrent site limit" type="number" /><Input value={draft.earliest_mobilisation_date || ""} onChange={(e) => set("earliest_mobilisation_date", e.target.value)} type="date" /><Input value={draft.service_radius_km ?? ""} onChange={(e) => set("service_radius_km", e.target.value)} placeholder="Service radius (km)" type="number" /><Input value={draft.labour_registration_no || ""} onChange={(e) => set("labour_registration_no", e.target.value)} placeholder="Labour registration number" /><Input value={draft.insurance_expiry || ""} onChange={(e) => set("insurance_expiry", e.target.value)} type="date" /><Input value={draft.pf_no || ""} onChange={(e) => set("pf_no", e.target.value)} placeholder="PF number" /><Input value={draft.esi_no || ""} onChange={(e) => set("esi_no", e.target.value)} placeholder="ESI number" /></div></section>}
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Internal notes</p><Textarea value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Relationship notes, special conditions, escalation or operating instructions" /></section>
          {duplicateError && <p className="text-xs text-destructive">{duplicateError}</p>}
        </div>
        <DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={!dirty || saving || Boolean(duplicateError)}><CheckCircle2 className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Save business details"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
''',
)

# Remove the stale StaffLocationPing bootstrap block.
regex_once(
    "supabase/schema-entity-tables.sql",
    r'''-- ----------------------------------------------------------------------------\n-- StaffLocationPing — GPS pings\n-- ----------------------------------------------------------------------------\ncreate table if not exists public\."StaffLocationPing" \(.*?create index if not exists "StaffLocationPing_staffId_capturedAt_idx"\n  on public\."StaffLocationPing" \("staffId", "capturedAt"\);\n\n''',
    '',
)
replace_once(
    "supabase/schema-entity-tables.sql",
    "-- One table per collection (80 total). Each table has the same structure:",
    "-- One table per active collection. Each table has the same structure:",
)

write(
    "supabase/migrations/20260731104500_remove_remaining_legacy_objects.sql",
    '''-- Remove superseded compatibility objects. Current production uses
-- revisioned entity_* tables, StaffProfile, StaffRouteBundle, uc_user_roles,
-- and GenericRecord for active settings only.

delete from public."GenericRecord"
where collection = 'workspace.snapshot';

drop function if exists public.write_workspace_snapshot(text, text, integer);
drop function if exists public.uc_register_tracking_device(text, text, text, text, text, text);

drop table if exists public."WorkspaceMeta" cascade;
drop table if exists public."entity_staffAuthUsers" cascade;
drop table if exists public."StaffLocationPing" cascade;
drop table if exists public.uc_tracking_devices cascade;
drop table if exists public.uc_tracking_device_enrollments cascade;
''',
)

# Remove one-time compatibility sources and the temporary type augmentation.
shutil.rmtree(ROOT / "supabase/project-upgrades/20260728-legacy-empty-project", ignore_errors=True)
(ROOT / "src/lib/rdash/partner-form-types.d.ts").unlink(missing_ok=True)

# Update existing regression test to remove legacy Vendor migration expectations.
test_path = "tests/customer-sites-legacy-removal.test.ts"
text = read(test_path)
text = text.replace(
    '''  fieldChanges,
  legacyVendorArticleNames,
  partnerChangedPatch,
  partnerFormFingerprint,
  vendorLegacyMigrationPatch,
  vendorNotesWithoutLegacyArticles,
''',
    '''  fieldChanges,
  partnerChangedPatch,
  partnerFormFingerprint,
''',
)
text = re.sub(
    r'\ntest\("legacy Vendor article migration preserves explicit user edits".*?\n\}\);\n\ntest\("legacy Vendor migration keeps unresolved text and respects an explicit empty list".*?\n\}\);\n',
    '\n',
    text,
    flags=re.S,
)
text = re.sub(
    r'\ntest\("Vendor create does not emit an empty or duplicate follow-up audit".*?\n\}\);\n?',
    '''\ntest("Vendor create persists structured articles in the atomic create", () => {
  expect(partnerDialog.includes("updateVendor(id, { article_ids")).toBe(false);
  expect(partnerBridge.includes('isActiveCreate("vendor")')).toBe(false);
});
''',
    text,
    flags=re.S,
)
write(test_path, text)

write(
    "tests/vendor-module-consistency.test.ts",
    '''import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { vendorDuplicateError } from "../src/lib/rdash/partner-form-consistency";

const partnerDialog = readFileSync("src/components/rdash/UnifiedPartnerFormDialog.tsx", "utf8");
const partner360 = readFileSync("src/components/rdash/modules/Partner360Module.tsx", "utf8");
const partnerBridge = readFileSync("src/lib/rdash/partner-form-store-bridge.ts", "utf8");
const consistency = readFileSync("src/lib/rdash/partner-form-consistency.ts", "utf8");
const procurement = readFileSync("src/lib/rdash/store/slices/procurement.ts", "utf8");
const types = readFileSync("src/lib/rdash/types.ts", "utf8");
const schema = readFileSync("supabase/schema-entity-tables.sql", "utf8");
const cleanupMigration = readFileSync("supabase/migrations/20260731104500_remove_remaining_legacy_objects.sql", "utf8");

test("Vendor legacy article compatibility is completely removed", () => {
  for (const source of [partnerDialog, partnerBridge, consistency]) {
    expect(source.includes("legacyVendorArticleNames")).toBe(false);
    expect(source.includes("vendorLegacyMigrationPatch")).toBe(false);
    expect(source.includes("vendorNotesWithoutLegacyArticles")).toBe(false);
    expect(source.includes("Supplies articles:")).toBe(false);
  }
  expect(existsSync("src/lib/rdash/partner-form-types.d.ts")).toBe(false);
  expect(existsSync("supabase/project-upgrades/20260728-legacy-empty-project")).toBe(false);
});

test("Vendor creation is one atomic operation with canonical fields", () => {
  expect(partnerDialog.includes("updateVendor(id, { article_ids")).toBe(false);
  expect(procurement.includes("article_ids: v.article_ids || []")).toBe(true);
  expect(procurement.includes("gstin: v.gstin")).toBe(true);
  expect(procurement.includes("status: v.status || \"active\"")).toBe(true);
  expect(types.includes("article_ids?: ID[]")).toBe(true);
  expect(types.includes("standard_lead_time_days?: number")).toBe(true);
  expect(types.includes("verified_bank?: boolean")).toBe(true);
});

test("Duplicate Vendors are rejected by stable identifiers and exact firm name", () => {
  const vendors = [{
    id: "v1",
    name: "A B C Traders",
    phone: "+91 98765-43210",
    gstin: "09ABCDE1234F1Z5",
    pan: "ABCDE1234F",
  }];
  expect(vendorDuplicateError(vendors, { name: "Other", gstin: "09abcde1234f1z5" })).toContain("GSTIN");
  expect(vendorDuplicateError(vendors, { name: "Other", pan: "abcde1234f" })).toContain("PAN");
  expect(vendorDuplicateError(vendors, { name: "Other", phone: "9876543210" })).toContain("contact number");
  expect(vendorDuplicateError(vendors, { name: "ABC  Traders" })).toContain("firm name");
  expect(vendorDuplicateError(vendors, { name: "ABC Traders" }, "v1")).toBeNull();
});

test("Structured supplied articles drive Vendor discovery and RFQ coverage", () => {
  expect(partnerDialog.includes("Vendor category")).toBe(true);
  expect(partner360.includes("suppliedArticleNames")).toBe(true);
  expect(partner360.includes("model.suppliedArticles")).toBe(true);
  expect(procurement.includes("vendor?.article_ids?.some")).toBe(true);
  expect(procurement.includes("vendorsWithCoverage")).toBe(true);
});

test("Business details uses guarded patch-only acknowledged saves", () => {
  expect(partner360.includes("retainPartnerFormStoreBridge(mode, partner.id)")).toBe(true);
  expect(partner360.includes("useDirtyFormRegistration")).toBe(true);
  expect(partner360.includes("partnerChangedPatch(baselineRef.current, currentPayload)")).toBe(true);
  expect(partner360.includes("await awaitServerSync();")).toBe(true);
  expect(partner360.includes("dirtyFormRegistry.requestNavigation")).toBe(true);
  expect(partner360.includes("disabled={!dirty || saving || Boolean(duplicateError)}")).toBe(true);
});

test("Supabase legacy compatibility objects are removed from the canonical schema", () => {
  expect(schema.includes('create table if not exists public."StaffLocationPing"')).toBe(false);
  for (const objectName of [
    'WorkspaceMeta',
    'entity_staffAuthUsers',
    'StaffLocationPing',
    'uc_tracking_devices',
    'uc_tracking_device_enrollments',
  ]) {
    expect(cleanupMigration.includes(objectName)).toBe(true);
  }
  expect(cleanupMigration.includes("workspace.snapshot")).toBe(true);
  expect(cleanupMigration.includes('drop table if exists public."GenericRecord"')).toBe(false);
  expect(cleanupMigration.includes('drop table if exists public."StaffRouteBundle"')).toBe(false);
});
''',
)

replace_once(
    "package.json",
    '''    "test:customer-sites-legacy": "bun test tests/customer-sites-legacy-removal.test.ts"''',
    '''    "test:customer-sites-legacy": "bun test tests/customer-sites-legacy-removal.test.ts",
    "test:vendor-module": "bun test tests/vendor-module-consistency.test.ts"''',
)
replace_once(
    ".github/workflows/application-ci.yml",
    '''      - name: Test legacy Customer and Site path removal
        run: bun run test:customer-sites-legacy
      - name: Test frontend staff route bundles''',
    '''      - name: Test legacy Customer and Site path removal
        run: bun run test:customer-sites-legacy
      - name: Test Vendor module consistency and legacy removal
        run: bun run test:vendor-module
      - name: Test frontend staff route bundles''',
)

print("Vendor module cleanup patch applied.")
