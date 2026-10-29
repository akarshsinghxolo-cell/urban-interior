# Connected shared schema

Prepared 28 October 2026 against application `ae6f57011a3864871b1f5ccb5f43878e2057ecce` and Supabase project `urban-interior` (`smfqwexofoqqrrhbzwmx`). This update preserves the newer authoritative Integrity API/read behavior.

## Storage and ownership

Six source tables move into one new and two existing typed stores, reducing public tables from **52 to 47**. All 80 logical collections, record IDs, revisions, workspace boundaries, permissions and historical payloads are retained.

| Logical collection | Previous table | Shared table |
| --- | --- | --- |
| workRequired | entity_workRequired | entity_project_work |
| acceptedScopes | entity_acceptedScopes | entity_project_work |
| workOrders | entity_workOrders | entity_project_work |
| payments | entity_payments | entity_financial_documents |
| commissions | entity_commissions | entity_financial_documents |
| master.catalogueArticleVendorLinks | entity_master_catalogueArticleVendorLinks | entity_resource_links |

The `collection` discriminator is mandatory for reads, writes, CAS checks and deletion. The SQL and TypeScript allowlists agree on every collection. Indexed canonical `customer_id_gen` and `site_id_gen` columns preserve entity-scoped REST reads; PostgreSQL tests execute those selectors against the actual schema. Existing pending client operations carry logical collection names; the server derives their current physical table. A stale client cannot choose a physical table or overwrite another kind with the same ID.

Payment schedules remain obligations; invoices remain documents; receipts/payments remain cash movements; commissions retain their own lifecycle. Shared storage does not combine their amounts or states. All dashboard SQL retains kind predicates.

The new project table has RLS enabled, no public/browser-role grants and service-role CRUD access through authorized application APIs. Logical collection authorization is preserved. Source policies and grants are restored exactly by rollback.

## Native integrity

The connection migration redirects **70 affected FKs**, retaining every relationship in the **251-FK baseline**, including compound financial/job fields, kind/workspace checks, deferral and deletion semantics. Added full supporting indexes retain workspace/field prefixes. Identical copied unique indexes are reused rather than duplicated.

The business-key migration adds three deferred, workspace-scoped compound FKs: Work Required, Accepted Scope and Work Order must each use a Site owned by their Customer. The resulting graph has **254 validated native FKs**. All 229 registered persisted scalar relationships remain covered; arrays, embedded records and provenance retain their application validation.

Four uniqueness rules cover:

- Article name within a workspace, normalized for case and whitespace.
- Variant name within a workspace and canonical Article.
- One scoped material per workspace, work subcategory and Article.
- One active Vendor rate per workspace, Vendor, Article and optional variant. Inactive rates/history remain valid.

These deferred unique constraints enforce existing business identities during concurrent saves while allowing valid multi-row replacements in one atomic save (for example, inserting a replacement active Vendor rate before retiring its predecessor). No record payload is rewritten or automatically merged. Database errors for these new checks become understandable application validation messages.

The contact audit found one matching phone identity across Vendor and Contractor roles, and no matching contacts within a role. A shared phone is insufficient evidence for an identity merge; both role profiles are preserved. There were no duplicate Article names, scoped-material keys, active Vendor-rate keys or Drive file identities in the preflight scan.

## Verification

The fresh recovery checkpoint contains **2,445 complete business row envelopes** and relevant schema metadata; it excludes Auth accounts, provider credentials and infrastructure journals and is not a full database backup. The full application scan evaluates **4,389 references** with zero reference issues, duplicate IDs or business-validator failures.

The full-data PostgreSQL/PGlite rehearsal restores every envelope, applies the earlier expansion/hardening plus this pair, reaches 47 tables / 254 FKs, compares every business envelope and finance/commercial/operations aggregates, and reverses to the 73-table historical baseline without losing any envelope. All four SQL regression packs pass at their applicable schema stages.

The published integration test independently verifies the complete FK graph, every registered scalar relationship, workspace/type isolation, wrong Customer/Site combinations, all four uniqueness rules, equal IDs in different kinds, atomic rejected multi-operation saves and unchanged journal/revision state on rejection. It checks duplicate-index absence and exact restoration of all baseline public indexes/FKs. Current rows written after migration survive rollback and reapplication. Existing browser tests exercise quotation saves and force-deletion using the new kind-scoped physical storage.

## Release and reversal

1. Recheck live schema, application main, data and advisors; save the recovery checkpoint and rehearse its rows.
2. Stage the exact application commit with production environment settings while retaining the current primary alias; require CI/build success.
3. Apply `shared_domain_connections`, then `shared_business_keys`, and promptly promote the matching staged application.
4. Confirm 47 public tables, 254 validated FKs, full envelope parity, dashboard aggregate parity, SQL regressions, advisors and runtime health.

The migrations take the workspace revision/table locks inside transactions, compare source/destination envelopes in both directions, and drop source tables without CASCADE. They create no compatibility views or duplicate archive tables. Database locks are bounded; a failed precondition rolls back the transaction.

To reverse, apply `supabase/rollback/shared_business_keys.sql`, then `supabase/rollback/shared_domain_connections.sql`, paired with the preceding application build. Rollback recreates the original six tables from **current shared rows**, including subsequent writes, restores original generated columns/checks/indexes/FKs/grants/policies/functions, and removes the added shared storage. Reverse this pair before reversing the older PR #239 migrations.
