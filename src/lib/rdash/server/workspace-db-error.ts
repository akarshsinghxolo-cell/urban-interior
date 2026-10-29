type DatabaseError = { code?: string; message?: string; details?: string };

/** Explain native race/ownership checks without exposing database identifiers. */
export function databaseBusinessRuleMessage(error: DatabaseError): string | undefined {
  const message = `${error.message || ""} ${error.details || ""}`;
  if (error.code === "23505") {
    if (message.includes("uc_article_canonical_name")) return "An Article with this name already exists. Use the existing Article.";
    if (message.includes("uc_article_variant_identity")) return "This Article already has a variant with this name.";
    if (message.includes("uc_scoped_material_identity")) return "This work subcategory already contains the selected Article. Update its existing material row.";
    if (message.includes("uc_active_vendor_rate_identity")) return "This Vendor already has an active rate for the selected Article and variant. Update the existing rate.";
  }
  if (error.code === "23503" && /uc_(workrequired|acceptedscopes|workorders)_site_customer/.test(message)) {
    return "The selected Site belongs to a different Customer. Refresh the record and select the correct Site.";
  }
  return undefined;
}
