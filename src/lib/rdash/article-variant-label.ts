import type { ArticleVariant } from "./types";

const clean = (value: unknown) => String(value ?? "").trim();

export function articleVariantLabel(variant: ArticleVariant) {
  const name = clean(variant.name) || "Variant";
  const details = [
    variant.brand,
    variant.color,
    variant.grade,
    variant.size,
    variant.finish,
    variant.pack_size,
  ]
    .map(clean)
    .filter((value, index, values) => value && value.toLowerCase() !== name.toLowerCase() && values.indexOf(value) === index);

  return details.length ? `${name} · ${details.join(" · ")}` : name;
}
