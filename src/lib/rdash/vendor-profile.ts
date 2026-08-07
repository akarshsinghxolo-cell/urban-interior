import type { RDashDatabase, Vendor, VendorRate } from "./types";

export type VendorLifecycleStatus = "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";
export type VendorType = "manufacturer" | "distributor" | "dealer" | "retailer" | "service_provider" | "other";
export type VendorAvailability = "in_stock" | "limited" | "on_order" | "unknown";

export type VendorSupplyCapability = {
  id?: string;
  article_id: string;
  article_name?: string;
  category_id?: string;
  category_name?: string;
  variant_ids?: string[];
  brand?: string;
  availability?: VendorAvailability;
  typical_lead_time_days?: number;
  moq?: number;
  preferred?: boolean;
  status?: "active" | "inactive";
  notes?: string;
};

export type VendorProfileRecord = Partial<Vendor> & {
  id?: string;
  legal_name?: string;
  whatsapp?: string;
  alternate_phone?: string;
  email?: string;
  gstin?: string;
  vendor_type?: VendorType;
  status?: VendorLifecycleStatus;
  categories?: string[];
  brands?: string[];
  article_ids?: string[];
  supply_capabilities?: VendorSupplyCapability[];
  created_at?: string;
  updated_at?: string;
};

export type VendorDuplicateConflict = {
  id: string;
  name: string;
  hard: boolean;
  reasons: string[];
  similarity?: number;
};

export type VendorCommercialProfile = {
  rateCount: number;
  activeRateCount: number;
  lowestQuotedRate?: number;
  averageQuotedRate?: number;
  latestQuotedRate?: number;
  latestRateAt?: string;
  purchaseOrderCount: number;
  totalOrderedValue: number;
  totalBilledValue: number;
  totalPaidValue: number;
  outstandingValue: number;
  averageActualDeliveryDays?: number;
};

export type VendorPerformanceScore = {
  overall: number;
  delivery: number;
  quality: number;
  price: number;
  relationship: number;
  completedDeliveries: number;
  onTimeDeliveries: number;
  grnCount: number;
  scoredRateCount: number;
};

export type VendorRecommendation = {
  vendorId: string;
  vendorName: string;
  score: number;
  quotedRate?: number;
  performance: VendorPerformanceScore;
  availability: VendorAvailability;
  leadTimeDays?: number;
  moq?: number;
  reasons: string[];
};

export type VendorTimelineEvent = {
  id: string;
  at: string;
  kind: "profile" | "rfq" | "bid" | "po" | "grn" | "bill" | "payment" | "audit";
  title: string;
  detail?: string;
  entityId?: string;
  amount?: number;
  status?: string;
};

const compact = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => compact(value).toLowerCase();
const rawDigits = (value: unknown) => compact(value).replace(/\D/g, "");
const indianPhoneDigits = (value: unknown) => {
  const valueDigits = rawDigits(value);
  return valueDigits.length === 12 && valueDigits.startsWith("91") ? valueDigits.slice(2) : valueDigits;
};
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const asNumber = (value: unknown) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
};
const positiveNumber = (value: unknown) => {
  const next = asNumber(value);
  return next != null && next >= 0 ? next : undefined;
};
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
const clampScore = (value: number) => Math.max(0, Math.min(100, round(value)));
const uniqueStrings = (values: unknown[]) => [...new Set(values.map((value) => compact(value)).filter(Boolean))];

