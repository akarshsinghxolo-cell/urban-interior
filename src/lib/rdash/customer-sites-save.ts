import type { Area, Customer, EntityFileAttachment, RDashDatabase, Site } from "./types";
import { assertUniqueCustomerIdentity } from "./customer-identity";

export type CustomerSiteSaveDraft = Partial<Site> & {
  id?: string;
};

export type CustomerAreaSaveDraft = Partial<Area> & {
  id?: string;
};

export type SaveCustomerWithSitesInput = {
  customerId?: string;
  customer: Partial<Customer>;
  sites?: CustomerSiteSaveDraft[];
  areas?: CustomerAreaSaveDraft[];
  detachAttachmentIds?: string[];
};

export type CustomerFieldChange = {
  field: keyof Customer;
  before: unknown;
  after: unknown;
};

export type SiteSaveChange = {
  siteId: string;
  kind: "create" | "update";
  archived?: boolean;
  before?: Site;
  after: Site;
};

export type AreaSaveChange = {
  areaId: string;
  kind: "create" | "update";
  before?: Area;
  after: Area;
};

export type SaveCustomerWithSitesResult = {
  db: RDashDatabase;
  customerId: string;
  siteIds: string[];
  areaIds: string[];
  changed: boolean;
  customerCreated: boolean;
  customerChanges: CustomerFieldChange[];
  siteChanges: SiteSaveChange[];
  areaChanges: AreaSaveChange[];
  detachedAttachmentIds: string[];
};

type SaveOptions = {
  now?: string;
  createId?: (prefix: "cust" | "site" | "area") => string;
};

const customerMutableFields: Array<keyof Customer> = [
  "name",
  "phone",
  "whatsapp",
  "alternate_phone",
  "email",
  "status",
  "interest_category_ids",
  "interest_work_subcategory_ids",
  "source_partner_id",
  "source_partner_name",
  "notes",
];

const siteMutableFields: Array<keyof Site> = [
  "name",
  "building_name",
  "site_type",
  "stage",
  "address",
  "city",
  "locality",
  "latitude",
  "longitude",
  "map_url",
  "photo_attachment_ids",
  "source_partner_id",
  "source_partner_name",
  "notes",
  "is_archived",
  "archived_at",
  "archived_by",
  "archive_reason",
];

const areaMutableFields: Array<keyof Area> = [
  "name",
  "area_type",
  "stage",
  "length",
  "width",
  "height",
  "unit",
  "floor_area",
  "perimeter",
  "notes",
];

function defaultId(prefix: "cust" | "site" | "area"): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }
  return left === right;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function suppliedValue<T extends object, K extends keyof T>(
  input: T,
  key: K,
  fallback: T[K],
): T[K] {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback;
}

