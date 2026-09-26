# Shared architecture audit — 2026-09-26

Verdict: partly shared, not duplication-free. Audited current GitHub main,
runtime routes, workspace persistence, master/rate ownership, and exact repeated
function bodies across `src`. Read production table/function metadata without
changing business records. This is not a claim that every module is refactored.

## Consolidated in this pass

- shrink: derive the REST table map from the existing workspace collection allowlist; do not maintain two lists (`workspace-operations.ts`, `server/commit-rest.ts`).
- shrink: entity-scoped and collection-scoped readers reuse empty-workspace construction, row decoding/version recording, and revision reads (`server/commit-rest.ts`, `server/entity-scoped-rest.ts`).
- shrink: navigation, background, and foundation synchronization share delta validation (`workspace-delta.ts`).
- shrink: module and entity routing share path normalization (`workspace-routes.ts`). Existing URLs and aliases stay valid.

## Data ownership retained

Business data uses `entity_*` tables and the existing atomic commit RPC.
Contractor capabilities own contractor rates; the rate table is a derived
projection. Vendor prices and price history have distinct current/history roles.
Staff identity, authentication, upload state, and synchronization journals are
not interchangeable copies of business data. No tables or business records were
added, dropped, merged, or rewritten in this pass.

## Remaining targeted cleanup

- shrink: integrity checker/cascade/repair repeat collection access helpers.
- shrink: procurement receipt paths repeat quantity-validation logic; preserve their different approval and stock-movement behavior when consolidating.
- shrink: GPS distance calculations repeat, but rounding differs between geofencing and route totals; preserve those contracts before sharing the formula.

Do not combine different business workflows just to reduce line count. Shared
rules belong in existing domain helpers; UI components own presentation, and
new database tables require a distinct data responsibility. New persisted
collections still require migrations even though their REST names are derived.