export function normalizeVendorName(value: unknown) {
  return lower(value)
    .replace(/\b(private|pvt|limited|ltd|llp|traders|trader|enterprises|enterprise|and|&|co|company)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bigrams(value: string) {
  const compactValue = value.replace(/\s+/g, " ");
  if (compactValue.length < 2) return new Set([compactValue]);
  const result = new Set<string>();
  for (let index = 0; index < compactValue.length - 1; index += 1) result.add(compactValue.slice(index, index + 2));
  return result;
}

export function vendorNameSimilarity(left: unknown, right: unknown) {
  const a = normalizeVendorName(left);
  const b = normalizeVendorName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const leftBigrams = bigrams(a);
  const rightBigrams = bigrams(b);
  const intersection = [...leftBigrams].filter((token) => rightBigrams.has(token)).length;
  return (2 * intersection) / Math.max(1, leftBigrams.size + rightBigrams.size);
}

function normalizeCapability(raw: VendorSupplyCapability, db: RDashDatabase): VendorSupplyCapability | undefined {
  const article = db.master.articles.find((row) => row.id === raw.article_id);
  if (!article) return undefined;
  const variants = uniqueStrings(raw.variant_ids || []).filter((variantId) =>
    db.master.articleVariants.some((variant) => variant.id === variantId && variant.article_id === article.id),
  );
  const category = article.category_id ? db.master.workCategories.find((row) => row.id === article.category_id) : undefined;
  return {
    id: compact(raw.id) || `vendor-cap-${article.id}-${compact(raw.brand || "general").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    article_id: article.id,
    article_name: article.name,
    category_id: article.category_id,
    category_name: category?.name,
    variant_ids: variants,
    brand: compact(raw.brand) || undefined,
    availability: raw.availability || "unknown",
    typical_lead_time_days: positiveNumber(raw.typical_lead_time_days),
    moq: positiveNumber(raw.moq),
    preferred: Boolean(raw.preferred),
    status: raw.status || "active",
    notes: compact(raw.notes) || undefined,
  };
}

export function canonicalVendorCapabilities(vendor: VendorProfileRecord, db: RDashDatabase): VendorSupplyCapability[] {
  const structured = Array.isArray(vendor.supply_capabilities) ? vendor.supply_capabilities : [];
  const normalized = structured.map((row) => normalizeCapability(row, db)).filter((row): row is VendorSupplyCapability => Boolean(row));
  if (normalized.length) return normalized;

  return uniqueStrings((vendor.article_ids || []) as string[]).flatMap((articleId) => {
    const article = db.master.articles.find((row) => row.id === articleId);
    if (!article) return [];
    const category = article.category_id ? db.master.workCategories.find((row) => row.id === article.category_id) : undefined;
    return [{
      id: `vendor-cap-${article.id}-legacy`,
      article_id: article.id,
      article_name: article.name,
      category_id: article.category_id,
      category_name: category?.name,
      variant_ids: [],
      availability: "unknown" as const,
      status: "active" as const,
    }];
  });
}

export function normalizeVendorForWrite(input: VendorProfileRecord, db: RDashDatabase, options: { id?: string } = {}): VendorProfileRecord {
  const capabilities = canonicalVendorCapabilities(input, db);
  const articleIds = uniqueStrings(capabilities.filter((row) => row.status !== "inactive").map((row) => row.article_id));
  const categories = uniqueStrings([...(input.categories || []), ...capabilities.map((row) => row.category_name)]);
  const brands = uniqueStrings([...(input.brands || []), ...capabilities.map((row) => row.brand)]);
  return {
    id: options.id || input.id,
    name: compact(input.name),
    legal_name: compact(input.legal_name) || undefined,
    phone: compact(input.phone) || undefined,
    whatsapp: compact(input.whatsapp) || undefined,
    alternate_phone: compact(input.alternate_phone) || undefined,
    email: compact(input.email).toLowerCase() || undefined,
    city: compact(input.city) || undefined,
    locality: compact(input.locality) || undefined,
    address: compact(input.address) || undefined,
    latitude: asNumber(input.latitude),
    longitude: asNumber(input.longitude),
    category: categories[0] || compact(input.category) || undefined,
    categories,
    brands,
    vendor_type: input.vendor_type || "dealer",
    status: input.status || "onboarding",
    gstin: compact(input.gstin).toUpperCase() || undefined,
    business_card_attachment_id: input.business_card_attachment_id,
    shop_attachment_id: input.shop_attachment_id,
    reliability_rating: input.reliability_rating || "average",
    delivery_time_rating: input.delivery_time_rating || "average",
    return_policy: input.return_policy || "available",
    notes: compact(input.notes) || undefined,
    source_partner_id: input.source_partner_id,
    source_partner_name: compact(input.source_partner_name) || undefined,
    article_ids: articleIds,
    supply_capabilities: capabilities,
    created_at: input.created_at,
    updated_at: new Date().toISOString(),
  };
}

export function vendorProfileValidationError(vendor: VendorProfileRecord) {
  if (!compact(vendor.name)) return "Vendor name is required.";
  const phone = indianPhoneDigits(vendor.phone);
  if (phone && phone.length !== 10) return "Vendor mobile number must be a valid Indian mobile number.";
  const alternate = indianPhoneDigits(vendor.alternate_phone);
  if (alternate && alternate.length !== 10) return "Alternate mobile number must be a valid Indian mobile number.";
  const gstin = compact(vendor.gstin).toUpperCase();
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return "GSTIN format is invalid.";
  const email = compact(vendor.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email format is invalid.";
  if (vendor.latitude != null && (!Number.isFinite(vendor.latitude) || vendor.latitude < -90 || vendor.latitude > 90)) return "Latitude is invalid.";
  if (vendor.longitude != null && (!Number.isFinite(vendor.longitude) || vendor.longitude < -180 || vendor.longitude > 180)) return "Longitude is invalid.";
  return null;
}

export function vendorDuplicateConflicts(db: RDashDatabase, candidate: VendorProfileRecord, excludeId?: string): VendorDuplicateConflict[] {
  const candidatePhone = indianPhoneDigits(candidate.phone);
  const candidateGstin = compact(candidate.gstin).toUpperCase();
  const candidateLegal = normalizeVendorName(candidate.legal_name);
  return db.master.vendors
    .filter((vendor) => vendor.id !== excludeId)
    .flatMap((vendor) => {
      const row = vendor as VendorProfileRecord;
      const reasons: string[] = [];
      let hard = false;
      if (candidatePhone && indianPhoneDigits(row.phone) === candidatePhone) {
        hard = true;
        reasons.push("same mobile number");
      }
      if (candidateGstin && compact(row.gstin).toUpperCase() === candidateGstin) {
        hard = true;
        reasons.push("same GSTIN");
      }
      if (candidateLegal && normalizeVendorName(row.legal_name) === candidateLegal) reasons.push("same legal name");
      const similarity = vendorNameSimilarity(candidate.name, row.name);
      const sameCity = !compact(candidate.city) || !compact(row.city) || lower(candidate.city) === lower(row.city);
      if (similarity >= 0.92 && sameCity) reasons.push(`very similar name (${Math.round(similarity * 100)}%)`);
      if (!reasons.length) return [];
      return [{ id: vendor.id, name: vendor.name, hard, reasons: uniqueStrings(reasons), similarity }];
    })
    .sort((left, right) => Number(right.hard) - Number(left.hard) || (right.similarity || 0) - (left.similarity || 0));
}

export function vendorQuotedRate(rate: VendorRate | Record<string, unknown>) {
  return Number((rate as any).quoted_rate ?? (rate as any).rate ?? 0);
}

function dateDiffDays(start?: string, end?: string) {
  if (!start || !end) return undefined;
  const left = new Date(start).getTime();
  const right = new Date(end).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  return Math.max(0, (right - left) / 86_400_000);
}

export function buildVendorCommercialProfile(db: RDashDatabase, vendorId: string): VendorCommercialProfile {
  const rates = db.master.vendorRates.filter((row) => row.vendor_id === vendorId);
  const activeRates = rates.filter((row) => !row.status || row.status === "active");
  const quoted = activeRates.map(vendorQuotedRate).filter((value) => value > 0);
  const latest = [...activeRates].sort((a, b) => compact((b as any).updated_at).localeCompare(compact((a as any).updated_at)))[0];
  const purchaseOrders = db.purchaseOrders.filter((row) => row.vendor_id === vendorId);
  const bills = db.vendorBills.filter((row) => row.vendor_id === vendorId);
  const payments = db.vendorPayments.filter((row) => row.vendor_id === vendorId);
  const deliveryDays = purchaseOrders.flatMap((po: any) => {
    const days = dateDiffDays(po.created_at || po.order_date, po.actual_delivery);
    return days == null ? [] : [days];
  });
  const totalBilledValue = bills.reduce((sum, row: any) => sum + Number(row.total_amount || row.amount || 0), 0);
  const totalPaidValue = payments.reduce((sum, row: any) => sum + Number(row.amount || 0), 0);
  const totalOrderedValue = purchaseOrders.reduce((sum, row: any) => sum + Number(row.total_amount || row.amount || 0), 0);
  return {
    rateCount: rates.length,
    activeRateCount: activeRates.length,
    lowestQuotedRate: quoted.length ? Math.min(...quoted) : undefined,
    averageQuotedRate: average(quoted),
    latestQuotedRate: latest ? vendorQuotedRate(latest) : undefined,
    latestRateAt: latest ? compact((latest as any).updated_at) || undefined : undefined,
    purchaseOrderCount: purchaseOrders.length,
    totalOrderedValue,
    totalBilledValue,
    totalPaidValue,
    outstandingValue: Math.max(0, totalBilledValue - totalPaidValue),
    averageActualDeliveryDays: average(deliveryDays),
  };
}

function relationshipScore(vendor: VendorProfileRecord) {
  const map = (value: string) => value === "very_good" ? 100 : value === "good" ? 90 : value === "average" ? 70 : value === "bad" || value === "poor" ? 40 : 70;
  return average([map(lower(vendor.reliability_rating)), map(lower(vendor.delivery_time_rating))]) || 70;
}

function qualityScoreFromGrns(grns: any[]) {
  if (!grns.length) return 70;
  const scores = grns.map((grn) => {
    const inspection = lower(grn.inspection_status || grn.quality_status);
    if (["rejected", "failed"].includes(inspection)) return 20;
    if (["accepted", "approved", "passed", "verified"].includes(inspection)) return 95;
    const mismatch = Number(grn.rejected_qty || grn.short_qty || grn.damaged_qty || 0);
    const received = Number(grn.received_qty || grn.quantity || 0);
    if (received > 0 && mismatch > 0) return Math.max(20, 100 - (mismatch / received) * 100);
    const status = lower(grn.status);
    if (["rejected", "failed"].includes(status)) return 20;
    if (["accepted", "approved", "passed", "verified"].includes(status)) return 95;
    if (["received", "completed", "matched", "closed"].includes(status)) return 90;
    return 75;
  });
  return clampScore(average(scores) || 70);
}

function priceScoreForVendor(db: RDashDatabase, vendorId: string) {
  const active = (rate: VendorRate) => !rate.status || rate.status === "active";
  const vendorRates = db.master.vendorRates.filter((rate) => rate.vendor_id === vendorId && active(rate) && vendorQuotedRate(rate) > 0);
  if (!vendorRates.length) return { score: 60, count: 0 };
  const scores = vendorRates.flatMap((rate) => {
    const comparable = db.master.vendorRates
      .filter((row) => active(row) && row.article_id === rate.article_id && (row.variant_id || "") === (rate.variant_id || "") && vendorQuotedRate(row) > 0)
      .map(vendorQuotedRate);
    if (!comparable.length) return [];
    const lowest = Math.min(...comparable);
    const quoted = vendorQuotedRate(rate);
    return [quoted <= lowest ? 100 : Math.max(20, 100 - ((quoted - lowest) / lowest) * 100)];
  });
  return { score: clampScore(average(scores) || 60), count: scores.length };
}

function observedDeliveryDate(po: any, grns: any[]) {
  if (po.actual_delivery) return po.actual_delivery as string;
  const receipts = grns
    .filter((grn) => grn.po_id === po.id)
    .map((grn) => compact(grn.received_at || grn.created_at || grn.updated_at))
    .filter(Boolean)
    .sort();
  return receipts[receipts.length - 1];
}

export function computeVendorPerformance(db: RDashDatabase, vendorId: string): VendorPerformanceScore {
  const vendor = db.master.vendors.find((row) => row.id === vendorId) as VendorProfileRecord | undefined;
  const purchaseOrders = db.purchaseOrders.filter((row) => row.vendor_id === vendorId);
  const poIds = new Set(purchaseOrders.map((row) => row.id));
  const grns = db.grns.filter((row: any) => poIds.has(row.po_id));
  const completed = purchaseOrders.flatMap((po: any) => {
    const actual = observedDeliveryDate(po, grns);
    return actual ? [{ po, actual }] : [];
  });
  const comparableDeliveries = completed.filter(({ po }: any) => Boolean(po.expected_delivery));
  const onTime = comparableDeliveries.filter(({ po, actual }: any) => new Date(actual).getTime() <= new Date(po.expected_delivery).getTime());
  const relationship = clampScore(relationshipScore(vendor || {}));
  const delivery = comparableDeliveries.length ? clampScore((onTime.length / comparableDeliveries.length) * 100) : relationship;
  const quality = qualityScoreFromGrns(grns);
  const price = priceScoreForVendor(db, vendorId);
  return {
    overall: clampScore(delivery * 0.4 + quality * 0.3 + price.score * 0.2 + relationship * 0.1),
    delivery,
    quality,
    price: price.score,
    relationship,
    completedDeliveries: completed.length,
    onTimeDeliveries: onTime.length,
    grnCount: grns.length,
    scoredRateCount: price.count,
  };
}

function capabilityForArticle(vendor: VendorProfileRecord, db: RDashDatabase, articleId: string, variantId?: string) {
  return canonicalVendorCapabilities(vendor, db).find((capability) =>
    capability.status !== "inactive" &&
    capability.article_id === articleId &&
    (!variantId || !capability.variant_ids?.length || capability.variant_ids.includes(variantId)),
  );
}

export function recommendVendorsForArticle(db: RDashDatabase, articleId: string, variantId?: string): VendorRecommendation[] {
  const relevantRates = db.master.vendorRates.filter((rate) =>
    rate.article_id === articleId &&
    (!variantId || (rate.variant_id || "") === variantId) &&
    vendorQuotedRate(rate) > 0 &&
    (!rate.status || rate.status === "active"),
  );
  const lowestRate = relevantRates.length ? Math.min(...relevantRates.map(vendorQuotedRate)) : undefined;
  return db.master.vendors.flatMap((vendor) => {
    const profile = vendor as VendorProfileRecord;
    if (["inactive", "blacklisted"].includes(profile.status || "")) return [];
    const capability = capabilityForArticle(profile, db, articleId, variantId);
    const rate = relevantRates.find((row) => row.vendor_id === vendor.id);
    if (!capability && !rate && !(profile.article_ids || []).includes(articleId)) return [];
    const performance = computeVendorPerformance(db, vendor.id);
    const quotedRate = rate ? vendorQuotedRate(rate) : undefined;
    const priceComponent = quotedRate && lowestRate ? Math.max(0, 100 - ((quotedRate - lowestRate) / lowestRate) * 100) : 55;
    const availability = capability?.availability || "unknown";
    const availabilityScore = availability === "in_stock" ? 100 : availability === "limited" ? 80 : availability === "on_order" ? 60 : 55;
    const leadTime = capability?.typical_lead_time_days;
    const leadScore = leadTime == null ? 60 : leadTime <= 2 ? 100 : leadTime <= 5 ? 85 : leadTime <= 10 ? 70 : 50;
    const capabilityScore = availabilityScore * 0.6 + leadScore * 0.4;
    const score = clampScore(performance.overall * 0.5 + priceComponent * 0.35 + capabilityScore * 0.15);
    const reasons = [
      quotedRate && lowestRate && quotedRate === lowestRate ? "Lowest current quoted rate" : undefined,
      performance.delivery >= 85 ? "Strong on-time delivery" : undefined,
      performance.quality >= 85 ? "Strong GRN / quality record" : undefined,
      availability === "in_stock" ? "Marked in stock" : undefined,
      leadTime != null ? `${leadTime}-day typical lead time` : undefined,
    ].filter((value): value is string => Boolean(value));
    if (!reasons.length) reasons.push("Matched by supplied-article capability");
    return [{ vendorId: vendor.id, vendorName: vendor.name, score, quotedRate, performance, availability, leadTimeDays: leadTime, moq: capability?.moq, reasons }];
  }).sort((left, right) => right.score - left.score || (left.quotedRate ?? Number.MAX_SAFE_INTEGER) - (right.quotedRate ?? Number.MAX_SAFE_INTEGER));
}

function eventDate(value: unknown) {
  const date = compact(value);
  return date && Number.isFinite(new Date(date).getTime()) ? date : "";
}

export function buildVendorRelationshipTimeline(db: RDashDatabase, vendorId: string): VendorTimelineEvent[] {
  const vendor = db.master.vendors.find((row) => row.id === vendorId) as VendorProfileRecord | undefined;
  const events: VendorTimelineEvent[] = [];
  const purchaseOrders = db.purchaseOrders.filter((row) => row.vendor_id === vendorId);
  const poIds = new Set(purchaseOrders.map((row) => row.id));
  const rfqs = db.vendorRfqs.filter((row) => row.vendor_ids?.includes(vendorId));
  const bids = db.vendorBids.filter((row) => row.vendor_id === vendorId);
  const grns = db.grns.filter((row: any) => poIds.has(row.po_id));
  const bills = db.vendorBills.filter((row) => row.vendor_id === vendorId);
  const payments = db.vendorPayments.filter((row) => row.vendor_id === vendorId);

  if (vendor?.created_at) events.push({ id: `profile-${vendorId}`, at: vendor.created_at, kind: "profile", title: "Vendor created", detail: vendor.name, entityId: vendorId });
  rfqs.forEach((row: any) => events.push({ id: `rfq-${row.id}`, at: eventDate(row.sent_at || row.created_at || row.updated_at), kind: "rfq", title: `RFQ ${row.rfq_no || row.id}`, detail: "Vendor invited to quote", entityId: row.id, status: row.status }));
  bids.forEach((row: any) => events.push({ id: `bid-${row.id}`, at: eventDate(row.submitted_at || row.created_at || row.updated_at), kind: "bid", title: `Bid ${row.bid_no || row.id}`, detail: row.status ? `Status: ${row.status}` : undefined, entityId: row.id, amount: Number(row.total_amount || row.quote_amount || 0) || undefined, status: row.status }));
  purchaseOrders.forEach((row: any) => events.push({ id: `po-${row.id}`, at: eventDate(row.created_at || row.order_date || row.updated_at), kind: "po", title: `PO ${row.po_no || row.id}`, detail: row.expected_delivery ? `Expected ${row.expected_delivery}` : undefined, entityId: row.id, amount: Number(row.total_amount || 0) || undefined, status: row.status }));
  grns.forEach((row: any) => events.push({ id: `grn-${row.id}`, at: eventDate(row.received_at || row.created_at || row.updated_at), kind: "grn", title: `GRN ${row.grn_no || row.id}`, detail: "Goods receipt recorded", entityId: row.id, status: row.status }));
  bills.forEach((row: any) => events.push({ id: `bill-${row.id}`, at: eventDate(row.invoice_date || row.created_at || row.updated_at), kind: "bill", title: `Bill ${row.vendor_invoice_no || row.bill_no || row.id}`, entityId: row.id, amount: Number(row.total_amount || row.amount || 0) || undefined, status: row.status }));
  payments.forEach((row: any) => events.push({ id: `payment-${row.id}`, at: eventDate(row.paid_at || row.created_at || row.updated_at), kind: "payment", title: `Payment ${row.payment_no || row.id}`, detail: row.reference || row.mode, entityId: row.id, amount: Number(row.amount || 0) || undefined, status: row.status }));
  ((db as any).auditLog || []).filter((row: any) => row.entity_type === "vendor" && row.entity_id === vendorId).forEach((row: any) => events.push({ id: `audit-${row.id}`, at: eventDate(row.timestamp || row.created_at), kind: "audit", title: row.action || "Vendor updated", detail: row.reason, entityId: row.id }));

  return events.filter((event) => event.at).sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}
