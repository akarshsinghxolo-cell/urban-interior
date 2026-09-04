import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Contractor legacy-path removal", () => {
  test("the shared partner form is Vendor-only", async () => {
    const router = await source("src/components/rdash/PartnerFormDialog.tsx");
    expect(router).toContain("<ContractorFormDialog");
    expect(router).toContain("<VendorFormDialog");
  });

  test("the obsolete shared form bridge is removed", async () => {
    expect(await testFile("src/lib/rdash/partner-form-store-bridge.ts").exists()).toBe(false);
    expect(await testFile("src/components/rdash/UnifiedPartnerFormDialog.tsx").exists()).toBe(false);
  });

  test("Contractor writes expose one canonical capability model", async () => {
    const profile = await source("src/lib/rdash/contractor-profile.ts");
    const policy = await source("src/lib/rdash/contractor-store-policy.ts");
    const governance = await source("src/components/rdash/modules/PartnerGovernanceModule.tsx");
    expect(profile).toContain("Array.isArray(contractor.work_capabilities)");
    expectNoTokens(profile, ["const legacyUnmapped"]);
    expect(profile).not.toContain("capabilities_v2");
    expect(policy).not.toContain("capabilities_v2");
    expectTokens(policy, ["must be linked to a Work Subcategory"]);
    expectTokens(governance, ["canonicalContractorCapabilities(selected, db)"]);
    expectNoTokens(governance, ["capabilities_v2: contractorGovernanceCapabilityProjection"]);
    expectNoTokens(governance, ["else if (Array.isArray(patch.capabilities_v2))"]);
    expectTokens(governance, ["canonicalContractorCapabilities(partner, db).length"]);
    expectTokens(governance, ["OperationalMediaPanel entityType={mode}"]);
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
    expectTokens(governance, ["export function vendorCapabilities"]);
    expectNoTokens(governance, ["export function partnerCapabilities"]);
    expect(governance).not.toContain("partner.work_capabilities");
    expect(governanceUi).toContain("vendorCapabilities(selected)");
    expect(governanceUi).toContain("vendorCapabilities(partner)");
    expectTokens(governanceUi, ["canonicalContractorCapabilities(selected, db)"]);
  });

  test("Contractor referrals and operations do not use the removed paths", async () => {
    const form = await source("src/components/rdash/ContractorFormDialog.tsx");
    const detail = await source("src/components/rdash/modules/ContractorDetailModule.tsx");
    expect(form).not.toContain("legacyReferral");
    expectNoTokens(form, ["Legacy free-text referrals"]);
    expect(form).not.toContain("business_gst");
    expect(form).not.toContain("bank_account");
    expect(form).not.toContain("supervisor_name");
    expect(form).not.toContain("concurrent_site_limit");
    expectTokens(form, ["Add work type"]);
    expectTokens(detail, ["contractorRateProjection(db, c)"]);
  });

  test("Contractor Rates are canonicalized (never trusted) at the server commit boundary", async () => {
    const server = await source("src/lib/rdash/server/authorized-commit.ts");
    // Rates-only commits re-project from stored capabilities instead of being
    // rejected — the old hard rejection broke legitimate edits (Task 17).
    expect(server).toContain("canonicalizeContractorRateOperations(");
    expect(server).toContain("contractorRateProjection(");
    expectNoTokens(server, ["read-only projections"]);
    expectTokens(server, ['operations.filter((operation) => operation.collection !== "master.contractorRates")']);
  });

  test("Contractor store policy saves capabilities and rate projection in ONE transaction", async () => {
    const policy = await source("src/lib/rdash/contractor-store-policy.ts");
    expect(policy).toContain("inTransaction(\"updateContractor\"");
    expect(policy).toContain("inTransaction(\"addContractor\"");
    expect(policy).toContain("inTransaction(\"addContractorRate\"");
    const store = await source("src/lib/rdash/raw-store.ts");
    expect(store).toContain("__runInWorkspaceTransaction");
  });
});
