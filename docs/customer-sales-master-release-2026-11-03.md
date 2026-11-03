# Customer sales and master usability — 2026-11-03

Application changes: `48b220e7`.

- Sales Pipeline is a Customer Desk view and a per-customer tab, with progress derived from linked workflow records. Hold/lost/resume decisions remain explicit and reasoned.
- Material sharing uses the customer's scoped Master Setup catalogue, starts with no selections, previews the message, and records preparation rather than delivery.
- Master rate rows stack on smaller screens so labour, total, notes and actions remain accessible.
- Work-type deletion ignores audit snapshots but still protects live references. Audit records are not rewritten.

Verification: 1,003 unit tests; four Playwright checks (authentication, customer pipeline/materials, desktop/mobile master layout, site directory); TypeScript; production build; no lint errors. SQL transaction verifies live-reference rejection and audit preservation, then rolls back fixtures.

Database migration `allow_work_type_deletion_with_audit_history` was applied to the Urban Interior project. Hehsh remains in the catalogue and has contractor references; no production work type was deleted or merged. Security advisors retain the existing leaked-password-protection warning; unrelated advisor findings were not changed.

The release is submitted through GitHub's signed-commit API to satisfy Vercel's verified-commit requirement without changing that setting. Live deployment readiness is checked separately after submission.
