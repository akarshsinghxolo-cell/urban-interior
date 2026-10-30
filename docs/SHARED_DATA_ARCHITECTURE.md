# Shared data architecture

## Connected storage revision, 28 October 2026

The next migration pair, `shared_domain_connections` and `shared_business_keys`, extends the PR #239 baseline from **52 to 47 public tables**, with **254 validated public/private FKs**. All 80 logical collections remain distinct. The resulting design uses 33 physical business stores and 14 infrastructure tables. See [connected schema verification](CONNECTED_SCHEMA_VERIFICATION.md) for the exact mapping, integrity checks and release/rollback procedure.

| Shared store | Additional logical collections |
| --- | --- |
| `entity_project_work` (new) | workRequired, acceptedScopes, workOrders |
| `entity_financial_documents` | payments (schedules), commissions |
| `entity_resource_links` | master.catalogueArticleVendorLinks |

Project records retain their separate stages, IDs and history. Three compound FKs additionally require their Site to belong to their Customer. Native uniqueness covers canonical Article names, per-Article variant names, scoped material pairs and active Vendor rate identities. Application errors explain these rules without database identifiers. Issued documents and historical snapshots retain their stored values.

## PR #239 baseline

Released 27 October 2026 to Supabase project `urban-interior` (`smfqwexofoqqrrhbzwmx`) and `urban-castle.vercel.app`. PR #239 was merged as `e60dbab03088c167b8ebdf69d516dc56e73786f0`; the matching application build `4d727f1` was promoted after the database cutover. That release reached **52 public tables and 251 validated public/private FKs**. Before this expansion, production had 73 public tables and the first shared-domain migration was already applied.

## Storage model

The first consolidation reduced 94 public tables to 73. This expansion moves 27 remaining business tables into six new and five existing typed domain stores, reducing **73 to 52 public tables**. That is 21 fewer tables in this expansion (28.8%), and 42 fewer than the original 94 (44.7%). All **80 logical collections** retain their IDs, validation, authorization, revision keys, routes and workflows. The app has 38 physical business stores and 14 infrastructure tables.

| Shared table | Logical collections |
| --- | --- |
| `entity_commercial_documents` | quotations, boqs, vendorRfqs, vendorBids, contractorBids, purchaseOrders, contractorSettlements, grns, dispatches |
| `entity_financial_documents` | invoices, vendorBills, contractorBills, payrollPeriods |
| `entity_money_movements` | customerReceipts, vendorPayments, contractorPayments |
| `entity_commercial_settings` | commercialTerms, paymentTermTemplates, taxConfigs, validityConfigs |
| `entity_workflow_controls` | actions, risks, blocked, tasks, followups, visits |
| `entity_reference_libraries` | master.catalogues, master.pinterestBoards, master.referenceMedia |
| `entity_rate_cards` | master.vendorRates, master.contractorRates, master.customerRateSuggestions, master.vendorRateHistories |
| `entity_policy_rules` | approvalPolicies, automationRules, master.commissionRules, recurringTasks |
| `entity_work_definitions` | master.workCategories, master.workSubcategories, master.workOptionGroups, master.workOptionValues |
| `entity_catalogue_items` | master.articles, master.articleVariants |
| `entity_site_records` | measurementRevisions, drawings, executionLogs, variationRequests |
| `entity_resource_links` | entityFileAttachments, entityReferenceAssignments |
| `entity_staff_records` | attendance, payrollLines, leaveRequests, salaryAdjustments, staffDocuments |
| `entity_storage_structure` | master.storageFolderTemplates, master.storageFolderInstances |

`src/lib/rdash/shared-domain-storage.ts` owns the physical mapping. Every shared-table read includes workspace and collection filters. PostgreSQL has the same explicit collection-to-table allowlist for atomic commits. Shared primary keys include collection; the same ID in two kinds remains two independent records.

## Canonical ownership across modules

| Business truth | Owner | Consumers |
| --- | --- | --- |
| Customer identity and contact details | customers | Customer Desk, Work Required, quotations, execution, finance, communications |
| Site, area and measurement identity | sites, areas, measurementRevisions | Customer Desk, Work Required, quotations, visits, execution |
| Work categories, subcategories, options and work-type IDs | shared work definitions | Master Setup, Work Required, quotations, BOQs, contractor capabilities, execution |
| Article identity, variants, units, conversion and GST | shared catalogue items; master.units | Master Setup, material selection, vendor rates, purchasing, quotations |
| Vendor rate and its history | shared rate cards | Vendor module, procurement, comparisons, costing |
| Contractor capabilities and agreed rates | master.contractors.work_capabilities | Contractor module and transactional contractorRates projection |
| Invoice/bill balance and recorded cash | financial documents and money movements | Finance, party screens, Customer Desk, dashboards |
| File bytes and contextual links | master.fileAssets and shared resource links | Module attachments, uploads, media library, WhatsApp attachments |
| Staff identity and operational history | master.staff and shared staff records | Staff, attendance, leave, payroll, protected document access |

Modules use authoritative IDs rather than new module-specific copies of masters. Existing foundation deltas, scoped reads and navigation revalidation propagate live master changes through the shared workspace store. Idle visible sessions now consult the authenticated revision journal once per minute and on focus/reconnect. Remote updates defer while a form is dirty or a save/outbox operation is pending. Set NEXT_PUBLIC_UC_DELTA_SYNC_ENABLED=0 at build time to disable this refresh. Embedded historical labels and independently entered overrides are not automatically rewritten.

