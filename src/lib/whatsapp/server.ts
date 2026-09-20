import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  proto,
  type AuthenticationState,
} from "@whiskeysockets/baileys";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type WhatsAppConnectionStatus =
  | "disconnected"
  | "pairing"
  | "connecting"
  | "connected"
  | "degraded"
  | "logged_out"
  | "error";

export interface WhatsAppAccountSnapshot {
  workspaceId: string;
  status: WhatsAppConnectionStatus;
  paired: boolean;
  phoneNumber?: string;
  jid?: string;
  displayName?: string;
  pairingRequestedAt?: string;
  connectedAt?: string;
  lastActivityAt?: string;
  lastError?: string;
}

export interface WhatsAppJournalMessage {
  id: string;
  direction: "inbound" | "outbound";
  providerMessageId?: string;
  remoteJid: string;
  customerId?: string;
  commSendId?: string;
  subject?: string;
  body?: string;
  messageType: string;
  status: "received" | "queued" | "sending" | "sent" | "delivered" | "read" | "failed";
  errorMessage?: string;
  sentAt?: string;
  receivedAt?: string;
  createdAt: string;
}

const logger: any = {
  level: "silent",
  child: () => logger,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
};

function adminClient(): any {
  return getSupabaseAdminClient() as any;
}

export function whatsappWorkspaceId(): string {
  return process.env.UC_WORKSPACE_ID?.trim() || "default";
}

export function isWhatsAppQaMode(): boolean {
  const url = process.env.SUPABASE_URL || "";
  return url.includes("127.0.0.1:3210") || url.includes("localhost:3210");
}

function encodeAuthPayload(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function decodeAuthPayload<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

function cleanPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function comparableIndianPhone(raw: string): string {
  const digits = cleanPhoneDigits(raw);
  if (!digits) return "";
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(-10);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function whatsappDialDigits(raw: string): string {
  const digits = cleanPhoneDigits(raw);
  if (!digits) throw new Error("A WhatsApp phone number is required.");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  throw new Error("Enter a valid WhatsApp number including country code when outside India.");
}

function remotePhone(remoteJid: string): string {
  const local = remoteJid.split("@")[0]?.split(":")[0] || "";
  return comparableIndianPhone(local);
}

async function ensureAccountRow(workspaceId = whatsappWorkspaceId()): Promise<void> {
  if (isWhatsAppQaMode()) return;
  const { error } = await adminClient()
    .from("uc_whatsapp_accounts")
    .upsert({ workspace_id: workspaceId, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) throw new Error(`Could not initialize WhatsApp account state: ${error.message}`);
}

async function readAuthValue<T>(workspaceId: string, authKey: string): Promise<T | null> {
  const { data, error } = await adminClient()
    .from("uc_whatsapp_auth_state")
    .select("payload")
    .eq("workspace_id", workspaceId)
    .eq("auth_key", authKey)
    .maybeSingle();
  if (error) throw new Error(`Could not read WhatsApp auth state: ${error.message}`);
  return data?.payload == null ? null : decodeAuthPayload<T>(data.payload);
}

async function writeAuthValue(workspaceId: string, authKey: string, value: unknown): Promise<void> {
  const { error } = await adminClient()
    .from("uc_whatsapp_auth_state")
    .upsert({
      workspace_id: workspaceId,
      auth_key: authKey,
      payload: encodeAuthPayload(value),
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,auth_key" });
  if (error) throw new Error(`Could not save WhatsApp auth state: ${error.message}`);
}

async function deleteAuthValue(workspaceId: string, authKey: string): Promise<void> {
  const { error } = await adminClient()
    .from("uc_whatsapp_auth_state")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("auth_key", authKey);
  if (error) throw new Error(`Could not remove WhatsApp auth state: ${error.message}`);
}

export async function clearWhatsAppAuthState(workspaceId = whatsappWorkspaceId()): Promise<void> {
  if (isWhatsAppQaMode()) return;
  const { error } = await adminClient()
    .from("uc_whatsapp_auth_state")
    .delete()
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`Could not clear WhatsApp auth state: ${error.message}`);
}

export async function useSupabaseWhatsAppAuthState(workspaceId = whatsappWorkspaceId()): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  await ensureAccountRow(workspaceId);
  const creds = (await readAuthValue<any>(workspaceId, "creds")) || initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type: any, ids: string[]) => {
        const values: Record<string, any> = {};
        await Promise.all(ids.map(async (id) => {
          let value = await readAuthValue<any>(workspaceId, `${type}:${id}`);
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          values[id] = value;
        }));
        return values;
      },
      set: async (data: any) => {
        const writes: Promise<void>[] = [];
        for (const category of Object.keys(data || {})) {
          for (const id of Object.keys(data[category] || {})) {
            const value = data[category][id];
            const key = `${category}:${id}`;
            writes.push(value == null
              ? deleteAuthValue(workspaceId, key)
              : writeAuthValue(workspaceId, key, value));
          }
        }
        await Promise.all(writes);
      },
    },
  };

  return {
    state,
    saveCreds: async () => writeAuthValue(workspaceId, "creds", creds),
  };
}

