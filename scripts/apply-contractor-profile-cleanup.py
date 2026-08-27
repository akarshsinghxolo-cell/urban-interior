from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

REMOVED_FIELDS = [
    "business_gst",
    "pan",
    "bank_account",
    "ifsc",
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
    "bank_verified",
]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str, flags: int = re.S) -> str:
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return next_text


def remove_section_with_marker(text: str, marker: str) -> str:
    marker_index = text.find(marker)
    if marker_index < 0:
        raise RuntimeError(f"Could not find section marker: {marker}")
    start = text.rfind("<section", 0, marker_index)
    end = text.find("</section>", marker_index)
    if start < 0 or end < 0:
        raise RuntimeError(f"Could not locate section bounds for: {marker}")
    end += len("</section>")
    while end < len(text) and text[end] in "\r\n ":
        if text[end] not in "\r\n ":
            break
        end += 1
    return text[:start] + text[end:]


def clean_contractor_form() -> None:
    path = "src/components/rdash/ContractorFormDialog.tsx"
    text = read(path)

    text = replace_once(
        text,
        'import { CheckCircle2, Navigation, Pencil, Plus, Search, X } from "lucide-react";',
        'import { Navigation, Pencil, Plus, Search, X } from "lucide-react";',
        "ContractorForm lucide import",
    )
    text = replace_once(text, "  verifiedContractorBankProof,\n", "", "ContractorForm bank verification import")

    camel_fields = [
        "gstin", "pan", "bankAccount", "ifsc", "supervisorName", "supervisorPhone",
        "availableWorkers", "concurrentSiteLimit", "earliestMobilisationDate", "serviceRadiusKm",
        "labourRegistrationNo", "insuranceExpiry", "pfNo", "esiNo",
    ]
    for field in camel_fields:
        text, count = re.subn(rf"^  {re.escape(field)}: [^;]+;\n", "", text, flags=re.M)
        if count != 1:
            raise RuntimeError(f"ContractorForm Draft field {field}: expected 1, found {count}")
        text, count = re.subn(rf'^  {re.escape(field)}: .*?,\n', "", text, count=1, flags=re.M)
        if count != 1:
            raise RuntimeError(f"ContractorForm EMPTY_DRAFT {field}: expected 1, found {count}")

    text = regex_once(
        text,
        r'const optionalNumber = \(value: string\): number \| undefined =>\n  value\.trim\(\) \? Number\(value\) : undefined;\n\n',
        "",
        "ContractorForm optionalNumber helper",
    )

    hydration_patterns = {
        "gstin": r'^    gstin: String\(record\.business_gst \|\| ""\),\n',
        "pan": r'^    pan: String\(record\.pan \|\| ""\),\n',
        "bankAccount": r'^    bankAccount: String\(record\.bank_account \|\| ""\),\n',
        "ifsc": r'^    ifsc: String\(record\.ifsc \|\| ""\),\n',
        "supervisorName": r'^    supervisorName: String\(record\.supervisor_name \|\| ""\),\n',
        "supervisorPhone": r'^    supervisorPhone: String\(record\.supervisor_phone \|\| ""\),\n',
        "availableWorkers": r'^    availableWorkers: record\.available_workers == null \? "" : String\(record\.available_workers\),\n',
        "concurrentSiteLimit": r'^    concurrentSiteLimit: record\.concurrent_site_limit == null \? "" : String\(record\.concurrent_site_limit\),\n',
        "earliestMobilisationDate": r'^    earliestMobilisationDate: String\(record\.earliest_mobilisation_date \|\| ""\),\n',
        "serviceRadiusKm": r'^    serviceRadiusKm: record\.service_radius_km == null \? "" : String\(record\.service_radius_km\),\n',
        "labourRegistrationNo": r'^    labourRegistrationNo: String\(record\.labour_registration_no \|\| ""\),\n',
        "insuranceExpiry": r'^    insuranceExpiry: String\(record\.insurance_expiry \|\| ""\),\n',
        "pfNo": r'^    pfNo: String\(record\.pf_no \|\| ""\),\n',
        "esiNo": r'^    esiNo: String\(record\.esi_no \|\| ""\),\n',
    }
    for field, pattern in hydration_patterns.items():
        text, count = re.subn(pattern, "", text, count=1, flags=re.M)
        if count != 1:
            raise RuntimeError(f"ContractorForm hydration {field}: expected 1, found {count}")

    payload_lines = [
        "      business_gst: draft.gstin,\n",
        "      pan: draft.pan,\n",
        "      bank_account: draft.bankAccount,\n",
        "      ifsc: draft.ifsc,\n",
        "      supervisor_name: draft.supervisorName,\n",
        "      supervisor_phone: draft.supervisorPhone,\n",
        "      available_workers: optionalNumber(draft.availableWorkers),\n",
        "      concurrent_site_limit: optionalNumber(draft.concurrentSiteLimit),\n",
        "      earliest_mobilisation_date: draft.earliestMobilisationDate,\n",
        "      service_radius_km: optionalNumber(draft.serviceRadiusKm),\n",
        "      labour_registration_no: draft.labourRegistrationNo,\n",
        "      insurance_expiry: draft.insuranceExpiry,\n",
        "      pf_no: draft.pfNo,\n",
        "      esi_no: draft.esiNo,\n",
    ]
    for line in payload_lines:
        text = replace_once(text, line, "", f"ContractorForm payload {line.strip()}")

    text = regex_once(
        text,
        r'      // Preserve documents added from Governance while the canonical profile\n      // helper synchronizes form-entered PAN, bank, labour, insurance, PF and\n      // ESI details into unverified document-register rows\.\n',
        '      // Preserve generic documents added from Governance while editing the canonical profile.\n',
        "ContractorForm compliance comment",
    )
    text = replace_once(
        text,
        "    referralId,\n    referralQuery,\n    reservedId,",
        "    referralId,\n    reservedId,",
        "ContractorForm unused referralQuery dependency",
    )

    text = regex_once(
        text,
        r'\n  const bankVerified = verifiedContractorBankProof\(\n    \(editId \? db\.master\.contractors\.find\(\(row\) => row\.id === editId\) : undefined\) as ContractorProfileRecord \|\| \{},\n  \);\n',
        "\n",
        "ContractorForm bankVerified derived state",
    )
    text = replace_once(
        text,
        "Identity, contact, location, capabilities, rates, capacity, banking and compliance readiness are maintained in one profile.",
        "Identity, contact, location, capabilities, rates, work quality and notes are maintained in one profile.",
        "ContractorForm description",
    )
    text = remove_section_with_marker(text, "Tax and banking (optional)")
    text = remove_section_with_marker(text, "Capacity and optional records")

    for forbidden in [
        "draft.gstin", "draft.pan", "draft.bankAccount", "draft.ifsc", "draft.supervisorName",
        "draft.supervisorPhone", "draft.availableWorkers", "draft.concurrentSiteLimit",
        "draft.earliestMobilisationDate", "draft.serviceRadiusKm", "draft.labourRegistrationNo",
        "draft.insuranceExpiry", "draft.pfNo", "draft.esiNo", "verifiedContractorBankProof",
        "Tax and banking (optional)", "Capacity and optional records",
    ]:
        if forbidden in text:
            raise RuntimeError(f"ContractorForm still contains removed concept: {forbidden}")
    write(path, text)


