import { describe, expect, test } from "bun:test";

const source = async (path: string) => Bun.file(path).text();

describe("Contractor legacy-path removal", () => {
  test("the shared partner form is Vendor-only", async () => {
    const router = await source("src/components/rdash/PartnerFormDialog.tsx");
    expect(router).toContain("<ContractorFormDialog");
    expect(router).toContain("<VendorFormDialog");
  });

  test("the obsolete shared form bridge is removed", async () => {
    expect(await Bun.file("src/lib/rdash/partner-form-store-bridge.ts").exists()).toBe(false);
    expect(await Bun.file("src/components/rdash/UnifiedPartnerFormDialog.tsx").exists()).toBe(false);
  });

  test("Contractor writes expose one canonical capability model", async () => {
    const profile = await source("src/lib/rdash/contractor-profile.ts");
    const policy = await source("src/lib/rdash/contractor-store-policy.ts");
    const governance = await source("src/components/rdash/modules/PartnerGovernanceModule.tsx");
    expect(profile).toContain("const rows = Array.isArray(contractor.work_capabilities)");
    expect(profile).not.toContain("const legacyUnmapped");
    expect(profile).not.toContain("capabilities_v2");
    expect(policy).not.toContain("capabilities_v2");
    expect(policy).toContain("must be linked to a Work Subcategory");
    expect(governance).toContain("canonicalContractorCapabilities(selected, db)");
    expect(governance).not.toContain("capabilities_v2: contractorGovernanceCapabilityProjection");
    expect(governance).not.toContain("else if (Array.isArray(patch.capabilities_v2))");
    expect(governance).toContain("canonicalContractorCapabilities(partner, db).length");
    expect(governance).toContain("OperationalMediaPanel entityType={mode}");
  });

  test("Contractor types and shared helpers expose no compatibility fallback", async () => {
    const types = await source("src/lib/rdash/types.ts");
    const contractorStart = types.indexOf("export interface Contractor {");
    const contractorEnd = types.indexOf("export type StaffRoleKey", contractorStart);
    const contractorType = types.slice(contractorStart, contractorEnd);
    const governance = await source("src/lib/rdash/partner-governance.ts");
    const governanceUi = await source("src/components/rdash/modules/PartnerGovernanceModule.tsx");

    expect(contractorStart).toBeGreaterThanOrEqual(0);
    expect(contractorEnd).toBeGreaterThan(contractorStart);
    expect(contractorType).not.toContain("capabilities_v2");
    expect(governance).toContain("export function vendorCapabilities");
    expect(governance).not.toContain("export function partnerCapabilities");
    expect(governance).not.toContain("partner.work_capabilities");
    expect(governanceUi).toContain("vendorCapabilities(selected)");
    expect(governanceUi).toContain("vendorCapabilities(partner)");
    expect(governanceUi).toContain("canonicalContractorCapabilities(selected, db)");
  });

  test("Contractor referrals and operations do not use the removed paths", async () => {
    const form = await source("src/components/rdash/ContractorFormDialog.tsx");
    const detail = await source("src/components/rdash/modules/ContractorDetailModule.tsx");
    expect(form).not.toContain("legacyReferral");
    expect(form).not.toContain("Legacy free-text referrals");
    expect(detail).toContain("contractorRateProjection(db, c)");
  });

  test("Contractor Rates are read-only at the server commit boundary", async () => {
    const server = await source("src/lib/rdash/server/authorized-commit.ts");
    expect(server).toContain("Contractor Rates are read-only projections");
    expect(server).toContain('operations.filter((operation) => operation.collection !== "master.contractorRates")');
    expect(server).toContain("contractorRateProjection(");
  });
});
