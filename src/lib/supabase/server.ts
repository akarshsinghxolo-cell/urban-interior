import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const configuredWorkspaceId = String(process.env.UC_WORKSPACE_ID || "").trim();
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(configuredWorkspaceId)) {
  process.env.UC_WORKSPACE_ID = "default";
}

type RDashUserRoleRow = {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  staff_id: string | null;
  display_name: string | null;
  status: "pending" | "active" | "rejected" | "inactive";
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

type GenericRecordRow = {
  collection: string;
  id: string;
  dataJson: string;
};

type CanonicalStaffEntityRow = {
  id: string;
  workspace_id: string;
  revision: number;
  updated_at: string;
  updated_by: string | null;
  data: Record<string, unknown>;
};

export type StaffRouteBundleRow = {
  id: string;
  staffId: string;
  startedAt: string;
  endedAt: string;
  pointCount: number;
  distanceM: number;
  dataJson: string;
  createdAt: string;
};

type StaffIdentityDriftRow = {
  identity_key: string;
  role_assignment_id: string | null;
  user_id: string | null;
  staff_id: string | null;
  email: string | null;
  role: string | null;
  role_status: string | null;
  expected_profile_status: string | null;
  profile_email: string | null;
  profile_role: string | null;
  profile_status: string | null;
  profile_auth_user_id: string | null;
  master_email: string | null;
  master_role: string | null;
  master_status: string | null;
  master_auth_user_id: string | null;
  profile_exists: boolean;
  master_exists: boolean;
  drift_reasons: string[];
  is_drifted: boolean;
};

type RDashSupabaseSchema = {
  public: {
    Tables: {
      uc_user_roles: {
        Row: RDashUserRoleRow;
        Insert: Partial<RDashUserRoleRow> & Pick<RDashUserRoleRow, "user_id" | "role">;
        Update: Partial<RDashUserRoleRow>;
        Relationships: [];
      };
      GenericRecord: {
        Row: GenericRecordRow;
        Insert: GenericRecordRow;
        Update: Partial<GenericRecordRow>;
        Relationships: [];
      };
      entity_master_staff: {
        Row: CanonicalStaffEntityRow;
        Insert: Partial<CanonicalStaffEntityRow> & Pick<CanonicalStaffEntityRow, "id" | "workspace_id" | "data">;
        Update: Partial<CanonicalStaffEntityRow>;
        Relationships: [];
      };
      StaffRouteBundle: {
        Row: StaffRouteBundleRow;
        Insert: StaffRouteBundleRow;
        Update: Partial<StaffRouteBundleRow>;
        Relationships: [];
      };
      [key: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: {
      staff_identity_drift_report: {
        Row: StaffIdentityDriftRow;
        Relationships: [];
      };
    };
    Functions: {
      commit_workspace_operations: {
        Args: {
          p_workspace_id: string;
          p_expected_workspace_revision: number;
          p_operations: Array<Record<string, unknown>>;
          p_expected_row_versions: Record<string, number>;
        };
        Returns: {
          upserted: number;
          deleted: number;
          conflicts: number;
          bumpedRowVersions: Record<string, number>;
          newRevision: number;
        };
      };
      get_workspace_health_summary_v2: {
        Args: {
          p_workspace_id: string;
        };
        Returns: Record<string, unknown>;
      };
      sync_staff_identity_bundle: {
        Args: {
          p_assignment_id: string | null;
          p_user_id: string;
          p_email: string;
          p_role: string;
          p_display_name: string;
          p_status: string;
          p_staff_id: string | null;
          p_approved_by: string | null;
          p_approved_at: string | null;
          p_rejected_at: string | null;
          p_workspace_id: string;
        };
        Returns: {
          assignment: RDashUserRoleRow;
          staffId: string;
          workspaceRevision: number;
        };
      };
      uc_bump_workspace_revision: {
        Args: {
          p_workspace_id: string;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type SupabaseEnvName =
  | "SUPABASE_URL"
  | "SUPABASE_PUBLISHABLE_KEY"
  | "SUPABASE_SECRET_KEY"
  | "SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY";

let authClient: SupabaseClient<RDashSupabaseSchema> | null = null;
let adminClient: SupabaseClient<RDashSupabaseSchema> | null = null;

function configuredValue(name: SupabaseEnvName) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (value.startsWith("replace-with-")) return null;
  if (value.includes("<") || value.includes(">")) return null;
  if (name === "SUPABASE_URL" && value.includes("replace-with-project-ref")) return null;
  return value;
}

function supabaseUrl() {
  const value = configuredValue("SUPABASE_URL");
  if (!value) throw new Error("SUPABASE_URL is required for Supabase authentication.");
  return value;
}

function publishableKey() {
  const value = configuredValue("SUPABASE_PUBLISHABLE_KEY") || configuredValue("SUPABASE_ANON_KEY");
  if (!value) throw new Error("SUPABASE_PUBLISHABLE_KEY is required for Supabase authentication. SUPABASE_ANON_KEY is also accepted as a legacy alias.");
  return value;
}

function secretKey() {
  const value = configuredValue("SUPABASE_SECRET_KEY") || configuredValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!value) throw new Error("SUPABASE_SECRET_KEY is required for Supabase admin authentication. SUPABASE_SERVICE_ROLE_KEY is also accepted as a legacy alias.");
  return value;
}

export function isSupabaseConfigured() {
  return Boolean(configuredValue("SUPABASE_URL") && (configuredValue("SUPABASE_PUBLISHABLE_KEY") || configuredValue("SUPABASE_ANON_KEY")) && (configuredValue("SUPABASE_SECRET_KEY") || configuredValue("SUPABASE_SERVICE_ROLE_KEY")));
}

export function getSupabaseAuthClient() {
  authClient ??= createClient<RDashSupabaseSchema>(supabaseUrl(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return authClient;
}

export function getSupabaseAdminClient() {
  adminClient ??= createClient<RDashSupabaseSchema>(supabaseUrl(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
