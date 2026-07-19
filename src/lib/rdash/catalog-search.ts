export interface CatalogSearchOption {
    id: string;
    label: string;
    articleName: string;
    categoryName?: string;
    submoduleName?: string;
    unitLabel?: string;
}
function normalize(value: string) {
    return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function scoreOption(option: CatalogSearchOption, query: string) {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery)
        return 1;
    const label = normalize(option.label);
    const article = normalize(option.articleName);
    const tokens = label.split(" ").filter(Boolean);
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    if (label.startsWith(normalizedQuery) || article.startsWith(normalizedQuery))
        return 600;
    if (tokens.some((token) => token.startsWith(normalizedQuery)))
        return 500;
    if (queryTokens.every((part) => tokens.some((token) => token.startsWith(part))))
        return 400;
    if (label.includes(normalizedQuery) || article.includes(normalizedQuery))
        return 300;
    if (queryTokens.every((part) => label.includes(part)))
        return 200;
    return 0;
}
export function searchCatalogOptions(options: CatalogSearchOption[], query: string, limit = 80): CatalogSearchOption[] {
    const normalizedQuery = normalize(query);
    return options
        .map((option) => ({ option, score: scoreOption(option, normalizedQuery) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score ||
        left.option.articleName.localeCompare(right.option.articleName) ||
        left.option.label.localeCompare(right.option.label))
        .slice(0, limit)
        .map((entry) => entry.option);
}
