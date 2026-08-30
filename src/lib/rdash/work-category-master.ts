import type { Customer } from "./types";
import { normalizeCustomerRow } from "./customer-record";
import sourceCategories from "@/data/work-category-master.json";
import { normalizeStorageMaster } from "./storage";
import type { Article, ArticleVariant, LineItem, Master, MasterUnit, RDashDatabase, VendorRate, WorkCategory, WorkRequiredArticle, WorkSubcategory, } from "./types";
import { defaultWorkTypeId, normalizeWorkSubcategoryWorkTypes, workTypesForSubcategory } from "./work-types";
export const WORK_CATALOG_VERSION = "1.0.0";
type CatalogMaterial = {
    n: string;
    u?: string;
    r?: number;
    v?: string;
    p?: string;
};
type CatalogItem = {
    id: string;
    name: string;
    unit: string;
    matRate?: number;
    labRate?: number;
    notes?: string;
    mats?: CatalogMaterial[];
};
type CatalogCategory = {
    id: string;
    name: string;
    items: CatalogItem[];
};
const raw = sourceCategories as CatalogCategory[];
const timestamp = "2026-06-27T00:00:00.000Z";
const unitDefinitions: Array<[
    string,
    string,
    NonNullable<MasterUnit["family"]>
]> = [
    ["sqft", "Square feet", "area"],
    ["rft", "Running feet", "length"],
    ["pcs", "Pieces", "count"],
    ["kg", "Kilograms", "weight"],
    ["ltr", "Litres", "volume"],
    ["box", "Box", "package"],
    ["roll", "Roll", "package"],
    ["bag", "Bag", "package"],
    ["set", "Set", "count"],
    ["sheet", "Sheet", "count"],
    ["nos", "Numbers", "count"],
    ["mtr", "Metres", "length"],
    ["cft", "Cubic feet", "volume"],
    ["pair", "Pair", "count"],
    ["tube", "Tube", "package"],
    ["unit", "Unit", "count"],
    ["workOrder", "WorkOrder", "other"],
];
export function normalizeCatalogName(value: string | undefined) {
    return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
export function resolveUnitId(value: string | undefined) {
    const normalized = normalizeCatalogName(value).replace(/\./g, "");
    const aliases: Record<string, string> = {
        piece: "pcs", pieces: "pcs", pc: "pcs", pcs: "pcs",
        number: "nos", numbers: "nos", nos: "nos",
        litre: "ltr", litres: "ltr", liter: "ltr", liters: "ltr",
        meter: "mtr", meters: "mtr", metre: "mtr", metres: "mtr",
        "sq ft": "sqft", "square foot": "sqft", "square feet": "sqft", sft: "sqft",
        "cu ft": "cft", "cubic foot": "cft", "cubic feet": "cft",
        "running foot": "rft", "running feet": "rft", feet: "rft", foot: "rft", ft: "rft",
        pairs: "pair", tubes: "tube", units: "unit",
    };
    return aliases[normalized] || normalized || "pcs";
}
export type CatalogCore = Pick<Master, "catalog_version" | "units" | "workCategories" | "workSubcategories" | "articles" | "articleVariants" | "subcategoryArticleMap" | "workOptionGroups" | "workOptionValues">;
export function buildWorkCategoryCatalog(): CatalogCore {
    const units: MasterUnit[] = unitDefinitions.map(([id, name, family]) => ({ id, symbol: id, name, family }));
    const unitIds = new Set(units.map((unit) => unit.id));
    const ensureUnit = (symbol: string | undefined) => {
        const id = resolveUnitId(symbol);
        if (!unitIds.has(id)) {
            units.push({ id, symbol: id, name: id.toUpperCase(), family: "other" });
            unitIds.add(id);
        }
        return id;
    };
    const workCategories: WorkCategory[] = raw.map((category, index) => ({
        id: category.id,
        name: category.name,
        sort_order: index,
        created_at: timestamp,
        updated_at: timestamp,
    }));
    const workSubcategories: WorkSubcategory[] = [];
    const articles: Article[] = [];
    const subcategoryArticleMap: WorkRequiredArticle[] = [];
    const articleByName = new Map<string, Article>();
    raw.forEach((category) => {
        category.items.forEach((item) => {
            const subcategory: WorkSubcategory = {
                id: item.id,
                category_id: category.id,
                name: item.name,
                unit_id: ensureUnit(item.unit),
                work_types: [{
                    id: defaultWorkTypeId(item.id),
                    name: "Standard",
                    unit_id: ensureUnit(item.unit),
                    notes: item.notes || "",
                    created_at: timestamp,
                    updated_at: timestamp,
                }],
                notes: item.notes || "",
                work_required_article_ids: [],
                created_at: timestamp,
                updated_at: timestamp,
            };
            (item.mats || []).forEach((material, materialIndex) => {
                const normalized = normalizeCatalogName(material.n);
                let article = articleByName.get(normalized);
                const unitId = ensureUnit(material.u || item.unit);
                if (!article) {
                    article = {
                        id: `article_${articles.length + 1}`,
                        name: material.n,
                        normalized_name: normalized,
                        category_id: category.id,
                        unit_id: unitId,
                        default_unit_id: unitId,
                        base_rate: Number(material.r || 0),
                        variant_ids: [],
                        created_at: timestamp,
                        updated_at: timestamp,
                    };
                    articleByName.set(normalized, article);
                    articles.push(article);
                }
                const row: WorkRequiredArticle = {
                    id: `wia_${item.id}_${materialIndex + 1}`,
                    work_required_id: item.id,
                    article_id: article.id,
                    unit_id: unitId,
                    reference_rate: Number(material.r || 0),
                    variation_note: material.v || "",
                    product_note: material.p || "",
                    created_at: timestamp,
                    updated_at: timestamp,
                };
                subcategory.work_required_article_ids!.push(row.id);
                subcategoryArticleMap.push(row);
            });
            workSubcategories.push(subcategory);
        });
    });
    return {
        catalog_version: WORK_CATALOG_VERSION,
        units,
        workCategories,
        workSubcategories,
        articles,
        articleVariants: [],
        subcategoryArticleMap,
        workOptionGroups: [],
        workOptionValues: [],
    };
}
function ensureMediaCollections(input: Master): Master {
    return {
        ...input,
        storageAccounts: input.storageAccounts || [],
        storageFolderTemplates: input.storageFolderTemplates || [],
        storageFolderInstances: input.storageFolderInstances || [],
        fileAssets: input.fileAssets || [],
        catalogues: input.catalogues || [],
        catalogueArticleVendorLinks: input.catalogueArticleVendorLinks || [],
        pinterestBoards: input.pinterestBoards || [],
        referenceMedia: input.referenceMedia || [],
    };
}
export function normalizeCatalogMaster(input: Master): Master {
    const storageNormalized = normalizeStorageMaster(ensureMediaCollections(input));
    const normalizedInput: Master = {
        ...storageNormalized,
        workSubcategories: Array.isArray(storageNormalized.workSubcategories)
            ? storageNormalized.workSubcategories.map(normalizeWorkSubcategoryWorkTypes)
            : [],
    };
    if (normalizedInput.catalog_version === WORK_CATALOG_VERSION &&
        Array.isArray(normalizedInput.units) &&
        Array.isArray(normalizedInput.workCategories) &&
        Array.isArray(normalizedInput.workSubcategories) &&
        Array.isArray(normalizedInput.articles) &&
        Array.isArray(normalizedInput.articleVariants) &&
        Array.isArray(normalizedInput.subcategoryArticleMap)) {
        return normalizedInput;
    }
    const catalog = buildWorkCategoryCatalog();
    const fresh: Master = {
        ...normalizedInput,
        ...catalog,
        vendors: normalizedInput.vendors || [],
        contractors: normalizedInput.contractors || [],
        staff: normalizedInput.staff || [],
        sourcePartners: normalizedInput.sourcePartners || [],
        commissionRules: normalizedInput.commissionRules || [],
        contractorRates: normalizedInput.contractorRates || [],
        customerRateSuggestions: normalizedInput.customerRateSuggestions || [],
        vendorRates: [],
        vendorRateHistories: normalizedInput.vendorRateHistories || [],
    };
    const validArticleIds = new Set(fresh.articles.map((article) => article.id));
    const validVariantIds = new Set(fresh.articleVariants.map((variant) => variant.id));
    const reconciled = (normalizedInput.vendorRates || []).filter((rate) =>
        validArticleIds.has(rate.article_id)
        && (!rate.variant_id || validVariantIds.has(rate.variant_id))
        && (!rate.variant_id || fresh.articleVariants.some((variant) => variant.id === rate.variant_id && variant.article_id === rate.article_id))
    ).map((rate) => ({
        ...rate,
        status: rate.status === "inactive" ? "inactive" as const : "active" as const,
        created_at: rate.created_at || rate.updated_at || timestamp,
        updated_at: rate.updated_at || timestamp,
    }));
    fresh.vendorRates = reconciled;
    return fresh;
}
function repairLineItem(item: LineItem, master: Master): LineItem {
    const validArticleIds = new Set(master.articles.map((article) => article.id));
    const validMapIds = new Set(master.subcategoryArticleMap.map((row) => row.id));
    const validVariantIds = new Set(master.articleVariants.map((variant) => variant.id));
    const validUnits = new Set(master.units.map((unit) => unit.id));
    const next = { ...item };
    if (next.article_id && !validArticleIds.has(next.article_id))
        next.article_id = undefined;
    if (next.work_required_article_id && !validMapIds.has(next.work_required_article_id))
        next.work_required_article_id = undefined;
    if (next.variant_id && !validVariantIds.has(next.variant_id))
        next.variant_id = undefined;
    if (next.unit_id && !validUnits.has(next.unit_id))
        next.unit_id = undefined;
    if (next.work_required_article_id) {
        const row = master.subcategoryArticleMap.find((entry) => entry.id === next.work_required_article_id);
        if (row) {
            next.article_id = row.article_id;
            const work = master.workSubcategories.find((entry) => entry.id === row.work_required_id);
            if (work && !next.category_id)
                next.category_id = work.category_id;
            const variant = next.variant_id ? master.articleVariants.find((entry) => entry.id === next.variant_id) : undefined;
            next.unit_id = variant?.unit_id || row.unit_id;
            next.unit_name = master.units.find((unit) => unit.id === next.unit_id)?.name || next.unit_name;
        }
    }
    return next;
}
function normalizeCustomers(rows: unknown): Customer[] {
    if (!Array.isArray(rows))
        return [];
    return rows.map((row) => normalizeCustomerRow(row));
}
export function prepareWorkspaceData(db: Partial<RDashDatabase>): RDashDatabase {
    const master = normalizeCatalogMaster(db.master || ({} as Master));
    const safe = <T,>(xs: T[] | undefined | null): T[] => (Array.isArray(xs) ? xs : []);
    return {
        ...(db as RDashDatabase),
        master,
        customers: normalizeCustomers(db.customers),
        sites: safe(db.sites),
        areas: safe(db.areas),
        contractorBids: safe(db.contractorBids),
        contractorSettlements: safe(db.contractorSettlements),
        drawings: safe(db.drawings),
        executionLogs: safe(db.executionLogs),
        entityFileAttachments: safe(db.entityFileAttachments),
        entityReferenceAssignments: safe(db.entityReferenceAssignments),
        quotations: safe(db.quotations).map((quote) => ({ ...quote, scope_lines: safe(quote.scope_lines).map((item) => repairLineItem(item, master)), items: quote.items?.map((item) => repairLineItem(item, master)) })),
        boqs: safe(db.boqs).map((boq) => ({ ...boq, items: safe(boq.items).map((item) => repairLineItem(item, master)) })),
        purchaseOrders: safe(db.purchaseOrders).map((po) => ({ ...po, items: safe(po.items).map((item) => repairLineItem(item, master)) })),
        grns: safe(db.grns).map((grn) => ({ ...grn, items: safe(grn.items).map((item) => repairLineItem(item, master)) })),
        dispatches: safe(db.dispatches).map((dispatch) => ({ ...dispatch, items: safe(dispatch.items).map((item) => repairLineItem(item, master)) })),
        inventory: safe(db.inventory).map((item) => ({ ...item, article_id: item.article_id && master.articles.some((article) => article.id === item.article_id) ? item.article_id : undefined, unit_id: item.unit_id && master.units.some((unit) => unit.id === item.unit_id) ? item.unit_id : undefined })),
        stockMovements: safe(db.stockMovements).map((item) => ({ ...item, article_id: item.article_id && master.articles.some((article) => article.id === item.article_id) ? item.article_id : undefined })),
    };
}
export type CatalogIssue = {
    severity: "error" | "warning";
    message: string;
};
export function getCatalogIssues(master: Master): CatalogIssue[] {
    const issues: CatalogIssue[] = [];
    const units = new Set(master.units.map((unit) => unit.id));
    const categories = new Set(master.workCategories.map((category) => category.id));
    const scopeLines = new Set(master.workSubcategories.map((item) => item.id));
    const articles = new Set(master.articles.map((article) => article.id));
    const maps = new Set(master.subcategoryArticleMap.map((row) => row.id));
    const variants = new Set(master.articleVariants.map((variant) => variant.id));
    const categoryNames = new Set<string>();
    master.workCategories.forEach((category) => {
        const key = normalizeCatalogName(category.name);
        if (!key)
            issues.push({ severity: "error", message: "A work category has no name." });
        if (categoryNames.has(key))
            issues.push({ severity: "error", message: `Duplicate work category: ${category.name}.` });
        categoryNames.add(key);
    });
    const workNames = new Set<string>();
    master.workSubcategories.forEach((item) => {
        const key = `${item.category_id}:${normalizeCatalogName(item.name)}`;
        if (!categories.has(item.category_id))
            issues.push({ severity: "error", message: `Submodule ${item.name} has no valid category.` });
        if (!item.unit_id || !units.has(item.unit_id))
            issues.push({ severity: "error", message: `Submodule ${item.name} has an invalid unit.` });
        const workTypeNames = new Set<string>();
        for (const workType of workTypesForSubcategory(item)) {
            const workTypeName = normalizeCatalogName(workType.name);
            if (!workTypeName)
                issues.push({ severity: "error", message: `Submodule ${item.name} has an unnamed work type.` });
            if (workTypeNames.has(workTypeName))
                issues.push({ severity: "error", message: `Submodule ${item.name} contains duplicate work type ${workType.name}.` });
            if (!workType.unit_id || !units.has(workType.unit_id))
                issues.push({ severity: "error", message: `Work type ${workType.name} in ${item.name} has an invalid unit.` });
            workTypeNames.add(workTypeName);
        }
        if (workNames.has(key))
            issues.push({ severity: "error", message: `Duplicate submodule in one category: ${item.name}.` });
        workNames.add(key);
    });
    const articleNames = new Set<string>();
    master.articles.forEach((article) => {
        const key = article.normalized_name || normalizeCatalogName(article.name);
        if (!article.default_unit_id || !units.has(article.default_unit_id))
            issues.push({ severity: "error", message: `Article ${article.name} has an invalid default unit.` });
        if (articleNames.has(key))
            issues.push({ severity: "error", message: `Duplicate canonical article: ${article.name}.` });
        articleNames.add(key);
    });
    const mapKeys = new Set<string>();
    master.subcategoryArticleMap.forEach((row) => {
        if (!scopeLines.has(row.work_required_id))
            issues.push({ severity: "error", message: `Scoped material ${row.id} has no valid submodule.` });
        if (!articles.has(row.article_id))
            issues.push({ severity: "error", message: `Scoped material ${row.id} has no valid canonical article.` });
        if (!units.has(row.unit_id))
            issues.push({ severity: "error", message: `Scoped material ${row.id} has an invalid unit.` });
        const key = `${row.work_required_id}:${row.article_id}`;
        if (mapKeys.has(key))
            issues.push({ severity: "error", message: "One submodule contains the same canonical material twice." });
        mapKeys.add(key);
    });
    const variantKeys = new Set<string>();
    master.articleVariants.forEach((variant) => {
        if (!articles.has(variant.article_id))
            issues.push({ severity: "error", message: `Variant ${variant.name} has no valid canonical article.` });
        if (variant.unit_id && !units.has(variant.unit_id))
            issues.push({ severity: "error", message: `Variant ${variant.name} has an invalid unit.` });
        const key = `${variant.article_id}:${normalizeCatalogName(variant.name)}`;
        if (variantKeys.has(key))
            issues.push({ severity: "error", message: `Duplicate variant: ${variant.name}.` });
        variantKeys.add(key);
    });
    master.vendorRates.forEach((rate) => {
        if (!articles.has(rate.article_id))
            issues.push({ severity: "error", message: `Vendor rate ${rate.id} points to a missing article.` });
        if (rate.variant_id && !variants.has(rate.variant_id))
            issues.push({ severity: "error", message: `Vendor rate ${rate.id} points to a missing variant.` });
        if (rate.variant_id) {
            const variant = master.articleVariants.find((row) => row.id === rate.variant_id);
            if (variant && variant.article_id !== rate.article_id)
                issues.push({ severity: "error", message: `Vendor rate ${rate.id} variant belongs to a different article.` });
        }
    });
    return issues;
}
export const catalogCounts = {
    categories: raw.length,
    scopeLines: raw.reduce((sum, category) => sum + category.items.length, 0),
    sourceMaterialRows: raw.reduce((sum, category) => sum + category.items.reduce((inner, item) => inner + (item.mats || []).length, 0), 0),
};
