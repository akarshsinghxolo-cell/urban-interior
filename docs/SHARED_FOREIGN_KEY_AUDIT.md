# PR #239: foreign-key and relationship audit

**Production release, 27 October 2026:** PR #239 is merged (`e60dbab`), the matching `4d727f1` build is live, and production has **52 public tables / 251 validated native FKs**. The final scan covered **all 257 registry rules, 2,441 records and 4,379 populated references**, with zero issues or duplicates after the 12 legacy conversation-link corrections described below. Every corrected pre-cutover row envelope survived the database cutover unchanged; finance, commercial and operations aggregates matched. CI passed 969 unit/PostgreSQL tests and 47 browser tests. Earlier counts and release holds below describe the dated audit stages.

Post-release checks also identified one duplicate index and a 30-second upload-finalization timeout. The guarded `shared_domain_index_cleanup` retains the original index supporting 28 constraints and removes only its dependency-free duplicate; PostgreSQL tests verify the entire FK graph and full rollback after cleanup. The upload action route now allows 300 seconds for its existing Drive and canonical registration workflow. The affected upload completed through its existing idempotent retry path. The existing leaked-password-protection advisory remains unchanged; no authentication settings were modified.

Audited 26 October 2026 against production `main` (`e130bc8a7054b17b10143cb3729f13bf5cd208a3`), PR #238 and PR #239, including the recent shared service catalogue, recovery-task, taxonomy-history and discrepancy-repair migrations. All 80 persisted logical collections and all 97 existing public/private database FKs were examined, not only the six new shared tables.

## Findings and fixes

- The live database has 73 public tables and one application-private helper table. PR #239 still targets 52 public tables; FK hardening creates no additional tables and changes no row payloads.
- All 2,430 business records were scanned in their own workspace. The corrected registry evaluated 4,040 references with zero integrity issues or duplicate IDs.
- Shared-domain expansion preserves the existing 97 FK relationships, including financial party/job compound links and infrastructure/Auth references. The 28 redirected FKs retain their original meanings.
- Added a second migration, `shared_domain_foreign_keys`, with 192 scoped FK definitions. It replaces 38 ID-only FKs and adds 154 constraints, taking public/private FKs from 97 to 251 (250 public, one private). Every one of the 229 registered, persisted scalar relationships is now covered by a validated workspace-scoped FK. Shared targets also require the correct collection discriminator.
- Canonical Article/category/unit, variant, scoped material, vendor rate/history, resource context, Staff/manager, approval, payroll, storage-folder, file and measurement relationships are covered. Existing generated columns are reused when their expressions and logical kind match. Added supporting indexes are checked in PostgreSQL.
- Optional and conditionally required fields still follow the business validator. A nonempty reference must be valid; this migration does not impose a blanket NOT NULL requirement on every kind sharing a table.

Native database deletion checks use deferred NO ACTION for the added relationships. The application continues to plan cascade/nullification and commit every changed child through the revision journal. The database cannot silently cascade away business rows without matching journal entries. Existing typed financial compound constraints remain in place.

The application integrity registry also had gaps that could hide or mis-handle references:

1. Task/follow-up Staff assignments were absent and Visit still used retired `staff_id`. All now use canonical `assigned_staff_id`.
2. Nested `three_way_match.obstacle_id` was read/written as a literal dotted property. The checker, repair and cascade paths now share nested field access.
3. Array cascade cleanup removed the child ID instead of the deleted parent ID; repair also removed only the first orphan in an array. Both now remove the correct IDs while retaining valid entries.
4. Thread messages/attachments and BOQ items were treated as standalone root collections; BOQ-item links incorrectly targeted entire BOQs. They now resolve and update their owning JSON documents without new tables. Deleting a document cleans links and file ownership for its embedded records.
5. Missing required parents were incorrectly advertised as safe automatic row deletion. Those issues now require manual resolution, and the operational normalization pass is skipped while required parents are unknown so it cannot remove incomplete rates and their history.
6. The retired Customer `source_partner_id` rule was removed; typed Customer referrers remain protected by the existing private identity guards. Rate-history scoped material remains optional, matching its model, and required commission-rule partners restrict deletion.

Embedded arrays and polymorphic links remain application relationships. Quotation coverage, material/work-type options, file-owner types, threads, customer referrers and historical audit entity identifiers retain their existing business/history validation. Provider Drive IDs and tombstone IDs are external/history identifiers, not fabricated database FKs. The matrix below distinguishes these cases explicitly.

## Verification and release

The schema-only fixture in `tests/fixtures/shared-domain-before-expansion.sql` captures the pre-PR PostgreSQL catalogue without production row data, Auth accounts, API keys or provider credentials. `tests/shared-domain-postgres.test.ts` reconstructs it in PostgreSQL/PGlite, reflects actual FKs and generated discriminator expressions, and checks every registered scalar relation. It preserves the complete original FK graph through expansion, hardening, rollback and reapplication.

