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