Payment schedules remain obligations, financial documents remain bills, and money movements remain actual cash. Payroll periods share physical document storage while retaining a separate collection; customer/vendor dashboard totals do not include payroll. Issued quotation revisions, agreed rates, tax snapshots and paid history retain their historical values.

## Integrity and access

The [foreign-key audit](SHARED_FOREIGN_KEY_AUDIT.md) covers all 80 logical collections, all 257 Integrity-module rules and the existing database graph. `shared_domain_foreign_keys` was applied after expansion: it validates all 229 persisted scalar relationships with workspace/type scope, upgrades 38 ID-only FKs and preserves journalled deletion semantics. It also fixes nested and embedded reference checking, Staff assignment metadata and array cleanup.

The expansion redirects 28 affected foreign keys, preserving their original workspace, party/job, deferral and deletion semantics. Typed compound foreign keys ensure that a dispatch cannot satisfy a GRN reference and an action cannot satisfy a recovery-task follow-up reference. Attendance uniqueness stays confined to attendance, rather than blocking payroll rows with the same staff/date.

Staff assignment and history-normalization triggers move with their original logical kinds. Work-category and subcategory history guards remain active. Taxonomy reference scans now exclude only the current typed definition; another kind with the same ID still counts as a reference. Contractor-rate projection and dashboard SQL use collection-filtered canonical reads.

New shared tables have RLS enabled, no browser-role grants, and service-role access through the existing authorized server APIs. Staff-document and WhatsApp attachment reads explicitly scope workspace and kind. Upload staging uses logical collection names, including folder templates, so physical storage changes cannot split the upload journal.

## Migration and rollback

`shared_domain_expansion` takes the workspace revision lock and source-table locks in one transaction, copies complete row envelopes, and compares source/destination rows in both directions before removing any table. No source table is dropped with CASCADE. No compatibility views, dual writes, archive tables or duplicate business records remain.

`supabase/rollback/shared_domain_expansion.sql` reverses this expansion using the **current shared rows**, including writes made after release. It restores original source tables, constraints, indexes, policies, triggers and functions. Reverse `supabase/rollback/shared_domain_foreign_keys.sql` first, then coordinate expansion rollback with the matching application rollback. To return all the way to the original 94-table model, reverse this expansion first, then use the earlier `shared_domain_tables.sql` rollback.

The provider folder-claim registry remains separate from workspace folder templates/instances. Its 48 provider claim/hierarchy rows and the 13 application folder instances represent different records and concurrency states. Combining them would require a provider workflow redesign. Credentials, authentication keys, upload jobs, revision journals and audit history retain their specific access and retention boundaries.

All application business tables remain in `public`. The contact uniqueness helper remains in `private`. Supabase-managed auth, storage, realtime, vault, extensions and migration schemas are platform infrastructure and are not duplicate application modules.

## Verification

- Restored the live catalogue and all 2,441 business record envelopes for the final release rehearsal. Authentication accounts and provider credential payloads were not copied.
- Rehearsed 73 -> 52 -> 73 -> 52 tables, comparing every copied row envelope and the dashboard aggregates. Rollback also preserves a new write made after migration.
- Ran all three SQL regression packs locally and against production inside rolled-back transactions: CAS/journal atomicity, forged collection rejection, same-ID kind isolation, workflow/follow-up type and workspace links, staff triggers, attendance uniqueness, taxonomy history, payroll aggregate isolation, GRN/bill relationships, RLS and grants, approval guards and contractor-rate projection.
- Application read regressions cover every shared domain, including workspace/kind isolation and SQL/TypeScript registry agreement.
- Compared the complete corrected pre-cutover and post-cutover envelopes: 2,441 before and after, zero missing, added or changed records. Finance, commercial and operations aggregates were unchanged. All 4,379 populated references passed the complete application scan.
- Application CI passed 969 unit/PostgreSQL tests and 47 browser tests for the released PR head. The production browser reached the expected sign-in screen; private production UI verification requires a signed-in session.
- Production migration history records expansion as `20261027103848` and FK hardening as `20261027103854` (MCP execution versions differ from the source file timestamps). Do not replay the files just because those timestamps differ.
- Release checks found a redundant commercial-document index and an explicit 30-second upload-route limit. The guarded `shared_domain_index_cleanup` removes only the index with no dependencies, retains every FK and supports standalone reversal/full consolidation rollback. Upload actions now have a bounded 300-second invocation budget. The timed-out upload recovered through the existing retry path without recreating its file registry rows.

## Shared business calculations, 30 October 2026

Vendor exposure screens, CSV and print exports use `vendorExposureRows`, derived
from the same approved/partly-paid/paid bills through `vendorBalance`. Stored
Vendor master outstanding fields are not authoritative for these outputs. Report
filters apply before this projection. No master or historical document is rewritten.

GST screen, CSV and print also share `taxReportProjection`: customer invoices
and approved/partly-paid/paid vendor bills, preserving current inclusion rules.
Exports no longer substitute quotation tax for invoice/bill tax.

Background refresh uses the existing authorized scoped delta API, workspace
revision and row-version checks. It is eventual synchronization (one minute while
idle/visible, plus focus/reconnect), not an immediate cross-device push. Hidden or
offline sessions do not read; dirty forms and pending writes take precedence.
Existing rollback/reload recovery and workspace/collection isolation remain active.

Further work: audit other report/export pairs and independently stored master
summary fields before removing them; preserve issued-document snapshots and
distinct quotation, invoiced, scheduled and received measures.
