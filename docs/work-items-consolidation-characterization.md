# Task + Follow-up Consolidation Characterization

> **Status:** discovery/design only. No Supabase table change in this branch.

## Refined consolidation boundary

The initial blueprint grouped Tasks, Follow-ups, Approval Actions and Recurring Tasks together. Code and live-data analysis show that boundary is too broad.

### Merge candidates
- `entity_tasks`
- `entity_followups`

These are both assigned, prioritized, due work items with customer/business context, thread history and operational completion/rescheduling behavior.

### Keep separate
- `entity_actions` — approval/decision records used by Procurement, Finance, Vendor Bills and Contractor workflows. They represent an authorization decision, not merely assigned work.
- `entity_recurringTasks` — schedule/template definitions. `runRecurringTasks()` materializes actual Tasks and then advances `last_run`, `next_run` and `runs_count`; the definition is not itself a task instance.

## Live production snapshot — 2026-08-02

- Tasks: 5 rows
- Follow-ups: 5 rows
- Approval Actions: 0 rows
- Recurring Task definitions: 0 rows
- Cross-type Task/Follow-up ID collisions: 0

Because Tasks and Follow-ups contain live production rows, their migration requires full backfill parity and rollback retention before physical cleanup.

## Current Task contract

Important shared/context fields:
- `id`
- `title`
- `customer_id`
- work/site/quotation/PO/visit references
- priority
- assignment
- due date
- thread
- created/updated timestamps

Task-specific lifecycle/fields include:
- statuses: `todo | in_progress | blocked | review | completed | cancelled`
- `task_scope`
- `task_type`
- description
- checklist/comments/proofs
- completion note/proof/actor/time
- reopen metadata
- blocker link
- business-decision Tasks that must close through linked workflows

Task side effects that must not change:
- Task thread creation
- audit events/cross-posts
- strict status transition rules
- only assignee or Owner/Operations may perform certain transitions
- completion note required
- completion proofs must use managed Google Drive
- dedicated Block Task/Reopen Task behavior

## Current Follow-up contract

Important shared/context fields:
- `id`
- `title`
- `customer_id`
- work/quotation/payment/visit references
- priority
- assignment
- due date/time
- thread
- created/updated timestamps

Follow-up-specific lifecycle/fields include:
- statuses: `pending | scheduled | completed | missed | closed`
- `followup_type`
- notes + notes history
- promise date
- outcome + outcome note
- missed time
- escalation level
- next follow-up link

Follow-up side effects that must not change:
- dedicated Follow-up thread
- actor/assignment enforcement
- completion/outcome semantics
- rescheduling rules
- overdue reconciliation marks open records `missed`
- reconciliation increments escalation level
- missed Follow-ups can generate recovery Tasks
- Finance/payment workflows create and complete payment Follow-ups automatically

## Proposed canonical concept

A future physical table can be shared without forcing the two lifecycle models into one status enum:

```text
entity_work_items
-----------------
id
workspace_id
revision
updated_at
updated_by
data jsonb

item_type           task | followup
lifecycle_status    subtype status string
priority
customer_id
site_id
work_required_id
work_order_id
quotation_id
po_id
payment_id
visit_id
thread_id
assignee_id
assignee_name
assigned_role
due_at
title
created_at

legacy_payload      inside data during compatibility phase
```

`lifecycle_status` remains subtype-aware. We should **not** invent a universal status mapping such as `open/done` that hides important Task/Follow-up states.

## Recommended migration method

Reuse the proven Issues pilot pattern:

1. Canonical `WorkItem` TypeScript contract with lossless Task/Follow-up conversion helpers.
2. Additive `entity_work_items` shadow table with generated typed/indexable shared fields.
3. Backfill all 10 live rows and abort on ID/count/field parity mismatch.
4. Keep `entity_tasks` and `entity_followups` authoritative while shadow parity is checked.
5. Immediately before cutover, refresh canonical storage from legacy tables.
6. Move physical Task/Follow-up tables into private rollback storage.
7. Recreate public names as writable `security_invoker` compatibility views over `entity_work_items`.
8. Preserve legacy operation/journal payloads so the browser/store sees no schema change.
9. Exercise insert/update/lifecycle/delete through the real atomic commit RPC inside a transaction and roll it back.
10. Observe live behavior and only then remove rollback copies.

## Important difference from Issues pilot

Tasks and Follow-ups have live data and substantially more side effects. The cutover probe must verify not just storage CRUD but also:
- all ten IDs and row revisions after backfill;
- legacy JSON equality for every live row before cutover;
- exact client journal collection names (`tasks`, `followups`);
- optimistic row-version updates;
- entity-scoped Customer/Site reads;
- thread references;
- payment follow-up helpers;
- Workdesk/Daily Work counters;
- field-staff visibility;
- notification and workspace-health calculations.

## Explicit exclusions

Do not consolidate these in this phase:
- Approval Actions
- Approval Policies
- Recurring Task definitions
- Automation Rules
- Threads
- Visits

Their relationships to Tasks/Follow-ups remain by ID and behavior, not by shared physical storage.
