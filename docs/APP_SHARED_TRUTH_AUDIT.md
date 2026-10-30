# App-wide shared-data audit — 30 October 2026

Baseline: `42f4d1ac04b9a986e78c6e3406e82575534ccdd8` (released PR241).

## Scope and limits

Initial source sweep covers all 66 TSX files under `src/components/rdash/modules`:
55 contain direct database reads, 29 contain local reductions, and 8 contain CSV/print
export code. These are search indicators, not proof of defects. Router, store
selectors, metrics, finance mutation helpers, typed storage mapping, module read
plans, report filters and session refresh were inspected alongside those results.
Deep review so far concentrates on financial/report flows. No module is certified
clean solely because the sweep found no pattern. This is not a production-data
reconciliation, penetration test, or complete manual UI audit.

No application code, schema, business rows, permissions or deployment were changed
by this audit. Findings below concern source paths capable of disagreement;
actual live discrepancies have not been measured.

## Resolution of confirmed findings

A01–A06 are addressed in the audit-consistency change. `report-data.ts` shares
invoice ageing (positive open balances, Indian business dates), receipt exports
and canonical P&L export rows across CSV/print and screen source calculations.
Data Export uses live vendor/contractor projections including current active job
counts. `commissionSummary` drives both commission and referral totals, excluding
cancelled history. `report-scope.ts` filters Work Required by customer and the
selected job's work_required_ids, intersecting conflicting filters and failing
closed for unknown jobs. No historical row or schema is rewritten.

The source evidence below describes the original baseline, not current behavior.
R01–R06 remain review items rather than confirmed defects resolved by this change.

Follow-through after PR243: legacy partner summaries now use canonical
projections (R01). The financial follow-through centralizes invoice status and
Indian date rules, customer/job supplier scoping and complete analytical reads
(R02–R05); see [FINANCIAL_TRUTH_FOLLOW_THROUGH.md](FINANCIAL_TRUTH_FOLLOW_THROUGH.md).
R06 now has authenticated multi-context browser regressions and permission-change
revalidation, while a manual two-user production exercise remains unperformed.
The original evidence and review questions below are retained for traceability.

## Confirmed source inconsistencies

| ID | Priority | Evidence | Consequence | Correction target |
| --- | --- | --- | --- | --- |
| A01 | High | ReportsModule: `agingReportRep` CSV/print select pending/overdue **payment schedules** and export full `amount`; AgingReport screen selects issued/overdue/partial **invoices** and `balance_amount`. | Same report exports different entities, omits partial invoices and can overstate remaining debt. | One invoice ageing projection for detail, totals and every export; reuse it with FinanceOverview. |
| A02 | High | ReportsModule: `collectionReport` CSV/print export `payments`; CollectionReport derives collected cash/modes from `customerReceipts`. | Collection exports cannot reconcile directly to the displayed recorded collections. | Export receipt detail for cash, with separately labelled schedule/outstanding detail. |
| A03 | High | DataExportModule vendor/contractor CSV reads master `outstanding`; partner screens use vendorBalance / contractorOutstanding. Contractor CSV also reads stored `active_jobs`. | General exports can contradict operational balances and current work-order counts. | Shared partner projections; verify required complete source collections before replacement. |
| A04 | High | ReportsModule `applyReportFilter` never filters `workRequired`; LeadSourceReport and both lead-source exports aggregate it. | Applying a customer/job filter can retain other customers' leads and budgets. | Central report scope projection including Work Required, accepted scopes and dependent collections; test combined filters. |
| A05 | Medium | SourceReferralModule sums every commission then subtracts paid; CommissionsModule outstanding includes only accrued/payable. | A cancelled commission still increases referral outstanding. | Shared commission status projection for both views; preserve history. |
| A06 | Medium | `jobPnlReport` exports work-order `value` and `progress`; screen uses allJobPnLs for revenue, collections, costs and margin. | P&L export does not contain the P&L figures shown on screen. | Shared P&L rows for screen and exports; keep operational work-order exports separately named. |

