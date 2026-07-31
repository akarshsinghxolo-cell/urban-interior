const NON_FORM_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "outstanding",
  "reliability_score",
  "on_time_pct",
  "active_jobs",
  "past_jobs_count",
  "performance_recomputed_at",
  "status",
  "category",
  "trade",
  "rating",
  "specializations",
]);

function stableValue(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    const normalized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !NON_FORM_KEYS.has(key))
        .map(([key, entry]) => [key, stableValue(entry)] as const)
        .filter(([, entry]) => entry !== null)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    return Object.keys(normalized).length ? normalized : null;
  }
  return value;
}

export function partnerFormFingerprint(value: unknown): string {
  return JSON.stringify(stableValue(value));
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

export function legacyVendorArticleNames(notes?: string): string[] {
  const line = String(notes || "")
    .split(/\r?\n/)
    .find((entry) => /^Supplies articles:\s*/i.test(entry.trim()));
  return line
    ? line
        .replace(/^Supplies articles:\s*/i, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

export function vendorNotesWithoutLegacyArticles(notes?: string): string {
  return String(notes || "")
    .split(/\r?\n/)
    .filter((entry) => !/^Supplies articles:\s*/i.test(entry.trim()))
    .join("\n")
    .trim();
}

export function vendorLegacyMigrationPatch(
  before: Record<string, unknown>,
  suppliedPatch: Record<string, unknown>,
  articles: Array<{ id: string; name: string }>,
): Record<string, unknown> {
  const patch = { ...suppliedPatch };
  if (Array.isArray(before.article_ids)) return patch;

  const legacyNames = legacyVendorArticleNames(before.notes as string | undefined);
  if (!legacyNames.length) return patch;
  const resolvedIds = legacyNames
    .map(
      (articleName) =>
        articles.find(
          (article) => article.name.toLowerCase() === articleName.toLowerCase(),
        )?.id,
    )
    .filter((articleId): articleId is string => Boolean(articleId));

  if (!("article_ids" in patch) && resolvedIds.length) {
    patch.article_ids = resolvedIds;
  }
  if (
    !("notes" in patch) &&
    resolvedIds.length === legacyNames.length
  ) {
    patch.notes =
      vendorNotesWithoutLegacyArticles(before.notes as string | undefined) ||
      undefined;
  }
  return patch;
}

export function optionalIndianMobileError(value: string): string | null {
  if (!value) return null;
  return /^[6-9]\d{9}$/.test(value)
    ? null
    : "Enter a valid 10-digit Indian mobile number.";
}

export function optionalGstinError(value: string): string | null {
  if (!value) return null;
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(value)
    ? null
    : "Enter a valid 15-character GSTIN.";
}

export function optionalPanError(value: string): string | null {
  if (!value) return null;
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(value)
    ? null
    : "Enter a valid PAN.";
}

export function optionalIfscError(value: string): string | null {
  if (!value) return null;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value)
    ? null
    : "Enter a valid IFSC code.";
}

export function fieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ field: string; before: unknown; after: unknown }> {
  return Object.entries(partnerChangedPatch(before, after)).map(
    ([field, value]) => ({ field, before: before[field], after: value }),
  );
}
