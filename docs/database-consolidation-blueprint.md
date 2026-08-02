# Urban Castle Database Consolidation Blueprint

> **Safety status:** discovery/design only. This document does **not** authorize dropping, renaming, merging, or rewriting production tables. Every destructive migration requires a separate implementation PR with parity tests and rollback.

## Objective

Reduce duplicate business truth and unnecessary physical table fragmentation without breaking module behavior, workspace revision/delta synchronization, authorization, reports, or operational workflows.

## Current production facts

- 92 public tables.
- 82 `entity_*` tables.
- 80 business `entity_*` tables share the same physical envelope: `id`, `workspace_id`, `revision`, `updated_at`, `updated_by`, `data jsonb`.
- 61 `entity_*` tables currently contain no rows; 21 contain rows.
- The application REST layer explicitly maps 80 logical collections to 80 physical `entity_*` tables in `src/lib/rdash/server/commit-rest.ts`.
- Module reads are controlled by exact-module plans plus scope-level collection groups in `module-read-plans.ts` and `module-scoped-collections.ts`.
- Customer/Site entity-scoped reads build a graph dynamically from JSON reference fields in `entity-scoped-read.ts`.
- Production has very few physical PostgreSQL foreign keys for business entities; most business references are JSON IDs validated by application logic.

## Non-negotiable migration rules

1. No destructive DDL until the old and new models have run in parallel and parity has been proven.
2. One domain per migration PR.
3. New canonical writes first; compatibility reads/views/adapters remain during transition.
4. Every migrated collection must preserve workspace revision semantics, row versions, delta-journal patches, authorization, import/export, integrity rules, and audit behavior.
5. Never consolidate tables merely because their SQL envelopes look the same. Consolidate only when they represent the same business concept/lifecycle.
6. Do not remove an empty table until code search, database dependency search, route/read-plan inspection, migrations, imports/exports, and tests all show it is unused.
7. Every cutover requires rollback instructions and old→new parity queries.

## Classification vocabulary

- **KEEP** — distinct canonical business concept; table separation is justified.
- **KEEP / NORMALIZE LATER** — valid concept, but JSON fields should eventually become typed/indexable columns.
- **MERGE CANDIDATE** — same business concept is split by subtype/counterparty and can likely use one canonical table with a discriminator.
- **PROFILE CONSOLIDATION CANDIDATE** — shared identity fields can move to a shared core while role-specific fields remain separate.
- **PROJECTION / VIEW CANDIDATE** — derived/read model should not remain an independently writable source of truth.
- **INFRASTRUCTURE — KEEP** — synchronization/auth/upload infrastructure; do not combine with business data.
- **LEGACY CANDIDATE — VERIFY FIRST** — appears replaceable, but must remain until every dependency is removed.

## Domain-level target decisions

### 1. Staff identity — HIGH RISK

Current:
- `StaffProfile`
- `entity_master_staff`
- `uc_user_roles`
- `StaffRouteBundle` references `StaffProfile`

Decision: **consolidate toward one canonical Staff business profile**, but keep `uc_user_roles` as the authentication/authorization assignment table. `StaffRouteBundle` should eventually reference the canonical Staff ID directly.

Do **not** merge `uc_user_roles` into Staff: Auth user assignment and operational Staff profile have different lifecycle/security responsibilities.

Migration prerequisites:
- map every RPC/trigger touching Staff mirrors;
- move GPS FK safely;
- preserve pending/approved user flows;
- parity-test Staff, attendance, payroll, GPS, approvals and role permissions;
- only then retire `StaffProfile` or the workspace mirror.

### 2. Work queue family — MEDIUM/HIGH RISK

Current:
- `entity_tasks`
- `entity_followups`
- `entity_actions`
- `entity_recurringTasks`

Proposed canonical model: `work_items` with fields such as `item_type`, `title`, `status`, `priority`, `due_at`, assignment, related-entity reference, recurrence metadata and subtype payload.

Decision: **strong merge candidate**, because the modules already present these records as overlapping action/follow-up/task queues and share customer/site/work-order/thread context.

