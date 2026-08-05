# Reliability upgrade checklist

This branch implements the agreed Urban Castle reliability plan for items 1–10, with item 7 intentionally skipped.

1. Renewable browser authentication backed by rotating Supabase refresh tokens while retaining the short-lived Urban Castle bearer token.
2. Server-only Google OAuth secrets and AES-256-GCM encrypted Drive refresh-token persistence.
3. Google Drive resumable sessions remain the direct browser upload transport.
4. Pending upload jobs remain durable in IndexedDB and recreate expired/dead Drive sessions.
5. The 8 MiB Drive chunk size is retained.
6. Temporary failures use exponential-style delays with jitter and honor `Retry-After` when Google provides it.
7. **Skipped by request:** no File System Access API / multi-GB local-file-handle work in this change.
8. Managed download/open/preview routes authorize in Urban Castle and redirect to Google; Vercel does not proxy file bodies.
9. Long-lived identity is separated from short-lived storage capabilities/redirects.
10. The current `anyone:reader` Drive link-sharing boundary is documented and surfaced in the storage UI.

## Production prerequisite

Before merging/deploying this branch, Vercel Production must contain:

- `GOOGLE_DRIVE_OAUTH_CLIENT_ID`
- `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`
- `DRIVE_TOKEN_ENCRYPTION_KEY`

`DRIVE_TOKEN_ENCRYPTION_KEY` should be a long random secret and must remain stable after encrypted Drive refresh tokens are written. Rotating or removing it without a migration/reconnect plan makes existing encrypted Drive connections unreadable.
