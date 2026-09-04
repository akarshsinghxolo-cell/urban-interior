import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Vendor secondary-contact removal", () => {
  test("the Vendor add/edit form collects no WhatsApp, alternate phone or email", async () => {
    const form = await source("src/components/rdash/VendorFormDialog.tsx");
    expect(form).not.toContain("whatsapp");
    expect(form).not.toContain("WhatsApp");
    expect(form).not.toContain("alternate_phone");
    expect(form).not.toContain("alternatePhone");
    expect(form).not.toContain('type="email"');
    expectTokens(form, ['Field label="Mobile"']);
    expectTokens(form, ['Field label="GSTIN"']);
  });

  test("the Vendor type and canonical write path expose no secondary contacts", async () => {
    const types = await source("src/lib/rdash/types.ts");
    const vendorStart = types.indexOf("export interface Vendor {");
    const vendorEnd = types.indexOf("export interface Contractor {", vendorStart);
    const vendorType = types.slice(vendorStart, vendorEnd);
    expect(vendorStart).toBeGreaterThanOrEqual(0);
    expect(vendorEnd).toBeGreaterThan(vendorStart);
    for (const removed of ["whatsapp", "alternate_phone", "email"]) {
      expect(vendorType).not.toContain(removed);
    }

    const profile = await source("src/lib/rdash/vendor-profile.ts");
    expect(profile).not.toContain("whatsapp");
    expect(profile).not.toContain("alternate_phone");
    expect(profile).not.toContain("email");
  });

  test("Vendor 360 surfaces are free of secondary-contact cells and actions", async () => {
    const partner360 = await source("src/components/rdash/modules/Partner360Module.tsx");
    expectNoTokens(partner360, ['InfoCell label="WhatsApp"']);
    expectNoTokens(partner360, ['InfoCell label="Alternate phone"']);
    expectNoTokens(partner360, ['InfoCell label="Email"']);
    expect(partner360).not.toContain("partner.whatsapp");
    expect(partner360).not.toContain("partner.alternate_phone");
    expect(partner360).not.toContain("partner.email");
    expect(partner360).toContain("whatsappHref(selected.phone)");

    const workspace = await source("src/components/rdash/modules/VendorWorkspaceModule.tsx");
    expect(workspace).not.toContain("selected.whatsapp");
    expect(workspace).not.toContain("selected.alternate_phone");
    expect(workspace).not.toContain("selected.email");
    expect(workspace).toContain("whatsappHref(selected.phone)");
  });

  test("Vendor business dialog keeps identity, tax, banking and commercial terms", async () => {
    const partner360 = await source("src/components/rdash/modules/Partner360Module.tsx");
    expectTokens(partner360, ["Vendor business details"]);
    expect(partner360).toContain('placeholder="GSTIN"');
    expect(partner360).toContain('placeholder="PAN"');
    expectTokens(partner360, ['placeholder="Bank account number"']);
    expect(partner360).toContain('placeholder="IFSC"');
    expectTokens(partner360, ['placeholder="Payment terms"']);
  });

  test("partner governance duplicate detection matches on the canonical mobile only", async () => {
    const governance = await source("src/lib/rdash/partner-governance.ts");
    expect(governance).toContain("normalizePhone(left.phone)");
    expectNoTokens(governance, ["left.phone || left.whatsapp"]);
  });
});
