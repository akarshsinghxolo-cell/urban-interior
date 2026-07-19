# Urban Castle — Setup Guide

## Quick Start (Dev)

```bash
# 1. Install dependencies
bun install        # or npm install

# 2. Configure environment
cp .env.example .env
# Edit .env: set RDASH_SESSION_SECRET to a 32+ char random string
# (the app falls back to a dev secret if missing in non-production)

# 3. Start dev server
bun run dev        # or npm run dev
# Open http://localhost:3000/signin

# 4. Login as super owner
# Email: akarshsingh4@gmail.com
# Password: Akarsh@123.
```

## Production (with Supabase)

The app runs on **Supabase** (PostgreSQL). No Prisma, no local database.

1. **Create a Supabase project** at https://supabase.com
2. **Apply the schema** (in Supabase Dashboard → SQL Editor, run in order):
   - `supabase/schema.sql` — base auth tables (5 tables + 1 RPC)
   - `supabase/schema-entity-tables.sql` — 86 entity_* tables + RLS policies
   - `supabase/seed.sql` — demo data (optional)
3. **Set environment variables** in `.env` (or Vercel → Settings → Environment Variables):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-anon-key
   SUPABASE_SECRET_KEY=your-service-role-key
   RDASH_SESSION_SECRET=your-32+char-random-secret
   RDASH_WORKSPACE_ID=default
   RDASH_OWNER_EMAIL=akarshsingh4@gmail.com
   RDASH_OWNER_PASSWORD=Akarsh@123.
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```

## Without Supabase (In-Memory Mode)

The app automatically falls back to **in-memory seed data** when Supabase is not configured. This is the default for dev/preview. Data resets on server restart.

## Stack
- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **Database**: Supabase (PostgreSQL) via REST — no Prisma
- **Auth**: Supabase Auth + session cookie + hardcoded super owner
- **State**: Zustand + TanStack Query
- **Deploy**: Vercel

## Key Folders
- `src/components/rdash/modules/` — 51 feature modules (CRM, Procurement, Finance, Execution, Operations, HR, Masters, Integrity)
- `src/lib/rdash/store/slices/` — Zustand store slices (15 files)
- `src/lib/rdash/integrity/` — Database integrity layer (178 FK rules, checker, cascade, repair)
- `src/lib/rdash/server/` — Supabase REST data layer (commit-rest.ts, workspace.ts, auth.ts)
- `supabase/` — SQL schema files
- `worklog.md` — Full development history (2,900+ lines)

## Super Owner
The super owner account is hardcoded in `src/lib/rdash/server/auth.ts`:
- Email: `akarshsingh4@gmail.com`
- Password: `Akarsh@123.`
- Role: Owner

This account always works regardless of Supabase configuration. The owner approves all other users via the User Approvals module.

## Lint
```bash
bun run lint
```
