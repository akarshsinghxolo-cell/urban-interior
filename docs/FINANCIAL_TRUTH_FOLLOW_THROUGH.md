# Shared financial truth — 30 October 2026

The workspace owns canonical business records. Every module remains subject to
the existing role and workspace permissions. This phase removes competing
calculations and strengthens the consistency of read inputs and stock events.
It performs no production schema or business-row migration.

## Rules and sources

| Fact | Shared rule / stored source |
| --- | --- |
| Billed value and output tax | Customer invoices in issued, partial, overdue or paid state; drafts and cancelled history stay visible but contribute no billed value or output tax |
| Customer receivable | Positive balances of issued, partial or overdue invoices; distinct from unbilled accepted contract value |
| Collected cash | Recorded customer receipts, including advances; payment-schedule received counters are not a second receipt source |
| Ageing | Same open invoices, remaining balances and Indian business day for Finance Control, dashboards, report detail and exports |
| Contractor payable | Verified/approved/partly-paid/paid bill amount less recorded paid payments; draft/submitted/disputed/held bills and pending payment requests do not create/discharge recognized debt |
| Site position | Shared siteFinancials/computeSitePnLsFromCostLines; includes site invoices and receipts before work-order award, latest quotation revisions and posted cost lines |
| Customer/job reports | Customer/job filters also constrain related buying and supplier costs through work-order, site, PO and bill IDs; combined filters intersect; unknown jobs do not retain unrelated supplier rows |
| Vendor filter | Constrains supplier-side records; it does not associate customer output invoices with a supplier without a business relation |
| Dispatch | Existing inventory supplies material identity, unit and valuation; one issue event, its stock movements and stock reduction commit atomically |

`financial-projections.ts` defines shared invoice policies and metric source
contracts. Common selectors, Finance Control, Customer Desk, workdesk widgets,
site execution, profitability, GST, ageing and collection summaries consume them.
Issued quotation prices, accepted measurement revisions and invoice history are
not recalculated from current Article prices.

## Complete reads

Module and entity REST readers now page complete collections in stable ID order.
The first page requests an exact count; subsequent pages continue until every
matching row is read, including when the server cap is smaller than the requested
page. Missing counts require exhaustion, and failed/repeated/premature pages fail
closed. Existing revision fences reject mixed-revision responses. Explicitly
bounded history feeds keep their separate pagination behavior.

Dependency tests verify that financial consumers declare every required source
without an analytical row limit. Customer extensions remain permission-aware;
source contracts do not grant additional access.

## Refresh and stock integrity

Normal updates retain the existing idle delta refresh, focus/online triggers and
dirty-form/outbox protection. Changes to permission rules require a full session
revalidation; a forbidden delta response also reloads the session instead of
leaving previously authorized rows on screen indefinitely.

Dispatch now rejects nonpositive quantities, missing stock, cross-job allocation
and aggregated duplicate-line overdraw before side effects. The server checks
the new dispatch against original inventory, matching issue movements and final
stock quantities, including direct API submissions. Issued item history is
immutable while acknowledgement remains available. No historical stock or
issued document is rewritten by this change.

## Audit coverage and verification limits

The pass traced the remaining financial status/date/filter/input findings,
Customer Desk, site profitability, procurement receipt/dispatch paths and
quotation/measurement locking boundaries. Receipt posting and quotation revision
guards retain their existing shared implementation. This is not a certification
that every possible app workflow or historical production record is defect-free.

Regression coverage includes all invoice states, partial payments, pre-award site
billing, Indian midnight/month boundaries, supplier scoping, 1,251-row reads,
page failures, canonical dispatch posting and permission-change invalidation.
Browser regressions exercise two authenticated contexts, focus propagation,
dirty-form protection, stale writes and forbidden-access revalidation against the
local QA backend; these do not constitute a signed-in production exercise.

Production catalogue audit: 47 public tables, 253 public foreign keys plus one
private foreign key, all validated. Every public FK definition matched a fresh
rebuild from the committed migrations. The earlier total of 254 included both
schemas; no FK was missing.

## Recovery

This phase requires an application rollback only. It adds no database objects,
changes no grants, merges no identities and deletes no production rows. Keep the
canonical partner-source migration from PR243 installed when rolling back this
application change.