Compatibility requirement: old collections should initially become adapters/views over the canonical model so Tasks, Follow-ups, Approvals and Calendar can migrate independently.

### 3. Risk/blocker family — MEDIUM RISK

Current:
- `entity_blocked`
- `entity_risks`

Proposed: `issues` with `issue_type = blocker | risk`, severity/probability/impact/resolution fields.

Decision: **strong merge candidate**. Their module is already a combined “Obstacles & Risks” surface.

### 4. Finance transaction family — HIGH RISK

Current:
- `entity_payments`
- `entity_customerReceipts`
- `entity_vendorPayments`
- `entity_contractorPayments`

Proposed: `financial_transactions` with `direction`, `transaction_type`, `party_id`, `party_role`, amount/date/method/status and typed references to bill/invoice/work-order/site.

Decision: **strong merge candidate conceptually**, but migrate only after detailed accounting-state and GST/reporting analysis.

Do not combine settlements/commissions blindly: they have different recognition and lifecycle semantics.

### 5. Finance document family — HIGH RISK

Current:
- `entity_invoices`
- `entity_vendorBills`
- `entity_contractorBills`

Proposed: `financial_documents` with `document_type = customer_invoice | vendor_bill | contractor_bill | ...` and shared totals/tax/status/party/reference fields, while subtype-specific payload remains structured.

Decision: **candidate, not yet approved**. First compare actual field contracts and posting/lifecycle rules.

### 6. Partner/party identity — VERY HIGH RISK

Current canonical profiles:
- `entity_customers`
- `entity_master_vendors`
- `entity_master_contractors`
- `entity_master_sourcePartners`

Proposed long-term model:
- `party` for shared identity/contact/location/KYC-neutral fields;
- `party_roles` for CUSTOMER/VENDOR/CONTRACTOR/SOURCE_PARTNER roles;
- separate role profiles for customer/vendor/contractor-specific operational data.

Decision: **profile consolidation candidate**, not a single giant table. A party can legitimately have multiple roles, so shared identity should not be duplicated, but role-specific business fields must remain separate.

This is a late-phase migration because Customer/Site, Procurement, Contractor, Finance, Commission and Communication modules all depend on these IDs.

### 7. Contractor rates — LOW/MEDIUM RISK after convergence work

Current:
- canonical: `entity_master_contractors.data.work_capabilities`
- projection: `entity_master_contractorRates`

Decision: `entity_master_contractorRates` should eventually become a **view/read projection**, not an independently writable physical truth source. Keep it during compatibility migration.

### 8. Vendor rate intelligence — MEDIUM/HIGH RISK

Current:
- `entity_master_vendorRates`
- `entity_master_vendorRateHistories`
- derived averages also affect article/reference rates

Decision: keep rate events/history conceptually separate from current rate state, but eliminate independently editable copies. Target should be one canonical rate-event/current-rate model plus derived views/materialized projections where justified.

### 9. Commercial configuration family — MEDIUM RISK

Current:
- `entity_commercialTerms`
- `entity_paymentTermTemplates`
- `entity_taxConfigs`
- `entity_validityConfigs`

Decision: possible **configuration-family consolidation**, but only if scope/versioning/ownership rules align. A single `commercial_config` table with `config_type` is reasonable if each record is fundamentally a versioned configuration object. Do not merge merely to reduce table count.

### 10. Media/reference/document metadata — MEDIUM RISK

Current includes:
- `entity_entityFileAttachments`
- `entity_entityReferenceAssignments`
- `entity_master_fileAssets`
- `entity_master_referenceMedia`
- `entity_staffDocuments`
- catalogues/Pinterest/reference link tables
- dedicated upload infrastructure (`uc_upload_*`)

Decision: consolidate **business document/reference metadata** where the same attachment/resource concept is duplicated, but keep `uc_upload_batches`, `uc_upload_items`, `uc_upload_events` separate as upload-state infrastructure.

### 11. Procurement lifecycle — KEEP

