from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def path(name: str) -> Path:
    return ROOT / name

def replace_all(file: str, pairs: list[tuple[str, str]]) -> None:
    p = path(file)
    text = p.read_text()
    for old, new in pairs:
        if old not in text:
            raise SystemExit(f"{file}: missing expected marker {old[:100]!r}")
        text = text.replace(old, new)
    p.write_text(text)

def sub_once(file: str, pattern: str, replacement: str) -> None:
    p = path(file)
    text = p.read_text()
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{file}: expected one regex match: {pattern[:100]!r}")
    p.write_text(next_text)

# Vendor performance has a derived star rating; it is not a commercial profile
# configuration and remains an observed metric alongside reliability/on-time.
types = path("src/lib/rdash/types.ts").read_text()
needle = "    on_time_pct?: number;\n    created_at?: string;"
if needle in types:
    types = types.replace(needle, "    on_time_pct?: number;\n    rating?: number;\n    created_at?: string;", 1)
path("src/lib/rdash/types.ts").write_text(types)

# -------------------------------------------------------------------------
# Material price tracker: history provides audit snapshots; current rate rows
# derive labels/unit/brand from canonical Article/Variant masters.
# -------------------------------------------------------------------------
p = path("src/components/rdash/MaterialPriceTracker.tsx")
text = p.read_text()
text = text.replace('import { formatINR } from "@/lib/rdash/format";', 'import { formatINR } from "@/lib/rdash/format";\nimport { resolveArticleRateConfig } from "@/lib/rdash/article-rate-config";')
text = text.replace('          articleName: h.article_name,', '          articleName: h.article_name || db.master.articles.find((article) => article.id === h.article_id)?.name || "Unknown Article",')
old = '''    for (const vr of db.master.vendorRates) {
      const vendor = db.master.vendors.find((v) => v.id === vr.vendor_id);
      const key = `${vr.vendor_id}-${vr.article_id}`;
      if (!byArticle.has(key)) {
        byArticle.set(key, {
          id: vr.id,
          articleName: vr.article_name,
          vendorName: vendor?.name || "Unknown",
          currentRate: vr.rate,
          changePct: 0,
          trend: "stable",
          unit: vr.unit_id,
          brand: vr.brand,
          lastUpdated: vr.updated_at,
        });
      }
    }'''
new = '''    for (const vr of db.master.vendorRates) {
      const vendor = db.master.vendors.find((v) => v.id === vr.vendor_id);
      const article = db.master.articles.find((row) => row.id === vr.article_id);
      const variant = vr.variant_id ? db.master.articleVariants.find((row) => row.id === vr.variant_id) : undefined;
      const config = resolveArticleRateConfig({ articleId: vr.article_id, variantId: vr.variant_id, articles: db.master.articles, variants: db.master.articleVariants });
      const key = `${vr.vendor_id}-${vr.article_id}`;
      if (!byArticle.has(key)) {
        byArticle.set(key, {
          id: vr.id,
          articleName: article?.name || "Unknown Article",
          vendorName: vendor?.name || "Unknown",
          currentRate: vr.quoted_rate,
          changePct: 0,
          trend: "stable",
          unit: config.rateUnit,
          brand: variant?.brand,
          lastUpdated: vr.updated_at,
        });
      }
    }'''
if old not in text:
    raise SystemExit("MaterialPriceTracker current-rate block changed unexpectedly")
text = text.replace(old, new)
text = text.replace('  }, [db.master.vendorRateHistories, db.master.vendorRates, db.master.vendors]);', '  }, [db.master.vendorRateHistories, db.master.vendorRates, db.master.vendors, db.master.articles, db.master.articleVariants]);')
p.write_text(text)

