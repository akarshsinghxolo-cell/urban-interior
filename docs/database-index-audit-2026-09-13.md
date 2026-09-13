# Database index audit — 2026-09-13

## Result

Supabase Performance Advisor reported 207 unused indexes. The audit deliberately did not translate “zero scans” into “safe to drop”.

Live PostgreSQL statistics showed 292 zero-scan indexes in total: 85 back a primary key, unique constraint, or other constraint and are therefore protected; 207 are non-constraint advisor candidates. Of the zero-scan set, 168 sit on currently empty tables and 124 sit on non-empty tables. The complete zero-scan set occupies about 3.4 MiB. `pg_stat_database.stats_reset` did not expose an explicit reset timestamp during the audit, so scan counts are treated as observations rather than proof of lifetime non-use.

Two structural redundancy checks were then run against the live catalog:

- exact duplicate indexes with the same table, key columns, uniqueness, expressions, and predicate: **0**
- non-unique B-tree indexes wholly covered by an otherwise equivalent longer index with the same leading key sequence and predicate: **0**

## Decision

No production indexes are dropped in this change.

The application is still young, many entity tables are empty or lightly used, and several Customer/Site relationship indexes were introduced only recently. A zero scan count is not enough evidence to remove an index that may protect a less-frequent workflow or future growth path. The current storage cost is also small relative to the regression risk.

## Repeatable policy

Use `scripts/audit-unused-indexes.sql` to rerun the catalog audit. An index becomes a removal candidate only when all of the following are true:

1. it does not back a primary key, unique constraint, exclusion constraint, or foreign-key support requirement;
2. it remains unused through a representative production observation window with real traffic;
3. it is either structurally redundant or its associated query path is confirmed retired;
4. representative `EXPLAIN (ANALYZE, BUFFERS)` plans remain acceptable without it in a safe environment;
5. removal is committed as its own reversible migration and Supabase performance advisors are rerun.

This converts the advisor count from a cleanup target into a workload-based maintenance signal.
