import { checkWorkspaceIntegrity } from "../integrity/checker";
import type { IntegrityIssue, RDashDatabase } from "../types";

/**
 * Returns only validation issues introduced by a candidate mutation.
 * Existing production defects remain visible to integrity tooling, but they do
 * not prevent an unrelated, otherwise valid edit from being saved.
 */
export function introducedIntegrityIssues(
  baselineIssues: string[],
  candidateIssues: string[],
): string[] {
  const remainingBaseline = new Map<string, number>();
  for (const issue of baselineIssues) {
    remainingBaseline.set(issue, (remainingBaseline.get(issue) || 0) + 1);
  }

  const introduced: string[] = [];
  for (const issue of candidateIssues) {
    const remaining = remainingBaseline.get(issue) || 0;
    if (remaining > 0) {
      remainingBaseline.set(issue, remaining - 1);
    } else {
      introduced.push(issue);
    }
  }
  return introduced;
}

/**
 * Registry-driven dangling-reference delta for commit validation: returns the
 * foreign-key issues the candidate introduces relative to the baseline. The
 * issue message doubles as the multiset key — it is deterministic across
 * checker runs (no generated ids) and readable enough to surface directly in
 * the commit's INVALID error.
 *
 * `fullCollections` must list the collections that were loaded WITHOUT row
 * limits. Rules whose child or parent collection is missing from that set are
 * skipped — a partial (row-targeted) domain cannot distinguish a true orphan
 * from a parent row that simply was not loaded.
 */
export function introducedFkIntegrityIssues(
  baseline: RDashDatabase,
  candidate: RDashDatabase,
  fullCollections: readonly string[],
): string[] {
  const loaded = new Set(fullCollections);
  const evaluable = (issue: IntegrityIssue) =>
    loaded.has(issue.rule.collection) && loaded.has(issue.rule.targetCollection);
  const issueMessages = (db: RDashDatabase) =>
    checkWorkspaceIntegrity(db).issues.filter(evaluable).map((issue) => issue.message);
  return introducedIntegrityIssues(issueMessages(baseline), issueMessages(candidate));
}