# -------------------------------------------------------------------------
# Masters Vendor cards/rate list: VendorRate owns only the quote; display data
# comes from Article/Variant master.
# -------------------------------------------------------------------------
p = path("src/components/rdash/modules/MastersSalesOpsModule.tsx")
text = p.read_text()
text = text.replace('import { latestQuotationRevisions } from "@/lib/rdash/metrics";', 'import { latestQuotationRevisions } from "@/lib/rdash/metrics";\nimport { resolveArticleRateConfig } from "@/lib/rdash/article-rate-config";')
text = text.replace('{rates.map((r) => <span key={r.id} className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px]">{r.article_name}: {formatINR(r.rate)}</span>)}', '{rates.map((r) => <span key={r.id} className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px]">{db.master.articles.find((article) => article.id === r.article_id)?.name || "Unknown Article"}: {formatINR(r.quoted_rate)}</span>)}')
old = '''          {isVendor && db.master.vendorRates.map((r) => {
                const v = db.master.vendors.find((x) => x.id === r.vendor_id);
                return <button key={r.id} type="button" onClick={() => openDetail("vendorRate" as any, r.id)} className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-accent/20 focus-visible:bg-accent/30 focus-visible:outline-none"><div><p className="font-medium">{r.article_name}</p><p className="text-[11px] text-muted-foreground">{v?.name} · {r.unit_id} · click for rate context</p></div><span className="font-mono font-bold">{formatINR(r.rate)}</span></button>;
            })}'''
new = '''          {isVendor && db.master.vendorRates.map((r) => {
                const v = db.master.vendors.find((x) => x.id === r.vendor_id);
                const article = db.master.articles.find((row) => row.id === r.article_id);
                const config = resolveArticleRateConfig({ articleId: r.article_id, variantId: r.variant_id, articles: db.master.articles, variants: db.master.articleVariants });
                return <button key={r.id} type="button" onClick={() => openDetail("vendorRate" as any, r.id)} className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-accent/20 focus-visible:bg-accent/30 focus-visible:outline-none"><div><p className="font-medium">{article?.name || "Unknown Article"}</p><p className="text-[11px] text-muted-foreground">{v?.name} · {config.rateUnit || "Unit not configured"} · click for rate context</p></div><span className="font-mono font-bold">{formatINR(r.quoted_rate)}</span></button>;
            })}'''
if old not in text:
    raise SystemExit("MastersSalesOps Vendor rate list block changed unexpectedly")
text = text.replace(old, new)
p.write_text(text)

# -------------------------------------------------------------------------
# Procurement: WorkRequiredArticle remains a line/scope relationship only.
# Vendor quote matching is Vendor + Article + optional Variant.
# -------------------------------------------------------------------------
p = path("src/components/rdash/modules/ProcurementModule.tsx")
text = p.read_text()
text = text.replace('import type { LineItem, VendorBidLine } from "@/lib/rdash/types";', 'import type { LineItem, Master, VendorBidLine } from "@/lib/rdash/types";')
text = text.replace('import { applyVendorRateUpdates } from "@/lib/rdash/vendor-rate";', 'import { applyVendorRateUpdates } from "@/lib/rdash/vendor-rate";\nimport { resolveArticleRateConfig } from "@/lib/rdash/article-rate-config";')
marker = '''function newBuilderRow(): BuilderRow {
    return {
        id: `br-${Math.random().toString(36).slice(2, 8)}`,
        work_required_article_id: "",
        quantity: 1,
        rate: null,
    };
}
'''
helper = marker + '''function procurementArticleId(master: Master, line: Pick<LineItem, "article_id" | "work_required_article_id">) {
    return line.article_id || (line.work_required_article_id ? master.subcategoryArticleMap.find((row) => row.id === line.work_required_article_id)?.article_id : undefined);
}
'''
if marker not in text:
    raise SystemExit("Procurement builder marker missing")
text = text.replace(marker, helper, 1)
text = re.sub(r'''const vendorRate = db\.master\.vendorRates\.find\(\(vr\) => vr\.vendor_id === firstVendor &&\s*\(vr\.work_required_article_id === boqItem\.work_required_article_id \|\|\s*vr\.article_id === boqItem\.article_id\)\);\s*prefilledRates\[itemId\] = vendorRate \? String\(vendorRate\.rate\) : "";''', '''const articleId = procurementArticleId(db.master, boqItem);
                const vendorRate = articleId ? db.master.vendorRates.find((vr) => vr.vendor_id === firstVendor && vr.article_id === articleId && (vr.variant_id || "") === (boqItem.variant_id || "")) : undefined;
                prefilledRates[itemId] = vendorRate ? String(vendorRate.quoted_rate) : "";''', text, count=1)
