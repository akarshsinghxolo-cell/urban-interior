# Customer domain cleanup — completed

The Customer/Site/Area/Work Required convergence is complete as of 2026-09-13.

The final hardening pass made `Customer` in `src/lib/rdash/types.ts` the only full Customer TypeScript model, made phone genuinely optional end-to-end, and moved typed `referrer_type` / `referrer_id` / `referrer_name` fields into that canonical contract. The transitional `CustomerRecord` intersection type is gone.

Retired Customer referral payloads are no longer accepted. Customer writers use only the canonical referrer fields; the database rejects `source_partner_id` / `source_partner_name` on Customer rows. Source-partner fields remain only as derived projections where Site or commission records require them.

The private Customer canonicalization and contact-identity trigger functions have explicit EXECUTE revocations for `PUBLIC`, `anon`, and `authenticated`, in addition to living in the non-exposed `private` schema. Their search paths are pinned for privileged execution.

Customer domain validation now depends on narrow structural contexts instead of requiring the full `RDashDatabase` workspace object. This keeps domain rules usable by targeted reads and reduces accidental cross-domain coupling.

The 2026-09-13 database index audit found no exact duplicate indexes and no simple prefix-redundant B-tree indexes among the 207 non-constraint zero-scan advisor findings. No indexes were removed without workload evidence; see `docs/database-index-audit-2026-09-13.md`.

Verification for this cleanup is enforced through the repository Application CI gate: full Vitest, TypeScript, ESLint, Next.js build, and Playwright smoke. The old checklist is retained at this path only to preserve links from earlier commits; it is no longer an active TODO list.

One account-level Supabase setting remains operational rather than code-owned: leaked-password protection should stay enabled in the project Auth settings and is monitored by the Supabase security advisor.
