# Shared data architecture

Audited 25 October 2026 against GitHub `main` at `c14417d7afeeb76cfc8454ad6fa306ca32f19c1f`, Vercel project `urban-castle`, and Supabase project `urban-interior` (`smfqwexofoqqrrhbzwmx`). Vercel's configured Supabase URL matches this project.

## Result

The database had 94 public tables: 80 revisioned business collections and 14 infrastructure tables. Twenty-nine business tables now share eight domain tables. The result is **73 public tables**, a reduction of **21 tables (22.3%)**. There are still 80 logical business collections, so permissions, workflows and financial meanings remain explicit. Existing modules keep their public routes and collection contracts.

| Shared physical table | Logical collections |
| --- | --- |
| `entity_commercial_documents` | quotations, boqs, vendorRfqs, vendorBids, contractorBids, purchaseOrders, contractorSettlements |
| `entity_financial_documents` | invoices, vendorBills, contractorBills |
| `entity_money_movements` | customerReceipts, vendorPayments, contractorPayments |
| `entity_commercial_settings` | commercialTerms, paymentTermTemplates, taxConfigs, validityConfigs |
| `entity_workflow_controls` | actions, risks, blocked |
| `entity_reference_libraries` | master.catalogues, master.pinterestBoards, master.referenceMedia |
| `entity_rate_cards` | master.vendorRates, master.contractorRates, master.customerRateSuggestions |
| `entity_policy_rules` | approvalPolicies, automationRules, master.commissionRules |

The registry in `src/lib/rdash/shared-domain-storage.ts` is the application source for physical storage names. Every shared-table read filters by both `workspace_id` and `collection`. PostgreSQL uses the same allowlist for atomic writes. A client cannot label one collection's storage as another collection.

## Shared ownership across modules

The audit found that the app already has one canonical Customer, Site, Article, Variant, Unit and Work taxonomy source. Their records remain shared by reference; this change does not create copies or alternative masters.

| Business truth | Canonical owner | Consumers |
| --- | --- | --- |
| Customer identity and contact details | `customers` | Customer Desk, Work Required, quotations, execution, finance, communications |
| Site and measured area identity | `sites`, `areas`, `measurementRevisions` | Customer Desk, Work Required, quotations, visits, execution |
| Article identity, units, conversion and GST | `master.articles`, `master.articleVariants`, `master.units` | Master Setup, material selection, vendor rates, purchasing, quotations |
| Work categories, subcategories, work types and option IDs | Existing shared Work masters | Master Setup, Work Required, quotations, BOQ, contractor capabilities, execution |
| Vendor price offers | `master.vendorRates` in the shared rate-card table | Vendor module, procurement, rate comparison and costing |
| Contractor capabilities and agreed rates | `master.contractors.work_capabilities` | Contractor module and generated `master.contractorRates` projection |
| Invoice or bill balance | One logical financial document in the shared document table | Finance, vendor/contractor screens, Customer Desk, dashboards |
| Recorded receipt or payment | One logical cash movement in the shared money-movement table | Finance, party screens, customer/site summaries, dashboards |
| File bytes and attachment links | Existing File Asset and attachment records | All modules viewing the same attachment |

Changing a live master record continues to reach consumers through its existing ID and the shared session/delta store. Navigation revalidates cached modules, and shared Master changes use the foundation delta stream. This refactor preserves those mechanisms. It does not introduce continuous cross-session polling or claim that every open browser changes instantly without a refresh/navigation.

Shared storage does **not** imply shared meaning: a payment schedule is an obligation; an invoice is a bill; a receipt is actual cash. Issued quotation revisions, agreed prices, tax snapshots and paid history remain explicit historical records. Master edits must not silently rewrite agreed commercial history or independently entered overrides.

## Why remaining tables stay separate

Work Required, accepted scopes, work orders and measured areas represent different lifecycle records. Article masters and operational transactions also have different owners and integrity rules. Identity, encrypted Google Drive credentials, WhatsApp authentication keys, upload sessions, revision journals and financial audit history have distinct security or retention requirements. Combining them would lower a count without removing duplicated business truth.

All application business storage remains in the existing `public` schema. The private customer-contact uniqueness helper stays in `private`. Supabase-managed `auth`, `storage`, `realtime`, extension and migration schemas are platform infrastructure and are not module duplicates.

The change reduces table proliferation. It does not, by itself, promise fewer requests, less egress, fewer logical records, or automatic synchronization of every embedded JSON field. Scoped reads and shared-ID resolvers still determine those behaviors.

## Migration and security

The migration runs in one transaction, takes the workspace revision lock before locking source tables, copies the complete row envelope and JSON, and compares each copied collection in both directions before removing any source table. Every source ID, workspace, revision, timestamp, author and payload is retained. Source tables are removed without `CASCADE`; no compatibility views or dual-write layer remain.

Foreign keys are redirected using explicit kind discriminators, including workspace and compound party/job relationships. Thus a contractor bill cannot satisfy a customer-receipt invoice reference even if its ID matches. Existing unique document-number indexes, checks and query indexes are retained with collection scope. Remapped foreign keys receive indexes.

Shared tables have RLS enabled, no browser-role grants, and service-role access only, matching the current server-mediated data path. Existing logical module authorization, validation and row-version keys continue to apply. The approval-rule Staff guard is attached only to approval-policy rows. Contractor rate projections are generated in the same transaction as contractor capability writes.

The paired script under `supabase/rollback/shared_domain_tables.sql` restores the original physical tables from the **current** shared rows, retaining writes made after release. It restores original functions, constraints, indexes, policies and the moved trigger. Application rollback must be coordinated with database rollback.

## Validation

- Recreated the live table definitions, 242 constraints, 394 indexes, 26 functions and 14 triggers in local PostgreSQL via PGlite.
- Restored 111 relevant persisted business records, including all 29 records in the affected tables and their required parent records. Sensitive authentication and provider credentials were not copied.
- Applied the migration: 94 to 73 public tables; every migrated row envelope matched.
- Compared dashboard aggregates before and after: unchanged.
- Ran SQL regressions for same-ID kind isolation, row CAS, atomic journaling, forged collection/table rejection, financial kind/workspace foreign keys, RLS/grants, approval Staff validation, contractor rate projections and dashboard receipts.
- Rehearsed rollback: all 94 public tables and every copied record/revision restored; migration reapplied successfully.
- Added application read regressions for every shared domain, including cross-workspace isolation and TypeScript/SQL registry agreement.

Production release must pair this application commit with the database migration. An old application build cannot use the removed tables. Stage and check the new build before the database cutover, then promote it and confirm table counts, SQL checks and runtime logs. The rollback script is intentionally outside the automatic migrations directory.
