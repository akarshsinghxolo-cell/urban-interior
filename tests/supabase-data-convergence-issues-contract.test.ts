import { describe, expect, test } from "bun:test";

import {
  blockedFromIssue,
  issueFromBlocked,
  issueFromRisk,
  projectLegacyBlocked,
  projectLegacyIssueCollections,
  projectLegacyRisks,
  riskFromIssue,
  type CanonicalIssue,
} from "../src/lib/rdash/issues";
import type { BlockedItem, RiskItem } from "../src/lib/rdash/types";

describe("canonical Issue compatibility contract", () => {
  test("round-trips a BlockedItem without changing IDs or known fields", () => {
    const blocked = {
      id: "blk-1",
      title: "Material delivery blocked",
      reason: "Vendor truck delayed",
      customer_id: "customer-1",
      customer_name: "Customer One",
      linked_task_id: "task-1",
      linked_work_order_id: "wo-1",
      linked_po_id: "po-1",
      linked_grn_id: "grn-1",
      linked_quotation_id: "quote-1",
      thread_id: "thread-1",
      resolved: false,
      created_at: "2026-08-02T10:00:00.000Z",
      legacy_marker: "preserve-me",
    } as BlockedItem & { legacy_marker: string };

    const issue = issueFromBlocked(blocked);
    expect(issue.id).toBe(blocked.id);
    expect(issue.issue_type).toBe("blocker");
    expect(issue.status).toBe("open");
    expect(issue.task_id).toBe("task-1");
    expect(issue.work_order_id).toBe("wo-1");
    expect(issue.po_id).toBe("po-1");
    expect(issue.grn_id).toBe("grn-1");
    expect(issue.quotation_id).toBe("quote-1");

    const roundTrip = blockedFromIssue(issue) as BlockedItem & { legacy_marker?: string };
    expect(roundTrip.id).toBe(blocked.id);
    expect(roundTrip.title).toBe(blocked.title);
    expect(roundTrip.reason).toBe(blocked.reason);
    expect(roundTrip.linked_task_id).toBe(blocked.linked_task_id);
    expect(roundTrip.linked_work_order_id).toBe(blocked.linked_work_order_id);
    expect(roundTrip.linked_po_id).toBe(blocked.linked_po_id);
    expect(roundTrip.linked_grn_id).toBe(blocked.linked_grn_id);
    expect(roundTrip.linked_quotation_id).toBe(blocked.linked_quotation_id);
    expect(roundTrip.thread_id).toBe(blocked.thread_id);
    expect(roundTrip.resolved).toBe(false);
    expect(roundTrip.legacy_marker).toBe("preserve-me");
  });

  test("round-trips a RiskItem and preserves unknown legacy fields", () => {
    const risk = {
      id: "risk-1",
      title: "Collection exposure",
      type: "collection",
      severity: "high",
      customer_id: "customer-1",
      customer_name: "Customer One",
      amount: 125000,
      reason: "Large overdue balance",
      created_at: "2026-08-02T10:00:00.000Z",
      legacy_marker: { source: "old-risk" },
    } as RiskItem & { legacy_marker: { source: string } };

    const issue = issueFromRisk(risk);
    expect(issue.id).toBe(risk.id);
    expect(issue.issue_type).toBe("risk");
    expect(issue.status).toBe("open");
    expect(issue.risk_type).toBe("collection");
    expect(issue.severity).toBe("high");
    expect(issue.amount).toBe(125000);

    const roundTrip = riskFromIssue(issue) as RiskItem & { legacy_marker?: { source: string } };
    expect(roundTrip).toMatchObject({
      id: risk.id,
      title: risk.title,
      type: risk.type,
      severity: risk.severity,
      customer_id: risk.customer_id,
      amount: risk.amount,
      reason: risk.reason,
      created_at: risk.created_at,
      legacy_marker: { source: "old-risk" },
    });
  });

  test("canonical fields override stale values preserved in legacy payload", () => {
    const blocked: BlockedItem = {
      id: "blk-2",
      title: "Original title",
      reason: "Original reason",
      resolved: false,
      created_at: "2026-08-02T10:00:00.000Z",
    };
    const issue: CanonicalIssue = {
      ...issueFromBlocked(blocked),
      title: "Updated title",
      reason: "Updated reason",
      status: "resolved",
      resolved_at: "2026-08-02T11:00:00.000Z",
    };

    const projected = blockedFromIssue(issue);
    expect(projected.title).toBe("Updated title");
    expect(projected.reason).toBe("Updated reason");
    expect(projected.resolved).toBe(true);
  });

  test("preserves legacy Risk deletion semantics through compatibility projection", () => {
    const open = issueFromRisk({
      id: "risk-open",
      title: "Open risk",
      type: "cash",
      severity: "medium",
      reason: "Cash exposure",
      created_at: "2026-08-02T10:00:00.000Z",
    });
    const resolved: CanonicalIssue = { ...open, id: "risk-resolved", status: "resolved" };
    const dismissed: CanonicalIssue = { ...open, id: "risk-dismissed", status: "dismissed" };

    expect(projectLegacyRisks([open, resolved, dismissed]).map((row) => row.id)).toEqual(["risk-open"]);
  });

  test("preserves legacy Blocker resolved rows through compatibility projection", () => {
    const open = issueFromBlocked({
      id: "blk-open",
      title: "Open blocker",
      reason: "Waiting",
      resolved: false,
      created_at: "2026-08-02T10:00:00.000Z",
    });
    const resolved: CanonicalIssue = { ...open, id: "blk-resolved", status: "resolved" };
    const dismissed: CanonicalIssue = { ...open, id: "blk-dismissed", status: "dismissed" };

    expect(projectLegacyBlocked([open, resolved, dismissed])).toMatchObject([
      { id: "blk-open", resolved: false },
      { id: "blk-resolved", resolved: true },
      { id: "blk-dismissed", resolved: true },
    ]);
  });

  test("projects both legacy collections from one canonical Issue list", () => {
    const blocker = issueFromBlocked({
      id: "blk-3",
      title: "Blocked",
      reason: "Dependency",
      created_at: "2026-08-02T10:00:00.000Z",
    });
    const risk = issueFromRisk({
      id: "risk-3",
      title: "Risk",
      type: "margin",
      severity: "low",
      reason: "Margin exposure",
      created_at: "2026-08-02T10:00:00.000Z",
    });

    const projected = projectLegacyIssueCollections([blocker, risk]);
    expect(projected.blocked.map((row) => row.id)).toEqual(["blk-3"]);
    expect(projected.risks.map((row) => row.id)).toEqual(["risk-3"]);
  });

  test("rejects projecting an Issue through the wrong legacy type", () => {
    const blocker = issueFromBlocked({
      id: "blk-wrong",
      title: "Blocked",
      reason: "Dependency",
      created_at: "2026-08-02T10:00:00.000Z",
    });
    const risk = issueFromRisk({
      id: "risk-wrong",
      title: "Risk",
      type: "vendor",
      severity: "medium",
      reason: "Vendor exposure",
      created_at: "2026-08-02T10:00:00.000Z",
    });

    expect(() => riskFromIssue(blocker)).toThrow("Cannot project blocker issue");
    expect(() => blockedFromIssue(risk)).toThrow("Cannot project risk issue");
  });

  test("rejects malformed canonical Risk Issues instead of inventing defaults", () => {
    const malformed: CanonicalIssue = {
      id: "risk-malformed",
      issue_type: "risk",
      status: "open",
      title: "Malformed",
      reason: "Missing typed risk fields",
      created_at: "2026-08-02T10:00:00.000Z",
    };

    expect(() => riskFromIssue(malformed)).toThrow("missing risk_type or severity");
  });
});