All three SQL regression packs verify kind/workspace isolation, atomic failed commits, journal/revision rollback, parent/child batch ordering, file/variant/folder/payroll/rate/measurement links, RLS and financial aggregates. A separate local rehearsal restored all 2,430 live business row envelopes, applied both migrations, compared dashboard aggregates, and rolled back to 73 tables with every envelope preserved. A post-release write is also preserved across rollback/reapplication.

Release order: apply `shared_domain_expansion`, then `shared_domain_foreign_keys`, and release the matching application head. Reverse FK hardening before reversing expansion. The earlier Supabase request-state failures were resolved before the 27 October cutover; both migrations were applied and the matching `4d727f1` application was promoted. The older staged build `fa43428` must not be used as the final PR release.

The baseline advisors report an existing leaked-password-protection warning and unused-index/RLS-without-policy information. New shared storage remains server-only. This audit does not change account authentication settings.

## Six-commit re-audit, 27 October 2026

Reviewed the six commits ending at `5969dcb`: `fc5160b`, `849c657`, `e130bc8`, `fa43428`, `47cfee3`, and `5969dcb`. This includes release holds/cutover, customer quotation coverage, all changed table mappings, upload callers, the FK migration and rollback, and the checker/cascade/repair paths. Some defects predated this range but were exposed by its expanded relationship handling.

| Priority | Verified problem | Correction |
| --- | --- | --- |
| High | Automatic orphan repair deleted only the orphan row. Its own children could become orphans; BOQ deletion bypassed an RFQ restrict link, and a row with a second manual-repair issue could be erased. | Use the dependency-aware cascade planner, retain restricted/manual records (including affected descendants), report skipped removals, and suppress operational normalization after a blocked repair. |
| High | FK delta validation matched only human-readable issue text. Fixing one row could hide an identical broken link newly added to a different row, including embedded-message references. | Match collection, record ID, field, target collection and target ID, retaining multiset counts and readable errors. |
| Medium | The cascade depth guard recorded a block without changing `success`; document deletion could continue after skipping embedded children. | Mark the whole operation unsuccessful and return the original database. |
| Medium | Quoted areas appeared checked and disabled, but **Clear editable** sent an empty area selection to the form. A save could drop the supposedly locked IDs and fail relation validation. | Retain locked IDs in every area-selection update, with a browser save/readback regression. |
| High | Integration with the newer production commit `92e9f54` exposed a pricing mismatch: operational repair retained additional-work fields but recalculated quotation amounts from quantity/rate alone, discarding those charges and their tax. | Preserve the latest printing/extra-column features and use the canonical quotation amount calculation during repair. A failing ₹250-charge regression verifies line, subtotal and tax preservation. |

That re-audit added seven focused integrity regression cases and one pricing-repair regression. All 956 unit/PostgreSQL tests passed locally after integrating the newer `main` commit `92e9f54` without overwriting its quotation printing or extra-column features. Typecheck passed and changed files added no lint warnings. The migration test rechecked the complete original 97-FK graph, all 229 registered scalar relationships, scope/kind isolation, current-row rollback and reapplication. At that audit stage, production still had 73 public tables and 97 public/private FKs; the subsequent release reached the 52-table target as recorded above.

## Annotation A: complete Integrity-module audit before release

The dashboard reads the same `FOREIGN_KEYS` registry reviewed here: all **257 rules** were evaluated, including the rules previously marked `ignore`. There are 229 persisted scalar rules covered by the new workspace/type-scoped database constraints, 14 array rules, seven embedded/operational rules, and seven polymorphic/provenance rules. Historical cost-source IDs and general library contexts deliberately do not manufacture live parent records.

The broader scan found 12 legacy Customer conversation links. Their Customers still exist; their raw record IDs needed the canonical `customer-conversation:` prefix. The one-time maintenance script corrected only those 12 parent fields through the existing CAS/journal transaction. Every thread ID and all 46 messages in the affected threads were retained, and workspace revision advanced to 521. Across the workspace, all 235 threads and 1,021 messages remain present. The saved pre-cutover checkpoint contains all 2,441 business row envelopes.

The checker now resolves thread, task/approval, file-owner and reference-resource parents instead of silently excluding them. Invalid polymorphic references require manual resolution rather than automatic deletion of history. Communication attachments are a normal array relationship to `entityFileAttachments` with safe nullification; vendor-bill approval links are resolved explicitly. Customer cascade deletion uses the canonical conversation identity. Row-targeted server reads now consume the registry for their parent dependencies, including canonical Staff assignments, and resolve typed linked records before validation.

A fresh complete scan after the link correction evaluated **4,379 references** across all 2,441 records: zero reference issues, zero duplicate IDs and zero business-validator failures. PostgreSQL regression coverage verifies that the correction preserves thread payloads and journals exactly one atomic batch. The table-consolidation and FK migration files are unchanged by this follow-up; the target remains 52 public tables.