def clean_contractor_profile() -> None:
    path = "src/lib/rdash/contractor-profile.ts"
    text = read(path)

    # Remove red-box properties from the canonical record and allowed-key whitelist.
    for field in REMOVED_FIELDS:
        text, type_count = re.subn(rf'^  {re.escape(field)}\?: [^;]+;\n', "", text, count=1, flags=re.M)
        if type_count != 1:
            raise RuntimeError(f"contractor-profile type {field}: expected 1, found {type_count}")
        key_line = f'  "{field}",\n'
        text = replace_once(text, key_line, "", f"contractor-profile allowed key {field}")

    text = regex_once(
        text,
        r'const PROFILE_DOCUMENT_SOURCE = "contractor_profile";\nconst PROFILE_DOCUMENT_TIMESTAMP = new Date\(0\)\.toISOString\(\);\n\ntype ContractorProfileDocumentSpec = \{.*?\};\n\n',
        "",
        "contractor-profile synthetic document declarations",
    )
    text = regex_once(text, r'^const upperId = .*?;\n', "", "contractor-profile upperId", flags=re.M)
    text = regex_once(text, r'^const bankDigits = .*?;\n', "", "contractor-profile bankDigits", flags=re.M)
    text = regex_once(
        text,
        r'export function contractorProfileComplianceDocuments\(.*?\n}\n\n(?=export function contractorMasterRecordForCreate)',
        "",
        "contractor-profile synthetic document function",
    )

    duplicate_function = '''export function contractorDuplicateConflicts(
  db: Pick<RDashDatabase, "master">,
  candidate: ContractorProfileRecord,
  excludeId?: string,
): ContractorDuplicateConflict[] {
  const result: ContractorDuplicateConflict[] = [];
  const candidatePhone = mobile(candidate.phone || candidate.whatsapp);
  const candidateName = normalizedName(candidate.legal_name || candidate.name);
  const candidateCity = String(candidate.city || "").trim().toLowerCase();

  for (const row of db.master.contractors as ContractorProfileRecord[]) {
    if (!row.id || row.id === excludeId || row.duplicate_of_id) continue;
    if (candidatePhone && candidatePhone === mobile(row.phone || row.whatsapp)) {
      result.push({
        id: row.id,
        name: String(row.name || row.id),
        reasons: ["same phone"],
        hard: true,
      });
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

'''
    text = regex_once(
        text,
        r'export function contractorDuplicateConflicts\(.*?\n}\n\n(?=export function contractorProfileValidationError)',
        duplicate_function,
        "contractor-profile duplicate policy",
    )

    validation_lines = [
        '  const supervisorPhone = mobile(candidate.supervisor_phone);\n',
        '  if (candidate.supervisor_phone && !/^[6-9]\\d{9}$/.test(supervisorPhone)) return "Enter a valid supervisor phone number.";\n',
        '  if (candidate.business_gst && !/^\\d{2}[A-Z]{5}\\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(upperId(candidate.business_gst))) return "Enter a valid 15-character GSTIN.";\n',
        '  if (candidate.pan && !/^[A-Z]{5}\\d{4}[A-Z]$/.test(upperId(candidate.pan))) return "Enter a valid PAN.";\n',
        '  if (candidate.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(upperId(candidate.ifsc))) return "Enter a valid IFSC code.";\n',
    ]
    for line in validation_lines:
        text = replace_once(text, line, "", f"contractor-profile validation {line.strip()}")
    text = regex_once(
        text,
        r'\n  for \(const value of \[candidate\.available_workers, candidate\.concurrent_site_limit, candidate\.service_radius_km\]\) \{\n    if \(value !== undefined && \(!Number\.isFinite\(Number\(value\)\) \|\| Number\(value\) < 0\)\) \{\n      return "Contractor capacity values must be valid non-negative numbers\.";\n    \}\n  \}\n',
        "\n",
        "contractor-profile capacity validation",
    )

    normalize_lines = [
        '    business_gst: upperId(input.business_gst) || undefined,\n',
        '    pan: upperId(input.pan) || undefined,\n',
        '    bank_account: bankDigits(input.bank_account) || undefined,\n',
        '    ifsc: upperId(input.ifsc) || undefined,\n',
        '    supervisor_name: String(input.supervisor_name || "").trim() || undefined,\n',
        '    supervisor_phone: mobile(input.supervisor_phone) || undefined,\n',
        '    available_workers: finiteNonNegative(input.available_workers),\n',
        '    concurrent_site_limit: finiteNonNegative(input.concurrent_site_limit),\n',
        '    service_radius_km: finiteNonNegative(input.service_radius_km),\n',
        '    earliest_mobilisation_date: String(input.earliest_mobilisation_date || "").trim() || undefined,\n',
        '    labour_registration_no: String(input.labour_registration_no || "").trim() || undefined,\n',
        '    insurance_expiry: String(input.insurance_expiry || "").trim() || undefined,\n',
        '    pf_no: String(input.pf_no || "").trim() || undefined,\n',
        '    esi_no: String(input.esi_no || "").trim() || undefined,\n',
    ]
    for line in normalize_lines:
        text = replace_once(text, line, "", f"contractor-profile normalize {line.strip()}")
    text = replace_once(
        text,
        "  normalized.compliance_documents = contractorProfileComplianceDocuments(normalized);\n  normalized.bank_verified = verifiedContractorBankProof(normalized);\n",
        "",
        "contractor-profile synthetic compliance normalization",
    )

    clean_projection = '''export function contractorFormProjection(record: ContractorProfileRecord): ContractorProfileRecord {
  const keys = [
    "name", "legal_name", "phone", "whatsapp", "alternate_phone", "email",
    "city", "locality", "address", "latitude", "longitude",
    "source_partner_id", "source_partner_name", "photo_attachment_id", "business_card_attachment_id",
    "reliability_rating", "politeness_rating", "worker_count_range", "deadline_commitment",
    "status", "work_capabilities", "notes",
  ] as const;
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as ContractorProfileRecord;
}
'''
    text = regex_once(
        text,
        r'export function contractorFormProjection\(record: ContractorProfileRecord\): ContractorProfileRecord \{.*?\n}\n\nexport function verifiedContractorBankProof\(record: ContractorProfileRecord\): boolean \{.*?\n}\n?$',
        clean_projection,
        "contractor-profile form projection and bank helper",
    )

    for field in REMOVED_FIELDS:
        if re.search(rf'\b{re.escape(field)}\b', text):
            raise RuntimeError(f"contractor-profile still contains removed field {field}")
    for dead in ["contractorProfileComplianceDocuments", "verifiedContractorBankProof", "PROFILE_DOCUMENT_SOURCE", "bankDigits", "upperId"]:
        if dead in text:
            raise RuntimeError(f"contractor-profile still contains dead helper {dead}")
    write(path, text)


