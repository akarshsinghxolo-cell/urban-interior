import type { Area, Customer, Priority, Site, WorkRequired } from "@/lib/rdash/types";
import type { CustomerAreaSaveDraft, CustomerSiteSaveDraft, CustomerWorkRequiredSaveDraft } from "@/lib/rdash/customer-sites-save";
import type { QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { reserveEntityId } from "@/lib/uploads/upload-types";
import { formatCoordinatePair } from "@/lib/rdash/coordinates";

export type PendingSiteFile = QueuedWorkflowFile & {
  id: string;
  file_name: string;
  mime_type?: string;
  url: string;
};

export type SiteDraft = {
  id: string;
  existing: boolean;
  enabled: boolean;
  expanded: boolean;
  name: string;
  buildingName: string;
  siteType: Site["site_type"];
  stage: Site["stage"];
  address: string;
  locality: string;
  city: string;
  latitude?: number;
  longitude?: number;
  coordinateInput: string;
  mapUrl: string;
  notes: string;
  photoAttachmentIds: string[];
  pendingPhotos: PendingSiteFile[];
  archiveRequested: boolean;
  archiveReason: string;
  archiveCancelled: boolean;
};

export type AreaDraft = {
  id: string;
  existing: boolean;
  siteId: string;
  name: string;
  areaType: Area["area_type"];
  notes: string;
};

export type CustomerWorkRequiredDraft = {
  id: string;
  existing: boolean;
  siteId: string;
  title: string;
  categoryId: string;
  subcategoryId: string;
  areaIds: string[];
  description: string;
  priority: Priority;
};

export type CustomerDraft = {
  name: string;
  phone: string;
  whatsapp: string;
  alternatePhone: string;
  email: string;
  status: Customer["status"];
  notes: string;
  referralQuery: string;
  referralLegacyName: string;
  referralSelected: { id: string; name: string } | null;
};

export const SITE_TYPES: Array<{ value: Site["site_type"]; label: string }> = [
  { value: "apartment", label: "Apartment" },
  { value: "office", label: "Office" },
  { value: "villa", label: "Villa" },
  { value: "shop", label: "Shop" },
  { value: "showroom", label: "Showroom" },
  { value: "other", label: "Other" },
];

export const SITE_STAGES: Array<{ value: Site["stage"]; label: string }> = [
  { value: "enquiry", label: "Enquiry" },
  { value: "planning", label: "Planning" },
  { value: "quoted", label: "Quoted" },
  { value: "awarded", label: "Awarded" },
  { value: "execution", label: "Execution" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const AREA_TYPES: Array<{ value: Area["area_type"]; label: string }> = [
  { value: "bedroom", label: "Bedroom" },
  { value: "guest_room", label: "Guest room" },
  { value: "living_room", label: "Living room / Hall" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "balcony", label: "Balcony" },
  { value: "staircase", label: "Staircase" },
  { value: "rooftop", label: "Rooftop" },
  { value: "office_cabin", label: "Office cabin" },
  { value: "reception", label: "Reception" },
  { value: "meeting_room", label: "Meeting room" },
  { value: "pantry", label: "Pantry" },
  { value: "facade", label: "Facade" },
  { value: "common_area", label: "Common area" },
  { value: "other", label: "Other" },
];

export function defaultSiteName(customerName: string): string {
  const trimmed = customerName.trim();
  return trimmed ? `${trimmed} Site` : "";
}

export function siteNameFollowsCustomer(site: Pick<SiteDraft, "existing" | "name">, previousCustomerName: string): boolean {
  if (site.existing) return false;
  const currentName = site.name.trim();
  return !currentName || currentName === defaultSiteName(previousCustomerName);
}

export function emptyCustomerDraft(): CustomerDraft {
  return {
    name: "",
    phone: "",
    whatsapp: "",
    alternatePhone: "",
    email: "",
    status: "active",
    notes: "",
    referralQuery: "",
    referralLegacyName: "",
    referralSelected: null,
  };
}

export function draftForCustomer(customer: Customer): CustomerDraft {
  return {
    name: customer.name || "",
    phone: customer.phone || "",
    whatsapp: customer.whatsapp || customer.phone || "",
    alternatePhone: customer.alternate_phone || "",
    email: customer.email || "",
    status: customer.status || "active",
    notes: customer.notes || "",
    referralQuery: customer.source_partner_name || "",
    referralLegacyName: customer.source_partner_id ? "" : customer.source_partner_name || "",
    referralSelected: customer.source_partner_id
      ? { id: customer.source_partner_id, name: customer.source_partner_name || "" }
      : null,
  };
}

export function newSiteDraft(customerName = ""): SiteDraft {
  return {
    id: reserveEntityId("site"),
    existing: false,
    enabled: true,
    expanded: true,
    name: defaultSiteName(customerName),
    buildingName: "",
    siteType: "apartment",
    stage: "enquiry",
    address: "",
    locality: "",
    city: "",
    coordinateInput: "",
    mapUrl: "",
    notes: "",
    photoAttachmentIds: [],
    pendingPhotos: [],
    archiveRequested: false,
    archiveReason: "",
    archiveCancelled: false,
  };
}

export function draftForSite(site: Site): SiteDraft {
  return {
    id: site.id,
    existing: true,
    enabled: true,
    expanded: false,
    name: site.name || "",
    buildingName: site.building_name || "",
    siteType: site.site_type || "other",
    stage: site.stage || "enquiry",
    address: site.address || "",
    locality: site.locality || "",
    city: site.city || "",
    latitude: site.latitude,
    longitude: site.longitude,
    coordinateInput: formatCoordinatePair(site),
    mapUrl: site.map_url || "",
    notes: site.notes || "",
    photoAttachmentIds: site.photo_attachment_ids || [],
    pendingPhotos: [],
    archiveRequested: false,
    archiveReason: "",
    archiveCancelled: false,
  };
}

export function newAreaDraft(siteId: string): AreaDraft {
  return {
    id: reserveEntityId("area"),
    existing: false,
    siteId,
    name: "",
    areaType: "other",
    notes: "",
  };
}

export function newCustomerWorkRequiredDraft(siteId: string): CustomerWorkRequiredDraft {
  return {
    id: reserveEntityId("workRequired"),
    existing: false,
    siteId,
    title: "",
    categoryId: "",
    subcategoryId: "",
    areaIds: [],
    description: "",
    priority: "medium",
  };
}

export function draftForWorkRequired(work: WorkRequired): CustomerWorkRequiredDraft {
  return {
    id: work.id,
    existing: true,
    siteId: work.site_id,
    title: work.title || "",
    categoryId: work.work_category_id || "",
    subcategoryId: work.work_subcategory_id || "",
    areaIds: work.area_ids || [],
    description: work.description || "",
    priority: work.priority || "medium",
  };
}

export function draftForArea(area: Area): AreaDraft {
  return {
    id: area.id,
    existing: true,
    siteId: area.site_id,
    name: area.name || "",
    areaType: area.area_type || "other",
    notes: area.notes || "",
  };
}

export function fingerprint(
  customer: CustomerDraft,
  sites: SiteDraft[],
  detachAttachmentIds: string[],
  sameNameAcknowledged: boolean,
  areas: AreaDraft[] = [],
  workRequired: CustomerWorkRequiredDraft[] = [],
): string {
  return JSON.stringify({
    customer,
    sites: sites.map(({ pendingPhotos, ...site }) => ({
      ...site,
      pendingPhotoIds: pendingPhotos.map((photo) => photo.attachmentId),
    })),
    detachAttachmentIds: [...detachAttachmentIds].sort(),
    sameNameAcknowledged,
    areas,
    workRequired,
  });
}

export function validIndianPhone(value: string): boolean {
  return !value || /^[6-9]\d{9}$/.test(value);
}

export function validEmail(value: string): boolean {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Only attachment rows already confirmed by PostgreSQL belong in the Site
 * mutation. Deferred uploads append their attachment IDs atomically after the
 * Site itself has been accepted by the server.
 */
export function confirmedPhotoAttachmentIds(
  attachmentIds: string[],
  detachAttachmentIds: string[] = [],
): string[] {
  const detached = new Set(detachAttachmentIds);
  return [...new Set(attachmentIds)].filter((id) => !detached.has(id));
}

export function customerPayload(draft: CustomerDraft): Partial<Customer> {
  return {
    name: draft.name.trim(),
    phone: draft.phone.trim(),
    whatsapp: draft.whatsapp.trim() || draft.phone.trim(),
    alternate_phone: draft.alternatePhone.trim() || undefined,
    email: draft.email.trim().toLowerCase() || undefined,
    status: draft.status,
    source_partner_id: draft.referralSelected?.id,
    source_partner_name: draft.referralSelected?.name
      || (draft.referralQuery.trim() === draft.referralLegacyName ? draft.referralLegacyName || undefined : undefined),
    notes: draft.notes.trim() || undefined,
  };
}

export function sitePayload(draft: SiteDraft, actorName: string): CustomerSiteSaveDraft {
  return {
    id: draft.id,
    name: draft.name.trim(),
    building_name: draft.buildingName.trim() || undefined,
    site_type: draft.siteType,
    stage: draft.archiveRequested && draft.archiveCancelled ? "cancelled" : draft.stage,
    address: draft.address.trim() || undefined,
    locality: draft.locality.trim() || undefined,
    city: draft.city.trim() || undefined,
    latitude: draft.latitude,
    longitude: draft.longitude,
    map_url: draft.mapUrl.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    photo_attachment_ids: confirmedPhotoAttachmentIds(draft.photoAttachmentIds),
    ...(draft.archiveRequested ? {
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: actorName,
      archive_reason: draft.archiveReason.trim(),
    } : {}),
  };
}

export function areaPayload(draft: AreaDraft): CustomerAreaSaveDraft {
  return {
    id: draft.id,
    site_id: draft.siteId,
    name: draft.name.trim(),
    area_type: draft.areaType,
    ...(draft.existing ? {} : { stage: "unmeasured" as const }),
    notes: draft.notes.trim() || undefined,
  };
}

export function workRequiredPayload(draft: CustomerWorkRequiredDraft): CustomerWorkRequiredSaveDraft {
  return {
    id: draft.id,
    site_id: draft.siteId,
    title: draft.title.trim(),
    work_category_id: draft.categoryId,
    work_subcategory_id: draft.subcategoryId,
    area_ids: draft.areaIds,
    description: draft.description.trim() || undefined,
    ...(draft.existing ? {} : { status: "new" as const }),
    priority: draft.priority,
  };
}