async function patchAccount(
  patch: Record<string, unknown>,
  workspaceId = whatsappWorkspaceId(),
): Promise<void> {
  if (isWhatsAppQaMode()) return;
  await ensureAccountRow(workspaceId);
  const { error } = await adminClient()
    .from("uc_whatsapp_accounts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`Could not update WhatsApp connection state: ${error.message}`);
}

async function pairedFromStoredCreds(workspaceId: string): Promise<boolean> {
  if (isWhatsAppQaMode()) return false;
  const creds = await readAuthValue<any>(workspaceId, "creds");
  return Boolean(creds?.registered);
}

export async function getWhatsAppAccountSnapshot(
  workspaceId = whatsappWorkspaceId(),
): Promise<WhatsAppAccountSnapshot> {
  if (isWhatsAppQaMode()) {
    return { workspaceId, status: "disconnected", paired: false };
  }
  await ensureAccountRow(workspaceId);
  const { data, error } = await adminClient()
    .from("uc_whatsapp_accounts")
    .select("workspace_id,status,phone_number,jid,display_name,pairing_requested_at,connected_at,last_activity_at,last_error")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Could not read WhatsApp connection state: ${error.message}`);
  const paired = await pairedFromStoredCreds(workspaceId);
  return {
    workspaceId,
    status: (data?.status || "disconnected") as WhatsAppConnectionStatus,
    paired,
    phoneNumber: data?.phone_number || undefined,
    jid: data?.jid || undefined,
    displayName: data?.display_name || undefined,
    pairingRequestedAt: data?.pairing_requested_at || undefined,
    connectedAt: data?.connected_at || undefined,
    lastActivityAt: data?.last_activity_at || undefined,
    lastError: data?.last_error || undefined,
  };
}

async function customerForId(customerId: string, workspaceId: string): Promise<any> {
  const { data, error } = await adminClient()
    .from("entity_customers")
    .select("id,data")
    .eq("workspace_id", workspaceId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(`Could not load customer for WhatsApp: ${error.message}`);
  if (!data) throw new Error("Customer not found.");
  return data;
}

async function customerIdForRemoteJid(remoteJid: string, workspaceId: string): Promise<string | undefined> {
  const phone = remotePhone(remoteJid);
  if (!phone) return undefined;
  const { data, error } = await adminClient()
    .from("entity_customers")
    .select("id,data")
    .eq("workspace_id", workspaceId)
    .limit(1000);
  if (error) return undefined;
  const match = (data || []).find((row: any) => {
    const customer = row.data || {};
    return [customer.whatsapp, customer.phone, customer.alternate_phone]
      .filter(Boolean)
      .some((value: string) => comparableIndianPhone(value) === phone);
  });
  return match?.id;
}

function messageBody(message: any): { body?: string; messageType: string } {
  if (!message) return { messageType: "unknown" };
  if (message.conversation) return { body: message.conversation, messageType: "text" };
  if (message.extendedTextMessage?.text) return { body: message.extendedTextMessage.text, messageType: "text" };
  if (message.imageMessage) return { body: message.imageMessage.caption || "[Image]", messageType: "image" };
  if (message.videoMessage) return { body: message.videoMessage.caption || "[Video]", messageType: "video" };
  if (message.documentMessage) return {
    body: message.documentMessage.caption || message.documentMessage.fileName || "[Document]",
    messageType: "document",
  };
  if (message.audioMessage) return { body: "[Voice/audio message]", messageType: "audio" };
  if (message.stickerMessage) return { body: "[Sticker]", messageType: "sticker" };
  if (message.locationMessage) return { body: "[Location]", messageType: "location" };
  return { body: "[WhatsApp message]", messageType: "unknown" };
}

async function journalInboundMessage(msg: any, workspaceId: string): Promise<void> {
  const remoteJid = msg?.key?.remoteJid;
  if (!remoteJid || msg?.key?.fromMe) return;
  const providerMessageId = msg?.key?.id || undefined;
  if (providerMessageId) {
    const { data: existing } = await adminClient()
      .from("uc_whatsapp_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("direction", "inbound")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    if (existing) return;
  }
  const extracted = messageBody(msg?.message);
  const customerId = await customerIdForRemoteJid(remoteJid, workspaceId);
  const receivedAt = new Date(
    Number(msg?.messageTimestamp || 0) > 0
      ? Number(msg.messageTimestamp) * 1000
      : Date.now(),
  ).toISOString();
  const { error } = await adminClient()
    .from("uc_whatsapp_messages")
    .insert({
      workspace_id: workspaceId,
      provider_message_id: providerMessageId,
      direction: "inbound",
      remote_jid: remoteJid,
      customer_id: customerId || null,
      body: extracted.body || null,
      message_type: extracted.messageType,
      status: "received",
      received_at: receivedAt,
      metadata: { pushName: msg?.pushName || null },
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Could not journal inbound WhatsApp message: ${error.message}`);
}

