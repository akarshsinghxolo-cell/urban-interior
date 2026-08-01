import type { Customer, CustomerSegment, Site } from "@/lib/rdash/types";
import type { CustomerSiteSaveDraft } from "@/lib/rdash/customer-sites-save";
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

export type CustomerDraft = {
  name: string;
  phone: string;
  whatsapp: string;
  alternatePhone: string;
  email: string;
  status: Customer["status"];
  notes: string;
  interestCategoryIds: string[];
  interestSubcategoryIds: string[];
  segments: CustomerSegment[];
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

export const CUSTOMER_SEGMENTS: Array<[CustomerSegment, string]> = [
  ["walk_in", "Walk-in"],
  ["service_customer", "Service customer"],
  ["product_buyer", "Product buyer"],
  ["repeat_customer", "Repeat customer"],
  ["trade_customer", "Trade customer"],
];

export function emptyCustomerDraft(): CustomerDraft {
  return {
    name: "",
    phone: "",
    whatsapp: "",
    alternatePhone: "",
    email: "",
    status: "active",
    notes: "",
    interestCategoryIds: [],
    interestSubcategoryIds: [],
    segments: ["service_customer"],
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
    interestCategoryIds: customer.interest_category_ids || [],
    interestSubcategoryIds: customer.interest_work_subcategory_ids || [],
    segments: customer.customer_segments?.length ? customer.customer_segments : ["service_customer"],
    referralQuery: customer.source_partner_name || "",
    referralLegacyName: customer.source_partner_id ? "" : customer.source_partner_name || "",
    referralSelected: customer.source_partner_id
      ? { id: customer.source_partner_id, name: customer.source_partner_name || "" }
      : null,
  };
}

export function newSiteDraft(): SiteDraft {
  return {
    id: reserveEntityId("site"),
    existing: false,
    enabled: true,
    expanded: true,
    name: "",
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

export function fingerprint(
  customer: CustomerDraft,
  sites: SiteDraft[],
  detachAttachmentIds: string[],
  sameNameAcknowledged: boolean,
): string {
  return JSON.stringify({
    customer,
    sites: sites.map(({ pendingPhotos, ...site }) => ({
      ...site,
      pendingPhotoIds: pendingPhotos.map((photo) => photo.attachmentId),
    })),
    detachAttachmentIds: [...detachAttachmentIds].sort(),
    sameNameAcknowledged,
  });
}

export function validIndianPhone(value: string): boolean {
  return !value || /^[6-9]\d{9}$/.test(value);
}

export function validEmail(value: string): boolean {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function customerPayload(draft: CustomerDraft): Partial<Customer> {
  return {
    name: draft.name.trim(),
    phone: draft.phone.trim(),
    whatsapp: draft.whatsapp.trim() || draft.phone.trim(),
    alternate_phone: draft.alternatePhone.trim() || undefined,
    email: draft.email.trim().toLowerCase() || undefined,
    status: draft.status,
    customer_segments: draft.segments,
    interest_category_ids: draft.interestCategoryIds,
    interest_work_subcategory_ids: draft.interestSubcategoryIds,
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
    photo_attachment_ids: [...new Set([
      ...draft.photoAttachmentIds,
      ...draft.pendingPhotos.map((photo) => photo.attachmentId),
    ])],
    ...(draft.archiveRequested ? {
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: actorName,
      archive_reason: draft.archiveReason.trim(),
    } : {}),
  };
}
