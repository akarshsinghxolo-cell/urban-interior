# Urban Interior Coding Agent Instructions

These instructions apply to all coding-agent work in this repository.

## Project identity and durable memory

- ChatGPT project / operating context: `UC project 1`
- GitHub repository: `akarshsinghxolo-cell/urban-interior`
- Primary production site: `urban-castle.vercel.app`
- Supabase project: `urban-interior`
- This `AGENTS.md` file is the canonical durable memory for coding-agent permissions, workflow, safety boundaries, verification, and completion requirements.
- Coding agents must read this file before inspecting, editing, testing, deploying, or changing the database.

## Operating mode

Act as an end-to-end coding agent, not only as a code advisor. Use repository-wide context and complete the edit-test-debug cycle whenever the available tools permit it.

For each engineering task:

1. Inspect the relevant repository structure, existing conventions, dependencies, data flow, recent commits, pull requests, deployment state, and database schema before changing architecture.
2. Search broadly enough to understand all affected callers, types, tests, configuration, persistence, and user flows.
3. Implement the smallest coherent change that solves the underlying problem.
4. Verify through the applicable checks: type checking, linting, tests, production builds, GitHub checks, Vercel preview or production logs, browser verification, SQL queries, migrations, and Supabase advisors.
5. Read failures, correct the implementation, and repeat until the available checks pass or a concrete external blocker is identified.
6. Report the exact final change set, verification performed, deployment status, database impact, unresolved risks, and any external blockers.

## Git and deployment policy

- Direct edits and commits to `main` are authorized and may be used as the default workflow.
- Inspect the current `main` state before writing so unrelated work is not overwritten.
- Use a separate branch or pull request only when it materially improves safety, reviewability, rollback, or parallel development.
- Production deployment does not require a separate approval when it is a natural part of completing the requested task.
- Before or immediately after production deployment, verify the deployment result and inspect relevant build/runtime errors.
- Do not claim success solely because a commit or deployment was created; verify the resulting application behavior where possible.

## Supabase and destructive operations

- Database migrations, SQL execution, schema changes, data correction, and destructive operations are authorized when they are clearly required by the requested task.
- State the concrete impact before executing a destructive operation, including the affected project, schema/table/object, expected rows or objects, and reversibility.
- Scope destructive work narrowly. Use precondition checks, transactions, backups or snapshots, row counts, and post-operation validation whenever feasible.
- Never perform destructive operations unrelated to the active task.
- Review RLS, grants, functions, views, triggers, storage policies, and Supabase security/performance advisors whenever relevant.

## Secrets and credentials

- Secret values may be retrieved only when technically necessary to diagnose, configure, or complete the requested operation.
- Never print, quote, summarize, expose, commit, store in repository files, include in pull requests, or place secret values in logs or chat responses.
- Prefer checking whether a secret exists, its target environment, metadata, or a redacted fingerprint rather than reading the raw value.
- Never move server-only credentials into browser-exposed variables or client code.
- If a secret must be replaced or rotated, update the intended secret store and verify usage without revealing the value.

## Repository context

Treat GitHub `main` as the source of truth unless the task identifies another ref. Full-repository context means systematically searching and inspecting all relevant files rather than relying on a single pasted snippet. Include, as applicable:

- Next.js routes, layouts, components, server actions, and APIs
- shared types, stores, validation, integrity rules, and utilities
- Supabase clients, migrations, schema baselines, RLS, functions, and storage
- tests, scripts, package configuration, environment-variable references, and deployment configuration
- Git history, open pull requests, GitHub Actions, Vercel deployments, build logs, and runtime logs

Do not load or change unrelated files merely for completeness. Gather enough context to make the change correct across the full affected system.

## Completion standard

A task is complete only when the requested behavior is implemented, available verification has been run, failures have been investigated, deployment/database state is known, and the final report distinguishes verified facts from assumptions or remaining risks.

## Local QA stack

A durable local QA backend emulates Supabase (GoTrue + PostgREST + workspace
RPCs) so browser QA never needs cloud credentials.

- `scripts/qa-mock-supabase.ts` — one Bun HTTP server on `127.0.0.1:3210`
  (`bun run qa:mock`). Its in-memory database IS the canonical seed:
  `buildSeedDatabase()` from `src/lib/rdash/seed.ts` flattened into
  `entity_*` tables. It emulates:
  - GoTrue token grants (`grant_type=password` / `refresh_token`),
    `/auth/v1/user`, `/auth/v1/logout`, `/auth/v1/admin/users`.
  - PostgREST selects/filters/order/limit/offset/range, `Prefer: count=exact`
    (Content-Range), `return=representation`, upserts
    (`resolution=merge-duplicates`), duplicate-key 23505 errors, and
    auto-creation of unknown tables on write (e.g. `uc_workspace_operations`
    receipts, `uc_upload_*`, `uc_drive_folders`, `GenericRecord`).
  - RPCs: `commit_workspace_operations` (workspace + row CAS, receipts,
    change journal), `get_workspace_health_summary_v2`,
    `sync_staff_identity_bundle`, `get_auth_user_by_email`,
    `uc_bump_workspace_revision`.
- QA identities are seeded staff; sign in through the real UI with
  `owner@urban.test` (Owner) or `ops@urban.test`, `field@urban.test`,
  `finance@urban.test`, `sales@urban.test`, `procurement@urban.test` —
  any password is accepted.
- `.env.local` points `SUPABASE_URL` at `http://127.0.0.1:3210` with QA keys
  and a local `UC_SESSION_SECRET` (required by the session signer).
- Start: `bun run qa:mock` in one shell and `bun run dev:qa` in another
  (Next dev on port 3100), or run both in background. No cloud credentials
  are needed.
- Browser automation (agent-browser) must use `http://localhost:3100`,
  NOT `127.0.0.1` — the mismatch breaks React hydration.
- Mock state is in-memory only; restart the mock to reset to the pristine
  seed. `npx tsc --noEmit` stays clean because `scripts/` is excluded from
  tsconfig (QA-only Bun script).


## E2E smoke pack (Playwright)

`tests/e2e/` drives the REAL UI in headless chromium against `next dev` on
port 3000 + the QA mock on 3210 — the same stack as manual browser QA.

- Run: `npm run test:e2e` (or `bunx playwright test`). Headed:
  `npm run test:e2e:headed`. Show a failure trace:
  `npx playwright show-trace <test-results/.../trace.zip>`.
- `playwright.config.ts` boots BOTH servers itself (`webServer` with explicit
  mock env vars, `reuseExistingServer: true`) — in CI nothing pre-running is
  assumed; in the sandbox it reuses the already-running double-forked pair.
- Session strategy: the `setup` project signs in ONCE through the real form
  (`tests/e2e/auth.setup.ts`) and saves `test-results/.auth/owner.json`;
  the `smoke` project reuses it via `storageState`. The login endpoint
  rate-limits 5 attempts / 15 min per email, so per-test sign-in is
  impossible by design. Only 2 sign-ins happen per full run (setup + the
  form test), which fits the limit on a fresh server.
- Covered today: `/`→`/signin` redirect, real-form sign-in, Customer Desk
  navigation (sidebar), customer drawer + tab walk, sign-out, and the
  390×844 mobile overflow guard on the workdesk and the customer drawer
  (regression net for the Task 26–28 mobile fixes).
- Selectors are role/label-first on purpose — they survive class refactors;
  update them only when the UI contract itself changes.
