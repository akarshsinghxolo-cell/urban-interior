import { describe, expect, test } from "bun:test";

const source = async (path: string) => Bun.file(path).text();

describe("Contractor legacy-path removal", () => {
  test("the shared partner form is Vendor-only", async () => {
    const form = await source("src/components/rdash/UnifiedPartnerFormDialog.tsx");
    const router = await source("src/components/rdash/PartnerFormDialog.tsx");
    expect(form).not.toContain("addContractor");
    expect(form).not.toContain("updateContractor");
    expect(form).not.toContain("contractorPhoto");
    expect(form).not.toContain('type: "contractor"');
    expect(router).toContain("<ContractorFormDialog");
    expect(router).toContain('<UnifiedVendorForm\n      type="vendor"');
  });

  test("the form store bridge is Vendor-only", async () => {
    const bridge = await source("src/lib/rdash/partner-form-store-bridge.ts");
    expect(bridge).not.toContain("updateContractor");
    expect(bridge).not.toContain('"contractor"');
  });

  test("Contractor writes expose one canonical capability model", async () => {
    const profile = await source("src/lib/rdash/contractor-profile.ts");
    const policy = await source("src/lib/rdash/contractor-store-policy.ts");
    const governance = await source("src/components/rdash/modules/PartnerGovernanceModule.tsx");
    expect(profile).toContain("const rows = Array.isArray(contractor.work_capabilities)");
    expect(profile).not.toContain("const legacyUnmapped");
    expect(profile).toContain("delete normalized.capabilities_v2");
    expect(policy).not.toContain("capabilities_v2");
    expect(policy).toContain("must be linked to a Work Subcategory");
    expect(governance).toContain("canonicalContractorCapabilities(selected, db)");
    expect(governance).not.toContain("capabilities_v2: contractorGovernanceCapabilityProjection");
  });

  test("Contractor referrals and operations do not use the removed paths", async () => {
    const form = await source("src/components/rdash/ContractorFormDialog.tsx");
    const detail = await source("src/components/rdash/modules/ContractorDetailModule.tsx");
    expect(form).not.toContain("legacyReferral");
    expect(form).not.toContain("Legacy free-text referrals");
    expect(detail).toContain("contractorRateProjection(db, c)");
  });
});