text = re.sub(r'''const vendorRate = db\.master\.vendorRates\.find\(\(vr\) => vr\.vendor_id === vendorId &&\s*\(vr\.work_required_article_id === boqItem\.work_required_article_id \|\|\s*vr\.article_id === boqItem\.article_id\)\);\s*prefilledRates\[itemId\] = vendorRate \? String\(vendorRate\.rate\) : "";''', '''const articleId = procurementArticleId(db.master, boqItem);
                const vendorRate = articleId ? db.master.vendorRates.find((vr) => vr.vendor_id === vendorId && vr.article_id === articleId && (vr.variant_id || "") === (boqItem.variant_id || "")) : undefined;
                prefilledRates[itemId] = vendorRate ? String(vendorRate.quoted_rate) : "";''', text, count=1)
old = '''            const vendorRate = scope ? vendorRates.find((rate) => rate.work_required_article_id === scope.id) : undefined;
            const unitId = vendorRate?.unit_id || scope?.unit_id || article?.default_unit_id || article?.unit_id;
            const rate = row.rate ?? vendorRate?.rate ?? 0;'''
new = '''            const vendorRate = article ? vendorRates.find((rate) => rate.article_id === article.id && !rate.variant_id) : undefined;
            const rateConfig = article ? resolveArticleRateConfig({ articleId: article.id, variantId: vendorRate?.variant_id, articles: db.master.articles, variants: db.master.articleVariants }) : undefined;
            const unitId = rateConfig?.rateUnit || scope?.unit_id || article?.default_unit_id || article?.unit_id;
            const rate = row.rate ?? vendorRate?.quoted_rate ?? 0;'''
if old not in text:
    raise SystemExit("Procurement PO row VendorRate block missing")
text = text.replace(old, new, 1)
old = '''            vendorId: vendor.id,
            scope: row.scope!,
            articleName: row.article!.name,
            unitId: row.unitId,
            variantId: row.vendorRate?.variant_id || db.master.articleVariants.find((variant) => (variant as { work_required_article_id?: string }).work_required_article_id === row.scope!.id)?.id,
            rate: row.rate,'''
new = '''            vendorId: vendor.id,
            articleId: row.article!.id,
            articleName: row.article!.name,
            workRequiredArticleId: row.scope!.id,
            variantId: row.vendorRate?.variant_id,
            quotedRate: row.rate,'''
if old not in text:
    raise SystemExit("Procurement VendorRate update payload missing")
text = text.replace(old, new, 1)
text = re.sub(r'''const vendorRate = vendorId\s*\? db\.master\.vendorRates\.find\(\(vr: any\) => vr\.vendor_id === vendorId &&\s*\(vr\.work_required_article_id === item\.work_required_article_id \|\|\s*vr\.article_id === item\.article_id\)\)\s*: undefined;''', '''const itemArticleId = procurementArticleId(db.master, item);
                    const vendorRate = vendorId && itemArticleId
                        ? db.master.vendorRates.find((vr) => vr.vendor_id === vendorId && vr.article_id === itemArticleId && (vr.variant_id || "") === (item.variant_id || ""))
                        : undefined;''', text, count=1)
text = text.replace('`Last rate: ${vendorRate.rate} (updated ${vendorRate.updated_at?.slice(0, 10) || "—"})`', '`Last rate: ${vendorRate.quoted_rate} (updated ${vendorRate.updated_at.slice(0, 10) || "—"})`')
text = text.replace('{vendorRate ? formatINR(vendorRate.rate) : "—"}', '{vendorRate ? formatINR(vendorRate.quoted_rate) : "—"}')
text = text.replace('placeholder={vendorRate ? String(vendorRate.rate) : "0"}', 'placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"}')
p.write_text(text)

# -------------------------------------------------------------------------
# Rate Finder uses the renamed derived-rate fields, not compatibility aliases.
# -------------------------------------------------------------------------
replace_all("src/components/rdash/modules/RateFinderModule.tsx", [
    ("rate.rawUnitId", "rate.rateUnit"),
    ("rate.vendorRateId", "rate.sourceId"),
    ("rate.rawRate", "rate.quotedRate"),
])

# Vendor 360 resolves the Article label from the canonical Article master.
p = path("src/components/rdash/modules/VendorWorkspaceModule.tsx")
text = p.read_text()
text = text.replace('title={`${rate.article_name}${variant ? ` · ${variant.name}` : ""}`}', 'title={`${db.master.articles.find((article) => article.id === rate.article_id)?.name || "Unknown Article"}${variant ? ` · ${variant.name}` : ""}`}')
p.write_text(text)

