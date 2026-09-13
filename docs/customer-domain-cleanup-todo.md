# Customer domain cleanup plan

Goal: remove old/new Customer domain conflicts so Customer, Site, Area and Work Required data have one authoritative set of rules from UI to PostgreSQL.

## P0 — security boundary

- [ ] Revoke `PUBLIC`, `anon`, and `authenticated` execution from internal `SECURITY DEFINER` workspace RPCs; keep only trusted server/service execution.
- [ ] Lock down internal helper RPCs used by the workspace commit path.
- [ ] Give `uc_normalize_phone` an immutable fixed search path.
- [ ] Re-run Supabase security advisors and verify the workspace commit RPC is no longer callable by `anon`/`authenticated`.

## P1 — canonical Customer graph rules

- [ ] Make Customer create/edit, Site create/edit, Area create/edit and Work Required create/edit use one shared domain rule set.
- [ ] Remove validation differences between `saveCustomerWithSites`, `addArea`, `updateArea`, `addWorkRequired`, `updateWorkRequired`, Quick Add and Site/Measurement flows.
- [ ] Make Work Required category/subcategory/work-type invariants authoritative on the server, not only in dialogs.
- [ ] Replace the quotation legacy-validator correction shim with one canonical quotation relationship rule.
- [ ] Remove stale comments/tests that describe deleted Customer CRUD paths as active architecture.

## P1 — database integrity

- [ ] Reconcile live schema with repository migrations.
- [ ] Add generated relationship columns/indexes/FKs for the Customer graph where live data is clean.
- [ ] Add DB checks for canonical Customer shape/status and non-empty phone format when supplied.
- [ ] Align entity row revision defaults with the actual 0-based commit implementation.
- [ ] Add one transactional Customer contact-identity backstop covering primary phone, WhatsApp, alternate phone and email.
- [ ] Verify no current orphan/customer-contact conflicts before and after constraints.

## P2 — Customer model cleanup

- [ ] Replace overloaded `source_partner_*` referral storage with typed `referrer_type`, `referrer_id`, `referrer_name` fields.
- [ ] Migrate legacy name-only referrals without inventing identities; unmatched names become explicit external/legacy referrals.
- [ ] Remove `interest_category_ids` and `interest_work_subcategory_ids` from live Customer JSON and canonical code paths.
- [ ] Decide the canonical phone rule without fabricating data: blank is allowed for existing/new Customers, but any supplied phone must be valid and unique across all phone slots.
- [ ] Remove active `referralLegacyName` compatibility state after the data migration.

## P2 — read path cleanup

- [ ] Give `customerDesk` an explicit bounded read plan instead of falling back to the broad Customer scope.
- [ ] Keep entity detail routes on the row-graph planner and maintenance-only operations on full-workspace reads.
- [ ] Remove stale/contradictory thread terminology: `customer-conversation:<customer_id>` is canonical, not legacy.

## Verification

- [ ] Add/adjust regression tests for shared Customer graph validation.
- [ ] Add DB integrity verification queries for Customer/Site/Area/Work Required/referrer/contact identity constraints.
- [ ] Run Customer-focused tests plus the workspace scoped-read tests.
- [ ] Re-run Supabase security and performance advisors.
- [ ] Re-evaluate repository search results for old Customer CRUD, legacy referral state, duplicate Work Required/Area validation and legacy quotation shim.
