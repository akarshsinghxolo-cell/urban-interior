from __future__ import annotations

from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact match, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:100]!r}")
    write(path, next_text)


# ---------------------------------------------------------------------------
# Canonical Contractor capability/profile model: work_capabilities only.
# ---------------------------------------------------------------------------
profile = "src/lib/rdash/contractor-profile.ts"
regex_once(
    profile,
    r'''export function canonicalContractorCapabilities\(\n  contractor: ContractorProfileRecord,\n  db\?: Pick<RDashDatabase, "master">,\n\): ContractorCapability\[\] \{\n  let rows: Array<Record<string, unknown>> = \[\];\n  if \(Array\.isArray\(contractor\.work_capabilities\)\) \{\n    rows = contractor\.work_capabilities as Array<Record<string, unknown>>;\n  \} else if \(Array\.isArray\(contractor\.capabilities_v2\)\) \{\n    rows = contractor\.capabilities_v2;\n  \} else if \(contractor\.id && db\) \{\n    rows = \(db\.master\.contractorRates \|\| \[\]\)\n      \.filter\(\(rate\) => rate\.contractor_id === contractor\.id && rate\.work_subcategory_id\)\n      \.map\(\(rate\) => \(\{\n        subcategory_id: rate\.work_subcategory_id,\n        subcategory_name: rate\.work_subcategory_name \|\| rate\.trade,\n        labour_rate: rate\.article_id \? undefined : rate\.labour_rate \?\? rate\.rate,\n        with_material_rate: rate\.article_id \? undefined : rate\.with_material_rate,\n        unit_id: rate\.unit_id,\n        article_ids: rate\.article_id \? \[rate\.article_id\] : \[\],\n        article_rates: rate\.article_id \? \[\{\n          article_id: rate\.article_id,\n          article_name: rate\.article_name,\n          labour_rate: rate\.labour_rate \?\? rate\.rate,\n          with_material_rate: rate\.with_material_rate,\n        \}\] : \[\],\n      \}\)\);\n  \}\n\n  const bySubcategory''',
    '''export function canonicalContractorCapabilities(\n  contractor: ContractorProfileRecord,\n  _db?: Pick<RDashDatabase, "master">,\n): ContractorCapability[] {\n  const rows = Array.isArray(contractor.work_capabilities)\n    ? contractor.work_capabilities as Array<Record<string, unknown>>\n    : [];\n\n  const bySubcategory''',
)

replace_once(
    profile,
    '''export function contractorCapabilitiesFromGovernance(\n  capabilities: Array<Record<string, unknown>>,\n): ContractorCapability[] {\n  return canonicalContractorCapabilities({ capabilities_v2: capabilities });\n}\n''',
    '''export function contractorCapabilitiesFromGovernance(\n  capabilities: Array<Record<string, unknown>>,\n): ContractorCapability[] {\n  return canonicalContractorCapabilities({\n    work_capabilities: capabilities as unknown as ContractorCapability[],\n  });\n}\n''',
)

replace_once(
    profile,
    '''): ContractorProfileRecord {\n  return {\n    ...input,\n''',
    '''): ContractorProfileRecord {\n  const canonicalInput: ContractorProfileRecord = { ...input };\n  delete canonicalInput.capabilities_v2;\n  return {\n    ...canonicalInput,\n''',
)

replace_once(
    profile,
    '    capabilities_v2: Array.isArray(input.capabilities_v2) ? input.capabilities_v2 : [],\n',
    '',
)
replace_once(profile, '    status: input.status || "active",\n', '    status: input.status || "onboarding",\n')
replace_once(
    profile,
    '''  const legacyUnmapped = existing.filter(\n    (rate) => rate.contractor_id === contractor.id && !rate.work_subcategory_id,\n  );\n''',
    '',
)
replace_once(
    profile,
    '  return [...projected, ...legacyUnmapped, ...otherContractors];\n',
    '  return [...projected, ...otherContractors];\n',
)
replace_once(
    profile,
    '    source_partner_name: sourcePartner?.name || (!input.source_partner_id ? String(input.source_partner_name || "").trim() || undefined : undefined),\n',
    '    source_partner_name: sourcePartner?.name,\n',
)
replace_once(
    profile,
    '    capabilities_v2: id ? contractorGovernanceCapabilityProjection(id, capabilities) : [],\n',
    '',
)
replace_once(
    profile,
    '''  };\n  normalized.compliance_documents = contractorProfileComplianceDocuments(normalized);\n''',
    '''  };\n  delete normalized.capabilities_v2;\n  normalized.compliance_documents = contractorProfileComplianceDocuments(normalized);\n''',
)

