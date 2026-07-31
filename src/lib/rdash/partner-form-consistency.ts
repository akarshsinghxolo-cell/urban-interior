export function partnerFormFingerprint(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((entry) => JSON.parse(partnerFormFingerprint(entry))));
  }
  if (value && typeof value === "object") {
    const sorted = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, JSON.parse(partnerFormFingerprint(entry))]),
    );
    return JSON.stringify(sorted);
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function partnerChangedPatch<T extends Record<string, unknown>>(
  before: T,
  after: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) =>
        partnerFormFingerprint(before[key]) !== partnerFormFingerprint(value),
    ),
  ) as Partial<T>;
}
