/**
 * Command palette match scoring.
 *
 * The palette previously ranked every match by groupPriority alone, so typing
 * "Finance" surfaced all seven submodules whose *nav group* is named "Finance"
 * (Commissions, GST Returns, ...) ahead of — and auto-selecting instead of —
 * the actual "Finance" module. Text-match quality must dominate before the
 * group ordering: an exact label match is the user's clearest intent.
 *
 * Score tiers (higher wins; -1 = no match):
 *  100 exact label · 80 label prefix · 60 label substring ·
 *  40 exact group · 30 group prefix · 20 group substring · 10 keywords
 */

export function commandMatchScore(
    item: { label: string; group: string; keywords?: string },
    rawQuery: string,
): number {
    const ql = rawQuery.trim().toLowerCase();
    if (!ql) return -1;
    const label = item.label.toLowerCase();
    if (label === ql) return 100;
    if (label.startsWith(ql)) return 80;
    if (label.includes(ql)) return 60;
    const group = item.group.toLowerCase();
    if (group === ql) return 40;
    if (group.startsWith(ql)) return 30;
    if (group.includes(ql)) return 20;
    if ((item.keywords || "").toLowerCase().includes(ql)) return 10;
    return -1;
}

export function compareCommandMatches(
    a: { matchScore: number; groupPriority: number; label: string },
    b: { matchScore: number; groupPriority: number; label: string },
): number {
    if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
    if (a.groupPriority !== b.groupPriority) return a.groupPriority - b.groupPriority;
    return a.label.localeCompare(b.label);
}