# ---------------------------------------------------------------------------
# Contractor form: Source Partner ID only; no free-text referral compatibility.
# ---------------------------------------------------------------------------
contractor_form = "src/components/rdash/ContractorFormDialog.tsx"
replace_once(contractor_form, '  const [legacyReferral, setLegacyReferral] = React.useState("");\n', '')
replace_once(
    contractor_form,
    '      source_partner_name: sourcePartner?.name || (!referralId ? referralQuery.trim() || undefined : undefined),\n',
    '      source_partner_name: sourcePartner?.name,\n',
)
replace_once(
    contractor_form,
    '    setReferralQuery(String(normalized.source_partner_name || ""));\n    setLegacyReferral(normalized.source_partner_id ? "" : String(normalized.source_partner_name || ""));\n',
    '    setReferralQuery(normalized.source_partner_id ? String(normalized.source_partner_name || "") : "");\n',
)
replace_once(
    contractor_form,
    '''  const referralError = referralQuery.trim() && !referralId && referralQuery.trim() !== legacyReferral\n    ? "Choose an existing Source Partner from the referral search results."\n    : null;\n''',
    '''  const referralError = referralQuery.trim() && !referralId\n    ? "Choose an existing Source Partner from the referral search results."\n    : null;\n''',
)
replace_once(
    contractor_form,
    'Only Source Partner records can be linked. Legacy free-text referrals are preserved until changed.',
    'Only existing Source Partner records can be linked.',
)

# ---------------------------------------------------------------------------
# Governance: derive Contractor rows from work_capabilities; never persist v2.
# ---------------------------------------------------------------------------
governance = "src/components/rdash/modules/PartnerGovernanceModule.tsx"
replace_once(
    governance,
    '''import {\n  contractorCapabilitiesFromGovernance,\n  contractorGovernanceCapabilityProjection,\n  derivedContractorCategoryNames,\n} from "@/lib/rdash/contractor-profile";\n''',
    '''import {\n  canonicalContractorCapabilities,\n  contractorCapabilitiesFromGovernance,\n  contractorGovernanceCapabilityProjection,\n  derivedContractorCategoryNames,\n} from "@/lib/rdash/contractor-profile";\n''',
)
replace_once(
    governance,
    '  const capabilities = selected ? partnerCapabilities(selected) : [];\n',
    '''  const capabilities = selected\n    ? mode === "contractor"\n      ? contractorGovernanceCapabilityProjection(\n          selected.id,\n          canonicalContractorCapabilities(selected, db),\n        )\n      : partnerCapabilities(selected)\n    : [];\n''',
)
replace_once(
    governance,
    '''      updateContractor(id, {\n        ...patch,\n        work_capabilities: workCapabilities,\n        capabilities_v2: contractorGovernanceCapabilityProjection(id, workCapabilities),\n        categories: derivedContractorCategoryNames(db, workCapabilities),\n      } as any);\n''',
    '''      updateContractor(id, {\n        work_capabilities: workCapabilities,\n        categories: derivedContractorCategoryNames(db, workCapabilities),\n      } as any);\n''',
)

# Prefer canonical work_capabilities in the shared presentation helper too.
partner_governance = "src/lib/rdash/partner-governance.ts"
regex_once(
    partner_governance,
    r'''export function partnerCapabilities\(partner: Record<string, unknown>\): PartnerCapability\[\] \{\n  const governed = Array\.isArray\(partner\.capabilities_v2\)\n    \? \(partner\.capabilities_v2 as PartnerCapability\[\]\)\n    : \[\];\n  if \(governed\.length\) return governed;\n  if \(!Array\.isArray\(partner\.work_capabilities\)\) return \[\];\n\n  const partnerId = String\(partner\.id \|\| "contractor"\);\n  return \(partner\.work_capabilities as Array<Record<string, unknown>>\)\.flatMap\(\(row\) => \{.*?\n  \}\);\n\}''',
    '''export function partnerCapabilities(partner: Record<string, unknown>): PartnerCapability[] {\n  if (Array.isArray(partner.work_capabilities)) {\n    const partnerId = String(partner.id || "contractor");\n    return (partner.work_capabilities as Array<Record<string, unknown>>).flatMap((row) => {\n      const subcategoryId = String(row.subcategory_id || row.work_subcategory_id || "").trim();\n      if (!subcategoryId) return [];\n      return [{\n        ...row,\n        id: String(row.id || `ccap-${partnerId}-${subcategoryId}`),\n        work_subcategory_id: subcategoryId,\n        work_subcategory_name: row.subcategory_name || row.work_subcategory_name,\n        status: row.status === "inactive" ? "inactive" : "active",\n        created_at: String(row.created_at || new Date(0).toISOString()),\n        updated_at: String(row.updated_at || new Date(0).toISOString()),\n      } as PartnerCapability];\n    });\n  }\n  return Array.isArray(partner.capabilities_v2)\n    ? (partner.capabilities_v2 as PartnerCapability[])\n    : [];\n}''',
    flags=re.S,
)

