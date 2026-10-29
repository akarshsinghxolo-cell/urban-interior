# Urban Castle Business Workspace

Urban Castle is a Next.js workspace for customer enquiries, sites, measurements, quotations, execution, procurement, finance, staff, communications and reporting.

## Data model

Supabase is the production source of truth. Modules share canonical customer, site, area, work, quotation, financial, article and communication records instead of maintaining module-specific copies. The app validates authenticated writes on the server and exposes relationship health under **System Settings → Data health**.

Use the normal application flows for operational changes. Database recovery, canonical reseeding and destructive relationship repair are maintenance procedures and are deliberately not exposed as ordinary Settings actions.

## Local setup

1. Install Node.js 24.
2. Copy `.env.example` to `.env.local` and supply the Supabase and session values.
3. Install dependencies with `npm ci`.
4. Start the app with `npm run dev` and open `http://localhost:3000`.

The local QA environment can use `npm run qa:mock` with `npm run dev:qa` when Bun is available.

## Verification

- `npm test` — unit and source-contract regression suite
- `npm run lint` — code quality checks
- `npx tsc --noEmit` — TypeScript validation
- `npm run build` — production build
- `npm run test:e2e` — browser workflows

See `CONTRIBUTING.md` for repository workflow and `AGENTS.md` for the required end-to-end change procedure.

## Architecture guide

- `src/app` — Next.js routes and authenticated server APIs
- `src/components/rdash` — workspace shell and business modules
- `src/lib/rdash` — canonical domain types, store logic, validation and routing registry
- `supabase` — database migrations and database-side support
- `tests` — unit, integration and source-contract coverage
- `docs` — operational and architecture notes

New UI navigation must target an ID registered in `src/lib/rdash/modules.ts`. Reports select their detailed views inside the Reports module; they are not independent workspace routes.
