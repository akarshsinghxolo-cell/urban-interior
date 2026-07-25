# Phase 5 direct Drive upload validation

Date: 2026-07-25

## Completed database preparation

- Normalized the preview Supabase upload tables to the final Phase 4 application contract.
- Added durable workspace operation receipts and the atomic workspace-revision RPC.
- Ran an insert/update/read smoke transaction across upload batches, items, events, folder claims, and workspace operations; the transaction was rolled back successfully.
- Consolidated two historical storage-account records that represented one Google OAuth connection.
- Repaired one Site whose `photo_attachment_ids` contained Google file IDs rather than Urban Castle attachment IDs.
- Scanned upload-bearing business tables for remaining embedded Google file IDs; none were found.
- Added database-side cleanup for obsolete resumable-session metadata after upload completion or cancellation.

## Live Google Drive tests

### Happy path — passed

The server created a resumable session, uploaded a small diagnostic file, verified it in Google Drive, moved it to the canonical `_System/Diagnostics` folder, registered the FileAsset, registered the EntityFileAttachment, and marked the queue item completed.

### Interrupted resumable upload — passed

A two-chunk upload was interrupted after the first 256 KiB chunk. Google Drive reported `bytes=0-262143`; upload resumed at the next byte and finalized successfully without retransmitting the first chunk.

### Lost final response reconciliation — defect found and fixed

The first live test found that an existing unexpired session was returned before Drive was searched for a completed file. The corrected initiation path now searches Drive by permanent upload-item identity and file size before reusing the session, persists the recovered Google file ID, clears obsolete session metadata, and continues finalization without creating a duplicate.

A live retest is pending because the Vercel project reached its daily deployment limit after the fix was committed. The original test item remains `failed_retryable` with its session cleared so the corrected path can recover the existing staged Drive file.

### Cancellation and Drive cleanup — pending live retest

The cancellation implementation and database invariants build successfully, but the final live delete-verification request was blocked by Vercel preview protection and the daily deployment cap.

## Application build

The complete Next.js production build and TypeScript check passed with the workspace-ID normalization and reconciliation fixes.

## Remaining release tests

- Recover and finalize the retained reconciliation smoke item on the next available preview deployment.
- Verify active-upload cancellation and Google Drive deletion.
- Test offline IndexedDB persistence, browser restart, and automatic resume from the real UI.
- Test the migrated Site, Customer, Vendor, Contractor, GRN, Drawing, Execution, Visit, Measurement, Thread, Communication, CSV import, and Staff upload controls.
- Test Chrome desktop, Edge, Chrome Android, installed Android PWA, Safari iPhone, and installed iPhone web app where applicable.
- Remove diagnostic files and test queue rows after the final validation cycle.
