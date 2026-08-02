# Risks + Blockers Consolidation Pilot

> **Status:** design + behavior characterization only. No production schema change in this branch.

## Why this is the first pilot

`entity_blocked` and `entity_risks` are both currently empty in production, they are already presented together in the **Obstacles & Risks** module, and they share customer/site/work context. This makes them a useful low-data-risk pilot for proving the consolidation method.

They are **not identical concepts**, so storage may be shared only if subtype-specific behavior remains explicit.

## Current behavior that must not change

### Blocker

Current `BlockedItem` behavior includes:
- explicit `resolved` state;
- optional links to Task, Work Order, PO and GRN;
- optional conversation `thread_id`;
- creation opens a blocker thread;
- creation auto-creates an Owner task to resolve the obstacle;
- resolving a blocker can move a linked Task from `blocked` back to `in_progress`;
- resolving writes a decision reply to the Task thread when present;
- resolving writes an audit event and cross-posts linked entity references.

### Risk

Current `RiskItem` behavior includes:
- `type`: cash / margin / vendor / collection;
- `severity`;
- optional monetary `amount`;
- optional customer reference;
- current resolution semantics remove the Risk row instead of marking it resolved;
- Risks currently do not use the dedicated `blocked` ThreadKind path.

The migration must preserve these differences even if both records live in one physical table.

## Proposed canonical physical model

A future canonical table should be purpose-built instead of another completely opaque JSON collection:

```text
entity_issues
------------
id
workspace_id
revision
updated_at
updated_by

issue_type          blocker | risk
status              open | resolved | dismissed
customer_id
site_id
work_order_id

linked_task_id
linked_po_id
linked_grn_id
thread_id

title
reason
risk_type            cash | margin | vendor | collection | null
severity             low | medium | high | urgent | null
amount               numeric | null
resolved_at
resolved_by

payload              jsonb   -- compatibility/subtype extension only
```

High-value routing/filter fields should be typed/indexable. `payload` is for subtype-specific compatibility data, not the primary source for every important field.

## Preferred logical cutover strategy

Do **not** map two independently writable logical collections directly to one physical table while the commit RPC assumes collection→table identity.

Preferred sequence:

1. Add a new logical canonical collection `issues` backed by `entity_issues`.
2. Keep `blocked` and `risks` in the application contract temporarily as compatibility projections/selectors.
3. Add conversion helpers:
   - BlockedItem → Issue
   - RiskItem → Issue
   - Issue(blocker) → BlockedItem compatibility shape
   - Issue(risk) → RiskItem compatibility shape
4. Move authoritative writes to `issues` first.
5. Make old `blocked` / `risks` reads derive from canonical `issues` during compatibility.
6. Update entity-scoped reads, module-scoped reads, reports, integrity rules and export/import.
7. Prove old/new parity with tests.
8. Remove old collections from `COLLECTION_TO_TABLE` only after no write/read dependency remains.
9. Drop `entity_blocked` / `entity_risks` in a later, separate migration after an observation period.

This avoids weakening the central commit-table validation just to support the pilot.

## Workspace synchronization requirements

A canonical Issue mutation must still:
- participate in the same workspace revision CAS;
- bump row revision correctly;
- appear in `entity_workspace_change_batches`;
- be returned to the saving client in the same patch;
- retain deterministic IDs during compatibility conversion;
- preserve audit/thread side effects exactly once.

## Dependency surfaces already identified

At minimum the pilot touches:
- `src/lib/rdash/types.ts`
- `src/lib/rdash/store/slices/risks.ts`
- `src/lib/rdash/modules.ts`
- `src/lib/rdash/server/module-read-plans.ts`
- `src/lib/rdash/server/module-scoped-collections.ts`
- `src/lib/rdash/server/entity-scoped-read.ts`
- `src/lib/rdash/server/commit-rest.ts`
- `src/lib/rdash/workspace-operations.ts`
- `src/components/rdash/WorkdeskCombinedViews.tsx`
- `src/components/rdash/NotificationCenter.tsx`
- `src/components/rdash/WorkspacePulseStrip.tsx`
- `src/components/rdash/WorkspaceHealthWidget.tsx`
- `src/lib/rdash/server/workspace-health.ts`
- `src/components/rdash/modules/IntegrityModule.tsx`
- field-staff visibility/presentation paths
- seed/reset/import/export
- audit/entity-thread/reference rules

## Pilot gates

### P0 — Characterization
Tests pin existing blocker/risk behavior and all known read-plan dependencies.

### P1 — Add canonical Issue contract
No database cutover. Add type/conversion helpers and parity tests.

### P2 — Add `entity_issues`
Migration creates the table without removing old tables. Existing rows are copied/backfilled and parity-checked.

### P3 — Dual-read verification
Old collections still drive runtime; canonical Issue reads are compared in tests/diagnostics.

### P4 — Canonical writes
Writes move to Issue while compatibility projections feed old readers.

### P5 — Canonical reads
Modules/read plans move to Issue. Old collections become unused.

### P6 — Deprecation
Remove old collection mappings after code search + CI proves no dependency.

### P7 — Physical drop
Separate migration drops old tables only after observation and rollback snapshot.

## Abort conditions

Do not proceed from one gate to the next if any of these appear:
- delta revision mismatch;
- duplicate audit/thread side effect;
- task unblocking behavior changes;
- reports/pulse/health counts differ;
- entity-scoped Customer/Site graph loses records;
- import/export loses subtype fields;
- production contains unexpected legacy rows that cannot be converted losslessly.