def clean_types() -> None:
    path = "src/lib/rdash/types.ts"
    text = read(path)
    start = text.index("export interface Contractor {")
    end = text.index("export type StaffRoleKey", start)
    contractor = text[start:end]
    contractor = regex_once(
        contractor,
        r'    // FIX-CONTRACTOR-BATCH2 / F\.6: Business / tax / banking fields, previously\n    // declared-but-never-populated dead fields\. Now captured in the\n    // EntityFormDialog contractor branch and persisted on the master record\.\n',
        "",
        "Contractor stale tax/bank comment",
    )
    for field in REMOVED_FIELDS:
        contractor, count = re.subn(rf'^    {re.escape(field)}\?: [^;]+;\n', "", contractor, count=1, flags=re.M)
        if count != 1:
            raise RuntimeError(f"Contractor type field {field}: expected 1, found {count}")
    text = text[:start] + contractor + text[end:]
    for field in REMOVED_FIELDS:
        if re.search(rf'\b{re.escape(field)}\b', contractor):
            raise RuntimeError(f"Contractor interface still contains removed field {field}")
    write(path, text)


def clean_field_staff_presentation() -> None:
    path = "src/lib/rdash/field-staff-presentation.ts"
    text = read(path)
    for field in ["business_gst", "pan", "bank_account", "ifsc"]:
        text = replace_once(text, f"        {field}: undefined,\n", "", f"field-staff Contractor mask {field}")
    write(path, text)


def clean_detail_panel() -> None:
    path = "src/components/rdash/DetailPanel.tsx"
    text = read(path)
    text, count = re.subn(
        r'\{\(contractor\.business_gst \|\| contractor\.pan \|\| contractor\.bank_account\) && <p className="mt-1 text-muted-foreground">GST \{contractor\.business_gst \|\| "—"\} · PAN \{contractor\.pan \|\| "—"\} · Bank \{contractor\.bank_account \|\| "—"\}\{contractor\.ifsc \? ` \(\$\{contractor\.ifsc\}\)` : ""\}</p>\}',
        "",
        text,
        count=1,
    )
    if count != 1:
        raise RuntimeError(f"DetailPanel Contractor tax/bank row: expected 1, found {count}")
    write(path, text)


def clean_partner_governance_helper() -> None:
    path = "src/lib/rdash/partner-governance.ts"
    text = read(path)
    replacement = '''export function detectPartnerDuplicates(
  partners: Array<Record<string, any>>,
  mode: PartnerGovernanceMode,
): PartnerDuplicateCandidate[] {
  const candidates: PartnerDuplicateCandidate[] = [];
  for (let leftIndex = 0; leftIndex < partners.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < partners.length; rightIndex += 1) {
      const left = partners[leftIndex];
      const right = partners[rightIndex];
      if (!left?.id || !right?.id || left.duplicate_of_id || right.duplicate_of_id) continue;

      let score = 0;
      const reasons: string[] = [];
      const leftPhone = normalizePhone(left.phone || left.whatsapp);
      const rightPhone = normalizePhone(right.phone || right.whatsapp);
      const leftName = normalizePartnerName(left.legal_name || left.name);
      const rightName = normalizePartnerName(right.legal_name || right.name);
      const sameCity = String(left.city || "").trim().toLowerCase() === String(right.city || "").trim().toLowerCase();

      if (mode === "vendor") {
        const leftGst = normalizeTaxId(left.gstin || left.business_gst);
        const rightGst = normalizeTaxId(right.gstin || right.business_gst);
        const leftPan = normalizeTaxId(left.pan);
        const rightPan = normalizeTaxId(right.pan);
        const leftBank = normalizeBankAccount(left.bank_account);
        const rightBank = normalizeBankAccount(right.bank_account);
        if (leftGst && leftGst === rightGst) { score += 100; reasons.push("Same GSTIN"); }
        if (leftPan && leftPan === rightPan) { score += 90; reasons.push("Same PAN"); }
        if (leftBank && leftBank === rightBank) { score += 95; reasons.push("Same bank account"); }
      }
      if (leftPhone && leftPhone === rightPhone) { score += 70; reasons.push("Same phone"); }
      if (leftName && leftName === rightName) { score += sameCity ? 60 : 45; reasons.push(sameCity ? "Same normalized name and city" : "Same normalized name"); }

      if (score >= 55) {
        candidates.push({ leftId: left.id, rightId: right.id, score, reasons });
      }
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

'''
    text = regex_once(
        text,
        r'export function detectPartnerDuplicates\(partners: Array<Record<string, any>>\): PartnerDuplicateCandidate\[\] \{.*?\n}\n\n(?=export function partnerMergePlan)',
        replacement,
        "mode-aware partner duplicate policy",
    )
    write(path, text)


