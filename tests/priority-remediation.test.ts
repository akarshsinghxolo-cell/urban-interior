import { describe, expect, test } from "vitest";

import { canonicalizeFinancialDocumentNumbers, nextFinancialDocumentNumber } from "@/lib/rdash/financial-document-number";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import { assertWorkspaceMutationAllowed } from "@/lib/rdash/server/mutation-policy";
import { siteFinancials } from "@/lib/rdash/store/selectors";
import { createDefaultStaffPermissions } from "@/lib/rdash/staff-operations";
import type { AuthenticatedUser } from "@/lib/rdash/server/auth";
import type { PayrollPeriod, Quotation } from "@/lib/rdash/types";
import type { WorkspaceOperation } from "@/lib/rdash/workspace-operations";
import { testFile } from "./test-file";

function approvalPolicy(trigger: "po_amount" | "quotation_discount", threshold: number) {
  return {
    id: `policy-${trigger}`,
    name: `${trigger} test policy`,
    trigger,
    threshold,
    operator: ">" as const,
    approver_role: "Owner",
    approver_id: "staff-owner",
    enabled: true,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

const user = (role: AuthenticatedUser["role"]): AuthenticatedUser => ({
  userId: `user-${role}`,
  email: `${role.toLowerCase().replaceAll(/\W/g, "-")}@urban.test`,
  name: role,
  role,
  staffId: `staff-${role}`,
  expiresAt: Date.now() + 60_000,
});

describe("priority audit remediation", () => {
  test("server permission rules classify payroll approval separately from updates", () => {
    const db = buildSeedDatabase();
    db.staffRolePermissions = createDefaultStaffPermissions();
    const generated: PayrollPeriod = {
      id: "payroll-2026-10",
      month: 10,
      year: 2026,
      status: "generated",
      generated_at: "2026-10-01T00:00:00.000Z",
    };
    db.payrollPeriods = [generated];

    const update: WorkspaceOperation[] = [{
      collection: "payrollPeriods",
      upsert: [{ ...generated, generated_at: "2026-10-02T00:00:00.000Z" }],
    }];
    const approve: WorkspaceOperation[] = [{
      collection: "payrollPeriods",
      upsert: [{ ...generated, status: "approved", approved_at: "2026-10-02T00:00:00.000Z" }],
    }];

    expect(() => assertWorkspaceMutationAllowed(user("Accounts / Admin"), update, db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Accounts / Admin"), approve, db)).toThrow("FORBIDDEN:payrollPeriods");
    expect(() => assertWorkspaceMutationAllowed(user("Finance"), approve, db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Accounts / Admin"), [{
      collection: "payrollPeriods",
      upsert: [{ ...generated, status: "paid" }],
    }], db)).toThrow("Invalid payroll status transition");
  });

  test("server permission rules recognize approval decisions across modules", () => {
    const db = buildSeedDatabase();
    db.staffRolePermissions = createDefaultStaffPermissions();
    db.approvalPolicies = [approvalPolicy("po_amount", 1_000)];
    db.purchaseOrders = [{
      id: "po-approval",
      status: "pending_approval",
      total_amount: 2_000,
    } as never];

    const ordinaryUpdate: WorkspaceOperation[] = [{
      collection: "purchaseOrders",
      upsert: [{ id: "po-approval", status: "pending_approval", expected_delivery: "2026-11-01" }],
    }];
    const approval: WorkspaceOperation[] = [{
      collection: "purchaseOrders",
      upsert: [{ id: "po-approval", status: "approved", approved_at: "2026-10-09T00:00:00.000Z" }],
    }];

    expect(() => assertWorkspaceMutationAllowed(user("Procurement Staff"), ordinaryUpdate, db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Procurement Staff"), approval, db)).toThrow("FORBIDDEN:purchaseOrders");
    expect(() => assertWorkspaceMutationAllowed(user("Operations Manager"), approval, db)).not.toThrow();
  });

  test("server approval rules preserve automatic releases without permitting policy bypasses", () => {
    const db = buildSeedDatabase();
    db.staffRolePermissions = createDefaultStaffPermissions();
    db.approvalPolicies = [
      approvalPolicy("po_amount", 1_000),
      approvalPolicy("quotation_discount", 10),
    ];
    db.purchaseOrders = [{ id: "po-low", status: "pending_approval", total_amount: 500 } as never];
    db.quotations = [{ id: "quote-held", status: "draft", discount_pct: 15, pending_approval: true } as never];
    db.vendorBills = [{ id: "bill-held", status: "pending_approval" } as never];
    db.payrollPeriods = [{ id: "payroll-generated", status: "generated" } as never];

    expect(() => assertWorkspaceMutationAllowed(user("Procurement Staff"), [{
      collection: "purchaseOrders",
      upsert: [{ id: "po-low", status: "approved", total_amount: 500 }],
    }], db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Procurement Staff"), [{
      collection: "purchaseOrders",
      upsert: [{ id: "po-high", status: "approved", total_amount: 2_000 }],
    }], db)).toThrow("FORBIDDEN:purchaseOrders");
    expect(() => assertWorkspaceMutationAllowed(user("Sales / Telecaller"), [{
      collection: "quotations",
      upsert: [{ id: "quote-held", status: "draft", discount_pct: 5, pending_approval: false }],
    }], db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Sales / Telecaller"), [{
      collection: "quotations",
      upsert: [{ id: "quote-held", title: "Updated title only" }],
    }], db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Accounts / Admin"), [{
      collection: "vendorBills",
      upsert: [{ id: "bill-held", notes: "Updated note only" }],
    }], db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Accounts / Admin"), [{
      collection: "payrollPeriods",
      upsert: [{ id: "payroll-generated", notes: "Updated note only" }],
    }], db)).not.toThrow();
    expect(() => assertWorkspaceMutationAllowed(user("Sales / Telecaller"), [{
      collection: "quotations",
      upsert: [{ id: "quote-held", status: "draft", discount_pct: 15, pending_approval: false }],
    }], db)).toThrow("FORBIDDEN:quotations");
  });

  test("public invoice and receipt numbers use one server-canonical allocator", () => {
    const year = new Date().getFullYear();
    expect(nextFinancialDocumentNumber("invoice", [
      { invoice_no: `INV-${year}-002` },
      { invoice_no: `INV-${year}-009` },
    ])).toBe(`INV-${year}-010`);

    const db = buildSeedDatabase();
    db.invoices = [{ id: "inv-existing", invoice_no: `INV-${year}-005` } as never];
    db.customerReceipts = [];
    const operations: WorkspaceOperation[] = [
      {
        collection: "invoices",
        upsert: [
          { id: "inv-new-1", invoice_no: `INV-${year}-001` },
          { id: "inv-new-2", invoice_no: `INV-${year}-002` },
        ],
      },
      {
        collection: "auditLog",
        upsert: [{ id: "audit-1", action: `Created INV-${year}-001` }],
      },
    ];

    const canonical = canonicalizeFinancialDocumentNumbers(db, operations);
    expect(canonical[0].upsert?.map((row) => row.invoice_no)).toEqual([
      `INV-${year}-006`,
      `INV-${year}-007`,
    ]);
    expect(canonical[1].upsert?.[0].action).toBe(`Created INV-${year}-006`);
  });

  test("site totals count only the latest quotation revision", () => {
    const db = buildSeedDatabase();
    const base = {
      customer_id: "cust-revision",
      customer_name: "Revision Customer",
      site_id: "site-revision",
      title: "Revision test",
      status: "sent",
      valid_until: "2026-12-31",
      subtotal: 100,
      tax_amount: 0,
      payment_terms: [],
      coverage: [],
      scope_lines: [],
      work_order_ids: [],
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    } satisfies Partial<Quotation>;
    db.quotations = [
      { ...base, id: "quote-v1", quotation_no: "Q-1", revision_no: 1, total_amount: 100 } as Quotation,
      {
        ...base,
        id: "quote-v2",
        quotation_no: "Q-1-R2",
        revision_no: 2,
        parent_quotation_id: "quote-v1",
        total_amount: 125,
        updated_at: "2026-10-02T00:00:00.000Z",
      } as Quotation,
    ];

    expect(siteFinancials(db, "site-revision").quoted).toBe(125);
  });

  test("receipt settlement does not silently pay commissions", async () => {
    const source = await testFile("src/lib/rdash/store/slices/finance.ts").text();
    expect(source).not.toContain("get().payCommission");
    expect(source).not.toContain("auto-paid on invoice settlement");
  });

  test("payroll success is shown only after server confirmation", async () => {
    const source = await testFile("src/components/rdash/modules/AttendancePayrollModule.tsx").text();
    expect(source).toContain("approvePayrollPeriod(id); await awaitServerSync(); toast.success(\"Payroll approved\")");
    expect(source).toContain("payPayrollPeriod(id); await awaitServerSync(); toast.success(\"Payroll marked paid\")");
    expect(source).toContain("reopenPayrollPeriod(id); await awaitServerSync(); toast.success(\"Payroll reopened\")");
  });

  test("WhatsApp reserves the canonical send before contacting the provider", async () => {
    const source = await testFile("src/lib/whatsapp/server.ts").text();
    const sendFunction = source.slice(source.indexOf("export async function sendWhatsAppMessage"));
    expect(sendFunction.indexOf("reserveOutboundSend({")).toBeGreaterThan(-1);
    expect(sendFunction.indexOf("reserveOutboundSend({")).toBeLessThan(sendFunction.indexOf("sock.sendMessage"));
    expect(sendFunction).toContain('.eq("comm_send_id", input.commSendId)');
    expect(source).toContain('["sent", "delivered", "read"].includes(existing.status)');

    const route = await testFile("src/app/api/whatsapp/send/route.ts").text();
    expect(route).toContain("!customerId || !subject || !commSendId");

    const composer = await testFile("src/components/rdash/modules/CommunicationCentreModule.tsx").text();
    expect(composer).toContain('const [commSendId] = React.useState(() => genId("cs"))');
    expect(composer).toContain("const commSendId = data.id");
  });
});