Keep distinct:
- `entity_vendorRfqs`
- `entity_vendorBids`
- `entity_purchaseOrders`
- `entity_grns`
- `entity_inventory`
- `entity_stockMovements`
- `entity_dispatches`

Reason: these represent different business events and state machines. Their identical JSON envelopes are not a reason to merge them.

### 12. Site/execution lifecycle — KEEP

Keep distinct:
- `entity_sites`
- `entity_areas`
- `entity_workRequired`
- `entity_measurementRevisions`
- `entity_quotations`
- `entity_acceptedScopes`
- `entity_workOrders`
- `entity_boqs`
- `entity_drawings`
- `entity_executionLogs`
- `entity_variationRequests`
- `entity_visits`

Reason: these are separate lifecycle/business artifacts. Future work should normalize high-value reference/status/date fields into typed columns rather than collapse concepts.

### 13. Work/catalog masters — KEEP

Keep distinct:
- `entity_master_units`
- `entity_master_workCategories`
- `entity_master_workSubcategories`
- `entity_master_articles`
- `entity_master_articleVariants`
- `entity_master_subcategoryArticleMap`
- `entity_master_workOptionGroups`
- `entity_master_workOptionValues`

Reason: these are legitimate reference entities/relationships. The more important future improvement is typed columns and real FKs/indexes for category/subcategory/article/unit relationships.

### 14. Workspace synchronization — INFRASTRUCTURE KEEP

Keep separate:
- `entity_workspace_revision`
- `entity_workspace_change_batches`
- `uc_workspace_operations`
- `entity_auditLog`

They serve different synchronization/idempotency/audit responsibilities and must not be folded into normal business tables.

### 15. Upload/Drive infrastructure — KEEP

Keep separate:
- `uc_upload_batches`
- `uc_upload_items`
- `uc_upload_events`
- `uc_drive_folders`

These have typed columns, state-machine constraints and real FKs; they are a better example of purposeful table separation than the generic business collection tables.

### 16. `GenericRecord` — LEGACY CANDIDATE, NOT YET REMOVABLE

It currently remains part of integration state compatibility. Long term, replace it with explicit integration/configuration storage and remove it only after all Google Drive OAuth/vault callers are migrated.

---

# Complete table decision matrix

## Core/customer/site/execution

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_customers` | Customer Desk, Sales, Quotation, Finance, Reports | 7 | KEEP; future Party-core candidate | Very high |
| `entity_sites` | Customer, Site Execution, Field, Quotation, Procurement, Finance | 3 | KEEP | Very high |
| `entity_areas` | Site, Measurement, Quotation, Procurement | 0 | KEEP | High |
| `entity_workRequired` | Customer/Site, Sales, Quotation, Procurement | 0 | KEEP | High |
| `entity_measurementRevisions` | Measurement, Quotation, Reports | 0 | KEEP | Medium |
| `entity_quotations` | Quotation, Sales, Finance, Communication | 0 | KEEP | High |
| `entity_acceptedScopes` | Quotation, Site/WO, Finance | 0 | KEEP | High |
| `entity_workOrders` | Site Execution, Procurement, Contractor, Finance, Field | 0 | KEEP | Very high |
| `entity_boqs` | BOQ, Procurement, Finance/Reports | 0 | KEEP | High |
| `entity_drawings` | Site Execution / Drawings | 0 | KEEP | Medium |
| `entity_executionLogs` | Site Execution / Execution Logs | 0 | KEEP | Medium |
| `entity_variationRequests` | Site/Field/Reports | 0 | KEEP | High |
| `entity_visits` | Field Visits, Calendar, Customer/Site graph | 1 | KEEP | High |

## Workdesk/workflow

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_tasks` | Workdesk, Tasks, Field, Calendar, Communication, most scopes | 5 | MERGE CANDIDATE → `work_items` | High |
| `entity_followups` | Workdesk, Tasks, Finance collections, Communication | 5 | MERGE CANDIDATE → `work_items` | High |
| `entity_actions` | Workdesk approvals/actions, Customer/Site graph | 0 | MERGE CANDIDATE → `work_items` | High |
| `entity_recurringTasks` | Tasks/Calendar | 0 | MERGE/TEMPLATE CANDIDATE → recurrence on `work_items` | Medium |
| `entity_blocked` | Workdesk, Obstacles & Risks, Customer/Field | 0 | MERGE CANDIDATE → `issues` | Medium |
| `entity_risks` | Workdesk, Obstacles & Risks, Reports | 0 | MERGE CANDIDATE → `issues` | Medium |
| `entity_threads` | Conversation Inbox and most operational modules | 26 | KEEP | High |
| `entity_approvalPolicies` | Approvals, HR, System | 0 | KEEP | Medium |
| `entity_automationRules` | Control Brain / System | 0 | KEEP | Medium |

