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

  test("uses the segment before city when the provider repeats city as locality", () => {
    const address = { city: "Gorakhpur", city_district: "Gorakhpur", state: "Uttar Pradesh", postcode: "273001" };

    expect(addressLocality(address, "karim nagar, Gorakhpur, Uttar Pradesh, 273001, India")).toBe("karim nagar");
    expect(addressCity(address)).toBe("Gorakhpur");
  });
});
