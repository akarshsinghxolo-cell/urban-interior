from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# CRM comments/imports after removing the low-level legacy actions.
path = Path("src/lib/rdash/store/slices/crm.ts")
text = path.read_text()
text = replace_once(
    text,
    " *   Group 3: addSite, updateSite, archiveSite (low-level compatibility paths)\n",
    " *   Group 3: archiveSite\n",
    "CRM group comment",
)
text = text.replace("`assertCustomerExists`, ", "")
text = text.replace(",\n * `assertUniqueCustomerIdentity`, `normalizeCustomerSegments`", "")
text = replace_once(
    text,
    "    assertCustomerExists, assertSiteExists, assertSiteBelongsToCustomer,\n",
    "    assertSiteExists, assertSiteBelongsToCustomer,\n",
    "CRM business-rule imports",
)
text = replace_once(
    text,
    'import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "../../customer-identity";\n',
    "",
    "CRM customer identity import",
)
path.write_text(text)

# Make the canonical transformation safe for patch-style callers and constrain file detachment.
path = Path("src/lib/rdash/customer-sites-save.ts")
text = path.read_text()
text = replace_once(
    text,
    '''function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
''',
    '''function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function suppliedValue<T extends object, K extends keyof T>(
  input: T,
  key: K,
  fallback: T[K],
): T[K] {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback;
}
''',
    "supplied value helper",
)
old_customer = '''  return {
    id: customerId,
    name: String(input.name ?? existing?.name ?? "").trim() || "New customer",
    phone: String(input.phone ?? existing?.phone ?? "").trim(),
    whatsapp: String(input.whatsapp ?? input.phone ?? existing?.whatsapp ?? existing?.phone ?? "").trim() || undefined,
    alternate_phone: input.alternate_phone,
    email: input.email,
    customer_segments: normalizeCustomerSegments(input.customer_segments ?? existing?.customer_segments),
    status: input.status ?? existing?.status ?? "active",
    interest_category_ids: input.interest_category_ids ?? existing?.interest_category_ids ?? [],
    interest_work_subcategory_ids: input.interest_work_subcategory_ids ?? existing?.interest_work_subcategory_ids ?? [],
    source_partner_id: input.source_partner_id,
    source_partner_name: input.source_partner_name,
    notes: input.notes,
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
'''
new_customer = '''  const phone = String(suppliedValue(input, "phone", existing?.phone ?? "") ?? "").trim();
  const whatsapp = suppliedValue(input, "whatsapp", existing?.whatsapp);
  return {
    id: customerId,
    name: String(suppliedValue(input, "name", existing?.name ?? "") ?? "").trim() || "New customer",
    phone,
    whatsapp: String(whatsapp ?? phone).trim() || undefined,
    alternate_phone: suppliedValue(input, "alternate_phone", existing?.alternate_phone),
    email: suppliedValue(input, "email", existing?.email),
    customer_segments: normalizeCustomerSegments(suppliedValue(input, "customer_segments", existing?.customer_segments)),
    status: suppliedValue(input, "status", existing?.status ?? "active") ?? "active",
    interest_category_ids: suppliedValue(input, "interest_category_ids", existing?.interest_category_ids ?? []) ?? [],
    interest_work_subcategory_ids: suppliedValue(input, "interest_work_subcategory_ids", existing?.interest_work_subcategory_ids ?? []) ?? [],
    source_partner_id: suppliedValue(input, "source_partner_id", existing?.source_partner_id),
    source_partner_name: suppliedValue(input, "source_partner_name", existing?.source_partner_name),
    notes: suppliedValue(input, "notes", existing?.notes),
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
'''
text = replace_once(text, old_customer, new_customer, "customer patch preservation")
old_site = '''  return {
    id: siteId,
    customer_id: customer.id,
    name,
    building_name: input.building_name,
    site_type: input.site_type ?? existing?.site_type ?? "other",
    stage: input.stage ?? existing?.stage ?? "enquiry",
    address: input.address,
    city: input.city,
    locality: input.locality,
    latitude: input.latitude,
    longitude: input.longitude,
    map_url: input.map_url,
    photo_attachment_ids: attachmentIds,
    source_partner_id: input.source_partner_id ?? customer.source_partner_id,
    source_partner_name: input.source_partner_name ?? customer.source_partner_name,
    notes: input.notes,
    is_archived: existing?.is_archived,
'''
new_site = '''  return {
    id: siteId,
    customer_id: customer.id,
    name,
    building_name: suppliedValue(input, "building_name", existing?.building_name),
    site_type: suppliedValue(input, "site_type", existing?.site_type ?? "other") ?? "other",
    stage: suppliedValue(input, "stage", existing?.stage ?? "enquiry") ?? "enquiry",
    address: suppliedValue(input, "address", existing?.address),
    city: suppliedValue(input, "city", existing?.city),
    locality: suppliedValue(input, "locality", existing?.locality),
    latitude: suppliedValue(input, "latitude", existing?.latitude),
    longitude: suppliedValue(input, "longitude", existing?.longitude),
    map_url: suppliedValue(input, "map_url", existing?.map_url),
    photo_attachment_ids: attachmentIds,
    source_partner_id: suppliedValue(input, "source_partner_id", existing?.source_partner_id ?? customer.source_partner_id),
    source_partner_name: suppliedValue(input, "source_partner_name", existing?.source_partner_name ?? customer.source_partner_name),
    notes: suppliedValue(input, "notes", existing?.notes),
    is_archived: existing?.is_archived,
'''
text = replace_once(text, old_site, new_site, "Site patch preservation")
validation_anchor = '''  for (const draft of input.sites ?? []) {
    const siteId = draft.id ?? createId("site");
    if (siteIds.includes(siteId)) throw new Error(`Site \\"${siteId}\\" was supplied more than once.`);
    siteIds.push(siteId);
    const existing = siteById.get(siteId);
    const next = siteRecord(existing, draft, nextCustomer, siteId, now, detachedSet);
    if (!siteChanged(existing, next)) continue;
    next.updated_at = now;
    siteChanges.push({ siteId, kind: existing ? "update" : "create", before: existing, after: next });
    const index = resultingSites.findIndex((site) => site.id === siteId);
    if (index >= 0) resultingSites[index] = next;
    else resultingSites.unshift(next);
  }

  let attachmentChanged = false;
'''
validation_replacement = '''  for (const draft of input.sites ?? []) {
    const siteId = draft.id ?? createId("site");
    if (siteIds.includes(siteId)) throw new Error(`Site \\"${siteId}\\" was supplied more than once.`);
    siteIds.push(siteId);
    const existing = siteById.get(siteId);
    const next = siteRecord(existing, draft, nextCustomer, siteId, now, detachedSet);
    if (!siteChanged(existing, next)) continue;
    next.updated_at = now;
    siteChanges.push({ siteId, kind: existing ? "update" : "create", before: existing, after: next });
    const index = resultingSites.findIndex((site) => site.id === siteId);
    if (index >= 0) resultingSites[index] = next;
    else resultingSites.unshift(next);
  }

  const suppliedSiteIds = new Set(siteIds);
  for (const attachmentId of detachedSet) {
    const attachment = (database.entityFileAttachments || []).find((row) => row.id === attachmentId);
    if (!attachment || attachment.entity_type !== "site") {
      throw new Error(`Site attachment \\"${attachmentId}\\" does not exist.`);
    }
    const attachmentSite = siteById.get(attachment.entity_id);
    if (!attachmentSite || attachmentSite.customer_id !== customerId) {
      throw new Error("A Site file cannot be detached from another Customer.");
    }
    if (!suppliedSiteIds.has(attachmentSite.id)) {
      throw new Error(`Include Site \\"${attachmentSite.name}\\" in the save before detaching its file.`);
    }
    if (!(attachmentSite.photo_attachment_ids || []).includes(attachmentId)) {
      throw new Error("The selected file is not attached through this Site's photo/file field.");
    }
  }

  let attachmentChanged = false;
'''
text = replace_once(text, validation_anchor, validation_replacement, "attachment ownership validation")
path.write_text(text)