# ---------------------------------------------------------------------------
# Contractor operations presentation: use the same canonical rate projection.
# ---------------------------------------------------------------------------
detail = "src/components/rdash/modules/ContractorDetailModule.tsx"
replace_once(
    detail,
    'import { useRDashStore, contractorBids, contractorSettlements, contractorOutstanding } from "@/lib/rdash/store";\n',
    'import { useRDashStore, contractorBids, contractorSettlements, contractorOutstanding } from "@/lib/rdash/store";\nimport { contractorRateProjection } from "@/lib/rdash/contractor-profile";\n',
)
replace_once(
    detail,
    '                const rates = db.master.contractorRates.filter((r) => r.contractor_id === c.id);\n',
    '                const rates = contractorRateProjection(db, c).filter((r) => r.contractor_id === c.id);\n',
)
replace_once(detail, '            if (c.trade) cats.set(`trade:${c.trade}`, c.trade);\n', '')
replace_once(
    detail,
    '''                if (categoryFilter.startsWith("trade:")) {\n                    const tradeVal = categoryFilter.slice(6);\n                    return c.trade === tradeVal || (c.work_capabilities?.some((cap) => cap.subcategory_name === tradeVal));\n                }\n''',
    '',
)
replace_once(detail, '                if (c.trade) contractorCategories.add(c.trade);\n', '')
replace_once(
    detail,
    '<p className="text-xs text-muted-foreground">{selected.trade} · {selected.city}</p>',
    '<p className="text-xs text-muted-foreground">{selected.contractorCategories?.join(", ") || "Capabilities configured"} · {selected.city}</p>',
)
regex_once(
    detail,
    r'''\n                  \{selected\.specializations && selected\.specializations\.length > 0 && \(<div className="mt-1 flex flex-wrap gap-1">\n                      \{selected\.specializations\.map\(\(s\) => \(<span key=\{s\} className="rounded bg-muted px-1\.5 py-0\.5 text-\[10px\] font-medium text-muted-foreground">\{s\}</span>\)\)\}\n                    </div>\)\}''',
    '',
)

# ---------------------------------------------------------------------------
# Regression tests: no fallback resurrection, no persisted v2 compatibility.
# ---------------------------------------------------------------------------
tests = "tests/contractor-profile.test.ts"
regex_once(
    tests,
    r'''  test\("capability rows are canonical and legacy contractor rates are only a fallback", \(\) => \{.*?\n  \}\);\n''',
    '''  test("missing canonical capabilities does not resurrect legacy rate rows", () => {\n    const state = db();\n    state.master.contractorRates = [{\n      id: "rate-1",\n      contractor_id: "con-1",\n      trade: "Interior Painting",\n      rate: 30,\n      work_subcategory_id: "sub-paint",\n      labour_rate: 30,\n    }];\n\n    expect(canonicalContractorCapabilities({ id: "con-1" }, state)).toEqual([]);\n    expect(canonicalContractorCapabilities({\n      id: "con-1",\n      work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: 40 }],\n    }, state)[0].labour_rate).toBe(40);\n  });\n''',
    flags=re.S,
)
regex_once(
    tests,
    r'''  test\("material rate fallback does not overwrite the subcategory default", \(\) => \{.*?\n  \}\);\n''',
    '''  test("existing projected rows cannot become a second rate source", () => {\n    const state = db();\n    state.master.contractorRates = [{\n      id: "rate-default",\n      contractor_id: "con-1",\n      trade: "Interior Painting",\n      rate: 30,\n      work_subcategory_id: "sub-paint",\n      labour_rate: 30,\n    }];\n    const capability = canonicalContractorCapabilities({\n      id: "con-1",\n      work_capabilities: [{\n        subcategory_id: "sub-paint",\n        labour_rate: 55,\n        with_material_rate: 125,\n      }],\n    }, state)[0];\n    expect(capability.labour_rate).toBe(55);\n    expect(capability.with_material_rate).toBe(125);\n  });\n''',
    flags=re.S,
)
replace_once(
    tests,
    '    expect(record.capabilities_v2).toHaveLength(1);\n',
    '    expect(record.capabilities_v2).toBeUndefined();\n',
)
replace_once(
    tests,
    '''  test("referral ids must resolve to Source Partners", () => {\n    const state = db();\n    expect(() =>\n      normalizeContractorForWrite(\n        { id: "con-1", name: "Mr Das", source_partner_id: "vendor-1" },\n        state,\n        { id: "con-1" },\n      ),\n    ).toThrow("Choose a valid Source Partner");\n  });\n''',
    '''  test("referrals require Source Partner ids and discard free-text compatibility", () => {\n    const state = db();\n    expect(() =>\n      normalizeContractorForWrite(\n        { id: "con-1", name: "Mr Das", source_partner_id: "vendor-1" },\n        state,\n        { id: "con-1" },\n      ),\n    ).toThrow("Choose a valid Source Partner");\n    const normalized = normalizeContractorForWrite(\n      { id: "con-1", name: "Mr Das", source_partner_name: "Old free text" },\n      state,\n      { id: "con-1" },\n    );\n    expect(normalized.source_partner_name).toBeUndefined();\n  });\n''',
)

