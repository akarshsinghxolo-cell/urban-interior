"use client";
import * as React from "react";
import { AlertTriangle, Boxes, ChevronDown, ChevronRight, ClipboardCheck, Download, FilePlus2, Layers3, Link2, PackagePlus, Pencil, Plus, Ruler, Search, Settings2, Tags, Trash2, Wrench, } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { Article, ArticleVariant, Master, MasterUnit, WorkCategory, WorkRequiredArticle, WorkSubcategory, WorkTypeRate } from "@/lib/rdash/types";
import { resolveUnitId, catalogCounts, getCatalogIssues, normalizeCatalogName, } from "@/lib/rdash/work-category-master";
import { createWorkTypeId, defaultWorkTypeId, normalizeWorkSubcategoryWorkTypes, workTypesForSubcategory } from "@/lib/rdash/work-types";
import { contractorWorkTypeAverages } from "@/lib/rdash/contractor-profile";
import { confirmDialog } from "../ConfirmDialog";
import { MetricCard, EmptyState, StatusBadge } from "../primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
export type WorkCategoryMasterView = "catalogue" | "articles" | "variants" | "units" | "integrity";
type Props = {
    initialView?: WorkCategoryMasterView;
};
type DraftWork = {
    categoryId: string;
    name: string;
    workTypeName: string;
    unitId: string;
    notes: string;
};
type DraftMaterial = {
    mode: "existing" | "new";
    articleId: string;
    name: string;
    unitId: string;
    referenceRate: string;
    variationNote: string;
    productNote: string;
};
type DraftVariant = {
    name: string;
    sku: string;
    unitId: string;
    brand: string;
    grade: string;
    packSize: string;
    thickness: string;
    size: string;
    finish: string;
    color: string;
    series: string;
};
type DraftUnit = {
    symbol: string;
    name: string;
    family: NonNullable<MasterUnit["family"]>;
};
const viewMeta: Record<WorkCategoryMasterView, {
    label: string;
    icon: React.ReactNode;
}> = {
    catalogue: { label: "Category", icon: <Layers3 className="h-3.5 w-3.5"/> },
    articles: { label: "Article Library", icon: <Boxes className="h-3.5 w-3.5"/> },
    variants: { label: "Variants", icon: <Tags className="h-3.5 w-3.5"/> },
    units: { label: "Units", icon: <Ruler className="h-3.5 w-3.5"/> },
    integrity: { label: "Integrity", icon: <ClipboardCheck className="h-3.5 w-3.5"/> },
};
function iso() {
    return new Date().toISOString();
}
function id(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function amount(value: string | number | undefined) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function unitLabel(master: Master, unitId?: string) {
    const unit = master.units.find((entry) => entry.id === unitId);
    return unit ? `${unit.symbol} · ${unit.name}` : unitId || "No unit";
}
function articleFor(master: Master, articleId?: string | null) {
    return master.articles.find((article) => article.id === articleId);
}
function scopeFor(master: Master, scopeId?: string | null) {
    return master.subcategoryArticleMap.find((row) => row.id === scopeId);
}
function workFor(master: Master, workId?: string | null) {
    return master.workSubcategories.find((item) => item.id === workId);
}
function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
    const csv = rows
        .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
function Field({ label, children, hint }: {
    label: string;
    children: React.ReactNode;
    hint?: string;
}) {
    return (<label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
      {hint ? <span className="font-normal text-[10px] leading-relaxed text-muted-foreground/80">{hint}</span> : null}
    </label>);
}
function NativeSelect(props: React.ComponentProps<"select">) {
    return <select {...props} className={cn("h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50", props.className)}/>;
}
export function WorkCategoryMasterModule({ initialView = "catalogue" }: Props) {
    const db = useRDashStore((s) => s.db);
    const mutateMaster = useRDashStore((s) => s.mutateMaster);
    const master = db.master;
    const [view, setView] = React.useState<WorkCategoryMasterView>(initialView);
    const [query, setQuery] = React.useState("");
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => ({ [master.workCategories[0]?.id || ""]: true }));
    const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
    const [workDialogCategoryId, setWorkDialogCategoryId] = React.useState<string | null>(null);
    const [materialWorkId, setMaterialWorkId] = React.useState<string | null>(null);
    const [variantArticleId, setVariantArticleId] = React.useState<string | null>(null);
    const [unitDialogOpen, setUnitDialogOpen] = React.useState(false);
    const [articleDialogOpen, setArticleDialogOpen] = React.useState(false);
    React.useEffect(() => setView(initialView), [initialView]);
    const workByCategory = React.useMemo(() => {
        const map = new Map<string, WorkSubcategory[]>();
        master.workSubcategories.forEach((item) => map.set(item.category_id, [...(map.get(item.category_id) || []), item]));
        return map;
    }, [master.workSubcategories]);
    const scopesByWork = React.useMemo(() => {
        const map = new Map<string, WorkRequiredArticle[]>();
        master.subcategoryArticleMap.forEach((row) => map.set(row.work_required_id, [...(map.get(row.work_required_id) || []), row]));
        return map;
    }, [master.subcategoryArticleMap]);
    const variantsByArticle = React.useMemo(() => {
        const map = new Map<string, ArticleVariant[]>();
        master.articleVariants.forEach((variant) => map.set(variant.article_id, [...(map.get(variant.article_id) || []), variant]));
        return map;
    }, [master.articleVariants]);
    const scopeCount = master.subcategoryArticleMap.length;
    const uniqueMaterialCount = master.articles.length;
    const issues = React.useMemo(() => getCatalogIssues(master), [master]);
    const filteredCategories = React.useMemo(() => {
        const needle = normalizeCatalogName(query);
        if (!needle)
            return master.workCategories;
        return master.workCategories.filter((category) => {
            if (normalizeCatalogName(category.name).includes(needle))
                return true;
            return (workByCategory.get(category.id) || []).some((work) => {
                if (normalizeCatalogName(work.name).includes(needle) || normalizeCatalogName(work.notes).includes(needle) || workTypesForSubcategory(work).some((workType) => normalizeCatalogName(`${workType.name} ${workType.notes}`).includes(needle)))
                    return true;
                return (scopesByWork.get(work.id) || []).some((row) => normalizeCatalogName(articleFor(master, row.article_id)?.name).includes(needle));
            });
        });
    }, [master, query, scopesByWork, workByCategory]);
    const updateMaster = React.useCallback((updater: (current: Master) => Master) => mutateMaster(updater), [mutateMaster]);
    function addCategory(name: string) {
        const clean = name.trim();
        if (!clean)
            return toast.error("Work category name is required.");
        if (master.workCategories.some((category) => normalizeCatalogName(category.name) === normalizeCatalogName(clean))) {
            return toast.error("A work category with this name already exists.");
        }
        const now = iso();
        const category: WorkCategory = { id: id("cat"), name: clean, sort_order: master.workCategories.length, created_at: now, updated_at: now };
        updateMaster((current) => ({ ...current, workCategories: [...current.workCategories, category] }));
        setExpanded((current) => ({ ...current, [category.id]: true }));
        toast.success("Work category added.");
    }
    function updateCategory(categoryId: string, patch: Partial<WorkCategory>) {
        const clean = patch.name === undefined ? undefined : patch.name.trim();
        if (clean !== undefined && !clean)
            return toast.error("Work category name is required.");
        if (clean && master.workCategories.some((category) => category.id !== categoryId && normalizeCatalogName(category.name) === normalizeCatalogName(clean))) {
            return toast.error("A work category with this name already exists.");
        }
        updateMaster((current) => ({ ...current, workCategories: current.workCategories.map((category) => category.id === categoryId ? { ...category, ...patch, name: clean ?? category.name, updated_at: iso() } : category) }));
    }
    async function removeCategory(categoryId: string) {
        const category = master.workCategories.find((entry) => entry.id === categoryId);
        const works = master.workSubcategories.filter((entry) => entry.category_id === categoryId);
        if (!category) return;
        const ok = await confirmDialog({
            title: `Remove ${category.name}`,
            description: `${works.length} sub categories and their scoped material rows will be removed. Historical transaction labels remain, but stale master links are cleared.`,
            confirmLabel: "Remove",
            danger: true,
        });
        if (!ok) return;
        const workIds = new Set(works.map((work) => work.id));
        const scopeIds = new Set(master.subcategoryArticleMap.filter((row) => workIds.has(row.work_required_id)).map((row) => row.id));
        updateMaster((current) => {
            const candidateArticleIds = new Set(current.subcategoryArticleMap
                .filter((row) => scopeIds.has(row.id))
                .map((row) => row.article_id));
            const remainingScopes = current.subcategoryArticleMap.filter((row) => !scopeIds.has(row.id));
            const remainingArticleIds = new Set(remainingScopes.map((row) => row.article_id));
            const removedArticleIds = new Set([...candidateArticleIds].filter((articleId) => !remainingArticleIds.has(articleId)));
            return {
                ...current,
                workCategories: current.workCategories.filter((entry) => entry.id !== categoryId),
                workSubcategories: current.workSubcategories.filter((entry) => !workIds.has(entry.id)),
                subcategoryArticleMap: remainingScopes,
                vendorRates: current.vendorRates.filter((rate) => !removedArticleIds.has(rate.article_id)),
                articleVariants: current.articleVariants.filter((variant) => !removedArticleIds.has(variant.article_id)),
                articles: current.articles.filter((article) => !removedArticleIds.has(article.id)),
            };
        });
        toast.success("Category and dependent catalogue rows removed.");
    }
    function addWorkItem(draft: DraftWork) {
        const clean = draft.name.trim();
        if (!clean || !draft.categoryId)
            return toast.error("Sub category name and category are required.");
        if (master.workSubcategories.some((item) => item.category_id === draft.categoryId && normalizeCatalogName(item.name) === normalizeCatalogName(clean))) {
            return toast.error("This category already has a sub category with this name.");
        }
        const now = iso();
        const workId = id("work");
        const item: WorkSubcategory = {
            id: workId,
            category_id: draft.categoryId,
            name: clean,
            unit_id: draft.unitId || "sqft",
            work_types: [{
                id: defaultWorkTypeId(workId),
                name: draft.workTypeName.trim() || "Standard",
                unit_id: draft.unitId || "sqft",
                notes: draft.notes.trim() || undefined,
                created_at: now,
                updated_at: now,
            }],
            notes: draft.notes.trim(),
            work_required_article_ids: [],
            created_at: now,
            updated_at: now,
        };
        updateMaster((current) => ({ ...current, workSubcategories: [...current.workSubcategories, item] }));
        setExpanded((current) => ({ ...current, [draft.categoryId]: true }));
        toast.success("Sub category added with its canonical execution unit.");
    }
    function updateWorkItem(workId: string, patch: Partial<WorkSubcategory>) {
        const existing = master.workSubcategories.find((entry) => entry.id === workId);
        if (!existing)
            return;
        const clean = patch.name === undefined ? undefined : patch.name.trim();
        if (clean !== undefined && !clean)
            return toast.error("Sub category name is required.");
        if (clean && master.workSubcategories.some((item) => item.id !== workId && item.category_id === existing.category_id && normalizeCatalogName(item.name) === normalizeCatalogName(clean))) {
            return toast.error("Duplicate sub category in the same category.");
        }
        updateMaster((current) => ({
            ...current,
            workSubcategories: current.workSubcategories.map((item) => item.id === workId ? { ...item, ...patch, name: clean ?? item.name, updated_at: iso() } : item),
        }));
    }
    function addWorkType(workId: string) {
        const work = workFor(master, workId);
        if (!work) return;
        const existingNames = new Set(workTypesForSubcategory(work).map((row) => normalizeCatalogName(row.name)));
        let suffix = 1;
        let name = "New work type";
        while (existingNames.has(normalizeCatalogName(name))) name = `New work type ${++suffix}`;
        const now = iso();
        const workType: WorkTypeRate = {
            id: createWorkTypeId(workId, name),
            name,
            unit_id: workTypesForSubcategory(work)[0]?.unit_id || work.unit_id || "pcs",
            created_at: now,
            updated_at: now,
        };
        updateMaster((current) => ({
            ...current,
            workSubcategories: current.workSubcategories.map((row) => row.id === workId
                ? { ...normalizeWorkSubcategoryWorkTypes(row), work_types: [...workTypesForSubcategory(row), workType], updated_at: now }
                : row),
        }));
        toast.success("Work type added. Contractor quotes will supply its average rates.");
    }
    function updateWorkType(workId: string, workTypeId: string, patch: Partial<WorkTypeRate>) {
        const work = workFor(master, workId);
        if (!work) return;
        const existing = workTypesForSubcategory(work).find((row) => row.id === workTypeId);
        if (!existing) return;
        const cleanName = patch.name === undefined ? undefined : patch.name.trim();
        if (cleanName !== undefined && !cleanName) return toast.error("Work type name is required.");
        if (cleanName && workTypesForSubcategory(work).some((row) => row.id !== workTypeId && normalizeCatalogName(row.name) === normalizeCatalogName(cleanName))) {
            return toast.error("This sub category already has that work type.");
        }
        const nextPatch = { ...patch, name: cleanName ?? existing.name, updated_at: iso() };
        updateMaster((current) => ({
            ...current,
            workSubcategories: current.workSubcategories.map((row) => row.id === workId ? {
                ...normalizeWorkSubcategoryWorkTypes(row),
                work_types: workTypesForSubcategory(row).map((workType) => workType.id === workTypeId ? { ...workType, ...nextPatch } : workType),
                updated_at: iso(),
            } : row),
            contractors: current.contractors.map((contractor) => ({
                ...contractor,
                work_capabilities: contractor.work_capabilities?.map((capability) => capability.subcategory_id === workId ? {
                    ...capability,
                    work_type_rates: capability.work_type_rates?.map((rate) => rate.work_type_id === workTypeId ? { ...rate, work_type_name: cleanName ?? rate.work_type_name } : rate),
                } : capability),
            })),
            contractorRates: current.contractorRates.map((rate) => rate.work_subcategory_id === workId && rate.work_type_id === workTypeId ? {
                ...rate,
                work_type_name: cleanName ?? rate.work_type_name,
                trade: cleanName ? `${work.name} · ${cleanName}` : rate.trade,
                unit_id: patch.unit_id ?? rate.unit_id,
            } : rate),
        }));
        const changes = (["material_rate", "labour_rate"] as const).flatMap((field) => patch[field] !== undefined && patch[field] !== existing[field]
            ? [{ id: `ch-${Date.now()}-${field}`, field: `work_types.${workTypeId}.${field}`, before: existing[field], after: patch[field] }]
            : []);
        if (changes.length) {
            const actor = useRDashStore.getState().currentUser();
            useRDashStore.getState().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Work type rate edited: ${work.name} · ${existing.name}`,
                entity_type: "workSubcategory",
                entity_id: workId,
                entity_label: work.name,
                kind: "update",
                source_module: "masters",
                reason: `Financial edit by ${actor.name} (${actor.role})`,
                changes,
            });
        }
    }
    async function removeWorkType(workId: string, workTypeId: string) {
        const work = workFor(master, workId);
        const workTypes = work ? workTypesForSubcategory(work) : [];
        const workType = workTypes.find((row) => row.id === workTypeId);
        if (!work || !workType) return;
        if (workTypes.length === 1) return toast.error("A sub category must keep at least one work type. Add a replacement first.");
        const ok = await confirmDialog({
            title: `Delete ${workType.name}`,
            description: "This work type and its contractor labour-rate entries will be removed. Vendor article data is not affected.",
            confirmLabel: "Delete work type",
            danger: true,
        });
        if (!ok) return;
        updateMaster((current) => ({
            ...current,
            workSubcategories: current.workSubcategories.map((row) => row.id === workId ? {
                ...normalizeWorkSubcategoryWorkTypes(row),
                work_types: workTypesForSubcategory(row).filter((entry) => entry.id !== workTypeId),
                updated_at: iso(),
            } : row),
            contractors: current.contractors.map((contractor) => ({
                ...contractor,
                work_capabilities: contractor.work_capabilities?.map((capability) => capability.subcategory_id === workId ? {
                    ...capability,
                    work_type_rates: capability.work_type_rates?.filter((rate) => rate.work_type_id !== workTypeId),
                } : capability),
            })),
            contractorRates: current.contractorRates.filter((rate) => !(rate.work_subcategory_id === workId && rate.work_type_id === workTypeId)),
        }));
        toast.success("Work type and linked contractor rates removed.");
    }
    async function removeWorkItem(workId: string) {
        const work = workFor(master, workId);
        if (!work) return;
        const ok2 = await confirmDialog({
            title: `Remove ${work.name}`,
            description: "Linked scoped materials, linked vendor prices and stale transaction links will be cleared.",
            confirmLabel: "Remove",
            danger: true,
        });
        if (!ok2) return;
        const scopeIds = new Set(master.subcategoryArticleMap.filter((row) => row.work_required_id === workId).map((row) => row.id));
        updateMaster((current) => {
            const candidateArticleIds = new Set(current.subcategoryArticleMap
                .filter((row) => scopeIds.has(row.id))
                .map((row) => row.article_id));
            const remainingScopes = current.subcategoryArticleMap.filter((row) => !scopeIds.has(row.id));
            const remainingArticleIds = new Set(remainingScopes.map((row) => row.article_id));
            const removedArticleIds = new Set([...candidateArticleIds].filter((articleId) => !remainingArticleIds.has(articleId)));
            return {
                ...current,
                workSubcategories: current.workSubcategories.filter((item) => item.id !== workId),
                subcategoryArticleMap: remainingScopes,
                vendorRates: current.vendorRates.filter((rate) => !removedArticleIds.has(rate.article_id)),
                articleVariants: current.articleVariants.filter((variant) => !removedArticleIds.has(variant.article_id)),
                articles: current.articles.filter((article) => !removedArticleIds.has(article.id)),
            };
        });
        toast.success("Sub category and dependent scoped materials removed.");
    }
    function addScopedMaterial(workId: string, draft: DraftMaterial) {
        const work = workFor(master, workId);
        if (!work)
            return;
        let articleId = draft.articleId;
        const name = draft.name.trim();
        if (draft.mode === "existing" && !articleId)
            return toast.error("Choose a canonical article.");
        if (draft.mode === "new") {
            if (!name)
                return toast.error("Material article name is required.");
            const duplicate = master.articles.find((article) => normalizeCatalogName(article.name) === normalizeCatalogName(name));
            if (duplicate)
                articleId = duplicate.id;
        }
        if (!articleId && draft.mode === "new")
            articleId = id("article");
        if (master.subcategoryArticleMap.some((row) => row.work_required_id === workId && row.article_id === articleId))
            return toast.error("This sub category already includes that material article.");
        const scopedUnit = draft.unitId || work.unit_id || "pcs";
        const now = iso();
        const scope: WorkRequiredArticle = {
            id: id("wia"),
            work_required_id: workId,
            article_id: articleId,
            unit_id: scopedUnit,
            reference_rate: amount(draft.referenceRate),
            variation_note: draft.variationNote.trim(),
            product_note: draft.productNote.trim(),
            created_at: now,
            updated_at: now,
        };
        updateMaster((current) => {
            const isNew = !current.articles.some((article) => article.id === articleId);
            const newArticle: Article | undefined = isNew ? {
                id: articleId,
                name,
                normalized_name: normalizeCatalogName(name),
                category_id: work.category_id,
                unit_id: scopedUnit,
                default_unit_id: scopedUnit,
                base_rate: amount(draft.referenceRate),
                variant_ids: [],
                created_at: now,
                updated_at: now,
            } : undefined;
            return {
                ...current,
                articles: newArticle ? [...current.articles, newArticle] : current.articles,
                subcategoryArticleMap: [...current.subcategoryArticleMap, scope],
                workSubcategories: current.workSubcategories.map((item) => item.id === workId ? { ...item, work_required_article_ids: [...(item.work_required_article_ids || []), scope.id], updated_at: now } : item),
            };
        });
        toast.success("Material linked to the sub category with its own scoped unit and rate.");
    }
    function updateScope(scopeId: string, patch: Partial<WorkRequiredArticle>) {
        const existing = master.subcategoryArticleMap.find((row) => row.id === scopeId);
        const oldRate = existing?.reference_rate;
        updateMaster((current) => {
            const scope = current.subcategoryArticleMap.find((row) => row.id === scopeId);
            if (!scope)
                return current;
            return {
                ...current,
                subcategoryArticleMap: current.subcategoryArticleMap.map((row) => row.id === scopeId ? { ...row, ...patch, updated_at: iso() } : row),
                vendorRates: current.vendorRates,
            };
        });
        // Audit log for reference rate edits — financial
        if (existing && patch.reference_rate !== undefined && patch.reference_rate !== oldRate) {
            const actor = useRDashStore.getState().currentUser();
            useRDashStore.getState().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Scope reference rate edited`,
                entity_type: "scope",
                entity_id: scopeId,
                kind: "update",
                source_module: "masters",
                reason: `Financial edit by ${actor.name} (${actor.role})`,
                changes: [{ id: `ch-${Date.now()}-rr`, field: "reference_rate", before: oldRate, after: patch.reference_rate }],
            });
        }
    }
    async function removeScope(scopeId: string) {
        const scope = scopeFor(master, scopeId);
        const article = articleFor(master, scope?.article_id);
        if (!scope) return;
        const ok3 = await confirmDialog({
            title: `Remove ${article?.name || "this material"}`,
            description: "This material will be removed from its sub category. Linked vendor prices for this exact context will also be removed.",
            confirmLabel: "Remove",
            danger: true,
        });
        if (!ok3) return;
        updateMaster((current) => ({
            ...current,
            subcategoryArticleMap: current.subcategoryArticleMap.filter((row) => row.id !== scopeId),
            workSubcategories: current.workSubcategories.map((item) => item.id === scope.work_required_id ? { ...item, work_required_article_ids: (item.work_required_article_ids || []).filter((rowId) => rowId !== scopeId), updated_at: iso() } : item),
        }));
        toast.success("Scoped material link removed.");
    }
    function addArticle(name: string, unitId: string) {
        const clean = name.trim();
        if (!clean)
            return toast.error("Article name is required.");
        if (master.articles.some((article) => normalizeCatalogName(article.name) === normalizeCatalogName(clean)))
            return toast.error("This canonical article already exists.");
        const now = iso();
        const article: Article = { id: id("article"), name: clean, normalized_name: normalizeCatalogName(clean), default_unit_id: unitId || "pcs", unit_id: unitId || "pcs", base_rate: 0, variant_ids: [], created_at: now, updated_at: now };
        updateMaster((current) => ({ ...current, articles: [...current.articles, article] }));
        toast.success("Canonical article created. Link it to one or more sub categories next.");
    }
    function updateArticle(articleId: string, patch: Partial<Article>) {
        const currentArticle = articleFor(master, articleId);
        if (!currentArticle)
            return;
        const clean = patch.name === undefined ? undefined : patch.name.trim();
        if (clean !== undefined && !clean)
            return toast.error("Article name is required.");
        if (clean && master.articles.some((article) => article.id !== articleId && normalizeCatalogName(article.name) === normalizeCatalogName(clean)))
            return toast.error("A canonical article with this name already exists.");
        const oldBaseRate = currentArticle.base_rate;
        updateMaster((current) => ({
            ...current,
            articles: current.articles.map((article) => article.id === articleId ? { ...article, ...patch, name: clean ?? article.name, normalized_name: clean ? normalizeCatalogName(clean) : article.normalized_name, unit_id: patch.default_unit_id ?? article.unit_id, updated_at: iso() } : article),
        }));
        // Audit log for base rate edits — financial
        if (patch.base_rate !== undefined && patch.base_rate !== oldBaseRate) {
            const actor = useRDashStore.getState().currentUser();
            useRDashStore.getState().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Article base rate edited: ${currentArticle.name}`,
                entity_type: "article",
                entity_id: articleId,
                entity_label: currentArticle.name,
                kind: "update",
                source_module: "masters",
                reason: `Financial edit by ${actor.name} (${actor.role})`,
                changes: [{ id: `ch-${Date.now()}-br`, field: "base_rate", before: oldBaseRate, after: patch.base_rate }],
            });
        }
    }
    async function removeArticle(articleId: string) {
        const article = articleFor(master, articleId);
        const isScoped = master.subcategoryArticleMap.some((row) => row.article_id === articleId);
        const usedByVendorRate = master.vendorRates.some((rate) => rate.article_id === articleId);
        if (!article)
            return;
        if (isScoped || usedByVendorRate)
            return toast.error("Unlink this article from sub categories and vendor rates before deleting its canonical record.");
        const ok4 = await confirmDialog({
            title: `Delete ${article.name}`,
            description: "This canonical article will be permanently deleted. It can be re-created later if needed.",
            confirmLabel: "Delete",
            danger: true,
        });
        if (!ok4) return;
        updateMaster((current) => ({ ...current, articles: current.articles.filter((entry) => entry.id !== articleId), articleVariants: current.articleVariants.filter((variant) => variant.article_id !== articleId) }));
        toast.success("Unused canonical article deleted.");
    }
    function addVariant(articleId: string, draft: DraftVariant) {
        const name = draft.name.trim();
        if (!name)
            return toast.error("Variant name is required.");
        if (master.articleVariants.some((variant) => variant.article_id === articleId && normalizeCatalogName(variant.name) === normalizeCatalogName(name)))
            return toast.error("This article already has a variant with this name.");
        const now = iso();
        const variant: ArticleVariant = {
            id: id("variant"),
            article_id: articleId,
            name,
            sku: draft.sku.trim(),
            unit_id: draft.unitId || undefined,
            brand: draft.brand.trim(),
            grade: draft.grade.trim(),
            pack_size: draft.packSize.trim(),
            thickness: draft.thickness.trim(),
            size: draft.size.trim(),
            finish: draft.finish.trim(),
            color: draft.color.trim(),
            series: draft.series.trim(),
            enabled: true,
            created_at: now,
            updated_at: now,
        };
        updateMaster((current) => ({
            ...current,
            articleVariants: [...current.articleVariants, variant],
            articles: current.articles.map((article) => article.id === articleId ? { ...article, variant_ids: [...(article.variant_ids || []), variant.id], updated_at: now } : article),
        }));
        toast.success("Variant added. Vendor pricing can now target this exact specification.");
    }
    function updateVariant(variantId: string, patch: Partial<ArticleVariant>) {
        updateMaster((current) => {
            const nextVariants = current.articleVariants.map((variant) => variant.id === variantId ? { ...variant, ...patch, updated_at: iso() } : variant);
            const selected = nextVariants.find((variant) => variant.id === variantId);
            return {
                ...current,
                articleVariants: nextVariants,
                vendorRates: current.vendorRates,
            };
        });
    }
    async function removeVariant(variantId: string) {
        const variant = master.articleVariants.find((entry) => entry.id === variantId);
        if (!variant) return;
        const ok5 = await confirmDialog({
            title: `Remove ${variant.name}`,
            description: "Linked vendor rates will safely fall back to the sub category base unit.",
            confirmLabel: "Remove",
            danger: true,
        });
        if (!ok5) return;
        updateMaster((current) => ({
            ...current,
            articleVariants: current.articleVariants.filter((entry) => entry.id !== variantId),
            articles: current.articles.map((article) => article.id === variant.article_id ? { ...article, variant_ids: (article.variant_ids || []).filter((entry) => entry !== variantId), updated_at: iso() } : article),
            vendorRates: current.vendorRates.map((rate) => rate.variant_id === variantId ? { ...rate, variant_id: undefined, updated_at: iso() } : rate),
        }));
        toast.success("Variant removed and vendor rate units repaired.");
    }
    function addUnit(draft: DraftUnit) {
        const key = resolveUnitId(draft.symbol);
        const cleanName = draft.name.trim();
        if (!key || !cleanName)
            return toast.error("Unit symbol and name are required.");
        if (master.units.some((unit) => unit.id === key || normalizeCatalogName(unit.symbol) === normalizeCatalogName(draft.symbol)))
            return toast.error("A unit with this symbol already exists.");
        updateMaster((current) => ({ ...current, units: [...current.units, { id: key, symbol: draft.symbol.trim(), name: cleanName, family: draft.family }] }));
        toast.success("Unit added to the shared unit master.");
    }
    function updateUnit(unitId: string, patch: Partial<MasterUnit>) {
        const cleanSymbol = patch.symbol === undefined ? undefined : patch.symbol.trim();
        const cleanName = patch.name === undefined ? undefined : patch.name.trim();
        if (cleanSymbol !== undefined && !cleanSymbol)
            return toast.error("Unit symbol is required.");
        if (cleanName !== undefined && !cleanName)
            return toast.error("Unit name is required.");
        updateMaster((current) => ({ ...current, units: current.units.map((unit) => unit.id === unitId ? { ...unit, ...patch, symbol: cleanSymbol ?? unit.symbol, name: cleanName ?? unit.name } : unit) }));
    }
    async function removeUnit(unitId: string) {
        const unit = master.units.find((entry) => entry.id === unitId);
        if (!unit)
            return;
        const references = [
            master.workSubcategories.reduce((count, item) => count + workTypesForSubcategory(item).filter((workType) => workType.unit_id === unitId).length, 0),
            master.articles.filter((article) => article.default_unit_id === unitId).length,
            master.subcategoryArticleMap.filter((row) => row.unit_id === unitId).length,
            master.articleVariants.filter((variant) => variant.unit_id === unitId).length,
        ].reduce((sum, value) => sum + value, 0);
        if (references)
            return toast.error(`${unit.symbol} is used by ${references} linked records and cannot be removed.`);
        const ok6 = await confirmDialog({
            title: `Delete ${unit.symbol}`,
            description: "This unit will be permanently deleted if no records are using it.",
            confirmLabel: "Delete",
            danger: true,
        });
        if (!ok6) return;
        updateMaster((current) => ({ ...current, units: current.units.filter((entry) => entry.id !== unitId) }));
        toast.success("Unused unit removed.");
    }
    function exportCatalogue() {
        const rows: Array<Array<string | number>> = [["Category", "Sub category", "Work type", "Execution unit", "Material rate", "Labour rate", "Total rate", "Article", "Article unit", "Scoped reference rate", "Variants", "Notes"]];
        master.workSubcategories.forEach((work) => {
            const category = master.workCategories.find((entry) => entry.id === work.category_id);
            const scopes = scopesByWork.get(work.id) || [];
            workTypesForSubcategory(work).forEach((workType) => {
                const average = contractorWorkTypeAverages(master.contractorRates, work.id, workType.id);
                (scopes.length ? scopes : [undefined]).forEach((scope) => {
                    const article = articleFor(master, scope?.article_id);
                    rows.push([
                        category?.name || "", work.name, workType.name, unitLabel(master, workType.unit_id), average.material_rate || 0, average.labour_rate || 0, average.total_rate || 0,
                        article?.name || "", scope ? unitLabel(master, scope.unit_id) : "", amount(scope?.reference_rate), scope ? (variantsByArticle.get(scope.article_id) || []).length : 0,
                        [workType.notes, scope?.variation_note, scope?.product_note, work.notes].filter(Boolean).join(" | "),
                    ]);
                });
            });
        });
        downloadCsv("rdash-work-category-catalogue.csv", rows);
        toast.success("Category master exported as CSV.");
    }
    function repairCatalog() {
        updateMaster((current) => {
            const validUnits = new Set(current.units.map((unit) => unit.id));
            const validCategories = new Set(current.workCategories.map((category) => category.id));
            const validWorks = new Set(current.workSubcategories.map((work) => work.id));
            const validArticles = new Set(current.articles.map((article) => article.id));
            const cleanWorks = current.workSubcategories.filter((work) => validCategories.has(work.category_id)).map((work) => {
                const normalized = normalizeWorkSubcategoryWorkTypes(work);
                return {
                    ...normalized,
                    unit_id: validUnits.has(normalized.unit_id || "") ? normalized.unit_id : "pcs",
                    work_types: workTypesForSubcategory(normalized).map((workType) => ({
                        ...workType,
                        unit_id: validUnits.has(workType.unit_id || "") ? workType.unit_id : "pcs",
                    })),
                };
            });
            const cleanScopes = current.subcategoryArticleMap.filter((scope) => validWorks.has(scope.work_required_id) && validArticles.has(scope.article_id) && validUnits.has(scope.unit_id));
            const validScopes = new Set(cleanScopes.map((scope) => scope.id));
            const cleanVariants = current.articleVariants.filter((variant) => validArticles.has(variant.article_id) && (!variant.unit_id || validUnits.has(variant.unit_id)));
            const validVariants = new Set(cleanVariants.map((variant) => variant.id));
            const scopesByWorkId = new Map<string, string[]>();
            cleanScopes.forEach((scope) => scopesByWorkId.set(scope.work_required_id, [...(scopesByWorkId.get(scope.work_required_id) || []), scope.id]));
            return {
                ...current,
                workSubcategories: cleanWorks.map((work) => ({ ...work, work_required_article_ids: scopesByWorkId.get(work.id) || [], updated_at: iso() })),
                subcategoryArticleMap: cleanScopes,
                articleVariants: cleanVariants,
                articles: current.articles.map((article) => ({
                    ...article,
                    default_unit_id: validUnits.has(article.default_unit_id || "") ? article.default_unit_id : cleanScopes.find((scope) => scope.article_id === article.id)?.unit_id || "pcs",
                    variant_ids: cleanVariants.filter((variant) => variant.article_id === article.id).map((variant) => variant.id),
                    updated_at: iso(),
                })),
                vendorRates: current.vendorRates.filter((rate) => validArticles.has(rate.article_id) && (!rate.variant_id || validVariants.has(rate.variant_id))),
            };
        });
        toast.success("Safe catalogue repair completed.");
    }
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers3 className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Work & Rate Master</h2>
            <p className="text-xs text-muted-foreground">Category → sub category → work type rates for contractors · scoped articles and variants for vendors</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCatalogue}><Download className="h-3.5 w-3.5"/> Export categories</Button>
          {view === "catalogue" ? <Button size="sm" onClick={() => setCategoryDialogOpen(true)}><Plus className="h-3.5 w-3.5"/> Add category</Button> : null}
          {view === "articles" ? <Button size="sm" onClick={() => setArticleDialogOpen(true)}><PackagePlus className="h-3.5 w-3.5"/> Create article</Button> : null}
          {view === "units" ? <Button size="sm" onClick={() => setUnitDialogOpen(true)}><Plus className="h-3.5 w-3.5"/> Add unit</Button> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Categories" value={master.workCategories.length} hint={`Source: ${catalogCounts.categories}`} tone="primary" icon={<Layers3 className="h-4 w-4"/>} onClick={() => setView("catalogue")} active={view === "catalogue"}/>
        <MetricCard label="Sub categories" value={master.workSubcategories.length} hint={`Source: ${catalogCounts.scopeLines}`} tone="success" icon={<Wrench className="h-4 w-4"/>} onClick={() => setView("catalogue")}/>
        <MetricCard label="Scoped materials" value={scopeCount} hint={`Source: ${catalogCounts.sourceMaterialRows}`} tone="warning" icon={<Link2 className="h-4 w-4"/>} onClick={() => setView("articles")}/>
        <MetricCard label="Integrity" value={issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Clean"} tone={issues.length ? "destructive" : "success"} icon={issues.length ? <AlertTriangle className="h-4 w-4"/> : <ClipboardCheck className="h-4 w-4"/>} onClick={() => setView("integrity")} active={view === "integrity"}/>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--panel-radius)] border border-border bg-card p-1.5 shadow-card" role="tablist" aria-label="Work master views">
        {(Object.keys(viewMeta) as WorkCategoryMasterView[]).map((entry) => {
            const active = entry === view;
            return <button key={entry} type="button" role="tab" aria-selected={active} onClick={() => setView(entry)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>{viewMeta[entry].icon}{viewMeta[entry].label}</button>;
        })}
      </div>

      {view === "catalogue" ? <CatalogueView master={master} query={query} setQuery={setQuery} filteredCategories={filteredCategories} workByCategory={workByCategory} scopesByWork={scopesByWork} variantsByArticle={variantsByArticle} expanded={expanded} setExpanded={setExpanded} updateCategory={updateCategory} removeCategory={removeCategory} setWorkDialogCategoryId={setWorkDialogCategoryId} updateWorkItem={updateWorkItem} addWorkType={addWorkType} updateWorkType={updateWorkType} removeWorkType={removeWorkType} removeWorkItem={removeWorkItem} setMaterialWorkId={setMaterialWorkId} updateScope={updateScope} updateArticle={updateArticle} removeScope={removeScope} setVariantArticleId={setVariantArticleId} onAddCategory={() => setCategoryDialogOpen(true)}/> : null}
      {view === "articles" ? <ArticlesView master={master} query={query} setQuery={setQuery} scopesByWork={scopesByWork} variantsByArticle={variantsByArticle} updateArticle={updateArticle} removeArticle={removeArticle} setVariantArticleId={setVariantArticleId}/> : null}
      {view === "variants" ? <VariantsView master={master} query={query} setQuery={setQuery} variantsByArticle={variantsByArticle} setVariantArticleId={setVariantArticleId}/> : null}
      {view === "units" ? <UnitsView master={master} query={query} setQuery={setQuery} updateUnit={updateUnit} removeUnit={removeUnit}/> : null}
      {view === "integrity" ? <IntegrityView master={master} issues={issues} onRepair={repairCatalog}/> : null}

      <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} onSave={addCategory}/>
      <WorkItemDialog open={Boolean(workDialogCategoryId)} onOpenChange={(open) => !open && setWorkDialogCategoryId(null)} category={master.workCategories.find((category) => category.id === workDialogCategoryId) || null} units={master.units} onSave={addWorkItem}/>
      <MaterialDialog open={Boolean(materialWorkId)} onOpenChange={(open) => !open && setMaterialWorkId(null)} master={master} work={workFor(master, materialWorkId) || null} onSave={addScopedMaterial}/>
      <VariantDialog open={Boolean(variantArticleId)} onOpenChange={(open) => !open && setVariantArticleId(null)} master={master} article={articleFor(master, variantArticleId) || null} updateArticle={updateArticle} addVariant={addVariant} updateVariant={updateVariant} removeVariant={removeVariant}/>
      <UnitDialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen} onSave={addUnit}/>
      <ArticleDialog open={articleDialogOpen} onOpenChange={setArticleDialogOpen} units={master.units} onSave={addArticle}/>
    </div>);
}
function CatalogueView({ master, query, setQuery, filteredCategories, workByCategory, scopesByWork, variantsByArticle, expanded, setExpanded, updateCategory, removeCategory, setWorkDialogCategoryId, updateWorkItem, addWorkType, updateWorkType, removeWorkType, removeWorkItem, setMaterialWorkId, updateScope, updateArticle, removeScope, setVariantArticleId, onAddCategory }: {
    master: Master;
    query: string;
    setQuery: (value: string) => void;
    filteredCategories: WorkCategory[];
    workByCategory: Map<string, WorkSubcategory[]>;
    scopesByWork: Map<string, WorkRequiredArticle[]>;
    variantsByArticle: Map<string, ArticleVariant[]>;
    expanded: Record<string, boolean>;
    setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    updateCategory: (id: string, patch: Partial<WorkCategory>) => void;
    removeCategory: (id: string) => void;
    setWorkDialogCategoryId: (id: string) => void;
    updateWorkItem: (id: string, patch: Partial<WorkSubcategory>) => void;
    addWorkType: (workId: string) => void;
    updateWorkType: (workId: string, workTypeId: string, patch: Partial<WorkTypeRate>) => void;
    removeWorkType: (workId: string, workTypeId: string) => void;
    removeWorkItem: (id: string) => void;
    setMaterialWorkId: (id: string) => void;
    updateScope: (id: string, patch: Partial<WorkRequiredArticle>) => void;
    updateArticle: (id: string, patch: Partial<Article>) => void;
    removeScope: (id: string) => void;
    setVariantArticleId: (id: string) => void;
    onAddCategory: () => void;
}) {
    const needle = normalizeCatalogName(query);
    const [editingCategoryId, setEditingCategoryId] = React.useState<string | null>(null);
    return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search category, sub category, material or note..." className="pl-8"/>
      </div>
      <span className="text-xs text-muted-foreground">{filteredCategories.length} categories shown</span>
      <Button size="sm" onClick={onAddCategory}><Plus className="h-3.5 w-3.5"/> Add category</Button>
    </div>

    {filteredCategories.length === 0 ? <EmptyState title="No category match" description="Search by category, sub category, material article or scope note." icon={<Search className="h-7 w-7"/>}/> : null}
    {filteredCategories.map((category) => {
            const isExpanded = expanded[category.id] || Boolean(needle);
            const works = (workByCategory.get(category.id) || []).filter((work) => !needle || normalizeCatalogName(category.name).includes(needle) || normalizeCatalogName(work.name).includes(needle) || normalizeCatalogName(work.notes).includes(needle) || (scopesByWork.get(work.id) || []).some((scope) => normalizeCatalogName(articleFor(master, scope.article_id)?.name).includes(needle)));
            const materialCount = works.reduce((sum, work) => sum + (scopesByWork.get(work.id) || []).length, 0);
            return <section key={category.id} className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-gradient-to-r from-muted/70 to-transparent px-3 py-2.5">
          <button type="button" onClick={() => setExpanded((current) => ({ ...current, [category.id]: !isExpanded }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
            <span className="min-w-0 flex-1">
              {editingCategoryId === category.id ? (<Input autoFocus defaultValue={category.name} onClick={(event) => event.stopPropagation()} onBlur={(event) => { updateCategory(category.id, { name: event.target.value }); setEditingCategoryId(null); }} onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            updateCategory(category.id, { name: event.currentTarget.value });
                            setEditingCategoryId(null);
                        }
                        if (event.key === "Escape")
                            setEditingCategoryId(null);
                    }} className="h-8 max-w-md font-semibold"/>) : (<span className="block truncate text-sm font-bold">{category.name}</span>)}
              <span className="text-[10px] text-muted-foreground">{works.length} sub categories - {materialCount} scoped materials</span>
            </span>
          </button>
          <Button size="icon" variant="ghost" aria-label={`Edit ${category.name}`} onClick={() => setEditingCategoryId(category.id)}><Pencil className="h-4 w-4"/></Button>
          <Button size="sm" variant="outline" onClick={() => setWorkDialogCategoryId(category.id)}><Plus className="h-3.5 w-3.5"/> Sub category</Button>
          <Button size="icon" variant="ghost" aria-label={`Delete ${category.name}`} onClick={() => removeCategory(category.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
        </div>
        {isExpanded ? <div className="p-3">
          <div className="grid gap-3">
            {works.map((work) => <WorkItemCard key={work.id} master={master} work={work} scopes={scopesByWork.get(work.id) || []} variantsByArticle={variantsByArticle} updateWorkItem={updateWorkItem} addWorkType={addWorkType} updateWorkType={updateWorkType} removeWorkType={removeWorkType} removeWorkItem={removeWorkItem} setMaterialWorkId={setMaterialWorkId} updateScope={updateScope} updateArticle={updateArticle} removeScope={removeScope} setVariantArticleId={setVariantArticleId}/>)}
            {works.length === 0 ? <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No sub categories match this category filter.</div> : null}
          </div>
        </div> : null}
      </section>;
        })}
  </div>;
}
function WorkItemCard({ master, work, scopes, variantsByArticle, updateWorkItem, addWorkType, updateWorkType, removeWorkType, removeWorkItem, setMaterialWorkId, updateScope, updateArticle, removeScope, setVariantArticleId }: {
    master: Master;
    work: WorkSubcategory;
    scopes: WorkRequiredArticle[];
    variantsByArticle: Map<string, ArticleVariant[]>;
    updateWorkItem: (id: string, patch: Partial<WorkSubcategory>) => void;
    addWorkType: (workId: string) => void;
    updateWorkType: (workId: string, workTypeId: string, patch: Partial<WorkTypeRate>) => void;
    removeWorkType: (workId: string, workTypeId: string) => void;
    removeWorkItem: (id: string) => void;
    setMaterialWorkId: (id: string) => void;
    updateScope: (id: string, patch: Partial<WorkRequiredArticle>) => void;
    updateArticle: (id: string, patch: Partial<Article>) => void;
    removeScope: (id: string) => void;
    setVariantArticleId: (id: string) => void;
}) {
    const workTypes = workTypesForSubcategory(work);
    const [open, setOpen] = React.useState(false);
    const [materialsOpen, setMaterialsOpen] = React.useState(false);
    const [editingName, setEditingName] = React.useState(false);
    return <article className="rounded-xl border border-border bg-background/50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
        <span className="min-w-0">
          {editingName ? (<Input autoFocus defaultValue={work.name} onClick={(event) => event.stopPropagation()} onBlur={(event) => {
            if (event.target.value !== work.name)
                updateWorkItem(work.id, { name: event.target.value });
            setEditingName(false);
        }} onKeyDown={(event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                if (event.currentTarget.value !== work.name)
                    updateWorkItem(work.id, { name: event.currentTarget.value });
                setEditingName(false);
            }
            if (event.key === "Escape")
                setEditingName(false);
        }} className="h-8 max-w-md text-sm font-semibold"/>) : (<span className="block truncate text-sm font-semibold">{work.name}</span>)}
          <span className="text-[10px] text-muted-foreground">{workTypes.length} work type{workTypes.length === 1 ? "" : "s"} · {scopes.length} scoped material{scopes.length === 1 ? "" : "s"}</span>
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        <Button size="icon" variant="ghost" aria-label={`Rename ${work.name}`} onClick={() => setEditingName(true)}><Pencil className="h-4 w-4"/></Button>
        <StatusBadge label={`${workTypes.length} rate row${workTypes.length === 1 ? "" : "s"}`} className="border-primary/20 bg-primary/10 text-primary"/>
        <Button size="icon" variant="ghost" aria-label={`Delete ${work.name}`} onClick={() => removeWorkItem(work.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
      </div>
    </div>

    {open ? <>
      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <div className="grid min-w-[980px] grid-cols-[minmax(150px,1.1fr)_minmax(160px,1fr)_minmax(120px,.8fr)_minmax(120px,.8fr)_minmax(120px,.8fr)_minmax(190px,1.3fr)_40px] gap-2 bg-muted/40 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Work type</span><span>Execution unit</span><span>Material rate</span><span>Labour rate</span><span>Total rate</span><span>Notes</span><span />
        </div>
        {workTypes.map((workType) => {
            const average = contractorWorkTypeAverages(master.contractorRates, work.id, workType.id);
            return <div key={workType.id} className="grid min-w-[980px] grid-cols-[minmax(150px,1.1fr)_minmax(160px,1fr)_minmax(120px,.8fr)_minmax(120px,.8fr)_minmax(120px,.8fr)_minmax(190px,1.3fr)_40px] items-center gap-2 border-t border-border px-2.5 py-2">
              <Input defaultValue={workType.name} aria-label={`Work type for ${work.name}`} onBlur={(event) => event.target.value !== workType.name && updateWorkType(work.id, workType.id, { name: event.target.value })} className="h-8 font-semibold"/>
              <NativeSelect value={workType.unit_id || work.unit_id || "pcs"} onChange={(event) => updateWorkType(work.id, workType.id, { unit_id: event.target.value })} className="h-8">{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(master, unit.id)}</option>)}</NativeSelect>
              <div className="flex h-8 items-center rounded-md border border-input bg-muted/50 px-3 font-mono text-sm font-bold" aria-label={`${workType.name} average material rate`}>{average.material_rate == null ? "—" : `Rs ${Math.round(average.material_rate).toLocaleString("en-IN")}`}</div>
              <div className="flex h-8 items-center rounded-md border border-input bg-muted/50 px-3 font-mono text-sm font-bold" aria-label={`${workType.name} average labour rate`}>{average.labour_rate == null ? "—" : `Rs ${Math.round(average.labour_rate).toLocaleString("en-IN")}`}</div>
              <div className="flex h-8 items-center rounded-md border border-input bg-muted/50 px-3 font-mono text-sm font-bold">{average.total_rate == null ? "—" : `Rs ${Math.round(average.total_rate).toLocaleString("en-IN")}`}</div>
              <Input defaultValue={workType.notes || ""} placeholder="Work-type note" aria-label={`${workType.name} notes`} onBlur={(event) => event.target.value !== (workType.notes || "") && updateWorkType(work.id, workType.id, { notes: event.target.value })} className="h-8"/>
              <Button size="icon" variant="ghost" onClick={() => removeWorkType(work.id, workType.id)} aria-label={`Delete ${workType.name}`}><Trash2 className="h-4 w-4 text-destructive"/></Button>
            </div>;
        })}
        <div className="border-t border-border p-2">
          <Button size="sm" variant="outline" className="border-dashed" onClick={() => addWorkType(work.id)}><Plus className="h-3.5 w-3.5"/> Add work type</Button>
        </div>
      </div>

      <div className="mt-2"><Field label="Sub-category notes"><Input defaultValue={work.notes || ""} placeholder="General scope note" onBlur={(event) => event.target.value !== (work.notes || "") && updateWorkItem(work.id, { notes: event.target.value })}/></Field></div>

      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-2.5 py-2">
          <button type="button" onClick={() => setMaterialsOpen((value) => !value)} className="flex min-w-0 items-center gap-2 text-left">
            {materialsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
            <span><span className="block text-xs font-semibold">Scoped material articles</span><span className="text-[10px] text-muted-foreground">{scopes.length} materials linked to this sub category</span></span>
          </button>
          <Button size="sm" variant="outline" onClick={() => setMaterialWorkId(work.id)}><PackagePlus className="h-3.5 w-3.5"/> Link material</Button>
        </div>
        {materialsOpen ? (scopes.length === 0 ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">No material articles linked yet.</p> : <div className="overflow-x-auto"><table className="min-w-[850px] w-full text-left text-xs"><thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Material article</th><th className="px-3 py-2 font-semibold">Scoped unit</th><th className="px-3 py-2 font-semibold">Scoped reference rate</th><th className="px-3 py-2 font-semibold">Scope note</th><th className="px-3 py-2 font-semibold">Variants</th><th className="px-3 py-2"></th></tr></thead><tbody>{scopes.map((scope) => {
                    const article = articleFor(master, scope.article_id);
                    const variants = variantsByArticle.get(scope.article_id) || [];
                    const note = [scope.variation_note, scope.product_note].filter(Boolean).join(" - ");
                    return <tr key={scope.id} className="border-t border-border align-top hover:bg-accent/20"><td className="px-3 py-2">{article ? <Input defaultValue={article.name} aria-label={`Material article ${article.name}`} onBlur={(event) => event.target.value !== article.name && updateArticle(article.id, { name: event.target.value })} className="h-8 min-w-48 font-semibold"/> : <p className="font-semibold text-destructive">Missing article</p>}</td><td className="px-3 py-2"><NativeSelect value={scope.unit_id} onChange={(event) => updateScope(scope.id, { unit_id: event.target.value })} className="h-8 min-w-[140px]">{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}</NativeSelect></td><td className="px-3 py-2"><Input type="number" min="0" defaultValue={scope.reference_rate || 0} onBlur={(event) => updateScope(scope.id, { reference_rate: amount(event.target.value) })} className="h-8 w-28"/></td><td className="px-3 py-2"><Input defaultValue={note} placeholder="Use variants for brand, grade, size and finish" onBlur={(event) => updateScope(scope.id, { variation_note: "", product_note: event.target.value })} className="h-8 min-w-56"/></td><td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => article && setVariantArticleId(article.id)}><Tags className="h-3.5 w-3.5"/> Manage variants ({variants.length})</Button></td><td className="px-3 py-2"><Button size="icon" variant="ghost" aria-label={`Remove ${article?.name || "material"}`} onClick={() => removeScope(scope.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></td></tr>;
                })}</tbody></table></div>) : null}
      </div>
    </> : null}
  </article>;
}
function ArticlesView({ master, query, setQuery, scopesByWork, variantsByArticle, updateArticle, removeArticle, setVariantArticleId }: {
    master: Master;
    query: string;
    setQuery: (value: string) => void;
    scopesByWork: Map<string, WorkRequiredArticle[]>;
    variantsByArticle: Map<string, ArticleVariant[]>;
    updateArticle: (id: string, patch: Partial<Article>) => void;
    removeArticle: (id: string) => void;
    setVariantArticleId: (id: string) => void;
}) {
    const rows = master.articles.filter((article) => !query || normalizeCatalogName(article.name).includes(normalizeCatalogName(query))).sort((a, b) => a.name.localeCompare(b.name));
    const scopesByArticle = new Map<string, WorkRequiredArticle[]>();
    master.subcategoryArticleMap.forEach((scope) => scopesByArticle.set(scope.article_id, [...(scopesByArticle.get(scope.article_id) || []), scope]));
    return <div className="flex flex-col gap-3"><div className="flex flex-wrap items-center gap-2"><div className="relative w-full max-w-md"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search canonical material articles…" className="pl-8"/></div><span className="text-xs text-muted-foreground">{rows.length} unique material identities</span></div><div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"><div className="overflow-x-auto"><table className="min-w-[920px] w-full text-left text-xs"><thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Canonical article</th><th className="px-3 py-2">Default unit</th><th className="px-3 py-2">Baseline</th><th className="px-3 py-2">Work contexts</th><th className="px-3 py-2">Variants</th><th className="px-3 py-2"></th></tr></thead><tbody>{rows.map((article) => { const scopes = scopesByArticle.get(article.id) || []; const variants = variantsByArticle.get(article.id) || []; return <tr key={article.id} className="border-t border-border align-top hover:bg-accent/20"><td className="px-3 py-2"><Input defaultValue={article.name} onBlur={(event) => event.target.value !== article.name && updateArticle(article.id, { name: event.target.value })} className="h-8 min-w-64 font-semibold"/><p className="mt-1 text-[10px] text-muted-foreground">ID: {article.id}</p></td><td className="px-3 py-2"><NativeSelect value={article.default_unit_id || "pcs"} onChange={(event) => updateArticle(article.id, { default_unit_id: event.target.value })} className="h-8 min-w-[140px]">{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(master, unit.id)}</option>)}</NativeSelect></td><td className="px-3 py-2"><Input type="number" min="0" defaultValue={article.base_rate || 0} onBlur={(event) => updateArticle(article.id, { base_rate: amount(event.target.value) })} className="h-8 w-28"/></td><td className="px-3 py-2"><span className="font-semibold">{scopes.length}</span><div className="mt-1 flex max-w-80 flex-wrap gap-1">{scopes.slice(0, 3).map((scope) => <span key={scope.id} className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px]">{workFor(master, scope.work_required_id)?.name || "Missing work"} · {master.units.find((unit) => unit.id === scope.unit_id)?.symbol}</span>)}{scopes.length > 3 ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">+{scopes.length - 3}</span> : null}</div></td><td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => setVariantArticleId(article.id)}><Tags className="h-3.5 w-3.5"/> {variants.length} manage</Button></td><td className="px-3 py-2"><Button size="icon" variant="ghost" onClick={() => removeArticle(article.id)} aria-label={`Delete ${article.name}`}><Trash2 className="h-4 w-4 text-destructive"/></Button></td></tr>; })}</tbody></table></div></div></div>;
}
function VariantsView({ master, query, setQuery, variantsByArticle, setVariantArticleId }: {
    master: Master;
    query: string;
    setQuery: (value: string) => void;
    variantsByArticle: Map<string, ArticleVariant[]>;
    setVariantArticleId: (id: string) => void;
}) {
    const rows = master.articles.filter((article) => {
        const variants = variantsByArticle.get(article.id) || [];
        const needle = normalizeCatalogName(query);
        return !needle || normalizeCatalogName(article.name).includes(needle) || variants.some((variant) => normalizeCatalogName(`${variant.name} ${variant.sku} ${variant.brand} ${variant.grade} ${variant.pack_size} ${variant.thickness} ${variant.size} ${variant.finish} ${variant.color} ${variant.series}`).includes(needle));
    }).sort((a, b) => a.name.localeCompare(b.name));
    return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search article or variant specification..." className="pl-8"/>
      </div>
      <span className="text-xs text-muted-foreground">{master.articleVariants.length} variants across {rows.filter((article) => (variantsByArticle.get(article.id) || []).length).length} articles</span>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.map((article) => {
            const variants = variantsByArticle.get(article.id) || [];
            return <section key={article.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <button type="button" onClick={() => setVariantArticleId(article.id)} className="min-w-0 text-left">
              <h3 className="truncate text-sm font-bold">{article.name}</h3>
              <p className="text-[11px] text-muted-foreground">Default unit: {unitLabel(master, article.default_unit_id)}</p>
            </button>
            <Button size="sm" variant="outline" onClick={() => setVariantArticleId(article.id)}><Tags className="h-3.5 w-3.5"/> Manage variants</Button>
          </div>
          {variants.length ? <div className="mt-3 grid gap-2">
            {variants.map((variant) => {
                        const attrs = [variant.brand, variant.grade, variant.pack_size, variant.thickness, variant.size, variant.finish, variant.color, variant.series].filter(Boolean).join(" / ");
                        return <button key={variant.id} type="button" onClick={() => setVariantArticleId(article.id)} className={cn("rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent", variant.enabled === false ? "border-border bg-muted text-muted-foreground line-through" : "border-primary/20 bg-primary/10 text-primary")}>
                <span className="block font-semibold">{variant.name}{variant.sku ? ` - ${variant.sku}` : ""}</span>
                {attrs ? <span className="mt-0.5 block text-[10px] text-muted-foreground">{attrs}</span> : null}
              </button>;
                    })}
          </div> : <button type="button" onClick={() => setVariantArticleId(article.id)} className="mt-3 w-full rounded-lg border border-dashed border-border p-3 text-left text-xs text-muted-foreground hover:bg-accent/20">No variants. Add one when grade, pack size, brand, thickness, size, finish, color, series, or SKU creates a distinct priceable material.</button>}
        </section>;
        })}
    </div>
  </div>;
}
function UnitsView({ master, query, setQuery, updateUnit, removeUnit }: {
    master: Master;
    query: string;
    setQuery: (value: string) => void;
    updateUnit: (id: string, patch: Partial<MasterUnit>) => void;
    removeUnit: (id: string) => void;
}) {
    const rows = master.units.filter((unit) => !query || normalizeCatalogName(`${unit.symbol} ${unit.name} ${unit.family}`).includes(normalizeCatalogName(query))).sort((a, b) => a.symbol.localeCompare(b.symbol));
    const countUsage = (unitId: string) => master.workSubcategories.filter((work) => work.unit_id === unitId).length + master.workSubcategories.reduce((count, work) => count + workTypesForSubcategory(work).filter((workType) => workType.unit_id === unitId).length, 0) + master.articles.filter((article) => article.default_unit_id === unitId).length + master.subcategoryArticleMap.filter((scope) => scope.unit_id === unitId).length + master.articleVariants.filter((variant) => variant.unit_id === unitId).length;
    return <div className="flex flex-col gap-3"><div className="flex flex-wrap items-center gap-2"><div className="relative w-full max-w-md"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared units…" className="pl-8"/></div><span className="text-xs text-muted-foreground">Stable IDs prevent unit text conflicts in quotations, vendors and materials.</span></div><div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"><div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-xs"><thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Symbol</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Family</th><th className="px-3 py-2">Linked records</th><th className="px-3 py-2"></th></tr></thead><tbody>{rows.map((unit) => <tr key={unit.id} className="border-t border-border hover:bg-accent/20"><td className="px-3 py-2"><Input defaultValue={unit.symbol} onBlur={(event) => event.target.value !== unit.symbol && updateUnit(unit.id, { symbol: event.target.value })} className="h-8 w-28 font-mono"/></td><td className="px-3 py-2"><Input defaultValue={unit.name} onBlur={(event) => event.target.value !== unit.name && updateUnit(unit.id, { name: event.target.value })} className="h-8 min-w-56"/></td><td className="px-3 py-2"><NativeSelect value={unit.family || "other"} onChange={(event) => updateUnit(unit.id, { family: event.target.value as MasterUnit["family"] })} className="h-8 min-w-32"><option value="area">Area</option><option value="length">Length</option><option value="count">Count</option><option value="weight">Weight</option><option value="volume">Volume</option><option value="package">Package</option><option value="other">Other</option></NativeSelect></td><td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-1 font-semibold">{countUsage(unit.id)}</span></td><td className="px-3 py-2"><Button size="icon" variant="ghost" onClick={() => removeUnit(unit.id)} aria-label={`Delete ${unit.symbol}`}><Trash2 className="h-4 w-4 text-destructive"/></Button></td></tr>)}</tbody></table></div></div></div>;
}
function IntegrityView({ master, issues, onRepair }: {
    master: Master;
    issues: ReturnType<typeof getCatalogIssues>;
    onRepair: () => void;
}) {
    return <div className="flex flex-col gap-3"><section className={cn("rounded-[var(--panel-radius)] border p-4 shadow-card", issues.length ? "border-destructive/30 bg-destructive/[0.04]" : "border-success/30 bg-success/[0.04]")}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-2.5">{issues.length ? <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive"/> : <ClipboardCheck className="mt-0.5 h-5 w-5 text-success"/>}<div><h3 className="text-sm font-bold">{issues.length ? `${issues.length} category integrity issue${issues.length === 1 ? "" : "s"}` : "Category integrity is clean"}</h3><p className="mt-0.5 text-xs text-muted-foreground">Checks category uniqueness, work scope, article identity, scoped units, variants, and vendor-rate references.</p></div></div><Button size="sm" variant="outline" onClick={onRepair}><Settings2 className="h-3.5 w-3.5"/> Run safe repair</Button></div></section><div className="grid gap-3 md:grid-cols-3"><MetricCard label="Category tree" value={`${master.workCategories.length} / ${master.workSubcategories.length}`} hint="categories / sub categories" tone="primary" icon={<Layers3 className="h-4 w-4"/>}/><MetricCard label="Material graph" value={`${master.articles.length} / ${master.subcategoryArticleMap.length}`} hint="canonical articles / scoped links" tone="warning" icon={<Link2 className="h-4 w-4"/>}/><MetricCard label="Price specifications" value={`${master.articleVariants.length} / ${master.vendorRates.length}`} hint="variants / vendor rate rows" tone="success" icon={<Tags className="h-4 w-4"/>}/></div>{issues.length ? <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"><div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold">Detected issues</div><div className="divide-y divide-border">{issues.map((issue, index) => <div key={`${issue.message}-${index}`} className="flex gap-2 px-3 py-2.5 text-xs"><AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", issue.severity === "error" ? "text-destructive" : "text-warning")}/><span>{issue.message}</span></div>)}</div></div> : <EmptyState title="No broken links found" description="The master has stable units, unique article identity, valid scoped materials and valid vendor-rate references." icon={<ClipboardCheck className="h-7 w-7"/>}/>}</div>;
}
function CategoryDialog({ open, onOpenChange, onSave }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (name: string) => void;
}) {
    const [name, setName] = React.useState("");
    return <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next)
        setName(""); }}><DialogContent><DialogHeader><DialogTitle>Add work category</DialogTitle><DialogDescription>Create the top-level group for related execution sub categories.</DialogDescription></DialogHeader><Field label="Category name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="For example: Modular Kitchen" onKeyDown={(event) => { if (event.key === "Enter") {
        onSave(name);
        onOpenChange(false);
    } }}/></Field><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { onSave(name); onOpenChange(false); }}>Add category</Button></DialogFooter></DialogContent></Dialog>;
}
function WorkItemDialog({ open, onOpenChange, category, units, onSave }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    category: WorkCategory | null;
    units: MasterUnit[];
    onSave: (draft: DraftWork) => void;
}) {
    const [draft, setDraft] = React.useState<DraftWork>({ categoryId: "", name: "", workTypeName: "Standard", unitId: "sqft", notes: "" });
    React.useEffect(() => { if (open)
        setDraft({ categoryId: category?.id || "", name: "", workTypeName: "Standard", unitId: "sqft", notes: "" }); }, [open, category?.id]);
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Add sub category</DialogTitle><DialogDescription>{category ? `Create an execution sub category under ${category.name}. Contractor quotes calculate the rate averages.` : "Create an execution sub category."}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="Sub category name"><Input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="For example: Gypsum false ceiling"/></Field><Field label="Initial work type"><Input value={draft.workTypeName} onChange={(event) => setDraft((current) => ({ ...current, workTypeName: event.target.value }))} placeholder="Standard, Budget, Premium or Luxury"/></Field><Field label="Execution unit"><NativeSelect value={draft.unitId} onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol} · {unit.name}</option>)}</NativeSelect></Field></div><Field label="Scope note"><Textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Where this work is used, finish requirements or exclusions…"/></Field><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { onSave(draft); onOpenChange(false); }}><Plus className="h-3.5 w-3.5"/> Add sub category</Button></DialogFooter></DialogContent></Dialog>;
}
function MaterialDialog({ open, onOpenChange, master, work, onSave }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    master: Master;
    work: WorkSubcategory | null;
    onSave: (workId: string, draft: DraftMaterial) => void;
}) {
    const [draft, setDraft] = React.useState<DraftMaterial>({ mode: "existing", articleId: "", name: "", unitId: "", referenceRate: "0", variationNote: "", productNote: "" });
    React.useEffect(() => { if (open)
        setDraft({ mode: "existing", articleId: "", name: "", unitId: work?.unit_id || "pcs", referenceRate: "0", variationNote: "", productNote: "" }); }, [open, work?.id, work?.unit_id]);
    const linkedIds = new Set(master.subcategoryArticleMap.filter((scope) => scope.work_required_id === work?.id).map((scope) => scope.article_id));
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Link material article</DialogTitle><DialogDescription>{work ? `Add a material context to ${work.name}. Its unit and scoped reference rate stay linked to this sub category.` : "Select a sub category."}</DialogDescription></DialogHeader><div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1"><Button size="sm" variant={draft.mode === "existing" ? "default" : "ghost"} onClick={() => setDraft((current) => ({ ...current, mode: "existing" }))}>Use canonical article</Button><Button size="sm" variant={draft.mode === "new" ? "default" : "ghost"} onClick={() => setDraft((current) => ({ ...current, mode: "new" }))}>Create article</Button></div>{draft.mode === "existing" ? <Field label="Canonical material article"><NativeSelect value={draft.articleId} onChange={(event) => { const chosen = master.articles.find((article) => article.id === event.target.value); setDraft((current) => ({ ...current, articleId: event.target.value, unitId: chosen?.default_unit_id || current.unitId })); }}><option value="">Select article</option>{master.articles.filter((article) => !linkedIds.has(article.id)).slice().sort((a, b) => a.name.localeCompare(b.name)).map((article) => <option key={article.id} value={article.id}>{article.name} · {unitLabel(master, article.default_unit_id)}</option>)}</NativeSelect></Field> : <div className="grid gap-3 sm:grid-cols-2"><Field label="Material article name"><Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="For example: Premium laminate sheet"/></Field><Field label="Default procurement unit"><NativeSelect value={draft.unitId} onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}>{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(master, unit.id)}</option>)}</NativeSelect></Field></div>}<div className="grid gap-3 sm:grid-cols-2"><Field label="Scoped material unit" hint="This can differ from the article default when the same material is used in a different scope."><NativeSelect value={draft.unitId} onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}>{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(master, unit.id)}</option>)}</NativeSelect></Field><Field label="Scoped reference rate"><Input type="number" min="0" value={draft.referenceRate} onChange={(event) => setDraft((current) => ({ ...current, referenceRate: event.target.value }))}/></Field></div><Field label="Scope note"><Input value={draft.variationNote} onChange={(event) => setDraft((current) => ({ ...current, variationNote: event.target.value }))} placeholder="Use variants for grade, pack, brand, size, finish or SKU"/></Field><Field label="Material note"><Textarea value={draft.productNote} onChange={(event) => setDraft((current) => ({ ...current, productNote: event.target.value }))} placeholder="Specification, sourcing, or installation note"/></Field><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { if (work) {
        onSave(work.id, draft);
        onOpenChange(false);
    } }}><Link2 className="h-3.5 w-3.5"/> Link material</Button></DialogFooter></DialogContent></Dialog>;
}
function VariantDialog({ open, onOpenChange, master, article, updateArticle, addVariant, updateVariant, removeVariant }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    master: Master;
    article: Article | null;
    updateArticle: (id: string, patch: Partial<Article>) => void;
    addVariant: (articleId: string, draft: DraftVariant) => void;
    updateVariant: (id: string, patch: Partial<ArticleVariant>) => void;
    removeVariant: (id: string) => void;
}) {
    const blankDraft = React.useCallback((): DraftVariant => ({ name: "", sku: "", unitId: "", brand: "", grade: "", packSize: "", thickness: "", size: "", finish: "", color: "", series: "" }), []);
    const [draft, setDraft] = React.useState<DraftVariant>(() => blankDraft());
    React.useEffect(() => { if (open)
        setDraft(blankDraft()); }, [open, article?.id, blankDraft]);
    const variants = master.articleVariants.filter((variant) => variant.article_id === article?.id);
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>Variants - {article?.name || "Article"}</DialogTitle><DialogDescription>Use variants for priceable specifications such as brand, grade, pack size, thickness, size, finish, color, series, model, or SKU. Keep the article name as the reusable material identity.</DialogDescription></DialogHeader>{article ? <div className="grid gap-4">
    <section className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold">Article identity</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Article name"><Input defaultValue={article.name} onBlur={(event) => event.target.value !== article.name && updateArticle(article.id, { name: event.target.value })}/></Field>
        <Field label="Default unit for future links"><NativeSelect value={article.default_unit_id || "pcs"} onChange={(event) => updateArticle(article.id, { default_unit_id: event.target.value })}>{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(master, unit.id)}</option>)}</NativeSelect></Field>
      </div>
    </section>

    <section className="rounded-lg border border-border bg-background p-3">
      <p className="mb-2 text-xs font-semibold">Add variant</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Variant name"><Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="12mm / 20L / Premium"/></Field>
        <Field label="SKU"><Input value={draft.sku} onChange={(event) => setDraft((current) => ({ ...current, sku: event.target.value }))}/></Field>
        <Field label="Unit"><NativeSelect value={draft.unitId} onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}><option value="">Use base - {master.units.find((unit) => unit.id === article.default_unit_id)?.symbol}</option>{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(master, unit.id)}</option>)}</NativeSelect></Field>
        <Field label="Brand"><Input value={draft.brand} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}/></Field>
        <Field label="Grade"><Input value={draft.grade} onChange={(event) => setDraft((current) => ({ ...current, grade: event.target.value }))}/></Field>
        <Field label="Pack size"><Input value={draft.packSize} onChange={(event) => setDraft((current) => ({ ...current, packSize: event.target.value }))} placeholder="25kg, 20L, 8x4"/></Field>
        <Field label="Thickness"><Input value={draft.thickness} onChange={(event) => setDraft((current) => ({ ...current, thickness: event.target.value }))}/></Field>
        <Field label="Size"><Input value={draft.size} onChange={(event) => setDraft((current) => ({ ...current, size: event.target.value }))}/></Field>
        <Field label="Finish"><Input value={draft.finish} onChange={(event) => setDraft((current) => ({ ...current, finish: event.target.value }))}/></Field>
        <Field label="Color"><Input value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}/></Field>
        <Field label="Series / model"><Input value={draft.series} onChange={(event) => setDraft((current) => ({ ...current, series: event.target.value }))}/></Field>
      </div>
      <Button className="mt-3" size="sm" onClick={() => { addVariant(article.id, draft); setDraft(blankDraft()); }}><Plus className="h-3.5 w-3.5"/> Add variant</Button>
    </section>

    {variants.length ? <section className="overflow-hidden rounded-lg border border-border"><div className="overflow-x-auto"><table className="min-w-[1220px] w-full text-left text-xs"><thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Variant</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Brand / grade / pack</th><th className="px-3 py-2">Thickness / size / finish</th><th className="px-3 py-2">Color / series</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th></tr></thead><tbody>{variants.map((variant) => <tr key={variant.id} className="border-t border-border align-top"><td className="px-3 py-2"><Input defaultValue={variant.name} onBlur={(event) => event.target.value !== variant.name && updateVariant(variant.id, { name: event.target.value })} className="h-8 min-w-40"/></td><td className="px-3 py-2"><Input defaultValue={variant.sku || ""} onBlur={(event) => updateVariant(variant.id, { sku: event.target.value })} className="h-8 min-w-28"/></td><td className="px-3 py-2"><NativeSelect value={variant.unit_id || ""} onChange={(event) => updateVariant(variant.id, { unit_id: event.target.value || undefined })} className="h-8 min-w-32"><option value="">Base - {master.units.find((unit) => unit.id === article.default_unit_id)?.symbol}</option>{master.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}</NativeSelect></td><td className="px-3 py-2"><div className="grid gap-1"><Input defaultValue={variant.brand || ""} placeholder="Brand" onBlur={(event) => updateVariant(variant.id, { brand: event.target.value })} className="h-8"/><Input defaultValue={variant.grade || ""} placeholder="Grade" onBlur={(event) => updateVariant(variant.id, { grade: event.target.value })} className="h-8"/><Input defaultValue={variant.pack_size || ""} placeholder="Pack size" onBlur={(event) => updateVariant(variant.id, { pack_size: event.target.value })} className="h-8"/></div></td><td className="px-3 py-2"><div className="grid gap-1"><Input defaultValue={variant.thickness || ""} placeholder="Thickness" onBlur={(event) => updateVariant(variant.id, { thickness: event.target.value })} className="h-8"/><Input defaultValue={variant.size || ""} placeholder="Size" onBlur={(event) => updateVariant(variant.id, { size: event.target.value })} className="h-8"/><Input defaultValue={variant.finish || ""} placeholder="Finish" onBlur={(event) => updateVariant(variant.id, { finish: event.target.value })} className="h-8"/></div></td><td className="px-3 py-2"><div className="grid gap-1"><Input defaultValue={variant.color || ""} placeholder="Color" onBlur={(event) => updateVariant(variant.id, { color: event.target.value })} className="h-8"/><Input defaultValue={variant.series || ""} placeholder="Series / model" onBlur={(event) => updateVariant(variant.id, { series: event.target.value })} className="h-8"/></div></td><td className="px-3 py-2"><Button size="sm" variant={variant.enabled === false ? "outline" : "default"} onClick={() => updateVariant(variant.id, { enabled: variant.enabled === false })}>{variant.enabled === false ? "Enable" : "Active"}</Button></td><td className="px-3 py-2"><Button size="icon" variant="ghost" onClick={() => removeVariant(variant.id)} aria-label={`Delete ${variant.name}`}><Trash2 className="h-4 w-4 text-destructive"/></Button></td></tr>)}</tbody></table></div></section> : <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No variants yet. Add a variant when the specification becomes a different priceable option.</div>}
  </div> : null}</DialogContent></Dialog>;
}
function UnitDialog({ open, onOpenChange, onSave }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (draft: DraftUnit) => void;
}) {
    const [draft, setDraft] = React.useState<DraftUnit>({ symbol: "", name: "", family: "other" });
    return <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next)
        setDraft({ symbol: "", name: "", family: "other" }); }}><DialogContent><DialogHeader><DialogTitle>Add shared unit</DialogTitle><DialogDescription>Create a stable unit once and reuse it across sub categories, material scopes, variants and vendor rates.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="Symbol"><Input autoFocus value={draft.symbol} onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value }))} placeholder="sqmt"/></Field><Field label="Name"><Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Square metres"/></Field><Field label="Family"><NativeSelect value={draft.family} onChange={(event) => setDraft((current) => ({ ...current, family: event.target.value as DraftUnit["family"] }))}><option value="area">Area</option><option value="length">Length</option><option value="count">Count</option><option value="weight">Weight</option><option value="volume">Volume</option><option value="package">Package</option><option value="other">Other</option></NativeSelect></Field></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { onSave(draft); onOpenChange(false); }}>Add unit</Button></DialogFooter></DialogContent></Dialog>;
}
function ArticleDialog({ open, onOpenChange, units, onSave }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    units: MasterUnit[];
    onSave: (name: string, unitId: string) => void;
}) {
    const [name, setName] = React.useState("");
    const [unitId, setUnitId] = React.useState("pcs");
    return <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) {
        setName("");
        setUnitId("pcs");
    } }}><DialogContent><DialogHeader><DialogTitle>Create canonical article</DialogTitle><DialogDescription>The article is a reusable material identity. Link it to specific sub categories afterwards to set scoped rate and unit context.</DialogDescription></DialogHeader><Field label="Material article name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="For example: WPC fluted panel 8ft"/></Field><Field label="Default procurement unit"><NativeSelect value={unitId} onChange={(event) => setUnitId(event.target.value)}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol} · {unit.name}</option>)}</NativeSelect></Field><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { onSave(name, unitId); onOpenChange(false); }}><FilePlus2 className="h-3.5 w-3.5"/> Create article</Button></DialogFooter></DialogContent></Dialog>;
}
