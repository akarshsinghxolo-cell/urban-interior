# Canonical shared business records

## Authority model

The workspace owns business data. Modules are authorized consumers/editors of
shared records through the same commit validation, IDs and revision rules.
Authorization still applies. Physical co-location does not combine different
business events into one entity.

| Fact | Canonical stored source | Consumers / derived representations |
| --- | --- | --- |
| Customer identity/contact | customers | Customer Desk, quotations, jobs, finance, communication; Customer labels resolve by ID |
| Site and area identity | sites, areas | Customer Desk, measurement, quotation, visits, execution |
| Measurements | measurementRevisions | Referenced revision is shared; issued commercial snapshots retain agreed measurements |
| Work taxonomy | master.workCategories/workSubcategories/options | Master Setup, Work Required, quotations, contractor capabilities, BOQ/execution |
| Article / variant / unit identity | master.articles/articleVariants/units | Material selection, quotation, purchasing, inventory and vendor rates |
| Vendor identity/profile | master.vendors | Vendor workspace, purchasing, bills, exports |
| Contractor identity/profile/capabilities | master.contractors | Contractor workspace, rates, quotation rate suggestions, award workflows |
| Current contractor rates | master.contractors.work_capabilities[].work_type_rates[] | master.contractorRates is now a read-only SQL view; hydrated client rows are derived, never independent writes |
| Vendor payable | approved/partly-paid/paid vendor bills | vendorBalance / vendorExposureRows; no stored Vendor outstanding override |
| Contractor payable | contractor bills and recorded paid contractor payments | contractorOutstanding / contractorExposureRows; no stored Contractor outstanding override |
| Active contractor jobs | workOrders with scheduled/in_progress/on_hold status and matching contractor_id | contractorExposureRows and partner workspace; no stored active_jobs override |
| Cash | customerReceipts and paid vendor/contractor/payroll/commission movements | Actual cash projections; obligations and schedules remain different measures |
| Job P&L | shared work-order revenue, invoices, receipts and cost lines | Job/site/financial reports and exports use shared calculations |
| Staff identity | master.staff, linked auth identity | Staff directory and HR projections retain appropriate field permissions |
| Files | master.fileAssets plus contextual attachment links | Provider credentials/jobs remain infrastructure, not duplicate business masters |

Work Required, accepted scopes, quotations, work orders, invoices, bills, schedules
and receipts describe different stages or events. Their IDs and relationships are
retained. Issued prices, tax amounts, accepted scope, measurement revision and
transaction history are not recomputed from today's catalogue.

A matching phone/name across Customer/Vendor/Contractor roles is not proof that
two records are the same legal identity. This release performs no speculative
identity merges and does not grant access across workspaces or staff roles.

## Destructive consolidation

Migration `canonical_partner_sources` removes separately materialized Contractor
rate rows from `entity_rate_cards` only after bidirectional equality against
`entity_contractor_rate_read`. At rehearsal, 17 rows matched exactly on IDs, units, rates and other business facts. Two stale descriptive labels are refreshed from canonical work taxonomy. The view has
no storage and derives the same IDs/data from current Contractor capabilities.
It is `security_invoker`, with no browser-role grants and service-role SELECT only.

The existing SQL commit-expansion entry point now strips generated rate writes
and master summary fields before journal/row updates. Direct rate-only SQL commits
are rejected. Constraints forbid physical Contractor-rate rows and obsolete master
summary keys. Deferred unit-reference triggers preserve the integrity formerly
provided by materialized rate rows, including unit deletion and direct parent
writes. All 254 existing native FKs remain installed/validated.

Stored `outstanding` is removed from Vendors, and `outstanding`/`active_jobs` from
Contractors using normal atomic revision/journal commits. Rehearsal affected four
Vendor records and fifteen Contractor records. Canonical data, profiles, capability
rates, documents and financial events remain unchanged. No table is dropped:
47 public tables remain; the additional rate relation is a view.

The app's common hydration and diff-write paths reconstruct rate read models,
remove obsolete counters, and omit rate-only writes. Current UI and general
exports use shared financial projections. Parent/taxonomy journal changes cause
loaded virtual-rate views to revalidate, even when the parent collection is also
loaded. Typed/workspace predicates still apply to every view read.

## Verification and recovery

A private targeted checkpoint contains affected master records, the original rate
rows and affected function/constraint definitions; it excludes Auth/provider
credentials and is not a full database backup. The production cutover must check
checkpoint revision and current projection equality under locks.

Rehearsal restored current 15 Contractors, eight Vendors, 17 units, 83 work
definitions and 17 rate rows. Only redundant summary fields were removed; every
rate ID, unit and financial fact was identical; two descriptive labels now follow taxonomy. Forward migration, rollback and reapplication passed.
PostgreSQL regressions cover forged rows, obsolete counter writes, invalid units,
unit deletion, typed workspace isolation, canonical journals and post-cutover edits.
Client tests cover virtual-write exclusion, derived hydration and delta invalidation.

Rollback `supabase/rollback/canonical_partner_sources.sql` recreates materialized
rates from CURRENT parent capabilities, including changes made after release,
and restores the former SQL expansion/mapping functions. Coordinate it with the
previous application version. Original obsolete counter values can be recovered
from the private checkpoint if needed; they are not restored as financial truth.