## Procurement/inventory

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_vendorRfqs` | Procurement, Site graph | 0 | KEEP | High |
| `entity_vendorBids` | Procurement | 0 | KEEP | High |
| `entity_purchaseOrders` | Procurement, GRN, Finance | 0 | KEEP | Very high |
| `entity_grns` | GRN, Inventory, Finance | 0 | KEEP | Very high |
| `entity_inventory` | Inventory, Procurement, Workdesk | 0 | KEEP | High |
| `entity_stockMovements` | Inventory, Dispatch, Reports | 0 | KEEP | High |
| `entity_dispatches` | Dispatch, Site/Procurement | 0 | KEEP | High |

## Finance

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_payments` | Customer Collections, Finance | 0 | MERGE CANDIDATE → `financial_transactions` | Very high |
| `entity_customerReceipts` | Collections, Invoices, GST | 0 | MERGE CANDIDATE → `financial_transactions` | Very high |
| `entity_vendorPayments` | Vendor Bills, GST, Finance | 0 | MERGE CANDIDATE → `financial_transactions` | Very high |
| `entity_contractorPayments` | Contractor Bills/Payments, Finance | 0 | MERGE CANDIDATE → `financial_transactions` | Very high |
| `entity_invoices` | Customer Invoices, GST, Finance | 0 | FINANCIAL-DOCUMENT CANDIDATE | Very high |
| `entity_vendorBills` | Vendor Bills, Procurement, GST | 0 | FINANCIAL-DOCUMENT CANDIDATE | Very high |
| `entity_contractorBills` | Contractor Bills/Payments | 0 | FINANCIAL-DOCUMENT CANDIDATE | Very high |
| `entity_contractorSettlements` | Contractor/Finance | 0 | KEEP until accounting semantics reviewed | High |
| `entity_commissions` | Commissions/Finance/Reports | 0 | KEEP | High |
| `entity_workOrderCostLines` | Profitability/Finance | 0 | KEEP | High |

## HR/Staff

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `StaffProfile` | Auth/Staff mirror, GPS FK | 2 | PROFILE CONSOLIDATION CANDIDATE | Critical |
| `entity_master_staff` | HR, permissions, assignments, workspace modules | 2 | CANONICAL TARGET CANDIDATE | Critical |
| `uc_user_roles` | Supabase Auth approval/authorization | 2 | INFRASTRUCTURE/IDENTITY — KEEP | Critical |
| `StaffRouteBundle` | GPS Tracking | 10 | KEEP; later FK to canonical Staff | High |
| `entity_staffRolePermissions` | Access control | 175 | KEEP | Critical |
| `entity_attendance` | Attendance, Field, Payroll | 6 | KEEP | High |
| `entity_leaveRequests` | HR/Payroll | 0 | KEEP | Medium |
| `entity_payrollPeriods` | HR/Payroll | 0 | KEEP | High |
| `entity_payrollLines` | Staff Salary | 0 | KEEP | High |
| `entity_salaryAdjustments` | Staff Salary | 0 | KEEP | High |
| `entity_staffDocuments` | HR documents | 0 | DOCUMENT CONSOLIDATION CANDIDATE | Medium |

