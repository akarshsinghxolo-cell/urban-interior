import { describe, expect, test } from "vitest";
import {
  introducedFkIntegrityIssues,
  introducedIntegrityIssues,
} from "../src/lib/rdash/server/integrity-delta";
import type { RDashDatabase } from "../src/lib/rdash/types";

// A full validation domain: every collection listed here is loaded without
// row limits, so FK rules among them are evaluable.
const FULL_DOMAIN = ["dispatches", "sites", "workOrders", "workRequired", "areas", "customers"];

function db(partial: Record<string, Array<Record<string, unknown>>>): RDashDatabase {
  return partial as unknown as RDashDatabase;
}

describe("introducedIntegrityIssues multiset semantics", () => {
  test("matches duplicate baseline issues by count, not by set membership", () => {
    // Two records share one identical issue string; candidate adds a third
    // copy — only the third is introduced.
    const baseline = ["X", "X"];
    const candidate = ["X", "X", "X"];
    expect(introducedIntegrityIssues(baseline, candidate)).toEqual(["X"]);
  });
});

describe("introducedFkIntegrityIssues", () => {
  test("rejects a dangling site reference introduced by the candidate", () => {
    const baseline = db({});
    const candidate = db({
      customers: [{ id: "cust-1" }],
      sites: [{ id: "site-1", customer_id: "cust-1" }],
      dispatches: [{ id: "d-1", site_id: "site-ghost" }],
    });
    expect(introducedFkIntegrityIssues(baseline, candidate, FULL_DOMAIN)).toEqual([
      'dispatches.site_id references missing sites "site-ghost".',
    ]);
  });

  test("passes through a pre-existing orphan the commit does not touch", () => {
    const baseline = db({
      customers: [{ id: "cust-1" }],
      sites: [{ id: "site-1", customer_id: "cust-1" }],
      dispatches: [{ id: "d-1", site_id: "site-ghost" }],
    });
    const candidate = db({
      customers: [{ id: "cust-1" }],
      sites: [{ id: "site-1", customer_id: "cust-1" }],
      dispatches: [{ id: "d-1", site_id: "site-ghost" }],
    });
    // Identical issue messages on both sides must cancel out even though the
    // checker stamps each run with freshly generated issue ids.
    expect(introducedFkIntegrityIssues(baseline, candidate, FULL_DOMAIN)).toEqual([]);
  });

  test("skips rules whose parent collection was not loaded full", () => {
    // Same ghost reference, but "sites" is missing from the read plan: the
    // orphan cannot be distinguished from an unloaded row, so the rule must
    // not fire (no false positive).
    const baseline = db({});
    const candidate = db({
      dispatches: [{ id: "d-1", site_id: "site-ghost" }],
    });
    const partialDomain = FULL_DOMAIN.filter((collection) => collection !== "sites");
    expect(introducedFkIntegrityIssues(baseline, candidate, partialDomain)).toEqual([]);
  });

  test("catches dangling array references", () => {
    const baseline = db({});
    const candidate = db({
      customers: [{ id: "cust-1" }],
      workRequired: [{ id: "work-1", customer_id: "cust-1", area_ids: ["area-ghost"] }],
      areas: [{ id: "area-1" }],
    });
    expect(introducedFkIntegrityIssues(baseline, candidate, FULL_DOMAIN)).toEqual([
      'workRequired.area_ids[] references missing areas "area-ghost".',
    ]);
  });

  test("treats an emptied nullable reference as valid", () => {
    const baseline = db({
      customers: [{ id: "cust-1" }],
      sites: [{ id: "site-1", customer_id: "cust-1" }],
      dispatches: [{ id: "d-1", site_id: "site-1" }],
    });
    const candidate = db({
      customers: [{ id: "cust-1" }],
      sites: [{ id: "site-1", customer_id: "cust-1" }],
      dispatches: [{ id: "d-1" }],
    });
    expect(introducedFkIntegrityIssues(baseline, candidate, FULL_DOMAIN)).toEqual([]);
  });

  test("flags a required reference left empty by the candidate", () => {
    const baseline = db({});
    const candidate = db({
      sites: [{ id: "site-1" }],
    });
    expect(introducedFkIntegrityIssues(baseline, candidate, FULL_DOMAIN)).toEqual([
      "sites.customer_id is required but missing (target: customers).",
    ]);
  });

  test("reports an orphan fix as introducing nothing", () => {
    const baseline = db({
      dispatches: [{ id: "d-1", site_id: "site-ghost" }],
    });
    const candidate = db({
      customers: [{ id: "cust-1" }],
      sites: [{ id: "site-1", customer_id: "cust-1" }],
      dispatches: [{ id: "d-1", site_id: "site-1" }],
    });
    expect(introducedFkIntegrityIssues(baseline, candidate, FULL_DOMAIN)).toEqual([]);
  });
});
