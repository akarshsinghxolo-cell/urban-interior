# Supabase data ownership

Urban Castle uses one physical `entity_*` table per workspace collection. A large table count is therefore not, by itself, evidence of duplicated business data. The rule is that every business fact must still have exactly one canonical writable owner.

## Canonical entities

| Business fact | Canonical owner | Secondary representations |
| --- | --- | --- |
| Customer | `entity_customers.data` | Labels and summaries are derived at read time |
| Site | `entity_sites.data` | Customer/site labels are derived |
| Contractor profile | `entity_master_contractors.data` | None |
| Contractor capability and agreed rate | `entity_master_contractors.data.work_capabilities` | `capabilities_v2` and `entity_master_contractorRates` are compatibility projections only |
| Vendor profile | `entity_master_vendors.data` | None |
| Vendor quoted rate | `entity_master_vendorRates.data` | `entity_master_vendorRateHistories` is immutable history; article/reference averages are derived projections |
| Article | `entity_master_articles.data` | Subcategory/article mapping stores relationship-specific reference data |
| Work category/subcategory | `entity_master_workCategories.data` / `entity_master_workSubcategories.data` | Names copied into transactional rows are display snapshots only |
| Staff workspace profile | `entity_master_staff.data` | `StaffProfile` is the typed operational mirror and `uc_user_roles` is the auth assignment; all three must be written through `sync_staff_identity_bundle` |
| Workspace revision | `entity_workspace_revision` | `entity_workspace_change_batches` is the ordered delta journal |

## Write-path rules

1. Business UI and APIs write workspace collections only through `/api/operations/commit` and `commit_workspace_operations`.
2. Direct SQL or direct Supabase table writes to `entity_*` business tables are prohibited outside migrations and guarded repair tools.
3. A secondary projection must never become independently editable.
4. Any function that increments `entity_workspace_revision` must create the matching `entity_workspace_change_batches` row in the same transaction.
5. Staff identity writes must use `sync_staff_identity_bundle`; direct writes to `uc_user_roles`, `StaffProfile`, or `entity_master_staff` are not supported application paths.
6. Empty registered tables are dormant collections, not abandoned tables. Removal requires proving there is no module, API mapping, migration, or stored function dependency.

## Retired architecture

The following pre-atomic workspace objects are retired:

- `CollectionMeta`
- `commit_operations(text,jsonb,jsonb,text)`
- `write_workspace_snapshot(text,text,integer)`

The active workspace architecture is:

```text
/api/operations/commit
  -> authorized application validation
  -> commit_workspace_operations
  -> entity_* collection tables
  -> entity_workspace_revision
  -> entity_workspace_change_batches
```

`GenericRecord` is not retired. It remains the server-owned storage for Google Drive OAuth configuration and connection vault records.