## Partner/master identity and rates

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_master_vendors` | Vendors, Procurement, Finance | 4 | KEEP; future Party-core candidate | Very high |
| `entity_master_contractors` | Contractors, Site, Finance | 2 | KEEP; future Party-core candidate | Very high |
| `entity_master_sourcePartners` | Customer referral, Commissions | 0 | KEEP; future Party-core candidate | High |
| `entity_master_commissionRules` | Commissions | 0 | KEEP | Medium |
| `entity_master_vendorRates` | Vendor Rates / Rate Finder / Procurement | 0 | KEEP canonical current-rate concept; review event model | High |
| `entity_master_vendorRateHistories` | Rate history | 0 | KEEP history/event concept | Medium |
| `entity_master_contractorRates` | Contractor Rate compatibility directory | 7 | PROJECTION / VIEW CANDIDATE | Medium |
| `entity_master_customerRateSuggestions` | Quotation configuration | 0 | KEEP pending semantic review | Medium |

## Work/article masters

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_master_units` | Quotation, rates, masters | 17 | KEEP; normalize typed relationships | High |
| `entity_master_workCategories` | Masters, quotation | 13 | KEEP | High |
| `entity_master_workSubcategories` | Masters, quotation, contractor rates | 69 | KEEP | High |
| `entity_master_articles` | Masters, quotation, procurement/rates | 252 | KEEP | High |
| `entity_master_articleVariants` | Article Variants, rates | 0 | KEEP | Medium |
| `entity_master_subcategoryArticleMap` | Quotation/BOQ/master mapping | 323 | KEEP; strong FK/index candidate | High |
| `entity_master_workOptionGroups` | Quotation configuration | 0 | KEEP | Medium |
| `entity_master_workOptionValues` | Quotation configuration | 0 | KEEP | Medium |

## Commercial configuration

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_commercialTerms` | Quotation/Finance | 0 | CONFIG-FAMILY MERGE CANDIDATE | Medium |
| `entity_paymentTermTemplates` | Quotation/Finance | 0 | CONFIG-FAMILY MERGE CANDIDATE | Medium |
| `entity_taxConfigs` | Quotation/Invoices/GST/Procurement | 0 | CONFIG-FAMILY MERGE CANDIDATE only if lifecycle aligns | High |
| `entity_validityConfigs` | Quotation | 0 | CONFIG-FAMILY MERGE CANDIDATE | Low/Medium |

## Media/files/communication

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_entityFileAttachments` | Customer/Site/Field/Media/HR | 0 | KEEP generic attachment relationship | High |
| `entity_entityReferenceAssignments` | Customer/Site/Media | 0 | REVIEW overlap with attachment/reference model | Medium |
| `entity_master_fileAssets` | Media, Drive, entity graph | 0 | KEEP canonical file metadata | High |
| `entity_master_storageAccounts` | Drive Manager | 0 | KEEP | High |
| `entity_master_storageFolderTemplates` | Drive Manager | 20 | KEEP | Medium |
| `entity_master_storageFolderInstances` | Drive/entity graph | 0 | KEEP | Medium |
| `entity_master_catalogues` | Communication/Media | 0 | KEEP | Medium |
| `entity_master_catalogueArticleVendorLinks` | Communication/Media | 0 | KEEP relationship | Medium |
| `entity_master_pinterestBoards` | Media | 0 | KEEP | Low |
| `entity_master_referenceMedia` | Media/reference | 0 | REVIEW consolidation with generic resource model | Medium |
| `entity_commSends` | Communication history | 0 | KEEP event/history | Medium |
| `uc_upload_batches` | Upload engine | 0 | INFRASTRUCTURE — KEEP | High |
| `uc_upload_items` | Upload engine | 0 | INFRASTRUCTURE — KEEP | High |
| `uc_upload_events` | Upload engine | 0 | INFRASTRUCTURE — KEEP | Medium |
| `uc_drive_folders` | Drive folder engine | 0 | INFRASTRUCTURE — KEEP | High |
| `GenericRecord` | Integration compatibility | 0 | LEGACY CANDIDATE — verify callers first | High |

## System/synchronization

