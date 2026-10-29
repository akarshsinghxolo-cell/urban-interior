# Workspace Clutter Audit and Cleanup

Date: 28 October 2026  
Release baseline: shared-domain production schema (52 tables)

## Outcome

This pass removed practical navigation and maintenance clutter without changing canonical business data or adding another database table.

- Report quick links now open the selected report inside Reports instead of sending unregistered IDs to the workspace router and falling back to Workdesk.
- Staff productivity, quotation conversion, lead source, visit compliance and task throughput now export their actual CSV and print/PDF data.
- Reports has one primary sidebar entry. Its family views remain registered and searchable for deep links but no longer consume sidebar space.
- System Settings now contains only appearance, signed-in access and valid data-tool destinations.
- The production seed-reset control and two unreachable Settings destinations were removed from the UI.
- Audit, import, export and data health remain searchable and directly reachable from Settings, but no longer duplicate the System sidebar.
- Database relationship diagnostics, cascade-delete preview and the FK registry are collapsed under **Advanced maintenance** on the Data Health page.
- Automatically opened workspace tabs are capped at five.
- The unused `activePredicate` route metadata was removed.
- A root README now documents setup, verification and the shared Supabase data model.

## Why the broken links escaped

The existing route-registry test verified the eight canonical registered routes but did not inspect IDs embedded in button handlers. Unknown module IDs are intentionally canonicalized to Workdesk, so the report buttons failed quietly. The broader navigation regression test now scans literal workspace-navigation calls, and the cleanup suite directly protects the report quick-link behavior.

## Verification completed

- 135 test files passed.
- 976 tests passed.
- TypeScript passed.
- ESLint passed with no errors. Existing repository warnings remain.
- Next.js production build passed and generated all 54 application/API routes.
- Route registry, module read registry, navigation targets and cleanup contracts passed.

## Not changed in this pass

- `DetailPanel.tsx` and the main domain type file remain large. Splitting them would mostly move code and increase regression risk without changing the user experience; they should be decomposed only alongside a feature boundary.
- Deep routes remain registered even when hidden from the sidebar. This preserves bookmarks, permissions, command search and existing links.
- The server-side recovery/reset capability remains available to audited maintenance code, but it is no longer an ordinary production Settings action.

## Coverage limits and remaining risk

The following were not exercised and must not be inferred from the passing unit/build checks:

- destructive repair, cascade execution or workspace reset;
- every permission role and every role/route combination;
- physical-device GPS, check-in and check-out behavior;
- live WhatsApp and Google Drive integrations;
- every end-to-end business workflow.

Local Playwright could not be run because the committed QA stack requires Bun, which is unavailable on this Windows host. The registered-route test passed, and the new navigation-target regression closes the embedded-button-ID gap, but browser coverage should still be run in CI or on a host with the QA stack before treating every interaction as verified.

## Release status

The change is committed on top of the current production `main` baseline. Publishing is pending repository authentication on this host; the configured GitHub credentials are expired. No database migration is required for this cleanup.
