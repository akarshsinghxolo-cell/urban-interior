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

## Cross-module audit register — 2026-10-10

Scope: the referenced **Cross Module Audit** brief. This is a continuing audit,
not a certification that the entire application is reliable. The first repair
batch traces Purchase Order → GRN evidence → verification → inventory → payment
milestone/follow-up, including the vendor-invoice boundary.

### Confirmed defects addressed in the local change set

| Priority | Finding and reproduction | Root correction and regression coverage |
| --- | --- | --- |
| P1 | Put the same article on two PO lines at different rates; receive the second. The first article match could override the exact line ID. | One exact-line normalizer in `business-rules.ts`, reused for filing, verification and commit validation. Caller-supplied material/rate overrides are not trusted. |
| P1 | Submit duplicate received rows against one PO line. Each row independently passed the remaining-quantity check. | Duplicate source-line rejection, cumulative posted-quantity limits, and stock-posting reconciliation at the shared validation boundary. |
| P1 | File an inspected/rejected delivery. It previously added usable inventory and could activate customer payments. | Record the rejection/evidence without stock, receipt completion or milestone activation. Unverified/rejected receipts cannot be billed or matched. |
| P1 | File a general-stock PO with no Work Order. Undefined IDs matched unrelated unlinked payment milestones. | Require an explicit matching Work Order and an open, awaiting-event payment. |
| P1 | Attach evidence while filing a new GRN. Uploads were deferred until after save, but save needed uploaded attachments belonging to a nonexistent GRN. | Upload to the existing PO first, await completion, then use the existing attachment API to reference the same assets from the GRN. No duplicate file or staging database. |
| P1 | Forge receipt verification as Field Staff through a commit rather than the form. | Server mutation policy permits only an own-identity pending submission; Owner/Operations verify. Finance may update billing metadata only alongside a matching bill operation, without rewriting physical receipt fields. |
| P2 | Open procurement directly in a fresh session. Its read scope omitted downstream payments, follow-ups and delivery obstacles. | Extend the existing procurement read scope with those three dependencies. |
| P2 | File another partial receipt. The form defaulted to full ordered quantities, including already-received lines; zero lines were submitted as invalid receipts. | Default to remaining quantities, show remaining balance, submit only positive received rows. |
| P2 | Save completion was reported before server confirmation; repeating a save could duplicate stock. | Await server confirmation, freeze submitted input, preserve the receipt ID/payload, and retry persistence without another stock posting. |
| P2 | A non-owner attaches a shared file. The attachment audit falsely claimed Owner, conflicting with server actor checks. | Existing attachment function records the actual authenticated actor and role. |

Tests: `tests/procurement-receipt-integration.test.ts` exercises real procurement,
file, thread, finance and follow-up slices; it also calls shared validation and
server mutation policy. It covers both Owner and Field Staff rejection, partial
receipts, exact same-article line identity, evidence readiness/ownership, retries,
duplicate postings and the invoice-role boundary. The local seed now contains
explicit GRN evidence and receipt movements so the fixture obeys these rules.
No live evidence or business records were fabricated or changed.

### Live database observations (read-only)

- `smfqwexofoqqrrhbzwmx` had one PO and zero GRNs, inventory rows or stock
  movements when checked; this batch requires no historical receipt repair.
- Both workspace commit functions deny EXECUTE to `anon` and `authenticated`
  and allow `service_role`. The internal transaction locks the workspace
  revision row, rejects stale revisions, checks touched row versions and writes
  the change journal in the same transaction. This is an inspected guarantee,
  not a production concurrency/load-test result.
- Security advisor: 13 informational RLS-without-policy findings remain. Several
  are intentionally server-only credentials/queues. Do not add broad public
  policies simply to silence these notices; review each table's intended access.
