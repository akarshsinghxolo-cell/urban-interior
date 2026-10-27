import { EMBEDDED_REFERENCE_PARENTS } from "../integrity/reference-access";
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
 * Match each issue to its referencing record and relationship, so repairing
 * one row cannot mask an identical broken link introduced on another row.
 * Generated issue IDs are excluded; readable messages remain the INVALID error.
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
    loaded.has(EMBEDDED_REFERENCE_PARENTS[issue.rule.collection] || issue.rule.collection)
    && loaded.has(EMBEDDED_REFERENCE_PARENTS[issue.rule.targetCollection] || issue.rule.targetCollection);
  const issues = (db: RDashDatabase) => checkWorkspaceIntegrity(db).issues.filter(evaluable);
  const key = (issue: IntegrityIssue) => JSON.stringify([
    issue.collection, issue.recordId, issue.field, issue.targetCollection, issue.targetId,
  ]);
  const remaining = new Map<string, number>();
  for (const issue of issues(baseline)) remaining.set(key(issue), (remaining.get(key(issue)) || 0) + 1);
  return issues(candidate).flatMap((issue) => {
    const identity = key(issue);
    const count = remaining.get(identity) || 0;
    if (count > 0) {
      remaining.set(identity, count - 1);
      return [];
    }
    return [issue.message];
  });
}
