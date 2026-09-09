import { describe, expect, test } from "vitest";
import { areaChipQuantity, groupedQuotationScopeLines } from "@/lib/rdash/work-types";
import { buildQuotationShareText } from "@/lib/rdash/quotation-share";

/**
 * Quotation scope lines in the user's annotated format: ONE row per covered
 * Work Required decision (annotation F shape) with the joined any-one-of
 * title and NO area names (annotation A), an area chip per measured area that
 * the editor can remove with a × (annotation B), and quantity = Σ chips so a
 * removal re-derives it automatically (annotation C).
 */
describe("groupedQuotationScopeLines (quotation decision rows + removable area chips)", () => {
  const workSubcategories = [
    { id: "sub-tgr", category_id: "cat-railing", name: "Toughened Glass Railing", work_types: [{ id: "wt-tgr-std", name: "Standard" }] },
    { id: "sub-ssr", category_id: "cat-railing", name: "SS Railing", work_types: [{ id: "wt-ssr-std", name: "Standard" }] },
    { id: "sub-carpet", category_id: "cat-floor", name: "Carpet / Carpet Tiles", work_types: [{ id: "wt-carpet-std", name: "Standard" }] },
    { id: "sub-ceramic", category_id: "cat-floor", name: "Ceramic Tiles", work_types: [{ id: "wt-ceramic-std", name: "Standard" }] },
    { id: "sub-parking", category_id: "cat-floor", name: "Parking Tiles / Pavers", work_types: [{ id: "wt-parking-std", name: "Standard" }] },
  ] as any;
  const areas = [
    { id: "area-rooftop", name: "Rooftop" },
    { id: "area-guest", name: "Guest room" },
    { id: "area-lobby", name: "Lobby" },
  ] as any;

  const railingWork = {
    id: "wr-railing",
    title: "Rooftop · Toughened Glass Railing · Standard / SS Railing · Standard / WPC Railing · Standard",
    work_subcategory_ids: ["sub-tgr", "sub-ssr"],
    work_type_ids: ["wt-tgr-std", "wt-ssr-std"],
    area_ids: ["area-rooftop"],
    structured_items: [
      { id: "li-1", area_id: "area-rooftop", area_name: "Rooftop", subcategory_id: "sub-tgr", work_type_id: "wt-tgr-std", quantity: 10, rate: 0, amount: 0, unit_name: "rft", option_pairs: [{ subcategory_id: "sub-tgr", work_type_id: "wt-tgr-std" }, { subcategory_id: "sub-ssr", work_type_id: "wt-ssr-std" }] },
    ],
  } as any;

  const floorWork = {
    id: "wr-floor",
    title: "Flooring",
    work_subcategory_ids: ["sub-carpet", "sub-ceramic", "sub-parking"],
    work_type_ids: ["wt-carpet-std", "wt-ceramic-std", "wt-parking-std"],
    area_ids: ["area-lobby", "area-guest"],
    structured_items: [
      // Lobby: the old exploded alternatives drifted apart (101/105) — plus
      // the merged any-one-of recapture (qty 20) that must price the area.
      { id: "li-2", area_id: "area-lobby", area_name: "Lobby", subcategory_id: "sub-carpet", quantity: 101, rate: 0, amount: 0 },
      { id: "li-3", area_id: "area-lobby", area_name: "Lobby", subcategory_id: "sub-ceramic", quantity: 105, rate: 0, amount: 0 },
      { id: "li-4", area_id: "area-lobby", area_name: "Lobby", subcategory_id: "sub-carpet", quantity: 20, rate: 12, amount: 240, option_pairs: [{ subcategory_id: "sub-carpet" }, { subcategory_id: "sub-ceramic" }, { subcategory_id: "sub-parking" }] },
      // Guest room: only the merged decision item.
      { id: "li-5", area_id: "area-guest", area_name: "Guest room", subcategory_id: "sub-carpet", quantity: 144, rate: 12, amount: 1728, option_pairs: [{ subcategory_id: "sub-carpet" }, { subcategory_id: "sub-ceramic" }] },
    ],
  } as any;

  test("one row per decision: joined title without area names, area chip per area, qty = Σ chips", () => {
    const lines = groupedQuotationScopeLines({
      workSubcategories,
      areas,
      coveredWork: [railingWork, floorWork],
      newId: (work) => `qi-${work.id}`,
    });
    expect(lines.map((line) => line.title)).toEqual([
      "Toughened Glass Railing · Standard / SS Railing · Standard",
      "Carpet / Carpet Tiles · Standard / Ceramic Tiles · Standard / Parking Tiles / Pavers · Standard",
    ]);
    expect(lines[0].area_chips).toEqual([{ area_id: "area-rooftop", area_name: "Rooftop", quantity: 10 }]);
    expect(lines[0].quantity).toBe(10);
    // No area names inside the title text (annotation A) — they live in chips.
    expect(lines[0].title).not.toContain("Rooftop ·");
    // Flooring: chips follow the Work Required's own area order.
    expect(lines[1].area_chips).toEqual([
      { area_id: "area-lobby", area_name: "Lobby", quantity: 20 },
      { area_id: "area-guest", area_name: "Guest room", quantity: 144 },
    ]);
    expect(lines[1].quantity).toBe(164);
  });

  test("exploded alternatives price ONCE per area — the decision's primary item wins", () => {
    const lines = groupedQuotationScopeLines({
      workSubcategories,
      areas,
      coveredWork: [floorWork],
      newId: () => "qi-x",
    });
    // Lobby's 101 + 105 drifted alternatives collapse into the merged 20.
    expect(lines[0].area_chips!.map((chip) => chip.quantity)).toEqual([20, 144]);
    // Amount = Σ the primaries' amounts (240 + 1728), rate = amount / qty.
    expect(lines[0].amount).toBe(1968);
    expect(lines[0].rate).toBe(12);
  });

  test("removing a chip re-derives the quantity; the last chip removes the line (editor contract)", () => {
    const lines = groupedQuotationScopeLines({
      workSubcategories,
      areas,
      coveredWork: [floorWork],
      newId: () => "qi-x",
    });
    const chips = lines[0].area_chips!;
    // What the editor's × does: drop one chip, quantity follows the sum.
    const rest = chips.filter((_, index) => index !== 0);
    expect(areaChipQuantity(rest)).toBe(144);
    expect(areaChipQuantity([])).toBe(0);
  });

  test("works without measured items produce no line; legacy titles fall back to the stored title", () => {
    const emptyWork = { ...railingWork, id: "wr-empty", structured_items: [] } as any;
    const legacyWork = {
      id: "wr-legacy",
      title: "Old scope row",
      work_subcategory_ids: [],
      work_type_ids: undefined,
      area_ids: ["area-rooftop"],
      structured_items: [{ id: "li-9", area_id: "area-rooftop", subcategory_id: undefined, quantity: 5, rate: 0, amount: 0 }],
    } as any;
    const lines = groupedQuotationScopeLines({
      workSubcategories,
      areas,
      coveredWork: [emptyWork, legacyWork],
      newId: (work) => `qi-${work.id}`,
    });
    expect(lines.map((line) => line.id)).toEqual(["qi-wr-legacy"]);
    expect(lines[0].title).toBe("Old scope row");
    expect(lines[0].area_chips).toEqual([{ area_id: "area-rooftop", area_name: "Rooftop", quantity: 5 }]);
  });
});