def clean_partner_governance_ui() -> None:
    path = "src/components/rdash/modules/PartnerGovernanceModule.tsx"
    text = read(path)
    text = replace_once(
        text,
        '''const CONTRACTOR_DOCUMENT_KINDS: PartnerDocumentKind[] = [
  "gst_registration", "pan_card", "bank_proof", "labour_license", "insurance",
  "pf_registration", "esi_registration", "identity_proof", "safety_certificate", "agreement", "other",
];''',
        '''const CONTRACTOR_DOCUMENT_KINDS: PartnerDocumentKind[] = [
  "address_proof", "identity_proof", "safety_certificate", "agreement", "other",
];''',
        "Contractor governance document kinds",
    )
    text = replace_once(
        text,
        '    return partners.filter((partner) => [partner.name, partner.legal_name, partner.phone, partner.city, partner.gstin, partner.business_gst, partner.pan].filter(Boolean).join(" ").toLowerCase().includes(needle));',
        '    return partners.filter((partner) => (mode === "vendor"\n      ? [partner.name, partner.legal_name, partner.phone, partner.city, partner.gstin, partner.business_gst, partner.pan]\n      : [partner.name, partner.legal_name, partner.phone, partner.city])\n      .filter(Boolean).join(" ").toLowerCase().includes(needle));',
        "Contractor governance search fields",
    )
    text = replace_once(
        text,
        "  const duplicateCandidates = React.useMemo(() => detectPartnerDuplicates(partners), [partners]);",
        "  const duplicateCandidates = React.useMemo(() => detectPartnerDuplicates(partners, mode), [mode, partners]);",
        "Contractor governance duplicate mode",
    )
    write(path, text)


