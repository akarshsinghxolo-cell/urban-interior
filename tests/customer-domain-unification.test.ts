import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import {
  assertCustomerRecord,
  assertWorkRequiredDefinition,
  workRequiredHasTaxonomy,
} from "../src/lib/rdash/customer-domain-rules";
import {
  customerReferrerSelection,
  sourcePartnerProjection,
} from "../src/lib/rdash/customer-referrer";
import type { Customer } from "../src/lib/rdash/types";
import { testFile } from "./test-file";

const read = (path: string) => testFile(path).text();

describe("customer domain unification", () => {
  test("accepts the two canonical Work Required shapes and rejects hybrids", () => {
    const db = structuredClone(buildSeedDatabase());
    const customer = db.customers[0];

    const general = {
      customer_id: customer.id,
      site_id: "",
      title: "General interior scope",
      work_category_id: undefined,
      work_subcategory_ids: [],
      work_type_ids: [],
      area_ids: [],
    };
    expect(() => assertWorkRequiredDefinition(db, general, "Work Required")).not.toThrow();
    expect(workRequiredHasTaxonomy(general)).toBe(false);

    expect(() => assertWorkRequiredDefinition(db, {
      ...general,
      work_category_id: db.master.workCategories[0]?.id,
    }, "Work Required")).toThrow(/both a Work Category and at least one Work Subcategory/i);
  });

  test("keeps external referrers typed and source-partner projection outside Customer", () => {
    const db = structuredClone(buildSeedDatabase());
    const customer = db.customers[0];
    const external = customerReferrerSelection("external", undefined, "Walk-in");
    const candidate: Customer = { ...customer, ...external };

    expect(() => assertCustomerRecord(db, candidate, "Customer")).not.toThrow();
    expect(sourcePartnerProjection(external)).toEqual({ source_partner_id: undefined, source_partner_name: undefined });

    const partner = db.master.sourcePartners[0];
    if (partner) {
      const selected = customerReferrerSelection("source_partner", partner.id, partner.name);
      expect(sourcePartnerProjection(selected)).toEqual({ source_partner_id: partner.id, source_partner_name: partner.name });
    }
  });

  test("Customer is the one canonical TypeScript model", async () => {
    const types = await read("src/lib/rdash/types.ts");
    const start = types.indexOf("export interface Customer {");
    const end = types.indexOf("type FileAttachmentReference", start);
    const customer = types.slice(start, end);
    const referrer = await read("src/lib/rdash/customer-referrer.ts");
    const seed = await read("src/lib/rdash/seed.ts");

    expect(customer).toContain("phone?: string;");
    expect(customer).toContain("referrer_type?: CustomerReferrerType;");
    expect(customer).toContain("referrer_id?: ID;");
    expect(customer).toContain("referrer_name?: string;");
    expect(customer).not.toContain("source_partner_id");
    expect(customer).not.toContain("source_partner_name");
    expect(referrer).not.toMatch(/\bCustomerRecord\b/);
    expect(seed).toContain("const customers: Customer[]");
    expect(seed).not.toContain("Customer & CustomerReferrerFields");
  });

  test("runtime and database boundaries reject retired Customer payloads", async () => {
    const saver = await read("src/lib/rdash/customer-sites-save.ts");
    const formModel = await read("src/components/rdash/customer-sites-form-model.ts");
    const migration = await read("supabase/migrations/20260913190000_finalize_customer_contract.sql");

    expect(saver).toContain("Customer source_partner_* referral fields are retired");
    expect(saver).not.toContain("if (input.source_partner_id");
    expect(formModel).not.toContain("sourcePartnerProjection(referrer)");
    expect(migration).toContain("INVALID_CUSTOMER_LEGACY_REFERRER_FIELDS");
    expect(migration).toContain("INVALID_CUSTOMER_REFERRER_PARTIAL");
    expect(migration).toContain("revoke execute on function private.uc_canonicalize_customer_row()");
    expect(migration).toContain("revoke execute on function private.uc_sync_customer_contact_identities()");
  });

  test("database migration is the authoritative customer cutover", async () => {
    const migration = await read("supabase/migrations/20260913085318_customer_domain_unification.sql");
    expect(migration).toContain("private.customer_contact_identities");
    expect(migration).toContain("INVALID_CUSTOMER_IDENTITY_DUPLICATE");
    expect(migration).toContain("referrer_type");
    expect(migration).toContain("interest_category_ids");
    expect(migration).toContain("interest_work_subcategory_ids");
    expect(migration).toContain("customer_id_gen");
    expect(migration).toContain("site_id_gen");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.commit_workspace_operations_internal");
  });

  test("relationship index migration leads with generated FK columns", async () => {
    const migration = await read("supabase/migrations/20260913085807_customer_graph_fk_index_order.sql");
    expect(migration).toContain("(customer_id_gen, workspace_id)");
    expect(migration).toContain("(site_id_gen, workspace_id)");
    expect(migration).toContain("drop index if exists public.entity_customers_phone_uidx");
    expect(migration).toContain("drop index if exists public.entity_customers_email_uidx");
  });

  test("entity-scoped reads use generated Customer/Site relationship columns", async () => {
    const source = await read("src/lib/rdash/server/entity-scoped-rest.ts");
    expect(source).toContain('return { column: "customer_id_gen", json: false }');
    expect(source).toContain('return { column: "site_id_gen", json: false }');
    expect(source).toContain("selectorColumn(spec.collection, field)");
  });

  test("Customer Desk has an explicit bounded module collection plan", async () => {
    const source = await read("src/lib/rdash/server/module-read-plans.ts");
    expect(source).toContain("customerDesk: Object.freeze([");
    expect(source).toContain('"customers", "sites", "areas", "workRequired", "measurementRevisions"');
    expect(source).toContain('"entityReferenceAssignments", "entityFileAttachments", "auditLog"');
  });

  test("core Customer rules no longer require the giant RDashDatabase type", async () => {
    const referrer = await read("src/lib/rdash/customer-referrer.ts");
    const rules = await read("src/lib/rdash/customer-domain-rules.ts");
    expect(referrer).not.toContain("RDashDatabase");
    expect(rules).not.toContain("RDashDatabase");
    expect(rules).toContain("WorkRequiredValidationContext");
  });

  test("removed quotation and customer-form compatibility shims do not return", async () => {
    const businessRules = await read("src/lib/rdash/business-rules.ts");
    const formModel = await read("src/components/rdash/customer-sites-form-model.ts");
    expect(businessRules).not.toContain("failure.match(/^Quotation");
    expect(businessRules).not.toContain("Site does not exist\\.$/");
    expect(formModel).not.toContain("referralLegacyName");
  });
});