# Keep the editor stable during background refreshes and guard direct close actions.
path = Path("src/components/rdash/CustomerSitesDialog.tsx")
text = path.read_text()
text = replace_once(
    text,
    '  const formId = `customer-sites:${editId || "new"}`;\n',
    '  const formId = `customer-sites:${editId || "new"}`;\n  const initializedKeyRef = React.useRef<string | null>(null);\n',
    "editor initialization ref",
)
old_effect = '''  React.useEffect(() => {
    if (open) initialise();
  }, [open, initialise]);
'''
new_effect = '''  React.useEffect(() => {
    if (!open) {
      initializedKeyRef.current = null;
      return;
    }
    const key = editId || "new";
    if (initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;
    initialise();
  }, [editId, initialise, open]);
'''
text = replace_once(text, old_effect, new_effect, "stable initialization effect")
old_sync = '''      commitBatches();
      await awaitServerSync();
      const nextBaseline = fingerprint(customer, sites, detachAttachmentIds);
'''
new_sync = '''      await awaitServerSync();
      commitBatches();
      const nextBaseline = fingerprint(customer, sites, detachAttachmentIds);
'''
text = replace_once(text, old_sync, new_sync, "server acknowledgement ordering")
old_toast = '''      toast.success(result.changed
        ? `Customer \\"${customer.name.trim()}\\" and ${result.siteIds.length} Site${result.siteIds.length === 1 ? "" : "s"} saved`
        : "No customer or Site changes to save");
'''
new_toast = '''      toast.success(result.changed
        ? `Customer \\"${customer.name.trim()}\\" and Site changes saved`
        : "No customer or Site changes to save");
'''
text = replace_once(text, old_toast, new_toast, "save success message")
close_anchor = '''  const saveAndClose = async () => {
    const saved = await persist();
    if (saved) onClose();
  };
'''
close_replacement = '''  const requestClose = React.useCallback(() => {
    dirtyFormRegistry.requestNavigation(onClose, {
      reason: isEdit ? "close the Customer and Sites editor" : "close the new Customer and Sites form",
    });
  }, [isEdit, onClose]);

  const saveAndClose = async () => {
    const saved = await persist();
    if (saved) onClose();
  };
'''
text = replace_once(text, close_anchor, close_replacement, "guarded close callback")
text = replace_once(
    text,
    '    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>',
    '    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>',
    "dialog close guard",
)
text = replace_once(
    text,
    '          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>',
    '          <Button variant="outline" size="sm" onClick={requestClose}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>',
    "Cancel close guard",
)
path.write_text(text)

