import { describe, expect, it } from "vitest";
import { customerLifecycleGaps, customerMatchesQuery } from "../src/lib/rdash/customer-desk-queries";
import { normalizePhone } from "../src/lib/rdash/customer-identity";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import type { RDashDatabase } from "../src/lib/rdash/types";

function dbWith(overrides: Partial<RDashDatabase>): RDashDatabase {
    const base = structuredClone(buildSeedDatabase()) as RDashDatabase;
    return { ...base, ...overrides };
}

const rahul = {
    id: "cust-rahul",
    name: "Rahul Chobay",
    phone: "9728324682",
    email: "",
    status: "active" as const,
    created_at: "2026-09-04T10:00:00.000Z",
    updated_at: "2026-09-04T10:00:00.000Z",
};

function rahulDb(): RDashDatabase {
    const siteId = "site-rahul";
    const areaIds = ["area-1", "area-2"];
    return dbWith({
        customers: [rahul] as RDashDatabase["customers"],
        sites: [{
            id: siteId,
            customer_id: rahul.id,
            name: "Rahul Chobay · Gorakhpur",
            address: "Gorakhpur",
            site_type: "apartment",
            stage: "enquiry",
            created_at: "2026-09-04T10:00:00.000Z",
            updated_at: "2026-09-04T10:00:00.000Z",
        }] as unknown as RDashDatabase["sites"],
        areas: areaIds.map((id, index) => ({
            id,
            site_id: siteId,
            name: `Room ${index + 1}`,
            stage: "unmeasured",
            created_at: "2026-09-04T10:00:00.000Z",
            updated_at: "2026-09-04T10:00:00.000Z",
        })) as unknown as RDashDatabase["areas"],
        workRequired: areaIds.map((id, index) => ({
            id: `work-${index}`,
            customer_id: rahul.id,
            site_id: siteId,
            title: `Work ${index + 1}`,
            status: "new",
            area_ids: [id],
            created_at: "2026-09-04T10:00:00.000Z",
            updated_at: "2026-09-04T10:00:00.000Z",
        })) as unknown as RDashDatabase["workRequired"],
    });
}

describe("customerMatchesQuery", () => {
    const db = rahulDb();

    it("matches the name case-insensitively", () => {
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "rahul")).toBe(true);
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "CHOBAY")).toBe(true);
    });

    it("matches phones typed the way humans type them", () => {
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "9728324682")).toBe(true);
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "97283 24682")).toBe(true);
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "+919728324682")).toBe(true);
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "09728324682")).toBe(true);
    });

    it("does not digit-match short non-phone queries", () => {
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "zzz")).toBe(false);
    });

    it("matches site name and address", () => {
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "gorakhpur")).toBe(true);
    });

    it("returns everything for a blank query", () => {
        expect(customerMatchesQuery(db, rahul as RDashDatabase["customers"][number], "  ")).toBe(true);
    });

    it("normalizes phones the same way identity matching does", () => {
        expect(normalizePhone("+91 97283 24682")).toBe("9728324682");
        expect(normalizePhone("00919728324682")).toBe("9728324682");
    });
});

describe("customerLifecycleGaps", () => {
    it("flags visit, measurement, quotation and budget gaps for an untouched enquiry", () => {
        const gaps = customerLifecycleGaps(rahulDb(), rahul.id);
        expect(gaps.map((gap) => gap.key)).toEqual(["visit", "measurement", "quotation", "budget"]);
        expect(gaps.find((gap) => gap.key === "measurement")?.label).toBe("Capture measurements (2 areas)");
        expect(gaps.find((gap) => gap.key === "budget")?.label).toBe("Set budget (2 work items)");
    });

    it("stays quiet once the lifecycle is closed out", () => {
        const db = rahulDb();
        const done = {
            ...(db.workRequired as unknown as Array<Record<string, unknown>>)[0],
            status: "completed",
            budget: 1000,
        };
        (db.workRequired as unknown as Array<Record<string, unknown>>) = [done];
        (db.areas as unknown as Array<Record<string, unknown>>) = [];
        expect(customerLifecycleGaps(db, rahul.id)).toEqual([]);
    });

    it("asks for a site when the customer has none", () => {
        const db = rahulDb();
        (db.sites as unknown as unknown[]) = [];
        (db.areas as unknown as unknown[]) = [];
        const gaps = customerLifecycleGaps(db, rahul.id);
        expect(gaps[0]?.key).toBe("site");
    });
});