describe("quotation share text with area chips", () => {
  test("multi-area lines list their areas under the item", () => {
    const text = buildQuotationShareText({
      quotation_no: "Q-2026-001",
      customer_name: "Kunal Ji",
      title: "Scope",
      status: "draft",
      revision_no: 0,
      valid_until: "2026-10-09",
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      payment_terms: [],
      items: [
        { id: "qi-1", title: "Toughened Glass Railing · Standard / SS Railing · Standard", quantity: 10, rate: 0, amount: 0, area_chips: [{ area_id: "a1", area_name: "Rooftop", quantity: 10 }] },
        { id: "qi-2", title: "UPVC Sliding Windows · Standard", quantity: 626, rate: 0, amount: 0, area_chips: [{ area_id: "a1", area_name: "Rooftop", quantity: 600 }, { area_id: "a2", area_name: "Guest room", quantity: 26 }] },
      ],
      scope_lines: [],
    } as any);
    expect(text).toContain("1. Toughened Glass Railing · Standard / SS Railing · Standard — 10 ×");
    expect(text).not.toContain("Areas: Rooftop 10");
    expect(text).toContain("2. UPVC Sliding Windows · Standard — 626 ×");
    expect(text).toContain("Areas: Rooftop 600, Guest room 26");
  });
});
