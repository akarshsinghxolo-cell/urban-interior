import type { ArticleVariant, LineItem, RDashDatabase, WorkRequired } from "./types";
import { attachCustomerLabels } from "./customer";
import { prepareWorkspaceData, normalizeCatalogName } from "./work-category-master";

const timestamp = "2026-07-08T00:00:00.000Z";

function tokenScore(title: string, articleName: string) {
  const titleTokens = new Set(normalizeCatalogName(title).split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  const articleTokens = normalizeCatalogName(articleName).split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  return articleTokens.reduce((score, token) => score + (titleTokens.has(token) ? 1 : 0), 0);
}

function bestScopedMaterialForLine(db: RDashDatabase, line: LineItem, work?: WorkRequired) {
  const subcategoryIds = work?.work_subcategory_ids || [];
  const rows = db.master.subcategoryArticleMap.filter((row) => !subcategoryIds.length || subcategoryIds.includes(row.work_required_id));
  if (!rows.length) return undefined;
  const current = line.work_required_article_id ? rows.find((row) => row.id === line.work_required_article_id) : undefined;
  if (current) return current;
  const byArticle = line.article_id ? rows.find((row) => row.article_id === line.article_id) : undefined;
  const title = normalizeCatalogName(line.title);
  if (title.includes("jointing") || title.includes("compound")) {
    const row = rows.find((entry) => normalizeCatalogName(db.master.articles.find((a) => a.id === entry.article_id)?.name).includes("jointing compound"));
    if (row) return row;
  }
  if (title.includes("suspension") || title.includes("hanger")) {
    const row = rows.find((entry) => /hanger|suspension/i.test(db.master.articles.find((a) => a.id === entry.article_id)?.name || ""));
    if (row) return row;
  }
  if (title.includes("framework") || title.includes("gi ") || title.includes("channel")) {
    const row = rows.find((entry) => /main gi channel|main t runner/i.test(db.master.articles.find((a) => a.id === entry.article_id)?.name || ""));
    if (row) return row;
  }
  if (title.includes("grid")) {
    const row = rows.find((entry) => /armstrong|tile/i.test(db.master.articles.find((a) => a.id === entry.article_id)?.name || ""));
    if (row) return row;
  }
  if (title.includes("paint") || title.includes("emulsion")) {
    const row = rows.find((entry) => /emulsion/i.test(db.master.articles.find((a) => a.id === entry.article_id)?.name || ""));
    if (row) return row;
  }
  const scored = rows
    .map((row) => ({ row, score: tokenScore(line.title, db.master.articles.find((a) => a.id === row.article_id)?.name || "") }))
    .sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) return scored[0].row;
  return byArticle || rows[0];
}

function unitName(db: RDashDatabase, unitId: string | undefined, fallback?: string) {
  return db.master.units.find((unit) => unit.id === unitId)?.name || fallback || unitId || "Unit";
}

function repairLine(db: RDashDatabase, line: LineItem, context: string): LineItem {
  const work = line.work_required_id ? db.workRequired.find((row) => row.id === line.work_required_id) : undefined;
  const material = bestScopedMaterialForLine(db, line, work);
  if (!material) return line;
  const article = db.master.articles.find((row) => row.id === material.article_id);
  const variant = scopedVariantForMaterial(db, material.id);
  const repaired: LineItem = {
    ...line,
    article_id: material.article_id,
    work_required_article_id: material.id,
    variant_id: line.variant_id || variant?.id,
    category_id: work?.work_category_id || db.master.workSubcategories.find((row) => row.id === material.work_required_id)?.category_id || line.category_id,
    unit_id: material.unit_id,
    unit_name: unitName(db, material.unit_id, line.unit_name),
  };
  if (!repaired.title && article?.name) repaired.title = article.name;
  if (!repaired.amount || Math.abs(repaired.amount - repaired.quantity * repaired.rate) > 1) {
    repaired.amount = Math.round((Number(repaired.quantity || 0) * Number(repaired.rate || 0)) * 100) / 100;
  }
  repaired.source_kind = repaired.source_kind || (context as LineItem["source_kind"]);
  return repaired;
}