| Table | Primary modules/scopes | Current rows | Decision | Risk |
|---|---|---:|---|---|
| `entity_auditLog` | Audit/System plus many scopes | 59 | INFRASTRUCTURE/BUSINESS AUDIT — KEEP | Critical |
| `entity_workspace_revision` | Global workspace CAS | 1 | INFRASTRUCTURE — KEEP | Critical |
| `entity_workspace_change_batches` | Delta journal | 41 | INFRASTRUCTURE — KEEP | Critical |
| `uc_workspace_operations` | Idempotency/commit receipts | 40 | INFRASTRUCTURE — KEEP | Critical |

---

# First migration candidates — ordered by safety

## Candidate A — Risks + Blockers

Why first:
- both currently empty;
- one combined UI already exists;
- relatively small dependency surface;
- good place to prove compatibility-view/adaptor migration mechanics.

Required proof before cutover:
- code references for both collection names accounted for;
- integrity/FK rules mapped;
- reports and entity-scoped reads parity-tested;
- delta patches for old module interfaces tested;
- import/export compatibility tested.

## Candidate B — Tasks + Follow-ups + Actions + Recurring Tasks

Do only after Candidate A proves the method.

Required proof:
- exact field union and status translation;
- due-date/time semantics;
- assignment/role model;
- visit/customer/site/work-order/quotation references;
- thread relationships;
- approvals behavior;
- calendar recurrence behavior;
- Workdesk counters and filters;
- entity-scoped reads and reports.

## Candidate C — Contractor Rates physical projection → view/read model

This should be lower risk than Party/Finance consolidation because canonical Contractor capability rates are already established. Cutover still requires checking every read path and ensuring row-version/delta consumers no longer depend on physical projection writes.

## Explicitly defer

Do **not** start with:
- Staff identity consolidation;
- Party/customer/vendor/contractor identity consolidation;
- finance payments/documents;
- procurement lifecycle;
- Customer/Site/Work Order lifecycle.

Those domains have the largest blast radius.

---

# Dependency surfaces that every implementation PR must update

For any logical collection moved or merged, audit all of:

1. `src/lib/rdash/server/commit-rest.ts` — collection→physical table map.
2. `src/lib/rdash/server/module-read-plans.ts` — exact module reads.
3. `src/lib/rdash/server/module-scoped-collections.ts` — scope reads.
4. `src/lib/rdash/server/entity-scoped-read.ts` — Customer/Site graph and JSON reference selectors.
5. workspace operation diff/canonicalization and server commit policy.
6. workspace delta journal and client patch application.
7. referential-integrity registry/rules.
8. store add/update/delete actions and form bridges.
9. module renderers, counters, filters and dashboards.
10. reports/analytics.
11. import/export and seed/reset paths.
12. audit-log and communication/thread relations.
13. Supabase functions/triggers/grants/RLS/advisors.
14. migration history and rollback.
15. regression tests, lint and production build.

# Phase gates

### Gate 0 — Blueprint (this document)
No production schema changes.

### Gate 1 — Automated dependency inventory
Create machine-readable collection metadata and CI checks ensuring every mapped collection has an explicit architecture classification and no hidden physical-table mapping is introduced.

### Gate 2 — Pilot migration: Risks/Blockers
Add canonical replacement + compatibility layer; no old-table deletion.

### Gate 3 — Observe and prove parity
Compare old/new reads and writes under tests and production-safe telemetry.

### Gate 4 — Cut over reads/writes
Only after parity.

### Gate 5 — Deprecation
Remove old collection from runtime maps only after code/dependency search is clean.

### Gate 6 — Physical drop
Separate migration after an observation period and rollback snapshot.

# Current recommendation

Proceed next with **Gate 1**, not with a table merge: add an automated architecture registry/test that covers every collection in `COLLECTION_TO_TABLE`, assigns its domain/classification/canonical owner, and fails CI if a new table/collection is introduced without an explicit architecture decision. This prevents the same uncontrolled table growth from recurring while the larger consolidation work proceeds safely.