- Leaked-password protection is disabled (warning). This batch did not alter
  Supabase Auth configuration. See [Supabase remediation guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- No migration, extra business table, compatibility branch or second ledger was
  introduced. Receipt rules use the current authorized API + transactional commit;
  this is not a claim that every JSON line rule is a native SQL constraint.

### Remaining audit queue — not yet signed off

1. **P1, confirmed code concern:** `raw-store.ts` asynchronous transaction cleanup
   clears its active transaction in `finally` before a returned Promise finishes.
   Reproduce async failure/concurrent actions and repair the transaction boundary
   before claiming all actions are atomic. Synchronous GRN actions in this batch
   do not await inside that transaction.
2. **P1, unverified integration risk:** quotation acceptance/revision → Work Order
   and contract snapshot immutability, including concurrent acceptance and retries.
3. **P1, unverified integration risk:** invoice matching → approval → vendor payment
   → job costs and reports, including partial payments, taxes/rounding and reversal.
   Documented variance approval and actor attribution are now covered below;
   full reversal and real-service concurrency remain unverified.
4. **P1, unverified integration risk:** contractor replacement/settlement and payroll
   posting must preserve historical ownership and avoid duplicate job expenses.
   Settlement balances, repeated settlements and paid-payroll protection are now
   covered below; complete payroll-to-job allocation remains outside this batch.
5. **P1, unverified security/recovery risk:** cross-workspace negative tests across
   every role/API; session expiry during save/upload; a fresh-project restore drill.
6. **P2, unverified operational risk:** concurrent receipt requests and lost replies
   against real PostgreSQL; offline queue replay after restart; actual Google Drive
   transfer/finalization. Unit mocks do not prove those external services work.
7. **P2, unverified UX risk:** phone keyboard/orientation/scrolling across Finance,
   HR, Reports, Settings, Master Setup and Media. Real Android/iOS remain unchecked.
8. **P2, unverified maintenance risk:** orphaned attachments, record deletion,
   task completion/progress and delivery-status reconciliation across modules.
9. **P2, design/debt review:** inspect remaining normalization/repair behavior before
   removing it; do not silently guess missing references or add legacy branches.
   Review unused indexes with workload evidence, not their count alone.

### Financial-truth repair batch — 2026-10-12

The existing finance helpers, source records, mutation policy and outbox are
extended; no parallel ledger, compatibility path or new business table is added.

1. Cash charts use confirmed receipts and paid disbursements, including payroll,
   on their actual payment dates. Pending/cancelled requests are not cash movement.
   Trace rows open the source invoice, bill, work order, commission or payroll.
2. The shared forecast counts today's movements once, uses remaining invoice and
   milestone balances, excludes cancelled/awaiting-event milestones, and includes
   approved unpaid bills even before a payment request exists.
3. Contractor settlement deducts actual paid amounts, preserves paid history,
   creates a verified unpaid final bill for the remaining liability, and adjusts
   cumulative job cost without counting prior bills/settlements twice. Overpayment
   requiring recovery is blocked rather than silently recorded as recovered.
4. Paid payroll cannot be reopened, deleted, rewritten or extended with new lines
   through the normal commit API. The server also protects paid payment/receipt
   history; hiding a button alone is not the enforcement boundary.
5. A documented vendor variance accepted as-is can be approved without pretending
   that the quantities matched. Other unresolved discrepancies remain blocked.
6. Invoice matching records the authenticated actor, not a hardcoded staff name.
7. Behavioral tests exercise cash dates, partial dues, variance decisions, payroll
   locks, repeated settlements, outstanding balances and source traceability.

The wider browser pack exposed another defect: retrying an identical in-flight
save queued a second operation instead of confirming the original one. The shared
outbox now reuses the original operation only for the exact same revision, changes
and expected row versions. Changed edits still queue separately. The interrupted
message-save browser regression now passes without duplicating the message.

Recorded cash movement is explicitly **not a reconciled bank balance**. Opening
balances, unrecorded expenses, refunds/reversals and account reconciliation are
not supplied by this projection. Undated future payroll/commission obligations
are not assigned guessed payment dates.

### Verification and release gate for this batch

- 863 tests across 115 files pass (`--testTimeout=15000`), including receipt,
  financial-truth and save-retry regressions. No assertion was disabled.
- TypeScript and the production build pass locally. Changed-file lint has no
  errors; existing `any`/style warnings remain.
- All 17 checks in the smoke, communication, finance and procurement browser pack
  pass against the disposable local QA backend. The 390px checks cover financial
  trace display and receipt evidence/remaining quantities. These do not prove
  real Android/iOS keyboard behavior or external Drive transfer.
- Read-only production checks found no customer receipts, paid vendor/contractor
  payments or paid payroll periods to repair. No migration or live business-record
  write was performed in this batch.
- Release requires a GitHub commit, matching READY Vercel production deployment,
  production alias verification and build/runtime log inspection. Local test
  results must not be presented as live financial-transaction verification.