export async function createUrbanCastleWhatsAppSocket(workspaceId = whatsappWorkspaceId()) {
  if (isWhatsAppQaMode()) {
    throw new Error("WhatsApp transport is disabled against the local QA Supabase mock.");
  }
  const { state, saveCreds } = await useSupabaseWhatsAppAuthState(workspaceId);
  const { version } = await fetchLatestBaileysVersion();
  await patchAccount({ status: state.creds.registered ? "connecting" : "pairing", last_error: null }, workspaceId);

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  } as any);

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
    } catch (error) {
      await patchAccount({
        status: "error",
        last_error: error instanceof Error ? error.message : "Credential save failed",
      }, workspaceId).catch(() => undefined);
    }
  });

  sock.ev.on("connection.update", async (update: any) => {
    try {
      if (update.connection === "open") {
        const now = new Date().toISOString();
        await patchAccount({
          status: "connected",
          jid: sock.user?.id || null,
          display_name: sock.user?.name || null,
          connected_at: now,
          last_activity_at: now,
          last_error: null,
        }, workspaceId);
      } else if (update.connection === "close") {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          await clearWhatsAppAuthState(workspaceId);
          await patchAccount({
            status: "logged_out",
            jid: null,
            display_name: null,
            last_error: "WhatsApp logged this linked device out.",
          }, workspaceId);
        } else {
          await patchAccount({
            status: "degraded",
            last_error: update.lastDisconnect?.error?.message || "WhatsApp socket closed; it will reconnect on the next Urban Castle request.",
          }, workspaceId);
        }
      }
    } catch {
      // Provider callbacks must never crash the socket event loop.
    }
  });

  sock.ev.on("messages.upsert", async (upsert: any) => {
    if (upsert?.type !== "notify") return;
    for (const msg of upsert.messages || []) {
      try {
        await journalInboundMessage(msg, workspaceId);
        await patchAccount({ last_activity_at: new Date().toISOString() }, workspaceId);
      } catch {
        // A malformed inbound message should not kill the connection.
      }
    }
  });

  return { sock, state };
}

function waitForSocketOpen(sock: any, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("WhatsApp did not connect in time. Check the linked-device status and try again."));
    }, timeoutMs);
    sock.ev.on("connection.update", (update: any) => {
      if (settled) return;
      if (update.connection === "open") {
        settled = true;
        clearTimeout(timer);
        resolve();
      } else if (update.connection === "close") {
        settled = true;
        clearTimeout(timer);
        reject(new Error(update.lastDisconnect?.error?.message || "WhatsApp connection closed before it was ready."));
      }
    });
  });
}

