import type { Customer, EntityFileAttachment, RDashDatabase, Site } from "./types";
import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "./customer-identity";

export type CustomerSiteSaveDraft = Partial<Site> & {
  id?: string;
};

export type SaveCustomerWithSitesInput = {
  customerId?: string;
  customer: Partial<Customer>;
  sites?: CustomerSiteSaveDraft[];
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
  before?: Site;
  after: Site;
};

export type SaveCustomerWithSitesResult = {
  db: RDashDatabase;
  customerId: string;
  siteIds: string[];
  changed: boolean;
  customerCreated: boolean;
  customerChanges: CustomerFieldChange[];
  siteChanges: SiteSaveChange[];
  detachedAttachmentIds: string[];
};

type SaveOptions = {
  now?: string;
  createId?: (prefix: "cust" | "site") => string;
};

const customerMutableFields: Array<keyof Customer> = [
  "name",
  "phone",
  "whatsapp",
  "alternate_phone",
  "email",
  "customer_segments",
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
];

function defaultId(prefix: "cust" | "site"): string {
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

function customerRecord(
  existing: Customer | undefined,
  input: Partial<Customer>,
  customerId: string,
  now: string,
): Customer {
  return {
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
  if (existing?.is_archived) throw new Error(`Archived Site \"${existing.name}\" cannot be edited.`);
  if (existing && existing.customer_id !== customer.id) {
    throw new Error("A Site cannot be moved to another Customer.");
  }
  if (input.customer_id && input.customer_id !== customer.id) {
    throw new Error("Every Site in a customer bundle must belong to that Customer.");
  }
  const attachmentIds = uniqueStrings([
    ...(input.photo_attachment_ids ?? existing?.photo_attachment_ids ?? []),
  ]).filter((id) => !detachedAttachmentIds.has(id));
  return {
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
    archived_at: existing?.archived_at,
    archived_by: existing?.archived_by,
    archive_reason: existing?.archive_reason,
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
}

function siteChanged(before: Site | undefined, after: Site): boolean {
  if (!before) return true;
  return siteMutableFields.some((field) => !sameValue(before[field], after[field]));
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
    if (siteIds.includes(siteId)) throw new Error(`Site \"${siteId}\" was supplied more than once.`);
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
  const resultingAttachments = detachedSet.size
    ? (database.entityFileAttachments || []).filter((attachment: EntityFileAttachment) => {
        const remove = detachedSet.has(attachment.id) && attachment.entity_type === "site";
        attachmentChanged ||= remove;
        return !remove;
      })
    : database.entityFileAttachments;

  const changed = !existingCustomer || customerChanges.length > 0 || siteChanges.length > 0 || attachmentChanged;
  if (!changed) {
    return {
      db: database,
      customerId,
      siteIds,
      changed: false,
      customerCreated: false,
      customerChanges: [],
      siteChanges: [],
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
      entityFileAttachments: resultingAttachments,
    },
    customerId,
    siteIds,
    changed: true,
    customerCreated: !existingCustomer,
    customerChanges,
    siteChanges,
    detachedAttachmentIds: attachmentChanged ? detachedAttachmentIds : [],
  };
}
