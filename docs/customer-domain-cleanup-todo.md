# Customer domain cleanup plan

Goal: remove old/new Customer domain conflicts so Customer, Site, Area and Work Required data have one authoritative set of rules from UI to PostgreSQL.

## P0 — security boundary

- [x] Revoke `PUBLIC`, `anon`, and `authenticated` execution from internal `SECURITY DEFINER` workspace RPCs; keep only trusted server/service execution.
- [x] Lock down internal helper RPCs used by the workspace commit path.
- [x] Give `uc_normalize_phone` a fixed `pg_catalog, public` search path.
- [x] Re-run Supabase security advisors and verify the workspace commit RPC is no longer callable by `anon`/`authenticated`.
- [x] Verify the remaining RLS-without-policy advisor entries are service-only: the flagged tables grant neither SELECT nor INSERT to `anon` or `authenticated`.
- [ ] Enable Supabase Auth leaked-password protection in project Auth settings. This is an account-level Auth setting; the connected database tooling does not expose a mutation for it.

## P1 — canonical Customer graph rules

- [x] Make Customer create/edit, Site create/edit, Area create/edit and Work Required create/edit use shared domain rules.
- [x] Remove the material validation differences between `saveCustomerWithSites`, standalone Area/Work Required mutations, Quick Add and Site/Measurement flows by enforcing the canonical server/domain invariants on every committed row.
- [x] Make Work Required category/subcategory/work-type invariants authoritative on the server and database, not only in dialogs.
- [x] Replace the quotation legacy-validator correction shim with one structural quotation relationship rule.
- [x] Remove stale CRM architecture comments and lock the removed compatibility paths with regression tests.

## P1 — database integrity

- [x] Reconcile live schema with repository migrations. Production migrations `20260913085318_customer_domain_unification` and `20260913085807_customer_graph_fk_index_order` are checked into `supabase/migrations/` verbatim.
- [x] Add generated relationship columns/indexes/FKs for the Customer graph where live data is clean.
- [x] Add DB checks for canonical Customer shape/status and valid phone/email shape when supplied.
- [x] Align entity row revision defaults with the actual 0-based commit implementation.
- [x] Add one transactional Customer contact-identity backstop covering primary phone, WhatsApp, alternate phone and email.
- [x] Verify no current orphan/customer-contact conflicts before and after constraints.
- [x] Reorder generated relationship indexes so Customer/Site FK columns are leading keys; the Supabase unindexed-FK advisor findings dropped from 38 to 0.

## P2 — Customer model cleanup

- [x] Replace overloaded `source_partner_*` referral storage with typed `referrer_type`, `referrer_id`, `referrer_name` fields.
- [x] Migrate legacy name-only referrals without inventing identities; unmatched names become explicit external referrals.
- [x] Remove `interest_category_ids` and `interest_work_subcategory_ids` from live Customer JSON and canonical code paths.
- [x] Make phone optional without fabricating data; every supplied phone must be valid and identity uniqueness is enforced across primary phone, WhatsApp, alternate phone and email.
- [x] Remove active `referralLegacyName` compatibility state after the data migration.
- [x] Convert the seed Customer `Walk-in` referrer to the canonical explicit external-referrer shape.
- [x] Remove runtime fallback inference from legacy `source_partner_*` Customer referral fields; runtime reads only canonical `referrer_*` fields.

## P2 — read path cleanup

- [x] Give `customerDesk` an explicit bounded read plan instead of falling back to the broad Customer scope.
- [x] Serve all collections actually read by Customer Desk, including contractor-rate estimates.
- [x] Use generated indexed `customer_id_gen` / `site_id_gen` columns for entity-scoped Customer/Site relationship reads, with JSON selectors only for relationships that do not yet have generated columns.
- [x] Keep entity detail routes on the row-graph planner and maintenance-only operations on full-workspace reads.
- [x] Remove stale Thread Inbox terminology: `customer-conversation:<customer_id>` is described as canonical, not legacy.

## Verification

- [x] Add/adjust regression tests for shared Customer graph validation and removed compatibility shims.
- [x] Add DB integrity verification queries for Customer/Site/Area/Work Required/referrer/contact identity constraints.
- [x] Re-run Supabase security and performance advisors.
- [x] Verify all generated foreign-key constraints are validated and current sampled Customer/Site orphan counts are zero.
- [x] Verify current invalid Customer rows, invalid Work Required rows and duplicate contact identities are zero.
- [ ] Complete the repository CI gate: full Vitest, TypeScript, ESLint, Next build and Playwright smoke. This commit triggers the final human-authored run.
- [ ] Re-evaluate branch/PR diffs for old referral state, duplicate Work Required/Area validation, stale thread wording and the removed quotation regex shim after CI is green.
