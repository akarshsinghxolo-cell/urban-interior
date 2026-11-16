import { describe, expect, test } from "vitest";

import { addressCity, addressLocality } from "../src/lib/rdash/location-search";

describe("location address extraction", () => {
  test("maps Indian tehsil and district fields to locality and city", () => {
    const address = { county: "Hata", state_district: "Kushinagar" };

    expect(addressLocality(address)).toBe("Hata");
    expect(addressCity(address)).toBe("Kushinagar");
  });

  test("keeps explicit city and suburb as the preferred values", () => {
    const address = { city: "Gorakhpur", suburb: "Civil Lines", county: "Sadar", state_district: "Gorakhpur" };

    expect(addressLocality(address)).toBe("Civil Lines");
    expect(addressCity(address)).toBe("Gorakhpur");
  });
});