## Complete relationship matrix

SQL coverage below applies to nonempty references and always includes workspace; shared parents include their collection kind. Deletion policies are application policies executed through the journalled transaction path.

| Child collection | Field | Parent | Enforcement | App deletion |
| --- | --- | --- | --- | --- |
| `sites` | `customer_id` | `customers` | Scoped database FK | cascade |
| `areas` | `site_id` | `sites` | Scoped database FK | cascade |
| `workRequired` | `customer_id` | `customers` | Scoped database FK | restrict |
| `workRequired` | `site_id` | `sites` | Scoped database FK | restrict |
| `workRequired` | `area_ids` | `areas` | Application array reference | restrict |
| `measurementRevisions` | `site_id` | `sites` | Scoped database FK | restrict |
| `measurementRevisions` | `area_id` | `areas` | Scoped database FK | restrict |
| `measurementRevisions` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `measurementRevisions` | `drawing_id` | `drawings` | Scoped database FK | nullify |
| `quotations` | `customer_id` | `customers` | Scoped database FK | restrict |
| `quotations` | `site_id` | `sites` | Scoped database FK | restrict |
| `acceptedScopes` | `customer_id` | `customers` | Scoped database FK | restrict |
| `acceptedScopes` | `site_id` | `sites` | Scoped database FK | restrict |
| `acceptedScopes` | `work_required_id` | `workRequired` | Scoped database FK | restrict |
| `acceptedScopes` | `quotation_id` | `quotations` | Scoped database FK | restrict |
| `acceptedScopes` | `area_ids` | `areas` | Application array reference | restrict |
| `acceptedScopes` | `measurement_revision_ids` | `measurementRevisions` | Application array reference | restrict |
| `acceptedScopes` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `workOrders` | `customer_id` | `customers` | Scoped database FK | restrict |
| `workOrders` | `site_id` | `sites` | Scoped database FK | restrict |
| `workOrders` | `contractor_id` | `master.contractors` | Scoped database FK | restrict |
| `workOrders` | `quotation_ids` | `quotations` | Application array reference | restrict |
| `workOrders` | `accepted_scope_ids` | `acceptedScopes` | Application array reference | restrict |
| `workOrders` | `work_required_ids` | `workRequired` | Application array reference | restrict |
| `workOrders` | `area_ids` | `areas` | Application array reference | nullify |
| `boqs` | `work_order_id` | `workOrders` | Scoped database FK | cascade |
| `vendorRfqs` | `work_order_id` | `workOrders` | Scoped database FK | cascade |
| `vendorRfqs` | `boq_id` | `boqs` | Scoped database FK | restrict |
| `vendorRfqs` | `site_id` | `sites` | Scoped database FK | nullify |
| `vendorBids` | `rfq_id` | `vendorRfqs` | Scoped database FK | cascade |
| `vendorBids` | `vendor_id` | `master.vendors` | Scoped database FK | restrict |
| `purchaseOrders` | `rfq_id` | `vendorRfqs` | Scoped database FK | nullify |
| `purchaseOrders` | `work_order_id` | `workOrders` | Scoped database FK | restrict |
| `purchaseOrders` | `vendor_id` | `master.vendors` | Scoped database FK | restrict |
| `purchaseOrders` | `site_id` | `sites` | Scoped database FK | nullify |
| `grns` | `po_id` | `purchaseOrders` | Scoped database FK | cascade |
| `grns` | `vendor_id` | `master.vendors` | Scoped database FK | restrict |
| `grns` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `grns` | `site_id` | `sites` | Scoped database FK | nullify |
| `dispatches` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `dispatches` | `site_id` | `sites` | Scoped database FK | nullify |
| `inventory` | `grn_id` | `grns` | Scoped database FK | nullify |
| `inventory` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `inventory` | `article_id` | `master.articles` | Scoped database FK | restrict |
| `inventory` | `work_required_article_id` | `master.subcategoryArticleMap` | Scoped database FK | restrict |
| `stockMovements` | `inventory_id` | `inventory` | Scoped database FK | cascade |
| `stockMovements` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `stockMovements` | `po_id` | `purchaseOrders` | Scoped database FK | nullify |
| `stockMovements` | `grn_id` | `grns` | Scoped database FK | nullify |
| `stockMovements` | `dispatch_id` | `dispatches` | Scoped database FK | nullify |
| `vendorBills` | `po_id` | `purchaseOrders` | Scoped database FK | restrict |
| `vendorBills` | `grn_id` | `grns` | Scoped database FK | restrict |
| `vendorBills` | `vendor_id` | `master.vendors` | Scoped database FK | restrict |
| `vendorBills` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `vendorBills` | `site_id` | `sites` | Scoped database FK | nullify |
| `vendorPayments` | `vendor_bill_id` | `vendorBills` | Scoped database FK | cascade |
| `vendorPayments` | `vendor_id` | `master.vendors` | Scoped database FK | restrict |
| `vendorPayments` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `vendorPayments` | `site_id` | `sites` | Scoped database FK | nullify |
| `contractorBills` | `work_order_id` | `workOrders` | Scoped database FK | restrict |
| `contractorBills` | `contractor_id` | `master.contractors` | Scoped database FK | restrict |
| `contractorBills` | `customer_id` | `customers` | Scoped database FK | restrict |
| `contractorBills` | `site_id` | `sites` | Scoped database FK | nullify |
| `contractorBills` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `contractorBills` | `settlement_id` | `contractorSettlements` | Scoped database FK | restrict |
| `contractorPayments` | `contractor_bill_id` | `contractorBills` | Scoped database FK | cascade |
| `contractorPayments` | `work_order_id` | `workOrders` | Scoped database FK | restrict |
| `contractorPayments` | `site_id` | `sites` | Scoped database FK | restrict |
| `contractorPayments` | `contractor_id` | `master.contractors` | Scoped database FK | restrict |
| `commissions` | `work_order_id` | `workOrders` | Scoped database FK | restrict |
| `commissions` | `source_partner_id` | `master.sourcePartners` | Scoped database FK | restrict |
| `commissions` | `customer_id` | `customers` | Scoped database FK | nullify |
| `commissions` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `workOrderCostLines` | `work_order_id` | `workOrders` | Scoped database FK | cascade |
| `contractorBids` | `work_order_id` | `workOrders` | Scoped database FK | cascade |
| `contractorBids` | `contractor_id` | `master.contractors` | Scoped database FK | restrict |
| `contractorBids` | `accepted_scope_id` | `acceptedScopes` | Scoped database FK | nullify |
| `contractorSettlements` | `work_order_id` | `workOrders` | Scoped database FK | cascade |
| `contractorSettlements` | `contractor_id` | `master.contractors` | Scoped database FK | restrict |
| `drawings` | `site_id` | `sites` | Scoped database FK | nullify |
| `drawings` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `drawings` | `area_id` | `areas` | Scoped database FK | nullify |
| `executionLogs` | `work_order_id` | `workOrders` | Scoped database FK | cascade |
| `executionLogs` | `filed_by_staff_id` | `master.staff` | Scoped database FK | nullify |
| `executionLogs` | `site_id` | `sites` | Scoped database FK | nullify |
| `variationRequests` | `work_order_id` | `workOrders` | Scoped database FK | cascade |
| `variationRequests` | `customer_id` | `customers` | Scoped database FK | restrict |
| `variationRequests` | `site_id` | `sites` | Scoped database FK | nullify |
| `visits` | `customer_id` | `customers` | Scoped database FK | restrict |
| `visits` | `site_id` | `sites` | Scoped database FK | nullify |
| `visits` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `visits` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `visits` | `assigned_staff_id` | `master.staff` | Scoped database FK | restrict |
| `visits` | `contractor_id` | `master.contractors` | Scoped database FK | nullify |
| `visits` | `vendor_id` | `master.vendors` | Scoped database FK | nullify |
| `tasks` | `assigned_staff_id` | `master.staff` | Scoped database FK | restrict |
| `followups` | `assigned_staff_id` | `master.staff` | Scoped database FK | restrict |
| `tasks` | `customer_id` | `customers` | Scoped database FK | restrict |
| `tasks` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `tasks` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `tasks` | `site_id` | `sites` | Scoped database FK | nullify |
| `tasks` | `visit_id` | `visits` | Scoped database FK | nullify |
| `tasks` | `po_id` | `purchaseOrders` | Scoped database FK | nullify |
| `tasks` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `tasks` | `linked_record_id` | `polymorphic` | Typed business guard | ignore |
| `followups` | `customer_id` | `customers` | Scoped database FK | restrict |
| `followups` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `followups` | `payment_id` | `payments` | Scoped database FK | nullify |
| `followups` | `visit_id` | `visits` | Scoped database FK | nullify |
| `followups` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `actions` | `customer_id` | `customers` | Scoped database FK | restrict |
| `actions` | `linked_record_id` | `polymorphic` | Typed business guard | ignore |
| `payments` | `customer_id` | `customers` | Scoped database FK | restrict |
| `payments` | `site_id` | `sites` | Scoped database FK | nullify |
| `payments` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `payments` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `payments` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `payments` | `invoice_id` | `invoices` | Scoped database FK | nullify |
| `invoices` | `customer_id` | `customers` | Scoped database FK | restrict |
| `invoices` | `site_id` | `sites` | Scoped database FK | nullify |
| `invoices` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `invoices` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `invoices` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `invoices` | `payment_id` | `payments` | Scoped database FK | nullify |
| `customerReceipts` | `customer_id` | `customers` | Scoped database FK | restrict |
| `customerReceipts` | `invoice_id` | `invoices` | Scoped database FK | cascade |
| `customerReceipts` | `payment_id` | `payments` | Scoped database FK | nullify |
| `customerReceipts` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `customerReceipts` | `site_id` | `sites` | Scoped database FK | nullify |
| `customerReceipts` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `customerReceipts` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `customerReceipts` | `area_ids` | `areas` | Application array reference | nullify |
| `blocked` | `customer_id` | `customers` | Scoped database FK | restrict |
| `blocked` | `linked_work_order_id` | `workOrders` | Scoped database FK | nullify |
| `blocked` | `linked_po_id` | `purchaseOrders` | Scoped database FK | nullify |
| `blocked` | `linked_grn_id` | `grns` | Scoped database FK | nullify |
| `blocked` | `linked_task_id` | `tasks` | Scoped database FK | nullify |
| `risks` | `customer_id` | `customers` | Scoped database FK | restrict |
| `threads` | `record_id` | `polymorphic` | Typed business guard | ignore |
| `commSends` | `customer_id` | `customers` | Scoped database FK | restrict |
| `commSends` | `followup_id` | `followups` | Scoped database FK | nullify |
| `commSends` | `task_id` | `tasks` | Scoped database FK | nullify |
| `commSends` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `commSends` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `attendance` | `staff_id` | `master.staff` | Scoped database FK | restrict |
| `attendance` | `visit_id` | `visits` | Scoped database FK | nullify |
| `staffLocationPings` | `staff_id` | `master.staff` | Operational projection reference | restrict |
| `leaveRequests` | `staff_id` | `master.staff` | Scoped database FK | cascade |
| `payrollLines` | `payroll_period_id` | `payrollPeriods` | Scoped database FK | cascade |
| `payrollLines` | `staff_id` | `master.staff` | Scoped database FK | restrict |
| `salaryAdjustments` | `staff_id` | `master.staff` | Scoped database FK | restrict |
| `salaryAdjustments` | `payroll_period_id` | `payrollPeriods` | Scoped database FK | nullify |
| `staffDocuments` | `staff_id` | `master.staff` | Scoped database FK | cascade |
| `staffDocuments` | `file_asset_id` | `master.fileAssets` | Scoped database FK | nullify |
| `recurringTasks` | `assigned_staff_id` | `master.staff` | Scoped database FK | nullify |
| `entityFileAttachments` | `file_asset_id` | `master.fileAssets` | Scoped database FK | cascade |
| `entityFileAttachments` | `entity_id` | `polymorphic` | Typed business guard | ignore |
| `entityReferenceAssignments` | `resource_id` | `polymorphic` | Typed business guard | ignore |
| `entityReferenceAssignments` | `entity_id` | `polymorphic` | Typed business guard | ignore |
| `entityReferenceAssignments` | `customer_id` | `customers` | Scoped database FK | nullify |
| `master.workSubcategories` | `unit_id` | `master.units` | Scoped database FK | restrict |
| `master.workSubcategories` | `work_required_article_ids` | `master.subcategoryArticleMap` | Application array reference | nullify |
| `master.articles` | `category_id` | `master.workCategories` | Scoped database FK | restrict |
| `master.articles` | `unit_id` | `master.units` | Scoped database FK | restrict |
| `master.articles` | `default_unit_id` | `master.units` | Scoped database FK | restrict |
| `master.articles` | `variant_ids` | `master.articleVariants` | Application array reference | nullify |
| `master.articleVariants` | `unit_id` | `master.units` | Scoped database FK | restrict |
| `master.subcategoryArticleMap` | `unit_id` | `master.units` | Scoped database FK | restrict |
| `master.vendorRates` | `variant_id` | `master.articleVariants` | Scoped database FK | restrict |
| `master.vendorRateHistories` | `variant_id` | `master.articleVariants` | Scoped database FK | restrict |
| `master.vendorRateHistories` | `unit_id` | `master.units` | Scoped database FK | restrict |
| `master.contractorRates` | `unit_id` | `master.units` | Scoped database FK | restrict |
| `master.catalogueArticleVendorLinks` | `variant_id` | `master.articleVariants` | Scoped database FK | nullify |
| `master.pinterestBoards` | `variant_id` | `master.articleVariants` | Scoped database FK | nullify |
| `master.referenceMedia` | `variant_id` | `master.articleVariants` | Scoped database FK | nullify |
| `master.referenceMedia` | `drive_asset_id` | `master.fileAssets` | Scoped database FK | nullify |
| `master.staff` | `reporting_manager_id` | `master.staff` | Scoped database FK | nullify |
| `approvalPolicies` | `approver_id` | `master.staff` | Scoped database FK | restrict |
| `entityReferenceAssignments` | `work_required_id` | `workRequired` | Scoped database FK | nullify |
| `entityReferenceAssignments` | `quotation_id` | `quotations` | Scoped database FK | nullify |
| `entityReferenceAssignments` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `entityReferenceAssignments` | `site_id` | `sites` | Scoped database FK | nullify |
| `entityReferenceAssignments` | `area_id` | `areas` | Scoped database FK | nullify |
| `entityReferenceAssignments` | `article_id` | `master.articles` | Scoped database FK | nullify |
| `entityReferenceAssignments` | `variant_id` | `master.articleVariants` | Scoped database FK | nullify |
| `entityReferenceAssignments` | `vendor_id` | `master.vendors` | Scoped database FK | nullify |
| `master.workSubcategories` | `category_id` | `master.workCategories` | Scoped database FK | restrict |
| `master.workSubcategories` | `category_ids` | `master.workCategories` | Application array reference | restrict |
| `master.vendorRates` | `vendor_id` | `master.vendors` | Scoped database FK | cascade |
| `master.vendorRates` | `work_required_article_id` | `master.subcategoryArticleMap` | Scoped database FK | cascade |
| `master.vendorRates` | `article_id` | `master.articles` | Scoped database FK | restrict |
| `master.vendorRateHistories` | `vendor_rate_id` | `master.vendorRates` | Scoped database FK | cascade |
| `master.vendorRateHistories` | `vendor_id` | `master.vendors` | Scoped database FK | cascade |
| `master.vendorRateHistories` | `article_id` | `master.articles` | Scoped database FK | restrict |
| `master.vendorRateHistories` | `work_required_article_id` | `master.subcategoryArticleMap` | Scoped database FK | cascade |
| `master.contractorRates` | `contractor_id` | `master.contractors` | Scoped database FK | cascade |
| `master.articleVariants` | `article_id` | `master.articles` | Scoped database FK | cascade |
| `master.articleVariants` | `work_required_article_id` | `master.subcategoryArticleMap` | Scoped database FK | nullify |
| `master.subcategoryArticleMap` | `article_id` | `master.articles` | Scoped database FK | cascade |
| `master.subcategoryArticleMap` | `work_required_id` | `master.workSubcategories` | Scoped database FK | cascade |
| `master.storageFolderInstances` | `storage_account_id` | `master.storageAccounts` | Scoped database FK | restrict |
| `master.storageFolderInstances` | `template_id` | `master.storageFolderTemplates` | Scoped database FK | restrict |
| `master.fileAssets` | `storage_account_id` | `master.storageAccounts` | Scoped database FK | nullify |
| `master.fileAssets` | `storage_folder_instance_id` | `master.storageFolderInstances` | Scoped database FK | nullify |
| `master.catalogueArticleVendorLinks` | `catalogue_id` | `master.catalogues` | Scoped database FK | cascade |
| `master.catalogueArticleVendorLinks` | `article_id` | `master.articles` | Scoped database FK | cascade |
| `master.catalogueArticleVendorLinks` | `vendor_id` | `master.vendors` | Scoped database FK | cascade |
| `master.commissionRules` | `source_partner_id` | `master.sourcePartners` | Scoped database FK | restrict |
| `master.commissionRules` | `category_id` | `master.workCategories` | Scoped database FK | nullify |
| `master.pinterestBoards` | `category_id` | `master.workCategories` | Scoped database FK | nullify |
| `master.pinterestBoards` | `subcategory_id` | `master.workSubcategories` | Scoped database FK | nullify |
| `master.pinterestBoards` | `article_id` | `master.articles` | Scoped database FK | nullify |
| `master.referenceMedia` | `category_id` | `master.workCategories` | Scoped database FK | nullify |
| `master.referenceMedia` | `subcategory_id` | `master.workSubcategories` | Scoped database FK | nullify |
| `master.referenceMedia` | `article_id` | `master.articles` | Scoped database FK | nullify |
| `master.catalogues` | `drive_asset_id` | `master.fileAssets` | Scoped database FK | nullify |
| `visits` | `recovery_followup_id` | `followups` | Scoped database FK | nullify |
| `visits` | `report_task_id` | `tasks` | Scoped database FK | nullify |
| `visits` | `checkout_thread_message_id` | `threadMessages` | Embedded document reference | nullify |
| `visits` | `report_thread_message_id` | `threadMessages` | Embedded document reference | nullify |
| `tasks` | `blocked_item_id` | `blocked` | Scoped database FK | nullify |
| `tasks` | `source_followup_id` | `followups` | Scoped database FK | restrict |
| `followups` | `next_followup_id` | `followups` | Scoped database FK | nullify |
| `payments` | `milestone_term_id` | `paymentTermTemplates` | Scoped database FK | nullify |
| `workOrders` | `replacement_for_work_order_id` | `workOrders` | Scoped database FK | nullify |
| `workOrders` | `abandoned_contractor_id` | `master.contractors` | Scoped database FK | nullify |
| `drawings` | `parent_drawing_id` | `drawings` | Scoped database FK | nullify |
| `drawings` | `derived_boq_item_ids` | `boqItems` | Application array reference | nullify |
| `grns` | `obstacle_id` | `blocked` | Scoped database FK | nullify |
| `grns` | `bill_id` | `vendorBills` | Scoped database FK | nullify |
| `vendorBills` | `three_way_match.obstacle_id` | `blocked` | Scoped database FK | nullify |
| `variationRequests` | `execution_log_id` | `executionLogs` | Scoped database FK | nullify |
| `workOrderCostLines` | `source_id` | `polymorphic` | Typed business guard | ignore |
| `threadMessages` | `parent_message_id` | `threadMessages` | Embedded document reference | nullify |
| `threadMessages` | `related_thread_id` | `threads` | Embedded document reference | nullify |
| `threadMessages` | `related_audit_id` | `auditLog` | Embedded document reference | nullify |
| `threadMessageAttachments` | `entity_file_attachment_id` | `entityFileAttachments` | Embedded document reference | nullify |
| `commSends` | `attachment_ids` | `entityFileAttachments` | Application array reference | nullify |
| `sites` | `source_partner_id` | `master.sourcePartners` | Scoped database FK | nullify |
| `quotations` | `parent_quotation_id` | `quotations` | Scoped database FK | nullify |
| `quotations` | `superseded_by_quotation_id` | `quotations` | Scoped database FK | nullify |
| `acceptedScopes` | `contractor_bid_id` | `contractorBids` | Scoped database FK | nullify |
| `contractorSettlements` | `replacement_work_order_id` | `workOrders` | Scoped database FK | nullify |
| `leaveRequests` | `approved_by_staff_id` | `master.staff` | Scoped database FK | nullify |
| `attendance` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `salaryAdjustments` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `recurringTasks` | `customer_id` | `customers` | Scoped database FK | nullify |
| `recurringTasks` | `site_id` | `sites` | Scoped database FK | nullify |
| `recurringTasks` | `work_order_id` | `workOrders` | Scoped database FK | nullify |
| `blocked` | `linked_quotation_id` | `quotations` | Scoped database FK | nullify |
| `variationRequests` | `affected_boq_item_ids` | `boqItems` | Application array reference | nullify |
| `auditLog` | `customer_id` | `customers` | Scoped database FK | nullify |
| `master.fileAssets` | `customer_id` | `customers` | Scoped database FK | nullify |
| `master.fileAssets` | `site_id` | `sites` | Scoped database FK | nullify |
| `master.storageFolderInstances` | `customer_id` | `customers` | Scoped database FK | nullify |
| `master.storageFolderInstances` | `site_id` | `sites` | Scoped database FK | nullify |
| `master.storageFolderInstances` | `work_order_id` | `workOrders` | Scoped database FK | nullify |

