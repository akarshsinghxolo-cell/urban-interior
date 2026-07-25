# Direct Drive upload phases 1–3 audit

Scope: every file introduced or changed by the stacked Phase 1, Phase 2 and Phase 3 branches, plus the repository integration points used by those files.

## Correctness repairs

- durable IndexedDB writes now wait for transaction completion
- empty and oversized files are rejected before queue creation
- duplicate-only selections no longer leave empty upload batches
- upload ownership is renewed for the entire transfer and coordinated across tabs
- cancellation is checked between session, chunk, verification and finalization stages
- completed Drive file IDs are persisted before finalization or cleanup
- lost final responses are reconciled by permanent upload identity before a new session is created
- finalization validates server-stored routing and Drive app properties
- attachment-field failures stop finalization instead of being silently ignored
- staged cleanup remains pending until Drive confirms deletion
- destination routing no longer falls back to an unrelated generic folder
- canonical folder creation uses database claims and Drive app properties
- workspace changes survive refresh and rebase after earlier pending changes synchronize
- operation receipts are atomically claimed and recover when a commit succeeded but its receipt write failed
- failed uploads and workspace changes remain visible and actionable
- upload and outbox database values are constrained by an additive hardening migration

## Required migration order

1. `20260725-upload-infrastructure.sql`
2. `20260725-upload-phase2-resumable.sql`
3. `20260725-upload-phase3-workspace-outbox.sql`
4. `20260725-upload-phase123-audit-hardening.sql`

## Remaining cutover boundary

This audit repairs the Phase 1–3 infrastructure. Existing business-form upload callers remain on the old upload path until the workflow migration phase. The old route must be deleted only after every caller has been migrated and tested.

## Required authenticated verification

- upload a small diagnostic file
- interrupt and resume a large upload
- cancel during an active chunk and verify Drive cleanup
- repeat Retry and confirm no duplicate Drive file
- create and edit records offline, reload, reconnect and verify one server commit
- create a conflict from a second device and review the explicit resolution flow
