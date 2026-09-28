# Connected business model — 2026-09-28

Urban Castle is a connected modular application, not independent customer,
vendor, contractor, staff and finance databases. Keeping separate tables for
distinct business records is correct; duplicating writable truth is not.

## Ownership and connections

- Customers own Sites; Sites contain Areas and Work Required.
- Quotations describe proposed work; accepted scope feeds Work Orders.
- A Work Order connects execution, its contractor, procurement and job costs.
- Vendors supply Purchase Orders; GRNs record delivery; vendor bills and
  payments retain the same vendor ownership.
- Contractor bills and payments retain their contractor, Work Order and Site.
  Historical bills must not be reassigned when a contractor is replaced.
- Staff identity is canonical in `entity_master_staff`. Attendance and salary
  adjustments can reference the Work Order for job allocation; these optional
  links do not imply that payroll automatically posts every job cost.
- Finance/partner/site screens read these records and shared selectors. The
  atomic workspace commit is the save boundary; row versions protect edits.
- Contractor-rate projections, vendor-price history, audit history and the
  synchronization journal have distinct responsibilities. They are not extra
  editable copies to merge into one generic table.

## Changes in this pass

1. One `business-rules.ts` implementation for action and commit validation.
   Removed the old core/facade split and synthetic Site validation snapshots.
   Customer-level quotation drafts remain a supported business workflow.
2. Shared partner-payment validation: the bill must exist, the partner and job
   allocation must match, and the payment amount must be positive. PO, GRN and
   vendor bill vendor identities must also agree.
3. Contractor workspace outstanding now sums the same per-contractor result
   used by profiles. One partner's credit cannot offset another partner's dues.
   Site finance also counts invoices and receipts before a Work Order exists;
   Customer Desk and Finance share that calculation instead of dropping advances.
4. PostgreSQL enforces 33 additional links and five composite ownership links
   with 16 required-link checks. Generated columns project existing JSON fields;
   no new business tables, mirrors or business-record rewrites were added.
   Foreign keys include workspace identity and defer until transaction end so
   related records can be created together. No database cascading deletion of
   financial records was introduced.
5. The existing application FK registry includes the missing Work Order →
   Contractor and Contractor Payment → Site references. A test checks all 33
   migration links against that registry to catch drift.
6. Constraint failures are validation errors at the existing save endpoint,
   not infrastructure failures retried indefinitely.
7. Removed unused `schema-entity-tables.sql`, which still recreated retired
   StaffProfile and access-role duplication. It is recoverable from Git history,
   but is no longer an alternative setup path.

## Verification and limits

- Unit tests cover quotation drafts, wrong-partner/job payments, PO/GRN/bill
  ownership, aggregate balances, registry agreement and save-error classification.
- `supabase/tests/commercial-relationships.sql` exercises valid deferred saves,
  wrong partners, missing links, cross-workspace references and parent deletion.
  It rolls back all fixtures and may be run through an administrative connection.
- This is targeted relationship hardening, not a claim that every optional,
  polymorphic or array reference has a native database constraint. The shared
  validator/registry still covers those relationships.
- A reproducible fresh-project bootstrap/recovery exercise remains necessary;
  deleting the obsolete schema script does not itself supply a complete baseline.
- Settlement accounting, full payroll-to-job-cost automation and every financial
  screen have not been redesigned in this pass. Any further work should extend
  the existing domain model, not introduce a second ledger or compatibility path.
