import { describe, expect, it } from "vitest";
import {
  indianMobileForWrite,
  indianPhoneSearchDigits,
  indianWhatsAppDialDigits,
  isValidIndianMobile,
  sanitizeIndianMobile,
} from "@/lib/rdash/phone-validation";

describe("canonical Indian mobile contract", () => {
  it("normalizes supported Indian input shapes to 10-digit storage", () => {
    expect(sanitizeIndianMobile("+91 98765 01933")).toBe("9876501933");
    expect(sanitizeIndianMobile("91 98765 01933")).toBe("9876501933");
    expect(sanitizeIndianMobile("0091 98765 01933")).toBe("9876501933");
    expect(sanitizeIndianMobile("09876501933")).toBe("9876501933");
    expect(sanitizeIndianMobile("9876501933")).toBe("9876501933");
  });

  it("does not silently truncate arbitrary long or invalid numbers", () => {
    expect(sanitizeIndianMobile("1234567890123")).toBe("1234567890123");
    expect(isValidIndianMobile("1234567890")).toBe(false);
    expect(isValidIndianMobile("5876501933")).toBe(false);
    expect(isValidIndianMobile("987650193")).toBe(false);
    expect(isValidIndianMobile("98765019331")).toBe(false);
  });

  it("allows an empty optional mobile and validates a required mobile at write time", () => {
    expect(isValidIndianMobile("")).toBe(true);
    expect(isValidIndianMobile("", { allowEmpty: false })).toBe(false);
    expect(indianMobileForWrite("")).toBeUndefined();
    expect(() => indianMobileForWrite("", { required: true, label: "Phone" })).toThrow("Phone is required");
  });

  it("returns exactly one canonical persisted value", () => {
    expect(indianMobileForWrite("+91 98765 01933")).toBe("9876501933");
    expect(() => indianMobileForWrite("5555555555")).toThrow("valid 10-digit Indian mobile number");
  });

  it("uses the same canonical number for search and WhatsApp dialing", () => {
    expect(indianPhoneSearchDigits("+91 97283 24682")).toBe("9728324682");
    expect(indianWhatsAppDialDigits("9728324682")).toBe("919728324682");
    expect(indianWhatsAppDialDigits("+91 97283 24682")).toBe("919728324682");
  });
});
