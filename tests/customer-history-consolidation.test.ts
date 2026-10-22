import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { customerHistoryEntries } from "../src/lib/rdash/customer-desk-queries";
import { customerConversationThreadRecordId } from "../src/lib/rdash/thread-record-id";
import type { RDashDatabase } from "../src/lib/rdash/types";
import { testFile } from "./test-file";

describe("Customer History & notes consolidation", () => {
  test("shows invoices and receipts as different money events and suppresses audit-copy thread messages", () => {
    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;
    const customer = db.customers[0];
    const timestamp = "2026-10-21T04:00:00.000Z";
    db.invoices.push({
      id: "invoice-history-check", invoice_no: "INV-HISTORY", customer_id: customer.id, finance_context: "service",
      title: "History check", status: "partial", subtotal: 1000, tax_amount: 0,
      total_amount: 1000, paid_amount: 250, balance_amount: 750,
      due_date: "2026-10-31", created_at: timestamp, updated_at: timestamp,
    });
    db.customerReceipts.push({
      id: "receipt-history-check", receipt_no: "RCT-HISTORY", customer_id: customer.id, finance_context: "service",
      invoice_id: "invoice-history-check", amount: 250, mode: "upi", reference: "UPI-250",
      received_at: timestamp, created_at: timestamp, updated_at: timestamp,
    });
    db.auditLog.push({
      id: "audit-history-check", timestamp, actor: "Finance", action: "Recorded RCT-HISTORY",
      entity_type: "invoice", entity_id: "invoice-history-check", entity_label: "INV-HISTORY",
      kind: "receive", customer_id: customer.id,
    });
    db.threads.push({
      id: "thread-history-check", kind: "generic", record_type: "generic",
      record_id: customerConversationThreadRecordId(customer.id), title: customer.name,
      participants: ["Owner"], open: true, created_at: timestamp, updated_at: timestamp,
      messages: [
        { id: "message-audit-copy", thread_id: "thread-history-check", author_name: "System", body: "Recorded RCT-HISTORY", kind: "system", related_audit_id: "audit-history-check", created_at: timestamp },
        { id: "message-real-note", thread_id: "thread-history-check", author_name: "Owner", body: "Call before the next visit", kind: "comment", created_at: timestamp },
      ],
    });

    const entries = customerHistoryEntries(db, customer.id);
    expect(entries.find((entry) => entry.id === "invoice-invoice-history-check")?.detail).toContain("₹750 outstanding");
    expect(entries.find((entry) => entry.id === "receipt-receipt-history-check")?.detail).toContain("₹250 received");
    expect(entries.filter((entry) => entry.detail === "Call before the next visit")).toHaveLength(1);
    expect(entries.some((entry) => entry.id === "note-message-audit-copy")).toBe(false);
  });

  test("uses one Work Required view and one customer History & notes feed", async () => {
    const workRequired = await testFile("src/components/rdash/modules/CustomerWorkRequiredWorkspace.tsx").text();
    const workRequiredModule = await testFile("src/components/rdash/modules/RemainingModules.tsx").text();
    const portfolio = await testFile("src/components/rdash/modules/CustomerDeskPortfolio.tsx").text();
    const modules = await testFile("src/lib/rdash/modules.ts").text();

    expect(workRequired).toContain("CustomerWorkRequiredModule");
    expect(workRequiredModule).toContain("function CustomerWorkRequiredModule");
    expect(workRequiredModule).not.toContain("Qualification Review");
    expect(workRequiredModule).not.toContain("Pending Actions");
    expect(portfolio).toContain('label: `History & notes (${historyEntries.length})`');
    expect(portfolio).toContain('key: "files"');
    expect(modules).not.toContain("customerTimeline");
    expect(modules).not.toContain("customerRequests");
  });
});