function repairQuotationTotals(db: RDashDatabase) {
  db.quotations = db.quotations.map((quote) => {
    const sourceLines = quote.scope_lines?.length ? quote.scope_lines : quote.items || [];
    const scopeLines = sourceLines.map((line) => repairLine(db, line, "quotation"));
    const subtotal = Math.round(scopeLines.reduce((sum, line) => sum + Number(line.amount || line.quantity * line.rate || 0), 0) * 100) / 100;
    const tax = Math.round(scopeLines.reduce((sum, line) => sum + Number(line.amount || 0) * Number(line.tax_rate || 0) / 100, 0) * 100) / 100;
    return { ...quote, scope_lines: scopeLines, items: [], subtotal, tax_amount: tax, total_amount: Math.round((subtotal + tax) * 100) / 100 };
  });
}

function scopedVariantId(materialId: string) {
  return `var_${materialId}_standard`;
}

function scopedVariantForMaterial(db: RDashDatabase, materialId: string | undefined) {
  if (!materialId) return undefined;
  return db.master.articleVariants.find((row) => (row as ArticleVariant & { work_required_article_id?: string }).work_required_article_id === materialId)
    || db.master.articleVariants.find((row) => row.id === scopedVariantId(materialId));
}

function seedArticleVariants(db: RDashDatabase) {
  const usedNamesByArticle = new Map<string, Set<string>>();
  const existingScopedIds = new Set(
    db.master.articleVariants
      .map((variant) => (variant as ArticleVariant & { work_required_article_id?: string }).work_required_article_id)
      .filter(Boolean) as string[],
  );
  const variants: ArticleVariant[] = [...db.master.articleVariants];
  db.master.articleVariants.forEach((variant) => {
    const key = variant.article_id;
    const names = usedNamesByArticle.get(key) || new Set<string>();
    names.add(variant.name);
    usedNamesByArticle.set(key, names);
  });
  db.master.subcategoryArticleMap.forEach((material) => {
    if (existingScopedIds.has(material.id)) return;
    const subcategory = db.master.workSubcategories.find((row) => row.id === material.work_required_id);
    const article = db.master.articles.find((row) => row.id === material.article_id);
    const names = usedNamesByArticle.get(material.article_id) || new Set<string>();
    let name = subcategory?.name ? `Standard · ${subcategory.name}` : "Standard";
    if (names.has(name)) name = `${name} · ${material.id}`;
    names.add(name);
    usedNamesByArticle.set(material.article_id, names);
    variants.push({
      id: scopedVariantId(material.id),
      article_id: material.article_id,
      work_required_article_id: material.id,
      name,
      sku: `${(article?.id || material.article_id).toUpperCase()}-${material.id.toUpperCase()}-STD`,
      unit_id: material.unit_id,
      enabled: true,
      created_at: timestamp,
      updated_at: timestamp,
    } as ArticleVariant & { work_required_article_id: string });
  });
  db.master.articleVariants = variants;
  db.master.articles = db.master.articles.map((article) => ({
    ...article,
    variant_ids: db.master.articleVariants.filter((variant) => variant.article_id === article.id).map((variant) => variant.id),
  }));
}