## Table and collection coverage

The inventory includes collections without outbound FKs; their inbound relationships, discriminator checks and shared read/write isolation still apply.

| Logical collection | Current table → PR table | Live rows | Outbound registry rules |
| --- | --- | ---: | ---: |
| `acceptedScopes` | `entity_acceptedScopes` | 22 | 8 |
| `actions` | `entity_workflow_controls` | 0 | 2 |
| `approvalPolicies` | `entity_policy_rules` | 0 | 1 |
| `areas` | `entity_areas` | 51 | 1 |
| `attendance` | `entity_attendance` → `entity_staff_records` | 133 | 3 |
| `auditLog` | `entity_auditLog` | 745 | 1 |
| `automationRules` | `entity_policy_rules` | 0 | 0 |
| `blocked` | `entity_workflow_controls` | 0 | 6 |
| `boqs` | `entity_commercial_documents` | 0 | 1 |
| `commSends` | `entity_commSends` | 2 | 6 |
| `commercialTerms` | `entity_commercial_settings` | 0 | 0 |
| `commissions` | `entity_commissions` | 0 | 4 |
| `contractorBids` | `entity_commercial_documents` | 0 | 3 |
| `contractorBills` | `entity_financial_documents` | 0 | 6 |
| `contractorPayments` | `entity_money_movements` | 0 | 4 |
| `contractorSettlements` | `entity_commercial_documents` | 0 | 3 |
| `customerReceipts` | `entity_money_movements` | 0 | 8 |
| `customers` | `entity_customers` | 32 | 0 |
| `dispatches` | `entity_dispatches` → `entity_commercial_documents` | 0 | 2 |
| `drawings` | `entity_drawings` → `entity_site_records` | 0 | 5 |
| `entityFileAttachments` | `entity_entityFileAttachments` → `entity_resource_links` | 98 | 2 |
| `entityReferenceAssignments` | `entity_entityReferenceAssignments` → `entity_resource_links` | 0 | 11 |
| `executionLogs` | `entity_executionLogs` → `entity_site_records` | 0 | 3 |
| `followups` | `entity_followups` → `entity_workflow_controls` | 9 | 7 |
| `grns` | `entity_grns` → `entity_commercial_documents` | 0 | 6 |
| `inventory` | `entity_inventory` | 0 | 4 |
| `invoices` | `entity_financial_documents` | 1 | 6 |
| `leaveRequests` | `entity_leaveRequests` → `entity_staff_records` | 0 | 2 |
| `master.articleVariants` | `entity_master_articleVariants` → `entity_catalogue_items` | 0 | 3 |
| `master.articles` | `entity_master_articles` → `entity_catalogue_items` | 246 | 4 |
| `master.catalogueArticleVendorLinks` | `entity_master_catalogueArticleVendorLinks` | 1 | 4 |
| `master.catalogues` | `entity_reference_libraries` | 1 | 1 |
| `master.commissionRules` | `entity_policy_rules` | 0 | 2 |
| `master.contractorRates` | `entity_rate_cards` | 17 | 2 |
| `master.contractors` | `entity_master_contractors` | 15 | 0 |
| `master.customerRateSuggestions` | `entity_rate_cards` | 0 | 0 |
| `master.fileAssets` | `entity_master_fileAssets` | 100 | 4 |
| `master.pinterestBoards` | `entity_reference_libraries` | 0 | 4 |
| `master.referenceMedia` | `entity_reference_libraries` | 0 | 5 |
| `master.sourcePartners` | `entity_master_sourcePartners` | 0 | 0 |
| `master.staff` | `entity_master_staff` | 6 | 1 |
| `master.storageAccounts` | `entity_master_storageAccounts` | 2 | 0 |
| `master.storageFolderInstances` | `entity_master_storageFolderInstances` → `entity_storage_structure` | 13 | 5 |
| `master.storageFolderTemplates` | `entity_master_storageFolderTemplates` → `entity_storage_structure` | 20 | 0 |
| `master.subcategoryArticleMap` | `entity_master_subcategoryArticleMap` | 300 | 3 |
| `master.units` | `entity_master_units` | 17 | 0 |
| `master.vendorRateHistories` | `entity_master_vendorRateHistories` → `entity_rate_cards` | 1 | 6 |
| `master.vendorRates` | `entity_rate_cards` | 1 | 4 |
| `master.vendors` | `entity_master_vendors` | 7 | 0 |
| `master.workCategories` | `entity_master_workCategories` → `entity_work_definitions` | 13 | 0 |
| `master.workOptionGroups` | `entity_master_workOptionGroups` → `entity_work_definitions` | 0 | 0 |
| `master.workOptionValues` | `entity_master_workOptionValues` → `entity_work_definitions` | 0 | 0 |
| `master.workSubcategories` | `entity_master_workSubcategories` → `entity_work_definitions` | 70 | 4 |
| `measurementRevisions` | `entity_measurementRevisions` → `entity_site_records` | 3 | 4 |
| `paymentTermTemplates` | `entity_commercial_settings` | 0 | 0 |
| `payments` | `entity_payments` | 1 | 7 |
| `payrollLines` | `entity_payrollLines` → `entity_staff_records` | 4 | 2 |
| `payrollPeriods` | `entity_payrollPeriods` → `entity_financial_documents` | 1 | 0 |
| `purchaseOrders` | `entity_commercial_documents` | 1 | 4 |
| `quotations` | `entity_commercial_documents` | 8 | 4 |
| `recurringTasks` | `entity_recurringTasks` → `entity_policy_rules` | 0 | 4 |
| `risks` | `entity_workflow_controls` | 0 | 1 |
| `salaryAdjustments` | `entity_salaryAdjustments` → `entity_staff_records` | 0 | 3 |
| `sites` | `entity_sites` | 27 | 2 |
| `staffDocuments` | `entity_staffDocuments` → `entity_staff_records` | 1 | 2 |
| `staffRolePermissions` | `entity_staffRolePermissions` | 175 | 0 |
| `stockMovements` | `entity_stockMovements` | 0 | 5 |
| `tasks` | `entity_tasks` → `entity_workflow_controls` | 9 | 11 |
| `taxConfigs` | `entity_commercial_settings` | 0 | 0 |
| `threads` | `entity_threads` | 231 | 1 |
| `validityConfigs` | `entity_commercial_settings` | 0 | 0 |
| `variationRequests` | `entity_variationRequests` → `entity_site_records` | 0 | 5 |
| `vendorBids` | `entity_commercial_documents` | 0 | 2 |
| `vendorBills` | `entity_financial_documents` | 0 | 6 |
| `vendorPayments` | `entity_money_movements` | 0 | 4 |
| `vendorRfqs` | `entity_commercial_documents` | 0 | 3 |
| `visits` | `entity_visits` → `entity_workflow_controls` | 2 | 11 |
| `workOrderCostLines` | `entity_workOrderCostLines` | 0 | 2 |
| `workOrders` | `entity_workOrders` | 0 | 9 |
| `workRequired` | `entity_workRequired` | 44 | 3 |