def clean_partner360() -> None:
    path = "src/components/rdash/modules/Partner360Module.tsx"
    text = read(path)
    text = replace_once(
        text,
        '    : "Contractor profile, capabilities, bids, work orders, RA bills, settlements, payments, capacity and compliance in one relationship record.";',
        '    : "Contractor profile, capabilities, bids, work orders, RA bills, settlements, payments and performance in one relationship record.";',
        "Contractor360 description",
    )
    text = replace_once(
        text,
        '          {tab === "compliance" && <ComplianceTab mode={mode} selected={selected} items={model.compliance} completionPct={completionPct} onEdit={() => setBusinessDialogOpen(true)} />}',
        '          {tab === "compliance" && <ComplianceTab mode={mode} selected={selected} items={model.compliance} completionPct={completionPct} onEdit={mode === "vendor" ? () => setBusinessDialogOpen(true) : openEdit} />}',
        "Contractor360 compliance edit action",
    )
    text = replace_once(
        text,
        '      {mode === "vendor" && <PartnerBusinessDialog mode="vendor" partner={selected} open={businessDialogOpen} onClose={() => setBusinessDialogOpen(false)} />}',
        '      {mode === "vendor" && <PartnerBusinessDialog partner={selected} open={businessDialogOpen} onClose={() => setBusinessDialogOpen(false)} />}',
        "Vendor-only business dialog call",
    )

    contractor_compliance = '''  const compliance: ChecklistItem[] = [
    { label: "Primary phone", complete: Boolean(partner.phone), detail: partner.phone },
    { label: "City", complete: Boolean(partner.city), detail: partner.city },
    { label: "Photo and business card", complete: Boolean(partner.photo_attachment_id && partner.business_card_attachment_id), optional: true },
    { label: "Structured capabilities", complete: Boolean(partner.work_capabilities?.length), detail: `${partner.work_capabilities?.length || 0} capability record${partner.work_capabilities?.length === 1 ? "" : "s"}` },
  ];'''
    text = regex_once(
        text,
        r'  const insuranceValid = partner\.insurance_expiry \? new Date\(partner\.insurance_expiry\)\.getTime\(\) >= Date\.now\(\) : false;\n  const compliance: ChecklistItem\[\] = \[\n    \{ label: "GSTIN".*?\n  \];',
        contractor_compliance,
        "Contractor360 profile checklist",
    )

    text = replace_once(
        text,
        '''            <div className="grid gap-2 sm:grid-cols-2">
              <InfoCell label="Trade" value={selected.trade || selected.categories?.join(", ")} />
              <InfoCell label="Workers" value={selected.available_workers != null ? `${selected.available_workers} available` : selected.worker_count_range} />
              <InfoCell label="Concurrent sites" value={selected.concurrent_site_limit} />
              <InfoCell label="Mobilisation" value={formatOptionalDate(selected.earliest_mobilisation_date)} />
              <InfoCell label="Supervisor" value={selected.supervisor_name} />
              <InfoCell label="Supervisor phone" value={selected.supervisor_phone} />
              <InfoCell label="Politeness" value={titleCase(selected.politeness_rating || "not rated")} />
              <InfoCell label="Deadline commitment" value={titleCase(selected.deadline_commitment || "not rated")} />
            </div>''',
        '''            <div className="grid gap-2 sm:grid-cols-2">
              <InfoCell label="Trade" value={selected.trade || selected.categories?.join(", ")} />
              <InfoCell label="Crew range" value={selected.worker_count_range} />
              <InfoCell label="Reliability" value={titleCase(selected.reliability_rating || "not rated")} />
              <InfoCell label="Politeness" value={titleCase(selected.politeness_rating || "not rated")} />
              <InfoCell label="Deadline commitment" value={titleCase(selected.deadline_commitment || "not rated")} />
            </div>''',
        "Contractor360 capability profile fields",
    )
    text = replace_once(
        text,
        '''            </> : <>
              <InfoCell label="Crew range" value={selected.worker_count_range} />
              <InfoCell label="Available workers" value={selected.available_workers} />
              <InfoCell label="Concurrent-site limit" value={selected.concurrent_site_limit} />
              <InfoCell label="Earliest mobilisation" value={formatOptionalDate(selected.earliest_mobilisation_date)} />
              <InfoCell label="Service radius" value={selected.service_radius_km != null ? `${selected.service_radius_km} km` : "—"} />
            </>}''',
        '''            </> : <>
              <InfoCell label="Crew range" value={selected.worker_count_range} />
              <InfoCell label="Reliability" value={titleCase(selected.reliability_rating || "not rated")} />
              <InfoCell label="Politeness" value={titleCase(selected.politeness_rating || "not rated")} />
              <InfoCell label="Deadline commitment" value={titleCase(selected.deadline_commitment || "not rated")} />
            </>}''',
        "Contractor360 commercial profile fields",
    )
    text = replace_once(
        text,
        '{mode === "contractor" ? "Optional records and operational profile details." : "Mandatory business, banking and operational readiness for awards and payment release."}',
        '{mode === "contractor" ? "Identity, contact, files and work-capability readiness." : "Mandatory business, banking and operational readiness for awards and payment release."}',
        "Contractor360 compliance description",
    )

    vendor_dialog = '''function PartnerBusinessDialog({ partner, open, onClose }: { partner: PartnerRecord; open: boolean; onClose: () => void }) {
  const updateVendor = useRDashStore((state) => state.updateVendor);
  const [draft, setDraft] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    if (!open) return;
    setDraft({
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
      notes: partner.notes || "",
    });
  }, [open, partner]);

  const set = (key: string, value: any) => setDraft((current) => ({ ...current, [key]: value }));
  const numberOrUndefined = (value: any) => value === "" || value == null ? undefined : Number(value);
  const save = () => {
    updateVendor(partner.id, {
      legal_name: draft.legal_name.trim() || undefined,
      email: draft.email.trim() || undefined,
      whatsapp: draft.whatsapp.trim() || undefined,
      alternate_phone: draft.alternate_phone.trim() || undefined,
      status: draft.status,
      notes: draft.notes.trim() || undefined,
      gstin: draft.gstin.trim() || undefined,
      pan: draft.pan.trim() || undefined,
      bank_account: draft.bank_account.trim() || undefined,
      ifsc: draft.ifsc.trim() || undefined,
      payment_terms: draft.payment_terms.trim() || undefined,
      credit_days: numberOrUndefined(draft.credit_days),
      credit_limit: numberOrUndefined(draft.credit_limit),
      minimum_order_value: numberOrUndefined(draft.minimum_order_value),
      standard_lead_time_days: numberOrUndefined(draft.standard_lead_time_days),
      warranty_terms: draft.warranty_terms.trim() || undefined,
      udyam_no: draft.udyam_no.trim() || undefined,
      verified_bank: Boolean(draft.verified_bank),
    } as any);
    toast.success("Vendor business details updated");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4"><DialogTitle>Vendor business details</DialogTitle><DialogDescription>Structured identity, tax, banking, commercial and operational readiness fields used by the 360° workspace.</DialogDescription></DialogHeader>
        <div className="rd-scroll max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Identity and lifecycle</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.legal_name || ""} onChange={(e) => set("legal_name", e.target.value)} placeholder="Legal / registered name" /><Input value={draft.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="Email" type="email" /><Input value={draft.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="WhatsApp number" /><Input value={draft.alternate_phone || ""} onChange={(e) => set("alternate_phone", e.target.value)} placeholder="Alternate phone" /><select value={draft.status || "active"} onChange={(e) => set("status", e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="blocked">Blocked</option><option value="inactive">Inactive</option></select></div></section>
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tax and banking</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.gstin || ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="GSTIN" /><Input value={draft.pan || ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} placeholder="PAN" /><Input value={draft.bank_account || ""} onChange={(e) => set("bank_account", e.target.value)} placeholder="Bank account number" /><Input value={draft.ifsc || ""} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} placeholder="IFSC" /></div><label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"><input type="checkbox" checked={Boolean(draft.verified_bank)} onChange={(e) => set("verified_bank", e.target.checked)} />Bank details independently verified</label></section>
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Commercial terms</p><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.payment_terms || ""} onChange={(e) => set("payment_terms", e.target.value)} placeholder="Payment terms" /><Input value={draft.credit_days ?? ""} onChange={(e) => set("credit_days", e.target.value)} placeholder="Credit days" type="number" /><Input value={draft.credit_limit ?? ""} onChange={(e) => set("credit_limit", e.target.value)} placeholder="Credit limit" type="number" /><Input value={draft.minimum_order_value ?? ""} onChange={(e) => set("minimum_order_value", e.target.value)} placeholder="Minimum order value" type="number" /><Input value={draft.standard_lead_time_days ?? ""} onChange={(e) => set("standard_lead_time_days", e.target.value)} placeholder="Standard lead time (days)" type="number" /><Input value={draft.udyam_no || ""} onChange={(e) => set("udyam_no", e.target.value)} placeholder="MSME / Udyam number" /><Input value={draft.warranty_terms || ""} onChange={(e) => set("warranty_terms", e.target.value)} placeholder="Warranty terms" className="sm:col-span-2" /></div></section>
          <section className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Internal notes</p><Textarea value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Relationship notes, special conditions, escalation or operating instructions" /></section>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}><CheckCircle2 className="mr-1 h-4 w-4" />Save business details</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
'''
    text = regex_once(
        text,
        r'function PartnerBusinessDialog\(\{ mode, partner, open, onClose \}: \{ mode: Partner360Mode; partner: PartnerRecord; open: boolean; onClose: \(\) => void \} \) \{.*?\n}\s*$',
        vendor_dialog,
        "remove unreachable Contractor business dialog branch",
    )

    contractor_forbidden = [
        "selected.available_workers", "selected.concurrent_site_limit", "selected.earliest_mobilisation_date",
        "selected.service_radius_km", "selected.supervisor_name", "selected.supervisor_phone",
        "partner.insurance_expiry", "partner.bank_verified", "partner.labour_registration_no",
        "partner.pf_no", "partner.esi_no", "updateContractor(partner.id",
        "Contractor business details",
    ]
    for forbidden in contractor_forbidden:
        if forbidden in text:
            raise RuntimeError(f"Partner360 still contains Contractor red-box/dead path: {forbidden}")
    write(path, text)