Reproduction examples: an invoice of 100 with 40 received has 60 remaining; an
unrelated pending schedule of 100 is a different record and cannot stand in for it
(A01). A cancelled commission of 50 with no paid commission contributes 50 in
SourceReferralModule but zero to CommissionsModule outstanding (A05). A stale
Vendor master outstanding of 999 with an approved bill balance of 70 exports 999
in DataExport while the partner/report projection returns 70 (A03).

## Review items requiring further tracing or business-rule decisions

| ID | Area | Evidence / unresolved point |
| --- | --- | --- |
| R01 | Legacy master views | MastersSalesOpsModule vendor/contractor branches still show stored outstanding. Canonical partner routes use shared projections. Trace all supported aliases before calling legacy branches reachable user defects. |
| R02 | Draft invoices | taxReportProjection, customerBalance, cash-flow and P&L helpers generally exclude cancelled invoices but can include drafts. Ageing report selects issued/overdue/partial; FinanceOverview ageing excludes only cancelled/zero balance. Agree issued-versus-draft policy, then centralize it. |
| R03 | Business date | Receivable ageing uses host/browser local dates in FinanceOverview and elapsed milliseconds in ReportsModule. App uses Indian business dates elsewhere. Test due-today and midnight boundaries before standardizing. |
| R04 | Report scope | `applyReportFilter` builds workOrderIds for a customer but never uses the set; vendor records intentionally remain unfiltered by customer. Define what a customer-filtered GST/vendor report should include before changing those totals. |
| R05 | Completeness | Module read plans distinguish paged lists and complete analytics. Any newly shared selector must declare every source collection and use complete rows for exact totals; unloaded arrays must not silently mean zero. Family analytics have explicit complete plans; all consumers still need a dependency-by-dependency check. |
| R06 | Refresh and edits | PR241 enables bounded idle delta refresh; dirty forms/outbox defer it. Verify with two signed-in browser sessions, concurrent edits, permission changes and long-lived dirty forms. The existing tests are not a substitute for this production-session exercise. |

## Shared boundaries retained

Customers, Sites, Articles, Units and work taxonomy use canonical identities.
Shared physical tables retain typed logical collections and workspace boundaries.
Vendor payable and contractor payable have canonical selectors; work-order/site
P&L share finance helpers. Actual cash is a read-only projection of recorded
receipts/paid movements. Issued document prices, taxes and measurement revisions
are historical snapshots and must not be rewritten by live-master changes.
Arrays, embedded links and provenance still need application validation alongside
native scalar FKs. Fewer physical tables do not enforce common business formulas.

## Verification

The unchanged application baseline passed all 980 tests across 137 files during
this audit (`vitest run --maxWorkers=2`). Source references and inventory counts
were checked against the baseline above. Passing existing tests does not resolve
the newly identified discrepancies; each fix needs a reproducing regression.

## Follow-through order

1. Align ageing, collections and P&L exports with their screen projections (A01/A02/A06).
2. Replace stale partner summary consumers and unify commission status rules (A03/A05).
3. Extract and test report scoping, including customer/job combinations (A04/R04).
4. Audit metric dependency completeness, draft inclusion and business dates (R02/R03/R05).
5. Exercise cross-session edits and each role against the shared data paths (R06).
6. Continue deep review through procurement/inventory, quotation/measurement locks,
   work execution, HR/payroll, files/provider workflows and auth/access boundaries.

## Complete module source-sweep inventory

`Sources` lists literal db/master reads detected in the file, not transitive
selector dependencies. A dash commonly indicates a wrapper or delegated read.
`Reductions` and `Export` are triage markers; they do not mean a module is wrong.
Every entry still needs workflow-level verification for a complete audit.