function customerRecord(
  existing: Customer | undefined,
  input: Partial<Customer>,
  customerId: string,
  now: string,
): Customer {
  const phone = String(suppliedValue(input, "phone", existing?.phone ?? "") ?? "").trim();
  const whatsapp = suppliedValue(input, "whatsapp", existing?.whatsapp);
  return {
    id: customerId,
    name: String(suppliedValue(input, "name", existing?.name ?? "") ?? "").trim() || "New customer",
    phone,
    whatsapp: String(whatsapp ?? phone).trim() || undefined,
    alternate_phone: suppliedValue(input, "alternate_phone", existing?.alternate_phone),
    email: suppliedValue(input, "email", existing?.email),
    status: suppliedValue(input, "status", existing?.status ?? "active") ?? "active",
    interest_category_ids: suppliedValue(input, "interest_category_ids", existing?.interest_category_ids ?? []) ?? [],
    interest_work_subcategory_ids: suppliedValue(input, "interest_work_subcategory_ids", existing?.interest_work_subcategory_ids ?? []) ?? [],
    source_partner_id: suppliedValue(input, "source_partner_id", existing?.source_partner_id),
    source_partner_name: suppliedValue(input, "source_partner_name", existing?.source_partner_name),
    notes: suppliedValue(input, "notes", existing?.notes),
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
}

function customerDiff(before: Customer | undefined, after: Customer): CustomerFieldChange[] {
  if (!before) {
    return customerMutableFields.map((field) => ({ field, before: undefined, after: after[field] }));
  }
  return customerMutableFields
    .filter((field) => !sameValue(before[field], after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

function siteRecord(
  existing: Site | undefined,
  input: CustomerSiteSaveDraft,
  customer: Customer,
  siteId: string,
  now: string,
  detachedAttachmentIds: Set<string>,
): Site {
  const name = String(input.name ?? existing?.name ?? "").trim();
  if (!name) throw new Error("Site name is required.");
  if (existing?.is_archived) throw new Error(`Archived Site "${existing.name}" cannot be edited.`);
  if (existing && existing.customer_id !== customer.id) {
    throw new Error("A Site cannot be moved to another Customer.");
  }
  if (input.customer_id && input.customer_id !== customer.id) {
    throw new Error("Every Site in a customer bundle must belong to that Customer.");
  }

  const isArchiving = Boolean(input.is_archived) && !existing?.is_archived;
  const archiveReason = String(input.archive_reason ?? "").trim();
  if (isArchiving && !existing) throw new Error("A new Site cannot be archived before it is created.");
  if (isArchiving && !archiveReason) throw new Error(`An archive reason is required for Site "${name}".`);

  const attachmentIds = uniqueStrings([
    ...(input.photo_attachment_ids ?? existing?.photo_attachment_ids ?? []),
  ]).filter((id) => !detachedAttachmentIds.has(id));

  return {
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
    is_archived: suppliedValue(input, "is_archived", existing?.is_archived),
    archived_at: isArchiving ? String(input.archived_at || now) : suppliedValue(input, "archived_at", existing?.archived_at),
    archived_by: isArchiving ? String(input.archived_by || "Unknown user") : suppliedValue(input, "archived_by", existing?.archived_by),
    archive_reason: isArchiving ? archiveReason : suppliedValue(input, "archive_reason", existing?.archive_reason),
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
}

function siteChanged(before: Site | undefined, after: Site): boolean {
  if (!before) return true;
  return siteMutableFields.some((field) => !sameValue(before[field], after[field]));
}

function areaRecord(
  existing: Area | undefined,
  input: CustomerAreaSaveDraft,
  areaId: string,
  site: Site,
  now: string,
): Area {
  if (site.is_archived) throw new Error(`Areas cannot be added to archived Site "${site.name}".`);
  if (existing?.is_archived) throw new Error(`Archived Area "${existing.name}" cannot be edited.`);
  if (existing && existing.site_id !== site.id) {
    throw new Error("An Area cannot be moved to another Site.");
  }

  const name = String(input.name ?? existing?.name ?? "").trim();
  if (!name) throw new Error("Area name is required.");

  const length = suppliedValue(input, "length", existing?.length);
  const width = suppliedValue(input, "width", existing?.width);
  return {
    id: areaId,
    site_id: site.id,
    name,
    area_type: suppliedValue(input, "area_type", existing?.area_type ?? "other") ?? "other",
    stage: suppliedValue(input, "stage", existing?.stage ?? "unmeasured") ?? "unmeasured",
    length,
    width,
    height: suppliedValue(input, "height", existing?.height),
    unit: suppliedValue(input, "unit", existing?.unit ?? "ft") ?? "ft",
    floor_area: suppliedValue(input, "floor_area", existing?.floor_area ?? (length && width ? length * width : undefined)),
    perimeter: suppliedValue(input, "perimeter", existing?.perimeter ?? (length && width ? 2 * (length + width) : undefined)),
    notes: suppliedValue(input, "notes", existing?.notes),
    is_archived: existing?.is_archived,
    archived_at: existing?.archived_at,
    archived_by: existing?.archived_by,
    archive_reason: existing?.archive_reason,
    replaced_by_area_id: existing?.replaced_by_area_id,
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
}

function areaChanged(before: Area | undefined, after: Area): boolean {
  if (!before) return true;
  return areaMutableFields.some((field) => !sameValue(before[field], after[field]));
}

export function applyCustomerWithSitesSave(
  database: RDashDatabase,
  input: SaveCustomerWithSitesInput,
  options: SaveOptions = {},
): SaveCustomerWithSitesResult {
  const now = options.now ?? new Date().toISOString();
  const createId = options.createId ?? defaultId;
  const existingCustomer = input.customerId
    ? database.customers.find((customer) => customer.id === input.customerId)
    : undefined;
  if (input.customerId && !existingCustomer) throw new Error("Customer not found.");

  const customerId = existingCustomer?.id ?? input.customer.id ?? createId("cust");
  const nextCustomer = customerRecord(existingCustomer, input.customer, customerId, now);
  assertUniqueCustomerIdentity(
    database.customers,
    nextCustomer,
    existingCustomer ? { excludeCustomerId: existingCustomer.id } : undefined,
  );
  const customerChanges = customerDiff(existingCustomer, nextCustomer);
  if (customerChanges.length) nextCustomer.updated_at = now;

  const detachedAttachmentIds = uniqueStrings(input.detachAttachmentIds ?? []);
  const detachedSet = new Set(detachedAttachmentIds);
  const siteChanges: SiteSaveChange[] = [];
  const siteIds: string[] = [];
  const siteById = new Map(database.sites.map((site) => [site.id, site]));
  const resultingSites = [...database.sites];

  for (const draft of input.sites ?? []) {
    const siteId = draft.id ?? createId("site");
    if (siteIds.includes(siteId)) throw new Error(`Site "${siteId}" was supplied more than once.`);
    siteIds.push(siteId);
    const existing = siteById.get(siteId);
    const next = siteRecord(existing, draft, nextCustomer, siteId, now, detachedSet);
    if (!siteChanged(existing, next)) continue;
    next.updated_at = now;
    const archived = Boolean(existing && next.is_archived && !existing.is_archived);
    const kind: SiteSaveChange["kind"] = existing ? "update" : "create";
    siteChanges.push({ siteId, kind, archived, before: existing, after: next });
    const index = resultingSites.findIndex((site) => site.id === siteId);
    if (index >= 0) resultingSites[index] = next;
    else resultingSites.unshift(next);
  }

  const areaChanges: AreaSaveChange[] = [];
  const areaIds: string[] = [];
  const areaById = new Map(database.areas.map((area) => [area.id, area]));
  const resultingAreas = [...database.areas];
  const resultingSiteById = new Map(resultingSites.map((site) => [site.id, site]));

  for (const draft of input.areas ?? []) {
    const areaId = draft.id ?? createId("area");
    if (areaIds.includes(areaId)) throw new Error(`Area "${areaId}" was supplied more than once.`);
    areaIds.push(areaId);
    const existing = areaById.get(areaId);
    const siteId = String(draft.site_id ?? existing?.site_id ?? "");
    const site = resultingSiteById.get(siteId);
    if (!site || site.customer_id !== nextCustomer.id) {
      throw new Error("Every Area in a customer bundle must belong to one of that Customer's Sites.");
    }
    const next = areaRecord(existing, draft, areaId, site, now);
    if (!areaChanged(existing, next)) continue;
    next.updated_at = now;
    const kind: AreaSaveChange["kind"] = existing ? "update" : "create";
    areaChanges.push({ areaId, kind, before: existing, after: next });
    const index = resultingAreas.findIndex((area) => area.id === areaId);
    if (index >= 0) resultingAreas[index] = next;
    else resultingAreas.unshift(next);
  }

  const suppliedSiteIds = new Set(siteIds);
  for (const attachmentId of detachedSet) {
    const attachment = (database.entityFileAttachments || []).find((row) => row.id === attachmentId);
    if (!attachment || (attachment.entity_type !== "site" && attachment.entity_type !== "customer")) {
      throw new Error(`Customer/Site attachment "${attachmentId}" does not exist.`);
    }
    if (attachment.entity_type === "customer") {
      if (attachment.entity_id !== customerId) {
        throw new Error("A Customer file cannot be detached from another Customer.");
      }
      continue;
    }
    const attachmentSite = siteById.get(attachment.entity_id);
    if (!attachmentSite || attachmentSite.customer_id !== customerId) {
      throw new Error("A Site file cannot be detached from another Customer.");
    }
    if (!suppliedSiteIds.has(attachmentSite.id)) {
      throw new Error(`Include Site "${attachmentSite.name}" in the save before detaching its file.`);
    }
  }

  let attachmentChanged = false;
  const resultingAttachments = detachedSet.size
    ? (database.entityFileAttachments || []).filter((attachment: EntityFileAttachment) => {
        const remove = detachedSet.has(attachment.id) && (attachment.entity_type === "site" || attachment.entity_type === "customer");
        attachmentChanged ||= remove;
        return !remove;
      })
    : database.entityFileAttachments;

  const changed = !existingCustomer || customerChanges.length > 0 || siteChanges.length > 0 || areaChanges.length > 0 || attachmentChanged;
  if (!changed) {
    return {
      db: database,
      customerId,
      siteIds,
      areaIds,
      changed: false,
      customerCreated: false,
      customerChanges: [],
      siteChanges: [],
      areaChanges: [],
      detachedAttachmentIds: [],
    };
  }

  const customers = existingCustomer
    ? database.customers.map((customer) => customer.id === customerId ? nextCustomer : customer)
    : [nextCustomer, ...database.customers];

  return {
    db: {
      ...database,
      customers,
      sites: resultingSites,
      areas: resultingAreas,
      entityFileAttachments: resultingAttachments,
    },
    customerId,
    siteIds,
    areaIds,
    changed: true,
    customerCreated: !existingCustomer,
    customerChanges,
    siteChanges,
    areaChanges,
    detachedAttachmentIds: attachmentChanged ? detachedAttachmentIds : [],
  };
}