# -------------------------------------------------------------------------
# Work-category master owns catalogue links; VendorRate no longer owns scope or
# unit copies. Article deletion is the only catalogue deletion that removes a
# VendorRate; variant deletion drops the optional variant reference.
# -------------------------------------------------------------------------
p = path("src/components/rdash/modules/WorkCategoryMasterModule.tsx")
text = p.read_text()
text = text.replace('vendorRates: current.vendorRates.filter((rate) => !scopeIds.has(rate.work_required_article_id || "") && !removedArticleIds.has(rate.article_id)),', 'vendorRates: current.vendorRates.filter((rate) => !removedArticleIds.has(rate.article_id)),')
text = text.replace('vendorRates: patch.unit_id ? current.vendorRates.map((rate) => rate.work_required_article_id === scopeId && !rate.variant_id ? { ...rate, unit_id: patch.unit_id, updated_at: iso() } : rate) : current.vendorRates,', 'vendorRates: current.vendorRates,')
text = text.replace('            vendorRates: current.vendorRates.filter((rate) => rate.work_required_article_id !== scopeId),\n', '')
old = '''                vendorRates: patch.unit_id !== undefined && selected ? current.vendorRates.map((rate) => {
                    if (rate.variant_id !== variantId)
                        return rate;
                    const scope = scopeFor(current, rate.work_required_article_id);
                    return { ...rate, unit_id: selected.unit_id || scope?.unit_id || "pcs", updated_at: iso() };
                }) : current.vendorRates,'''
if old in text:
    text = text.replace(old, '                vendorRates: current.vendorRates,')
old = '''            vendorRates: current.vendorRates.map((rate) => {
                if (rate.variant_id !== variantId)
                    return rate;
                const scope = scopeFor(current, rate.work_required_article_id);
                return { ...rate, variant_id: undefined, unit_id: scope?.unit_id || rate.unit_id, updated_at: iso() };
            }),'''
if old in text:
    text = text.replace(old, '            vendorRates: current.vendorRates.map((rate) => rate.variant_id === variantId ? { ...rate, variant_id: undefined, updated_at: iso() } : rate),')