def clean_docs() -> None:
    write(
        "docs/contractor-profile-architecture.md",
        '''# Contractor profile architecture

The Contractor module uses one canonical Contractor profile and one canonical capability/rate representation.

## Canonical write path

All normal Contractor create/update operations pass through the public store policy before reaching the underlying Contractor slice. The policy normalizes identity/contact data, validates lifecycle requirements, enforces Contractor write permissions, blocks hard duplicates, validates Source Partner references, derives work categories from subcategories, and synchronizes the read-only rate projection.

New Contractors begin in `onboarding`. Creating a Contractor or moving one into `active` requires a valid primary mobile number, a city, and at least one work capability.

## Capabilities and rates

`work_capabilities` is authoritative. Each capability is keyed by `subcategory_id` and may carry default labour/with-material rates plus material-specific Article rates, unit/capacity metadata, and status.

`master.contractorRates` is a derived read projection only. It exists for rate-oriented read surfaces and persistence indexing; it is not an independent write model. Free-form Contractor Rate writes without a Work Subcategory are rejected. Updating a mapped Contractor Rate updates the corresponding canonical capability and then rebuilds the projection.

Contractor Governance does not persist a second `capabilities_v2` model. It derives transient Governance rows from `work_capabilities` and converts Governance edits back into `work_capabilities` before saving.

Contractor category labels are derived from the capability subcategories and category masters; they are not independently editable.

## Editing

Contractors use `ContractorFormDialog` for the editable profile: identity, contact, lifecycle, location, referral, files, capabilities/rates, work-quality/crew characteristics, generic Governance documents and internal notes. Contractor 360 routes its edit action to this same editor. The separate business-details editor is Vendor-only.

Contractor profiles deliberately do not own GST/PAN/bank fields or the old supervisor, live-capacity, mobilisation, service-radius, labour-registration, insurance, PF or ESI fields. Those removed fields are not accepted as compatibility aliases and are discarded by canonical normalization.

Generic Contractor files or evidence such as identity proof, address proof, safety certificates and agreements can still be managed through Governance. Editing the canonical Contractor profile preserves those Governance documents but does not synthesize compliance evidence from profile fields.

Dirty-state comparison is limited to fields owned by the Contractor form and includes the raw coordinate input. Render-time validation uses reactive baseline state; refs are reserved for event/effect-only reset snapshots so React's render rules are not bypassed.

## Duplicate policy

A normalized matching phone number is a hard duplicate. A normalized same-name + same-city match is surfaced as a warning in the form and requires explicit acknowledgement before saving. Contractor duplicate detection does not depend on GST, PAN or bank-account data.

## Referral policy

Contractor referrals may point only to `master.sourcePartners`. Unlinked/free-text referral values are not part of the canonical Contractor write model.
''',
    )
    write(
        "docs/partner-governance-phase2.md",
        '''# Partner Governance Phase 2

This governance layer is shared by Vendors and Contractors where the concepts are genuinely common, while preserving different domain rules.

## Included

- Structured Vendor–Article capability records
- Structured Contractor–Trade capability records backed by canonical `work_capabilities`
- Typed document register and expiry tracking
- Vendor payment-readiness blockers and warnings
- One-click expiry task generation with duplicate-task protection
- Mode-aware duplicate detection: Vendor checks may use GSTIN/PAN/bank/phone/name, while Contractor checks use phone and normalized name/city
- Duplicate impact preview across linked transaction collections
- Safe duplicate quarantine that preserves historical references

Contractor documents are generic evidence such as identity proof, address proof, safety certificates and agreements. Removed Contractor tax/banking/capacity fields are not recreated through Governance.

## Deliberate safety boundary

Phase 2 does not silently rewrite partner IDs across financial and operational collections. The current workspace transaction API does not expose an atomic cross-collection partner merge action. A suspected duplicate can be quarantined as inactive and linked to its canonical record while historical references remain unchanged.

A later phase can add an atomic merge command with validation, rollback and audit support.
''',
    )


