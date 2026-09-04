import { describe, expect, it } from "vitest";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { validIndianPhone } from "@/components/rdash/customer-sites-form-model";

describe("sanitizeIndianMobile", () => {
  it("strips formatting from a +91 country-code number", () => {
    expect(sanitizeIndianMobile("+91 9876501933")).toBe("9876501933");
    expect(sanitizeIndianMobile("91 98765 01933")).toBe("9876501933");
  });

  it("strips a leading trunk zero", () => {
    expect(sanitizeIndianMobile("09876501933")).toBe("9876501933");
  });

  it("leaves plain 10-digit numbers untouched", () => {
    expect(sanitizeIndianMobile("9876501933")).toBe("9876501933");
  });

  it("never strips 91 from a 10-digit number (country code is 12 digits only)", () => {
    expect(sanitizeIndianMobile("9198765019")).toBe("9198765019");
  });
});

describe("validIndianPhone (regression: seeded +91 numbers must validate)", () => {
  it("accepts the canonical seeded mobile with +91 prefix", () => {
    expect(validIndianPhone("+91 9876501933")).toBe(true);
  });

  it("accepts every seeded staff/customer phone shape", () => {
    expect(validIndianPhone("+91 9876520110")).toBe(true);
    expect(validIndianPhone("09876501933")).toBe(true);
    expect(validIndianPhone("9876501933")).toBe(true);
  });

  it("still rejects numbers with too few or too many digits", () => {
    expect(validIndianPhone("987650193")).toBe(false);
    expect(validIndianPhone("98765019331")).toBe(false);
    expect(validIndianPhone("not-a-phone")).toBe(false);
  });

  it("treats empty input as valid (phone is optional)", () => {
    expect(validIndianPhone("")).toBe(true);
  });
});