text = text.replace('            master.vendorRates.filter((rate) => rate.unit_id === unitId).length,\n', '')
text = text.replace(' + master.vendorRates.filter((rate) => rate.unit_id === unitId).length', '')
old_pattern = r'''vendorRates: current\.vendorRates\.filter\(\(rate\) => validArticles\.has\(rate\.article_id\) && \(!rate\.work_required_article_id \|\| validScopes\.has\(rate\.work_required_article_id\)\) && \(!rate\.variant_id \|\| validVariants\.has\(rate\.variant_id\)\)\)\.map\(\(rate\) => \{.*?\n\s*\}\),'''
text, count = re.subn(old_pattern, 'vendorRates: current.vendorRates.filter((rate) => validArticles.has(rate.article_id) && (!rate.variant_id || validVariants.has(rate.variant_id))),', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("WorkCategory integrity VendorRate rewrite did not match")
p.write_text(text)

# -------------------------------------------------------------------------
# Catalog normalization/repair: no synthetic scope-owned Vendor Rates.
# -------------------------------------------------------------------------
p = path("src/lib/rdash/work-category-master.ts")
text = p.read_text()
text = re.sub(r'''const firstValidMapForArticle = .*?\nexport function buildCatalogDemoVendorRates\(master: Master\): VendorRate\[\] \{.*?\n\}\nfunction ensureMediaCollections''', '''export function buildCatalogDemoVendorRates(master: Master): VendorRate[] {
    const vendorIds = master.vendors.map((vendor) => vendor.id);
    if (!vendorIds.length) return [];
    return master.articles.flatMap((article, articleIndex) => {
        const reference = master.subcategoryArticleMap.find((row) => row.article_id === article.id)?.reference_rate;
        const baseRate = Number(reference || article.base_rate || 1) || 1;
        return vendorIds.map((vendorId, vendorIndex) => ({
            id: `catalog-vr-${vendorId}-${article.id}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
            vendor_id: vendorId,
            article_id: article.id,
            quoted_rate: Math.max(1, Math.round(baseRate * (vendorIndex % 2 === 0 ? 0.96 : 1.04) * 100) / 100),
            status: "active" as const,
            created_at: timestamp,
            updated_at: timestamp,
        }));
    });
}
function ensureMediaCollections''', text, count=1, flags=re.S)
# Replace old catalog-version reconciliation with strict Article/Variant identity.
text, count = re.subn(r'''    const validArticleIds = new Set\(fresh\.articles\.map\(\(article\) => article\.id\)\);\n    const validMapIds = .*?\n    fresh\.vendorRates = reconciled;''', '''    const validArticleIds = new Set(fresh.articles.map((article) => article.id));
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
    fresh.vendorRates = reconciled;''', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Catalog VendorRate reconciliation rewrite did not match")
text, count = re.subn(r'''    master\.vendorRates\.forEach\(\(rate\) => \{\n        if \(!articles\.has\(rate\.article_id\)\).*?\n    \}\);''', '''    master.vendorRates.forEach((rate) => {
        if (!articles.has(rate.article_id))
            issues.push({ severity: "error", message: `Vendor rate ${rate.id} points to a missing article.` });
        if (rate.variant_id && !variants.has(rate.variant_id))
            issues.push({ severity: "error", message: `Vendor rate ${rate.id} points to a missing variant.` });
        if (rate.variant_id) {
            const variant = master.articleVariants.find((row) => row.id === rate.variant_id);
            if (variant && variant.article_id !== rate.article_id)
                issues.push({ severity: "error", message: `Vendor rate ${rate.id} variant belongs to a different article.` });
        }
    });''', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Catalog issue VendorRate block rewrite did not match")
p.write_text(text)

# Operational repair validates current quote identity but never invents prices.
p = path("src/lib/rdash/operational-repair.ts")
text = p.read_text()
text, count = re.subn(r'''function ensureVendorRateCoverage\(db: RDashDatabase\) \{.*?\n\}\n\nfunction repairInventoryAndMovements''', '''function ensureVendorRateCoverage(db: RDashDatabase) {
  const vendorIds = new Set(db.master.vendors.map((vendor) => vendor.id));
  const articleIds = new Set(db.master.articles.map((article) => article.id));
  const variants = new Map(db.master.articleVariants.map((variant) => [variant.id, variant]));
  db.master.vendorRates = db.master.vendorRates.filter((rate) => {
    if (!vendorIds.has(rate.vendor_id) || !articleIds.has(rate.article_id)) return false;
    if (!rate.variant_id) return true;
    return variants.get(rate.variant_id)?.article_id === rate.article_id;
  });
  const rateIds = new Set(db.master.vendorRates.map((rate) => rate.id));
  db.master.vendorRateHistories = db.master.vendorRateHistories.filter((row) => !row.vendor_rate_id || rateIds.has(row.vendor_rate_id));
}

function repairInventoryAndMovements''', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Operational VendorRate repair rewrite did not match")
p.write_text(text)

# Seed data uses the canonical quoted-rate shape. Audit/source context belongs in
# history, not in the live rate object.
p = path("src/lib/rdash/seed.ts")
text = p.read_text()
text, count = re.subn(r'''    vendorRates: \[\n.*?\n    \],\n    // vendorRateHistories:''', '''    vendorRates: [
        { id: "vr-build-gypsum-board", vendor_id: "ven-build", article_id: "art-gypsum-board", quoted_rate: 44, status: "active", created_at: at(-5), updated_at: at(-5) },
        { id: "vr-build-gypsum-channel", vendor_id: "ven-build", article_id: "art-gypsum-channel", quoted_rate: 38, status: "active", created_at: at(-30), updated_at: at(-30) },
        { id: "vr-build-paint-royale", vendor_id: "ven-build", article_id: "art-paint-premium", quoted_rate: 520, status: "active", created_at: at(-2), updated_at: at(-2) },
        { id: "vr-build-primer", vendor_id: "ven-build", article_id: "art-primer", quoted_rate: 280, status: "active", created_at: at(-2), updated_at: at(-2) },
        { id: "vr-ceiling-grid-tee", vendor_id: "ven-ceiling", article_id: "art-grid-tee", quoted_rate: 85, status: "active", created_at: at(-20), updated_at: at(-20) },
    ],
    // vendorRateHistories:''', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Seed VendorRate block rewrite did not match")
p.write_text(text)

print("Canonical VendorRate consumers updated.")