# Add regression cases for partial patches and attachment ownership.
path = Path("tests/customer-sites-save.test.ts")
text = path.read_text()
insert_before = '''  test("requires a Site name for every supplied Site", () => {
'''
extra_tests = '''  test("preserves omitted customer and Site fields for patch-style callers", () => {
    const db = database();
    db.customers[0].email = "existing@example.com";
    db.sites[0].notes = "Keep this note";
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Renamed Customer" },
      sites: [{ id: "site-1", name: "Renamed Site" }],
    }, options);
    expect(result.db.customers[0].email).toBe("existing@example.com");
    expect(result.db.sites[0].notes).toBe("Keep this note");
  });

  test("rejects detaching a Site file owned by another Customer", () => {
    const db = database();
    db.customers.push({
      ...db.customers[0],
      id: "customer-2",
      name: "Other Customer",
      phone: "9999999999",
      whatsapp: "9999999999",
    });
    db.sites.push({
      ...db.sites[0],
      id: "site-2",
      customer_id: "customer-2",
      name: "Other Site",
      photo_attachment_ids: ["attachment-2"],
    });
    db.entityFileAttachments.push({
      ...db.entityFileAttachments[0],
      id: "attachment-2",
      entity_id: "site-2",
    });
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
      detachAttachmentIds: ["attachment-2"],
    }, options)).toThrow(/another Customer/i);
  });

  test("requires the owning Site to be included before detaching its file", () => {
    const db = database();
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [],
      detachAttachmentIds: ["attachment-1"],
    }, options)).toThrow(/Include Site/i);
  });

'''
text = replace_once(text, insert_before, extra_tests + insert_before, "extra transformation tests")
path.write_text(text)

# Expand the static UI safety guard.
path = Path("tests/customer-sites-legacy-removal.test.ts")
text = path.read_text()
text = replace_once(
    text,
    'const partnerDialog = readFileSync("src/components/rdash/EntityFormDialog.tsx", "utf8");\n',
    'const partnerDialog = readFileSync("src/components/rdash/EntityFormDialog.tsx", "utf8");\nconst customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");\n',
    "static customer editor source",
)
text = replace_once(
    text,
    '  expect(partnerDialog.includes("saveCustomerWithSites")).toBe(false);\n',
    '  expect(partnerDialog.includes("saveCustomerWithSites")).toBe(false);\n  expect(customerSitesDialog.includes("initializedKeyRef")).toBe(true);\n  expect(customerSitesDialog.indexOf("await awaitServerSync();")).toBeLessThan(customerSitesDialog.indexOf("commitBatches();"));\n  expect(customerSitesDialog.includes("dirtyFormRegistry.requestNavigation")).toBe(true);\n',
    "static customer editor safety assertions",
)
path.write_text(text)

print("Final Customer and Sites correctness audit applied")
