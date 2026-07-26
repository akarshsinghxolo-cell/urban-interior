import { createHash, randomBytes } from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuthenticatedUser } from "./auth";

const ENROLLMENT_TTL_MS = 15 * 60_000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function ownerCanManageDevices(user: AuthenticatedUser) {
  return user.role === "Owner" || user.role === "Operations Manager";
}

export async function issueTrackingEnrollment(user: AuthenticatedUser, staffId: string, deviceName: string) {
  if (!ownerCanManageDevices(user)) throw new Error("FORBIDDEN:Only Owner or Operations Manager may register tracking devices.");
  const admin = getSupabaseAdminClient();
  const { data: staff, error } = await admin.from("StaffProfile")
    .select("id,name,status,gpsTrackingEnabled")
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw new Error(`Could not inspect staff: ${error.message}`);
  if (!staff || staff.status !== "active" || staff.gpsTrackingEnabled === false) {
    throw new Error("INVALID:Choose an active staff member with GPS tracking enabled.");
  }

  const code = `uce_${randomBytes(18).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString();
  const { error: insertError } = await admin.from("uc_tracking_device_enrollments").insert({
    code_hash: sha256(code),
    staff_id: staffId,
    staff_name: staff.name,
    device_name: deviceName.trim().slice(0, 80) || `${staff.name} phone`,
    created_by_user_id: user.userId,
    created_by_name: user.name,
    expires_at: expiresAt,
  });
  if (insertError) throw new Error(`Could not create device enrollment: ${insertError.message}`);
  return { code, expiresAt, staffId, staffName: staff.name };
}

export async function registerTrackingDevice(input: {
  code: string;
  deviceName: string;
  platform: "android" | "ios";
  installationId?: string;
}) {
  const token = `uct_${randomBytes(32).toString("base64url")}`;
  const tokenHash = sha256(token);
  const tokenPrefix = token.slice(0, 12);
  const { data, error } = await (getSupabaseAdminClient() as any).rpc("uc_register_tracking_device", {
    p_code_hash: sha256(input.code.trim()),
    p_token_hash: tokenHash,
    p_token_prefix: tokenPrefix,
    p_device_name: input.deviceName.trim().slice(0, 80),
    p_platform: input.platform,
    p_installation_id: input.installationId?.trim().slice(0, 120) || null,
  });
  if (error) throw new Error(`INVALID:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.device_id || !row?.staff_id) throw new Error("INVALID:The enrollment code is invalid, expired, or already used.");
  return {
    token,
    deviceId: String(row.device_id),
    staffId: String(row.staff_id),
    staffName: String(row.staff_name || ""),
  };
}

export async function authenticateTrackingDevice(authorization: string | null) {
  const token = authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("uct_") || token.length < 32) throw new Error("UNAUTHORIZED");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("uc_tracking_devices")
    .select("id,staff_id,device_name,platform,status")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (error) throw new Error(`Could not authenticate tracking device: ${error.message}`);
  if (!data || data.status !== "active") throw new Error("UNAUTHORIZED");
  return {
    id: String(data.id),
    staffId: String(data.staff_id),
    deviceName: String(data.device_name),
    platform: String(data.platform),
  };
}

export async function markTrackingDeviceSeen(deviceId: string, pointCount: number) {
  await getSupabaseAdminClient().from("uc_tracking_devices").update({
    last_seen_at: new Date().toISOString(),
    last_batch_size: pointCount,
  }).eq("id", deviceId).eq("status", "active");
}