def rewrite_contractor_tests() -> None:
    write(
        "tests/contractor-profile.test.ts",
        '''import { describe, expect, test } from "vitest";
import {
  canonicalContractorCapabilities,
  contractorMasterRecordForCreate,
  contractorDuplicateConflicts,
  contractorGovernanceCapabilityProjection,
  contractorProfileValidationError,
  contractorRateProjection,
  derivedContractorCategoryNames,
  normalizeContractorForWrite,
  type ContractorProfileRecord,
} from "../src/lib/rdash/contractor-profile";

function db() {
  return {
    master: {
      contractors: [] as ContractorProfileRecord[],
      contractorRates: [] as any[],
      workCategories: [
        { id: "cat-paint", name: "Painting" },
        { id: "cat-wood", name: "Carpentry" },
      ],
      workSubcategories: [
        { id: "sub-paint", category_id: "cat-paint", name: "Interior Painting" },
        { id: "sub-wood", category_id: "cat-wood", name: "Wardrobes" },
      ],
      articles: [
        { id: "art-1", name: "Primer" },
        { id: "art-2", name: "Premium Paint" },
      ],
      subcategoryArticleMap: [
        { id: "scope-1", work_required_id: "sub-paint", article_id: "art-1", unit_id: "sqft" },
        { id: "scope-2", work_required_id: "sub-paint", article_id: "art-2", unit_id: "sqft" },
      ],
      sourcePartners: [{ id: "sp-1", name: "Architect One", type: "Architect" }],
    },
  } as any;
}

const removedFields = [
  "business_gst", "pan", "bank_account", "ifsc", "supervisor_name", "supervisor_phone",
  "available_workers", "concurrent_site_limit", "earliest_mobilisation_date", "service_radius_km",
  "labour_registration_no", "insurance_expiry", "pf_no", "esi_no", "bank_verified",
] as const;

describe("canonical contractor profile", () => {
  test("new contractors normalize identity and derive categories from capabilities", () => {
    const normalized = normalizeContractorForWrite({
      id: "con-1",
      name: "  Mr Das  ",
      phone: "+91 98765 43210",
      city: " Gorakhpur ",
      source_partner_id: "sp-1",
      work_capabilities: [{
        subcategory_id: "sub-paint",
        subcategory_name: "Interior Painting",
        labour_rate: 25,
        with_material_rate: 80,
        article_ids: ["art-1", "art-1"],
        article_rates: [
          { article_id: "art-1", labour_rate: 30, with_material_rate: 95 },
          { article_id: "art-1", labour_rate: 35, with_material_rate: 100 },
        ],
      }],
    }, db(), { id: "con-1" });

    expect(normalized.name).toBe("Mr Das");
    expect(normalized.phone).toBe("9876543210");
    expect(normalized.city).toBe("Gorakhpur");
    expect(normalized.status).toBe("onboarding");
    expect(normalized.source_partner_name).toBe("Architect One");
    expect(normalized.categories).toEqual(["Painting"]);
    expect(normalized.work_capabilities?.[0].article_ids).toEqual(["art-1"]);
    expect(normalized.work_capabilities?.[0].article_rates).toEqual([
      { article_id: "art-1", labour_rate: 35, with_material_rate: 100 },
    ]);
  });

  test("missing canonical capabilities does not resurrect rate projection rows", () => {
    const state = db();
    state.master.contractorRates = [{ id: "rate-1", contractor_id: "con-1", trade: "Interior Painting", rate: 30, work_subcategory_id: "sub-paint", labour_rate: 30 }];
    expect(canonicalContractorCapabilities({ id: "con-1" }, state)).toEqual([]);
    expect(canonicalContractorCapabilities({ id: "con-1", work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: 40 }] }, state)[0].labour_rate).toBe(40);
  });

  test("category names cannot drift from selected subcategories", () => {
    expect(derivedContractorCategoryNames(db(), [{ subcategory_id: "sub-paint" }, { subcategory_id: "sub-wood" }])).toEqual(["Painting", "Carpentry"]);
    expect(derivedContractorCategoryNames(db(), [])).toEqual([]);
  });

  test("contractor rate master rows are projections of canonical capabilities", () => {
    const rates = contractorRateProjection(db(), {
      id: "con-1",
      name: "Mr Das",
      work_capabilities: [{ subcategory_id: "sub-paint", subcategory_name: "Interior Painting", labour_rate: 40, with_material_rate: 110 }],
    });
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({ contractor_id: "con-1", work_subcategory_id: "sub-paint", labour_rate: 40, with_material_rate: 110, rate: 40 });
  });

  test("material-specific rates project as separate contractor rate rows", () => {
    const rates = contractorRateProjection(db(), {
      id: "con-1",
      name: "Mr Das",
      work_capabilities: [{
        subcategory_id: "sub-paint",
        subcategory_name: "Interior Painting",
        article_ids: ["art-1", "art-2"],
        article_rates: [
          { article_id: "art-1", labour_rate: 30, with_material_rate: 90 },
          { article_id: "art-2", labour_rate: 45, with_material_rate: 140 },
        ],
      }],
    });
    expect(rates.map((rate) => ({ article_id: rate.article_id, labour_rate: rate.labour_rate, with_material_rate: rate.with_material_rate }))).toEqual([
      { article_id: "art-1", labour_rate: 30, with_material_rate: 90 },
      { article_id: "art-2", labour_rate: 45, with_material_rate: 140 },
    ]);
  });
});

describe("contractor validation and duplicate prevention", () => {
  test("create requires phone, city and at least one capability", () => {
    expect(contractorProfileValidationError({ name: "Mr Das", phone: "9876543210", city: "Gorakhpur", work_capabilities: [] }, { isCreate: true })).toBe("Select at least one work capability for the contractor.");
  });

  test("invalid email and rates are rejected", () => {
    expect(contractorProfileValidationError({ name: "Mr Das", email: "invalid" })).toBe("Enter a valid contractor email address.");
    expect(contractorProfileValidationError({ name: "Mr Das", work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: -1 }] })).toBe("Contractor rates must be valid non-negative numbers.");
  });

  test("same phone is a hard duplicate", () => {
    const state = db();
    state.master.contractors = [{ id: "existing", name: "Das Enterprises", phone: "9876543210", city: "Gorakhpur" }];
    const conflicts = contractorDuplicateConflicts(state, { name: "Another Das", phone: "+91 98765 43210", city: "Lucknow" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ hard: true, reasons: ["same phone"] });
  });

  test("same normalized name and city is a warning, not a hard block", () => {
    const state = db();
    state.master.contractors = [{ id: "existing", name: "Das Contractors Pvt Ltd", city: "Gorakhpur" }];
    const conflicts = contractorDuplicateConflicts(state, { name: "Das Contractor", city: "Gorakhpur" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].hard).toBe(false);
  });

  test("referrals require Source Partner ids and discard free-text input", () => {
    const state = db();
    expect(() => normalizeContractorForWrite({ id: "con-1", name: "Mr Das", source_partner_id: "vendor-1" }, state, { id: "con-1" })).toThrow("Choose a valid Source Partner");
    const normalized = normalizeContractorForWrite({ id: "con-1", name: "Mr Das", source_partner_name: "Old free text" }, state, { id: "con-1" });
    expect(normalized.source_partner_name).toBeUndefined();
  });
});

describe("contractor red-box and legacy cleanup", () => {
  test("obsolete tax, banking and optional-capacity keys are discarded from canonical writes", () => {
    const stalePayload: ContractorProfileRecord = {
      id: "con-1",
      name: "Clean Contractor",
      phone: "9876543210",
      city: "Gorakhpur",
      work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: 40 }],
      notes: "Keep this note",
      compliance_documents: [{ id: "doc-1", kind: "identity_proof", verified: false }],
      business_gst: "09ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      bank_account: "1234567890",
      ifsc: "HDFC0001234",
      supervisor_name: "Old supervisor",
      supervisor_phone: "9876543212",
      available_workers: 14,
      concurrent_site_limit: 3,
      earliest_mobilisation_date: "2026-09-01",
      service_radius_km: 45,
      labour_registration_no: "LAB-42",
      insurance_expiry: "2027-12-31",
      pf_no: "PF-42",
      esi_no: "ESI-42",
      bank_verified: true,
      capabilities_v2: [{ id: "old-cap" }],
    };
    const normalized = normalizeContractorForWrite(stalePayload, db(), { id: "con-1" }) as Record<string, unknown>;
    for (const field of removedFields) expect(normalized[field]).toBeUndefined();
    expect(normalized.capabilities_v2).toBeUndefined();
    expect(normalized.notes).toBe("Keep this note");
    expect(normalized.compliance_documents).toEqual([{ id: "doc-1", kind: "identity_proof", verified: false }]);
  });

  test("create persistence preserves canonical data but not obsolete fields", () => {
    const record = contractorMasterRecordForCreate({
      name: "Complete Contractor",
      legal_name: "Complete Contractor Private Limited",
      email: "accounts@example.com",
      notes: "Preferred for complex work",
      work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: 40 }],
      obsolete_payload_field: "discard-me",
      compliance_documents: [{ id: "doc-1", kind: "identity_proof", verified: false }],
    }, "con-42") as Record<string, unknown>;
    expect(record).toMatchObject({ id: "con-42", legal_name: "Complete Contractor Private Limited", email: "accounts@example.com", notes: "Preferred for complex work" });
    expect(record.obsolete_payload_field).toBeUndefined();
    expect(record.compliance_documents).toEqual([{ id: "doc-1", kind: "identity_proof", verified: false }]);
  });

  test("governance projects canonical work capabilities directly", () => {
    const canonical = canonicalContractorCapabilities({ id: "con-1", work_capabilities: [{ subcategory_id: "sub-paint", subcategory_name: "Interior Painting", labour_rate: 40, with_material_rate: 110 }] }, db());
    expect(contractorGovernanceCapabilityProjection("con-1", canonical)[0]).toMatchObject({ id: "ccap-con-1-sub-paint", work_subcategory_id: "sub-paint", labour_rate: 40, with_material_rate: 110, status: "active" });
  });
});
''',
    )

    legacy_path = "tests/contractor-legacy-removal.test.ts"
    legacy = read(legacy_path)
    insertion = '''
  test("removed Contractor tax, banking and optional-capacity fields cannot re-enter the canonical model", async () => {
    const types = await source("src/lib/rdash/types.ts");
    const contractorStart = types.indexOf("export interface Contractor {");
    const contractorEnd = types.indexOf("export type StaffRoleKey", contractorStart);
    const contractorType = types.slice(contractorStart, contractorEnd);
    const profile = await source("src/lib/rdash/contractor-profile.ts");
    const form = await source("src/components/rdash/ContractorFormDialog.tsx");
    const removed = [
      "business_gst", "pan", "bank_account", "ifsc", "supervisor_name", "supervisor_phone",
      "available_workers", "concurrent_site_limit", "earliest_mobilisation_date", "service_radius_km",
      "labour_registration_no", "insurance_expiry", "pf_no", "esi_no", "bank_verified",
    ];
    for (const field of removed) {
      expect(contractorType).not.toContain(field);
      expect(profile).not.toContain(field);
    }
    expect(form).not.toContain("Tax and banking (optional)");
    expect(form).not.toContain("Capacity and optional records");
    expect(form).not.toContain("verifiedContractorBankProof");
  });

  test("Contractor 360 has no unreachable business-details compatibility editor", async () => {
    const module = await source("src/components/rdash/modules/Partner360Module.tsx");
    expect(module).not.toContain("Contractor business details");
    expect(module).not.toContain("updateContractor(partner.id");
    expect(module).toContain("<PartnerBusinessDialog partner={selected}");
  });
'''
    legacy = replace_once(legacy, "\n  test(\"Contractor Rates are read-only at the server commit boundary\"", insertion + "\n  test(\"Contractor Rates are read-only at the server commit boundary\"", "contractor legacy cleanup assertions")
    write(legacy_path, legacy)


def final_source_assertions() -> None:
    form = read("src/components/rdash/ContractorFormDialog.tsx")
    profile = read("src/lib/rdash/contractor-profile.ts")
    types = read("src/lib/rdash/types.ts")
    contractor_slice = types[types.index("export interface Contractor {"):types.index("export type StaffRoleKey")]
    for field in REMOVED_FIELDS:
        if field in profile:
            raise RuntimeError(f"Removed field still in canonical profile: {field}")
        if field in contractor_slice:
            raise RuntimeError(f"Removed field still in Contractor interface: {field}")
    if "Tax and banking (optional)" in form or "Capacity and optional records" in form:
        raise RuntimeError("Removed Contractor UI section still present")


if __name__ == "__main__":
    clean_contractor_form()
    clean_contractor_profile()
    clean_types()
    clean_field_staff_presentation()
    clean_detail_panel()
    clean_partner_governance_helper()
    clean_partner_governance_ui()
    clean_partner360()
    clean_docs()
    rewrite_contractor_tests()
    final_source_assertions()
    print("Contractor profile cleanup applied successfully.")
