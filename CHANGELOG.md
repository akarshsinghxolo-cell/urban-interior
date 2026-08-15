# Urban Castle — Changelog

All notable changes to the Urban Castle workspace are documented here.
The signin page reads this file via `/api/changelog` and renders the latest
entries in the "What's new" panel. Entries are ordered newest-first.

The format follows a simplified Keep-a-Changelog convention:
- `FEATURE` — new functionality
- `FIX` — bug fixes
- `POLISH` — styling/UX improvements

---

## v0.4.3 — Aug 2026

- **FIX** — Site photo uploads now wait for confirmed customer/Site persistence before attachment records are committed. Pending browser upload placeholders are excluded from Site payloads, preventing the “attachment does not exist” validation failure.

## v0.4.2 — Jul 2026

- **FEATURE** — "Copy summary" button in the health badge popover. Copies a formatted text summary of workspace health (badge, integrity, attention breakdown, cash, revenue) to the clipboard. Useful for support/debugging/reporting.
- **POLISH** — ActivityFeedWidget mobile spacing pass. Larger avatars (36px), more padding (12px), larger text + kind icons on mobile. Fixes the "cramped on mobile" issue.
- **POLISH** — Empty states for zero-count ExceptionDashboard tabs. Zero tabs now show "—" instead of "0" with a muted color + tooltip.

## v0.4.1 — Jul 2026

- **FEATURE** — Rich shadcn Tooltips on all health-widget metric chips + refresh button + integrity button. The integrity tooltip explains "rec = records, refs = references" + the 178 FK rules.
- **POLISH** — Health ribbon horizontal-scroll on mobile. Chips stay on one row (22px tall, was 230px) instead of wrapping. Desktop still wraps normally.
- **FIX** — Keyboard-shortcuts button hidden on mobile (less relevant on touch; still in "More" dropdown).
- **FEATURE** — "synced Xs ago" freshness indicator in the greeting (green dot + relative time), so users know the data is current.

## v0.4.0 — Jul 2026

- **FEATURE** — ActivityFeedWidget: compact premium card showing the last 6 audit-log entries with actor avatars, kind icons, entity badges, relative timestamps, click-to-deep-link. Live pulsing indicator on the most recent entry.
- **FEATURE** — Health-aware greeting badge. The greeting shows a contextual, clickable badge (green "All clear" / amber "N to review" / red "N need attention") that opens a mini health-summary popover.
- **FEATURE** — Login toast deep-linking. The "Workspace needs attention" toast action now prioritizes the most urgent module ("Open Integrity" / "Open Recovery" / "Open Finance" / "Open Blockers").

## v0.3.9 — Jul 2026

- **FIX** — tracking/ping 403 spam. Client now treats demo-mode `ignored: true` as success + treats 401/403 as terminal (no infinite retry loop).
- **FEATURE** — Health badge popover "last updated" + manual refresh button.
- **FEATURE** — ActivityFeedWidget new-entry animation (slide-in + green flash).
- **FIX** — Critical `ReferenceError: display is not defined` crash in WorkspacePulseStrip's useCountUp hook (accidentally removed useState line).

## v0.3.8 — Jul 2026

- **FIX** — Removed redundant WorkspaceHealthWidget from WorkdeskDashboard (kept only on Daily Work, the default landing).
- **FEATURE** — ActivityFeedWidget live indicator: pulsing green dot on header icon + count badge + first-item highlight/avatar pulse/LIVE tag.
- **FEATURE** — Health badge popover with mini health summary (integrity score, 6-stat grid, cash position, Open button).

## v0.3.7 — Jul 2026

- **FEATURE** — Login welcome toast + workspace health banner. On login: "Good morning, {name}" toast, then a contextual health toast (warning if attention/integrity/overdue/cash issues, success if healthy).
- **POLISH** — WorkspacePulseStrip KPI tile polish. Stronger hover lift, shadow progression, radial gradient overlay, icon scale-110 on hover.
- **FEATURE** — 7-day revenue sparkline on the health widget's "month" chip. Extended /api/health/summary with revenueSeries.

## v0.3.6 — Jul 2026

- **FIX** — Keyboard shortcuts dropdown item was broken (dispatched `⌘/` which the listener rejected). Now dispatches `?`.
- **FEATURE** — Discoverable `?` keyboard-shortcuts button in the workspace header.
- **FEATURE** — WorkspaceHealthWidget added to the Daily Work module (default landing page).
- **FEATURE** — /api/health/summary extended with financial metrics (cashPosition, monthRevenue, overdueInvoiceValue, pendingVendorBillValue).
- **FEATURE** — 4 financial chips on the WorkspaceHealthWidget + manual refresh button.

## v0.3.5 — Jul 2026

- **FIX** — Signin error permanently fixed. Added a dev-fallback secret in auth.ts so the app always works in dev/preview even if .env is wiped.
- **FEATURE** — /api/health/config endpoint + configuration health panel on signin.
- **FEATURE** — Always-visible demo owner button on signin.

## v0.3.4 — Jul 2026

- **FEATURE** — Data Integrity module (cascade-delete, auto-repair, 178 FK rules, health score gauge). Seed data fixed to achieve 100/100 integrity on fresh load.

## v0.3.0 — Jul 2026

- **FEATURE** — /api/health/summary endpoint + WorkspaceHealthWidget on the Workdesk Dashboard. Color-coded health badge, 6 metric chips, last-activity card, integrity deep-link.
- **POLISH** — Premium signin redesign with split-screen layout (branded left hero + right auth card + "What's new" changelog panel).