| Module source | Sources | Reductions | Export |
| --- | --- | ---: | --- |
| ApprovalPoliciesModule.tsx | actions, approvalPolicies, master.staff | 0 | — |
| ArticleVariantsModule.tsx | master.articleVariants | 0 | — |
| AttendancePayrollModule.tsx | attendance, master.staff, payrollLines, payrollPeriods, salaryAdjustments, visits | 4 | — |
| AuditLogModule.tsx | auditLog | 0 | yes |
| BOQModule.tsx | acceptedScopes, boqs, vendorRfqs, workOrders | 1 | — |
| BusinessApprovalsWorkspace.tsx | actions, quotations | 0 | — |
| CalendarModule.tsx | payments, purchaseOrders, tasks, visits | 1 | — |
| CommissionsModule.tsx | commissions, master.sourcePartners | 2 | — |
| CommissionsWorkspaceModule.tsx | commissions, master.sourcePartners | 0 | — |
| CommunicationCentreModule.tsx | commSends, customers, entityFileAttachments, followups, master.fileAssets, tasks | 0 | — |
| ContractorPaymentsModule.tsx | actions, contractorBills, contractorPayments, contractorSettlements, sites, workOrders | 6 | — |
| ContractorWorkDialogs.tsx | — | 0 | — |
| ContractorWorkspaceModule.tsx | — | 0 | — |
| ControlBrainModule.tsx | auditLog, automationRules | 1 | — |
| CustomerDesk.tsx | customers, quotations, sites, workOrders, workRequired | 0 | — |
| CustomerDeskPortfolio.tsx | acceptedScopes, actions, areas, customerReceipts, customers, entityFileAttachments, entityReferenceAssignments, invoices, master.staff, master.workSubcategories, payments, purchaseOrders, quotations, sites, tasks, vendorBills, visits, workOrderCostLines, workOrders, workRequired | 9 | — |
| CustomerWorkRequiredWorkspace.tsx | — | 0 | — |
| DailyWork.tsx | actions, attendance, blocked, customerReceipts, customers, dispatches, executionLogs, followups, inventory, invoices, master.staff, payments, quotations, risks, sites, tasks, vendorBills, visits, workOrders | 6 | — |
| DataExportModule.tsx | customers, followups, grns, master.contractors, master.staff, master.vendors, payments, purchaseOrders, quotations, sites, tasks, visits, workOrders, workRequired | 1 | yes |
| DataImportModule.tsx | customers, sites | 0 | yes |
| DispatchModule.tsx | dispatches, inventory, workOrders | 9 | — |
| DrawingsExecutionModules.tsx | areas, drawings, executionLogs, sites, variationRequests, workOrders | 0 | — |
| DriveSecurityDiagnosticsPanel.tsx | — | 0 | — |
| FieldModeModule.tsx | customers, master.staff, sites, visits | 0 | — |
| FinanceOverviewModule.tsx | customerReceipts, customers, invoices, sites, vendorBills | 5 | — |
| GRNModule.tsx | grns, purchaseOrders | 0 | — |
| GenericModule.tsx | customers, quotations, tasks, workOrders | 0 | — |
| GoogleDriveManagerCoreModule.tsx | entityFileAttachments, master.fileAssets, master.storageAccounts | 0 | — |
| GoogleDriveManagerModule.tsx | — | 0 | — |
| GpsTrackingModule.tsx | customers, master.staff, master.vendors, sites, visits | 0 | — |
| IntegrityModule.tsx | master | 0 | yes |
| InventoryModule.tsx | inventory, stockMovements | 0 | — |
| JobPnLModule.tsx | contractorBills, purchaseOrders, workOrderCostLines, workOrders | 7 | — |
| MastersSalesOpsModule.tsx | blocked, customers, invoices, master.articleVariants, master.articles, master.commissionRules, master.contractorRates, master.contractors, master.sourcePartners, master.staff, master.vendorRates, master.vendors, master.workCategories, master.workSubcategories, quotations, sites, tasks, threads, visits, workOrders | 12 | — |
| MediaLibraryModule.tsx | entityFileAttachments, entityReferenceAssignments, master, master.fileAssets | 0 | — |
| MiscModules.tsx | customers, quotations, recurringTasks, workOrders, workRequired | 2 | — |
| PartnerDetailContent.tsx | acceptedScopes, contractorBids, customers, master.contractors, master.sourcePartners, master.units, master.vendors, sites | 0 | — |
| PartnerGovernanceModule.tsx | master.articleVariants, master.articles, master.contractors, master.vendors, tasks | 0 | — |
| PartnerWorkspaceModule.tsx | master.contractors, master.vendors | 2 | — |
| PaymentRecoveryModule.tsx | customerReceipts, followups, payments | 2 | — |
| ProcurementModule.tsx | boqs, master, master.articleVariants, master.articles, master.subcategoryArticleMap, master.units, master.vendorRates, master.vendors, master.workCategories, master.workSubcategories, purchaseOrders, vendorBids, vendorRfqs, workOrders | 4 | — |
| ProfitabilityWorkspaceModule.tsx | — | 0 | — |
| QuotationConfigModule.tsx | commercialTerms, paymentTermTemplates, taxConfigs, validityConfigs | 2 | — |
| QuotationWorkspaceModule.tsx | quotations | 1 | — |
| QuotationsModule.tsx | quotations | 0 | — |
| RateFinderModule.tsx | master.articles, master.subcategoryArticleMap, master.units, master.vendors, master.workCategories, master.workSubcategories, quotations | 2 | — |
| RemainingModules.tsx | actions, customers, master.staff, quotations, risks, visits, workOrders, workRequired | 5 | yes |
| ReportFamilyModule.tsx | — | 0 | — |
| ReportsModule.tsx | customerReceipts, customers, followups, grns, invoices, master, master.staff, master.vendors, payments, purchaseOrders, quotations, sites, tasks, vendorBills, vendorPayments, vendorRfqs, visits, workOrders, workRequired | 27 | yes |
| SalesExtraModules.tsx | actions, approvalPolicies, commissions, customers, invoices, master.sourcePartners, quotations, vendorBills | 8 | — |
| SalesPipelineModule.tsx | customers, quotations, workOrders, workRequired | 1 | — |
| SiteExecutionModule.tsx | acceptedScopes, areas, boqs, contractorBids, contractorBills, customerReceipts, customers, grns, invoices, master.contractors, master.vendors, master.workSubcategories, measurementRevisions, purchaseOrders, quotations, sites, vendorBids, vendorRfqs, visits, workOrders, workRequired | 3 | — |
| SiteMeasurementModule.tsx | areas, customers, measurementRevisions, sites, visits | 2 | — |
| SiteProfitabilityModule.tsx | acceptedScopes, contractorBills, contractorPayments, customers, purchaseOrders, quotations, sites, vendorBills, vendorPayments, workOrders | 19 | — |
| StaffSalaryModule.tsx | master.staff, salaryAdjustments | 0 | — |
| TasksFollowups.tsx | commSends, customers, followups, master.staff, quotations, sites, tasks, workRequired | 0 | — |
| UnifiedThreadInboxModule.tsx | areas, attendance, boqs, customers, master, threads, variationRequests | 0 | — |
| UserApprovalsModule.tsx | — | 0 | — |
| VendorBillsModule.tsx | grns, master, master.vendors, purchaseOrders, sites, vendorBills, workOrders | 2 | — |
| VendorPerformanceModule.tsx | — | 0 | — |
| VendorPriceMasterModule.tsx | master | 0 | yes |
| VendorWorkspaceModule.tsx | — | 0 | — |
| VisitProofsModule.tsx | customers, visits | 0 | — |
| WorkCategoryMasterModule.tsx | master | 4 | yes |
| WorkOrderTimelineModule.tsx | acceptedScopes, auditLog, boqs, commSends, commissions, contractorBills, customerReceipts, dispatches, drawings, executionLogs, followups, grns, invoices, purchaseOrders, quotations, tasks, threads, variationRequests, vendorBills, vendorRfqs, visits, workOrders | 0 | — |
| WorkspaceViewTabs.tsx | — | 0 | — |
