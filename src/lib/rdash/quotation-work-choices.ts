import type { LineItem, RDashDatabase, WorkRequired } from "./types";
import { averageWorkTypeTotalRate, capturedPairsTitle, groupedQuotationScopeLines, itemOptionPairs, workTypesForSubcategory } from "./work-types";
import { quotationMeasuredLine } from "./quotation-measurement";

export function spacedQuotationTitle(title: string, db: Pick<RDashDatabase, "master">): string {
  let result = title;
  for (const subcategory of db.master.workSubcategories) {
    for (const type of workTypesForSubcategory(subcategory)) {
      const label = `${subcategory.name} · ${type.name}`;
      result = result.split(` / ${label}`).join(`      ${label}`);
    }
  }
  return result;
}

export type QuotationWorkChoice = WorkRequired & { sourceWorkId: string };

/** Selection keys are local to the form; persisted lines retain the original Work Required ID. */
export function quotationWorkChoices(db: Pick<RDashDatabase, "master">, works: WorkRequired[]): QuotationWorkChoice[] {
  return works.flatMap((work) => {
    const pairs = db.master.workSubcategories.flatMap((subcategory) => workTypesForSubcategory(subcategory)
      .filter((type) => work.work_type_ids?.includes(type.id))
      .map((type) => ({ subcategory_id: subcategory.id, work_type_id: type.id })));
    if (!pairs.length) return [{ ...work, sourceWorkId: work.id }];
    return pairs.map((pair) => ({ ...work,
      id: JSON.stringify([work.id, pair.subcategory_id, pair.work_type_id]),
      sourceWorkId: work.id,
      title: capturedPairsTitle(db.master.workSubcategories, [pair]),
      work_subcategory_ids: [pair.subcategory_id],
      work_type_ids: [pair.work_type_id],
    }));
  });
}

export function quotationChoiceLines(db: RDashDatabase, choices: QuotationWorkChoice[], grouping: "work" | "area", newId: () => string): LineItem[] {
  const lines = choices.flatMap((choice) => {
    const subcategoryId = choice.work_subcategory_ids?.[0];
    const workTypeId = choice.work_type_ids?.[0];
    const subcategory = db.master.workSubcategories.find((row) => row.id === subcategoryId);
    const work = { ...choice, id: choice.sourceWorkId };
    const scopedItems = (choice.area_ids.length ? choice.area_ids : [""]).flatMap((areaId) => {
      const candidates = (choice.structured_items || []).filter((item) => (item.area_id || "") === areaId);
      if (!workTypeId) return candidates;
      const matches = (pair: { subcategory_id?: string; work_type_id?: string }) => pair.subcategory_id === subcategoryId && pair.work_type_id === workTypeId;
      const captured = candidates.find((item) => matches(item)) || candidates.find((item) => itemOptionPairs(item).some(matches));
      const revision = db.measurementRevisions.filter((row) => row.work_required_id === work.id && row.area_id === areaId && row.status === "verified")
        .sort((a, b) => b.revision_no - a.revision_no)[0];
      const area = db.areas.find((row) => row.id === areaId);
      const multiplier = revision?.unit === "m" ? 3.280839895 : 1;
      // Use captured quantities when present; otherwise use this room's verified measurement for this work type.
      const base = captured || (area && revision?.length && revision.width ? quotationMeasuredLine({
        work: { ...work, structured_items: [] }, area,
        dimensions: { length: revision.length * multiplier, breadth: revision.width * multiplier, height: (revision.height || 0) * multiplier },
        workSubcategories: db.master.workSubcategories, contractorRates: db.master.contractorRates, id: newId(),
      }) : undefined);
      const rate = captured && matches(captured) ? captured.rate
        : captured?.option_pairs?.find(matches)?.rate ?? averageWorkTypeTotalRate(db.master.contractorRates, subcategoryId, workTypeId) ?? 0;
      if (!base) {
        if (areaId) throw new Error(`Capture a measurement for ${area?.name || "this room"} · ${choice.title} before quoting it.`);
        return [{ id: newId(), title: choice.title, quantity: 0, rate, amount: 0,
          category_id: subcategory?.category_id, subcategory_id: subcategoryId, work_type_id: workTypeId }];
      }
      return [{ ...base, title: choice.title, category_id: subcategory?.category_id,
        ...(base.subcategory_id !== subcategoryId ? { article_id: undefined, work_required_article_id: undefined, variant_id: undefined } : {}),
        subcategory_id: subcategoryId, work_type_id: workTypeId, option_pairs: undefined,
        rate, amount: Math.round(base.quantity * rate * 100) / 100 }];
    });
    return groupedQuotationScopeLines({ workSubcategories: db.master.workSubcategories, areas: db.areas,
      coveredWork: [{ ...work, structured_items: scopedItems }], grouping, newId });
  });
  if (grouping === "area") {
    const order = new Map(db.areas.map((area, index) => [area.id, index]));
    lines.sort((a, b) => (order.get(a.area_id || "") ?? -1) - (order.get(b.area_id || "") ?? -1));
  }
  return lines.map((line) => {
    const siteId = choices.find((choice) => choice.sourceWorkId === line.work_required_id)?.site_id;
    return siteId ? { ...line, source_kind: "quotation", site_id: siteId }
      : { ...line, source_kind: "quotation", work_required_id: undefined, area_id: undefined, area_chips: undefined, site_id: undefined };
  });
}
