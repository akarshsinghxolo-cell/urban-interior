# Legacy empty-project upgrade · 2026-07-28

These scripts document the one-time upgrade performed on the reset Supabase project that had the Urban Castle July 11 preview schema.

## Status

- Applied successfully on 2026-07-28.
- Target project at application time: `yqlyzmeylbyoldfulwsk`.
- The project was verified empty before execution: no business rows, Auth users, sessions, identities, or Storage objects.
- The final atomic workspace commit and revision journal were verified with an isolated smoke workspace and all smoke rows were removed.

## Important

These files are **not part of the normal Supabase migration chain**. Do not copy them into `supabase/migrations` and do not run them on a populated project.

They exist only to make the specific upgrade reproducible. The guarded baseline script aborts when legacy business tables contain rows. The installation scripts fetch merged migration sources pinned to commit `23256061b21cec781aed6c8b73925e24c010e93e` and verify SHA-256 checksums before execution.

For a normal fresh project, use the repository's current schema and regular migrations instead of these project-upgrade utilities.

## Execution order

1. `01_upgrade_legacy_empty_project_baseline.sql`
2. `02_add_missing_master_staff_collection.sql`
3. `03_install_staff_identity_on_current_baseline.sql`
4. `04_install_current_upload_stack.sql`
5. `05_install_current_operational_baseline.sql`
6. `06_address_new_project_advisors.sql`
