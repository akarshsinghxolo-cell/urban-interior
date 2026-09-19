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
    const workspace = await source("src/components/rdash/modules/PartnerDetailContent.tsx");
    expect(workspace).not.toContain("partner.whatsapp");
    expect(workspace).not.toContain("partner.alternate_phone");
    expect(workspace).not.toContain("partner.email");
    expect(workspace).toContain('(partner.phone || "").replace');
    expect(workspace).toContain('https://wa.me/${phone}');
  });

  test("the unused business dialog cannot reintroduce fields removed from the canonical form", async () => {
    expect(await testFile("src/components/rdash/modules/Partner360Module.tsx").exists()).toBe(false);
    const form = await source("src/components/rdash/VendorFormDialog.tsx");
    expectTokens(form, ['Field label="GSTIN"']);
    expectNoTokens(form, ['placeholder="PAN"', 'placeholder="Bank account number"', 'placeholder="IFSC"', 'placeholder="Payment terms"']);
  });

  test("partner governance duplicate detection matches on the canonical mobile only", async () => {
    const governance = await source("src/lib/rdash/partner-governance.ts");
    expect(governance).toContain("normalizePhone(left.phone)");
    expectNoTokens(governance, ["left.phone || left.whatsapp"]);
  });
});