# Add a source-level regression suite that prevents the removed paths returning.
legacy_test = Path("tests/contractor-legacy-removal.test.ts")
legacy_test.write_text('''import { describe, expect, test } from "bun:test";\n\nconst source = async (path: string) => Bun.file(path).text();\n\ndescribe("Contractor legacy-path removal", () => {\n  test("the shared partner form is Vendor-only", async () => {\n    const form = await source("src/components/rdash/UnifiedPartnerFormDialog.tsx");\n    const router = await source("src/components/rdash/PartnerFormDialog.tsx");\n    expect(form).not.toContain("addContractor");\n    expect(form).not.toContain("updateContractor");\n    expect(form).not.toContain("contractorPhoto");\n    expect(form).not.toContain('type: "contractor"');\n    expect(router).toContain("<ContractorFormDialog");\n    expect(router).toContain('<UnifiedVendorForm\\n      type="vendor"');\n  });\n\n  test("the form store bridge is Vendor-only", async () => {\n    const bridge = await source("src/lib/rdash/partner-form-store-bridge.ts");\n    expect(bridge).not.toContain("updateContractor");\n    expect(bridge).not.toContain('"contractor"');\n  });\n\n  test("Contractor writes expose one canonical capability model", async () => {\n    const profile = await source("src/lib/rdash/contractor-profile.ts");\n    const policy = await source("src/lib/rdash/contractor-store-policy.ts");\n    const governance = await source("src/components/rdash/modules/PartnerGovernanceModule.tsx");\n    expect(profile).toContain("const rows = Array.isArray(contractor.work_capabilities)");\n    expect(profile).not.toContain("const legacyUnmapped");\n    expect(profile).toContain("delete normalized.capabilities_v2");\n    expect(policy).not.toContain("capabilities_v2");\n    expect(policy).toContain("must be linked to a Work Subcategory");\n    expect(governance).toContain("canonicalContractorCapabilities(selected, db)");\n    expect(governance).not.toContain("capabilities_v2: contractorGovernanceCapabilityProjection");\n  });\n\n  test("Contractor referrals and operations do not use the removed paths", async () => {\n    const form = await source("src/components/rdash/ContractorFormDialog.tsx");\n    const detail = await source("src/components/rdash/modules/ContractorDetailModule.tsx");\n    expect(form).not.toContain("legacyReferral");\n    expect(form).not.toContain("Legacy free-text referrals");\n    expect(detail).toContain("contractorRateProjection(db, c)");\n  });\n});\n''')

# Ensure the permanent Contractor test command includes the cleanup regression suite.
package = "package.json"
replace_once(
    package,
    '    "test:contractor-profile": "bun test tests/contractor-profile.test.ts"\n',
    '    "test:contractor-profile": "bun test tests/contractor-profile.test.ts tests/contractor-legacy-removal.test.ts"\n',
)

# Remove the temporary CI plumbing from the final committed tree. The currently
# running workflow keeps its already-parsed steps and will still commit the result.
ci = ".github/workflows/application-ci.yml"
ci_text = read(ci)
ci_text, removed = re.subn(
    r'\n      # CONTRACTOR-CLEANUP-BEGIN.*?# CONTRACTOR-CLEANUP-END\n',
    '\n',
    ci_text,
    flags=re.S,
)
if removed != 3:
    raise RuntimeError(f"{ci}: expected to remove 3 temporary cleanup blocks, removed {removed}")
write(ci, ci_text)

print("Contractor legacy cleanup applied successfully.")
