import "./types";

declare module "./types" {
  interface Vendor {
    legal_name?: string;
    whatsapp?: string;
    alternate_phone?: string;
    email?: string;
    gstin?: string;
    vendor_type?: "manufacturer" | "distributor" | "dealer" | "retailer" | "service_provider" | "other";
    status?: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";
    categories?: string[];
    brands?: string[];
    supply_capabilities?: Array<{
      id?: string;
      article_id: string;
      article_name?: string;
      category_id?: string;
      category_name?: string;
      variant_ids?: string[];
      brand?: string;
      availability?: "in_stock" | "limited" | "on_order" | "unknown";
      typical_lead_time_days?: number;
      moq?: number;
      preferred?: boolean;
      status?: "active" | "inactive";
      notes?: string;
    }>;
    created_at?: string;
    updated_at?: string;
  }

  interface VendorRate {
    created_at?: string;
  }
}

export {};
