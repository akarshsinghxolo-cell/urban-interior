import type { RDashDatabase } from "./types";
import { isActiveWorkTaxonomy } from "./work-types";

export function customerMaterialOptions(db: RDashDatabase, customerId: string) {
  const requiredSubcategories = new Set(db.workRequired.filter((work) => work.customer_id === customerId)
    .flatMap((work) => work.work_subcategory_ids || []));
  return db.master.workSubcategories.filter((work) => isActiveWorkTaxonomy(work)
    && requiredSubcategories.has(work.id)).map((work) => ({
    id: work.id,
    name: work.name,
    options: db.master.subcategoryArticleMap.filter((scope) => scope.work_required_id === work.id)
      .flatMap((scope) => {
        const article = db.master.articles.find((article) => article.id === scope.article_id);
        if (!article) return [];
        const variants = db.master.articleVariants.filter((variant) => variant.article_id === article.id
          && variant.enabled !== false && (!variant.work_required_article_id || variant.work_required_article_id === scope.id));
        const note = [scope.product_note, scope.variation_note].filter(Boolean).join(" · ");
        return variants.length ? variants.map((variant) => ({
          id: `${scope.id}:${variant.id}`,
          name: `${article.name} — ${variant.name}`,
          note: [variant.brand, variant.grade, variant.size, variant.finish, variant.color, note].filter(Boolean).join(" · "),
        })) : [{ id: scope.id, name: article.name, note }];
      }),
  })).filter((group) => group.options.length);
}
