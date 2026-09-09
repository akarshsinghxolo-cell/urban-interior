import { describe, expect, test } from "vitest";
import { areaChipQuantity, groupedQuotationScopeLines, linePairBoxes, removeOptionPair } from "@/lib/rdash/work-types";
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

describe("quotation pair boxes (one box per work type: item / rate / amount)", () => {
  const workSubcategories = [
    {
      id: "ws-cabinets",
      category_id: "wc-1",
      name: "Kitchen Cabinets (Modular)",
      work_types: [
        { id: "wt-premium", name: "premium" },
        { id: "wt-luxury", name: "luxury" },
      ],
    },
    { id: "ws-wardrobe", category_id: "wc-1", name: "Wardrobe (Sliding/Swing)", work_types: [{ id: "wt-wardrobe-std", name: "Standard" }] },
  ] as any;
  // Contractor rates: premium 100+50, luxury 180+70 (different contractors),
  // wardrobe has NO rates at all.
  const contractorRates = [
    { contractor_id: "c1", work_subcategory_id: "ws-cabinets", work_type_id: "wt-premium", material_rate: 100, labour_rate: 50 },
    { contractor_id: "c2", work_subcategory_id: "ws-cabinets", work_type_id: "wt-premium", material_rate: 120, labour_rate: 30 },
    { contractor_id: "c1", work_subcategory_id: "ws-cabinets", work_type_id: "wt-luxury", material_rate: 180, labour_rate: 70 },
  ] as any;
  const line = {
    title: "Kitchen Cabinets (Modular) · premium / Kitchen Cabinets (Modular) · luxury / Wardrobe (Sliding/Swing) · Standard",
    quantity: 32,
    rate: 150,
    amount: 4800,
    subcategory_id: "ws-cabinets",
    work_type_id: "wt-premium",
    option_pairs: [
      { subcategory_id: "ws-cabinets", work_type_id: "wt-premium" },
      { subcategory_id: "ws-cabinets", work_type_id: "wt-luxury" },
      { subcategory_id: "ws-wardrobe", work_type_id: "wt-wardrobe-std" },
    ],
  };

  test("one box per pair: label, total rate (material + labour), primary prices the line", () => {
    const boxes = linePairBoxes(line as any, workSubcategories, contractorRates);
    expect(boxes.map((box) => box.label)).toEqual([
      "Kitchen Cabinets (Modular) · premium",
      "Kitchen Cabinets (Modular) · luxury",
      "Wardrobe (Sliding/Swing) · Standard",
    ]);
    // Primary keeps the quoted line rate; alternatives resolve from the
    // contractor averages (material and labour averaged separately, then summed).
    expect(boxes[0]).toMatchObject({ primary: true, rate: 150, amount: 4800 });
    expect(boxes[1]).toMatchObject({ primary: false, rate: 250, amount: 8000 });
    // No contractor rate for wardrobe → "—" (undefined), never a fake ₹0.
    expect(boxes[2].rate).toBeUndefined();
    expect(boxes[2].amount).toBeUndefined();
  });

  test("a hand-set pair rate override wins over the master average", () => {
    const withOverride = { ...line, option_pairs: [{ ...line.option_pairs[1], rate: 210 }, ...line.option_pairs.slice(2)] , subcategory_id: "ws-cabinets", work_type_id: "wt-luxury" };
    const boxes = linePairBoxes(withOverride as any, workSubcategories, contractorRates);
    expect(boxes[0].rate).toBe(210);
    expect(boxes[0].amount).toBe(32 * 210);
  });

  test("removeOptionPair: removing the primary promotes the next pair (mirrors ids, re-derives title and rate)", () => {
    const patch = removeOptionPair(line as any, 0, workSubcategories, contractorRates)!;
    expect(patch.option_pairs).toHaveLength(2);
    expect(patch.subcategory_id).toBe("ws-cabinets");
    expect(patch.work_type_id).toBe("wt-luxury");
    expect(patch.title).toBe("Kitchen Cabinets (Modular) · luxury / Wardrobe (Sliding/Swing) · Standard");
    expect(patch.rate).toBe(250); // promoted primary falls back to the master average (180 + 70)
  });

  test("removeOptionPair: removing a non-primary keeps the primary untouched", () => {
    const patch = removeOptionPair(line as any, 2, workSubcategories, contractorRates)!;
    expect(patch.subcategory_id).toBe("ws-cabinets");
    expect(patch.work_type_id).toBe("wt-premium");
    expect(patch.title).toBe("Kitchen Cabinets (Modular) · premium / Kitchen Cabinets (Modular) · luxury");
    expect(patch.rate).toBe(150);
  });

  test("removeOptionPair: the last box removes the whole line", () => {
    const single = { ...line, option_pairs: [line.option_pairs[0]] };
    expect(removeOptionPair(single as any, 0, workSubcategories, contractorRates)).toBeNull();
  });
});