function ensureVendorRateCoverage(db: RDashDatabase) {
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

function repairInventoryAndMovements(db: RDashDatabase) {
  db.inventory = db.inventory.map((item) => {
    const sourceGrn = item.grn_id ? db.grns.find((grn) => grn.id === item.grn_id) : undefined;
    const sourceLine = sourceGrn?.items.find((line) => line.article_id === item.article_id || normalizeCatalogName(line.title) === normalizeCatalogName(item.name));
    const material = sourceLine?.work_required_article_id ? db.master.subcategoryArticleMap.find((row) => row.id === sourceLine.work_required_article_id) : undefined;
    if (!material) return item;
    return { ...item, article_id: material.article_id, work_required_article_id: material.id, unit_id: material.unit_id, unit_name: unitName(db, material.unit_id, item.unit_name) } as typeof item;
  });
  if (!db.stockMovements.length && db.inventory.length) {
    db.stockMovements = db.inventory.map((item) => ({
      id: `sm-${item.id}`,
      inventory_id: item.id,
      article_id: item.article_id,
      work_required_article_id: (item as { work_required_article_id?: string }).work_required_article_id,
      name: item.name,
      type: "receipt" as const,
      quantity: Number(item.received_qty ?? item.quantity ?? 0),
      unit_id: item.unit_id,
      unit_name: item.unit_name,
      rate: item.rate,
      work_order_id: item.work_order_id,
      work_order_no: item.work_order_no,
      grn_id: item.grn_id,
      notes: "Auto-created from initial GRN receipt during PostgreSQL migration.",
      created_at: item.created_at,
    }));
  } else {
    db.stockMovements = db.stockMovements.map((movement) => {
      const inventory = db.inventory.find((item) => item.id === movement.inventory_id);
      const scoped = inventory as typeof inventory & { work_required_article_id?: string };
      return scoped?.work_required_article_id ? { ...movement, article_id: scoped.article_id, work_required_article_id: scoped.work_required_article_id, unit_id: scoped.unit_id, unit_name: scoped.unit_name } as typeof movement : movement;
    });
  }
}

function repairWorkCosts(db: RDashDatabase) {
  // FIX-CONTRACTOR-BATCH1 / F.3: vendor_id is the canonical counterparty
  // field on WorkOrderCostLine (matches runtime code in contractors.ts and
  // the ContractorDetailModule filter `cl.vendor_id === c.id`). Previously
  // this repair function UNSET vendor_id when the counterparty was a
  // contractor — which actively broke the canonical-field filter for
  // runtime-created cost lines (createContractorRABill, settleContractor).
  // Now we MIRROR vendor_id → contractor_id (for backward compat with any
  // consumer that still reads contractor_id) but NEVER unset vendor_id.
  db.workOrderCostLines = db.workOrderCostLines.map((line) => {
    if (line.vendor_id && db.master.contractors.some((contractor) => contractor.id === line.vendor_id)) {
      return { ...line, contractor_id: line.contractor_id || line.vendor_id, contractor_name: line.contractor_name || line.vendor_name } as typeof line;
    }
    // Legacy seed rows that only have contractor_id (no vendor_id): mirror
    // contractor_id → vendor_id so the canonical filter finds them too.
    if (!line.vendor_id && line.contractor_id && db.master.contractors.some((contractor) => contractor.id === line.contractor_id)) {
      return { ...line, vendor_id: line.contractor_id, vendor_name: line.vendor_name || line.contractor_name } as typeof line;
    }
    return line;
  });
}

export function repairOperationalWorkspace(input: RDashDatabase): RDashDatabase {
  const db = attachCustomerLabels(prepareWorkspaceData(structuredClone(input) as RDashDatabase));
  seedArticleVariants(db);
  ensureVendorRateCoverage(db);
  repairQuotationTotals(db);
  db.boqs = db.boqs.map((boq) => ({ ...boq, items: boq.items.map((line) => repairLine(db, line, "boq")), total_amount: Math.round(boq.items.reduce((sum, line) => sum + Number(line.amount || 0), 0) * 100) / 100 }));
  db.purchaseOrders = db.purchaseOrders.map((po) => {
    const items = po.items.map((line) => repairLine(db, line, "po"));
    const subtotal = Math.round(items.reduce((sum, line) => sum + Number(line.amount || 0), 0) * 100) / 100;
    const tax = Math.round(items.reduce((sum, line) => sum + Number(line.amount || 0) * Number(line.tax_rate || 0) / 100, 0) * 100) / 100;
    return { ...po, items, subtotal, tax_amount: tax, total_amount: Math.round((subtotal + tax) * 100) / 100 };
  });
  db.grns = db.grns.map((grn) => ({ ...grn, items: grn.items.map((line) => repairLine(db, line, "grn")) }));
  db.dispatches = db.dispatches.map((dispatch) => ({ ...dispatch, items: dispatch.items.map((line) => repairLine(db, line, "inventory")) }));
  repairInventoryAndMovements(db);
  repairWorkCosts(db);
  return attachCustomerLabels(prepareWorkspaceData(db));
}