export async function requestWhatsAppPairingCode(phoneNumber: string) {
  if (isWhatsAppQaMode()) throw new Error("WhatsApp pairing is disabled in local QA mode.");
  const workspaceId = whatsappWorkspaceId();
  await ensureAccountRow(workspaceId);
  const snapshot = await getWhatsAppAccountSnapshot(workspaceId);
  if (snapshot.paired) {
    throw new Error("Urban Castle already has a paired WhatsApp account. Disconnect it before pairing another number.");
  }
  const dialDigits = whatsappDialDigits(phoneNumber);
  const { sock } = await createUrbanCastleWhatsAppSocket(workspaceId);
  const code = await sock.requestPairingCode(dialDigits);
  const now = new Date().toISOString();
  await patchAccount({
    status: "pairing",
    phone_number: dialDigits,
    pairing_requested_at: now,
    last_error: null,
  }, workspaceId);
  return { code, phoneNumber: dialDigits, sock, expiresInSeconds: 180 };
}

export async function holdPairingSocket(sock: any, timeoutMs = 180_000): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    sock.ev.on("connection.update", (update: any) => {
      if (update.connection === "open" || update.connection === "close") {
        clearTimeout(timer);
        finish();
      }
    });
  });
}

async function loadSendableAttachments(sourceAttachmentIds: string[] | undefined, workspaceId: string) {
  const ids = [...new Set((sourceAttachmentIds || []).filter(Boolean))];
  if (!ids.length) return [] as Array<{ url: string; mimeType: string; fileName: string; caption?: string }>;

  const { data: attachmentRows, error: attachmentError } = await adminClient()
    .from("entity_entityFileAttachments")
    .select("id,data")
    .eq("workspace_id", workspaceId)
    .in("id", ids);
  if (attachmentError) throw new Error(`Could not load WhatsApp attachments: ${attachmentError.message}`);

  const attachments = attachmentRows || [];
  if (attachments.length !== ids.length) {
    throw new Error("One or more communication attachments no longer exist.");
  }
  const assetIds = [...new Set(attachments.map((row: any) => row.data?.file_asset_id).filter(Boolean))];
  const { data: assetRows, error: assetError } = await adminClient()
    .from("entity_master_fileAssets")
    .select("id,data")
    .eq("workspace_id", workspaceId)
    .in("id", assetIds);
  if (assetError) throw new Error(`Could not load WhatsApp file assets: ${assetError.message}`);

  const assetsById = new Map((assetRows || []).map((row: any) => [row.id, row.data || {}]));
  return attachments.map((row: any) => {
    const attachment = row.data || {};
    const asset: any = assetsById.get(attachment.file_asset_id);
    if (!asset || asset.sync_status !== "uploaded") {
      throw new Error("WhatsApp attachments must finish uploading to Google Drive before sending.");
    }
    if (!asset.google_file_id) {
      throw new Error(`WhatsApp cannot send “${asset.file_name || "attachment"}” because it has no Google Drive file ID.`);
    }
    return {
      url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(asset.google_file_id)}`,
      mimeType: asset.mime_type || "application/octet-stream",
      fileName: asset.file_name || "attachment",
      caption: attachment.caption || undefined,
    };
  });
}

export async function sendWhatsAppMessage(input: {
  customerId: string;
  subject: string;
  body?: string;
  sourceAttachmentIds?: string[];
  commSendId?: string;
}) {
  if (isWhatsAppQaMode()) throw new Error("WhatsApp sending is disabled in local QA mode.");
  const workspaceId = whatsappWorkspaceId();
  const customerRow = await customerForId(input.customerId, workspaceId);
  const customer = customerRow.data || {};
  const recipient = customer.whatsapp || customer.phone;
  if (!recipient) throw new Error("This customer has no WhatsApp or phone number.");
  const dialDigits = whatsappDialDigits(recipient);
  const remoteJid = `${dialDigits}@s.whatsapp.net`;

  const { sock, state } = await createUrbanCastleWhatsAppSocket(workspaceId);
  if (!state.creds.registered) {
    throw new Error("WhatsApp is not paired. Ask the Owner to connect Urban Castle to WhatsApp first.");
  }
  await waitForSocketOpen(sock);

  const parts = [input.subject?.trim(), input.body?.trim()].filter(Boolean);
  const text = parts.join("\n\n") || "Urban Castle";
  const attachments = await loadSendableAttachments(input.sourceAttachmentIds, workspaceId);
  const sent = await sock.sendMessage(remoteJid, { text });
  const providerMessageId = sent?.key?.id || undefined;
  const attachmentProviderMessageIds: string[] = [];

  for (const attachment of attachments) {
    let result: any;
    if (attachment.mimeType.startsWith("image/")) {
      result = await sock.sendMessage(remoteJid, {
        image: { url: attachment.url },
        mimetype: attachment.mimeType,
        caption: attachment.caption || attachment.fileName,
      } as any);
    } else if (attachment.mimeType.startsWith("video/")) {
      result = await sock.sendMessage(remoteJid, {
        video: { url: attachment.url },
        mimetype: attachment.mimeType,
        caption: attachment.caption || attachment.fileName,
      } as any);
    } else if (attachment.mimeType.startsWith("audio/")) {
      result = await sock.sendMessage(remoteJid, {
        audio: { url: attachment.url },
        mimetype: attachment.mimeType,
      } as any);
    } else {
      result = await sock.sendMessage(remoteJid, {
        document: { url: attachment.url },
        mimetype: attachment.mimeType,
        fileName: attachment.fileName,
        caption: attachment.caption,
      } as any);
    }
    if (result?.key?.id) attachmentProviderMessageIds.push(result.key.id);
  }

  const now = new Date().toISOString();

  const { error } = await adminClient()
    .from("uc_whatsapp_messages")
    .insert({
      workspace_id: workspaceId,
      provider_message_id: providerMessageId || null,
      direction: "outbound",
      remote_jid: remoteJid,
      customer_id: input.customerId,
      comm_send_id: input.commSendId || null,
      subject: input.subject || null,
      body: input.body || null,
      message_type: "text",
      status: "sent",
      metadata: {
        sourceAttachmentIds: input.sourceAttachmentIds || [],
        attachmentProviderMessageIds,
        transport: "baileys",
      },
      sent_at: now,
      updated_at: now,
    });
  if (error) throw new Error(`WhatsApp sent, but Urban Castle could not journal the provider message: ${error.message}`);

  await patchAccount({ status: "connected", last_activity_at: now, last_error: null }, workspaceId);
  return { providerMessageId, attachmentProviderMessageIds, remoteJid, sentAt: now };
}

export async function disconnectWhatsApp(): Promise<void> {
  if (isWhatsAppQaMode()) return;
  const workspaceId = whatsappWorkspaceId();
  const { sock, state } = await createUrbanCastleWhatsAppSocket(workspaceId);
  if (state.creds.registered) {
    await waitForSocketOpen(sock, 15_000);
    await sock.logout();
  }
  await clearWhatsAppAuthState(workspaceId);
  await patchAccount({
    status: "disconnected",
    phone_number: null,
    jid: null,
    display_name: null,
    pairing_requested_at: null,
    connected_at: null,
    last_activity_at: new Date().toISOString(),
    last_error: null,
  }, workspaceId);
}

export async function listWhatsAppMessages(limit = 50): Promise<WhatsAppJournalMessage[]> {
  if (isWhatsAppQaMode()) return [];
  const workspaceId = whatsappWorkspaceId();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit || 50)));
  const { data, error } = await adminClient()
    .from("uc_whatsapp_messages")
    .select("id,direction,provider_message_id,remote_jid,customer_id,comm_send_id,subject,body,message_type,status,error_message,sent_at,received_at,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`Could not load WhatsApp message journal: ${error.message}`);
  return (data || []).map((row: any) => ({
    id: row.id,
    direction: row.direction,
    providerMessageId: row.provider_message_id || undefined,
    remoteJid: row.remote_jid,
    customerId: row.customer_id || undefined,
    commSendId: row.comm_send_id || undefined,
    subject: row.subject || undefined,
    body: row.body || undefined,
    messageType: row.message_type,
    status: row.status,
    errorMessage: row.error_message || undefined,
    sentAt: row.sent_at || undefined,
    receivedAt: row.received_at || undefined,
    createdAt: row.created_at,
  }));
}
