import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("Urban Castle WhatsApp integration", () => {
  test("pins the reviewed Baileys release in both package manifests", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
    expect(pkg.dependencies?.["@whiskeysockets/baileys"]).toBe("7.0.0-rc14");
    expect(pkg.dependencies?.qrcode).toBe("1.5.4");
    expect(lock.packages?.[""]?.dependencies?.["@whiskeysockets/baileys"]).toBe("7.0.0-rc14");
  });

  test("keeps WhatsApp credentials in server-only Supabase tables", async () => {
    const migration = await readFile("supabase/migrations/20260920042121_whatsapp_baileys_foundation.sql", "utf8");
    const server = await readFile("src/lib/whatsapp/server.ts", "utf8");

    expect(migration).toContain("create table if not exists public.uc_whatsapp_auth_state");
    expect(migration).toContain("alter table public.uc_whatsapp_auth_state enable row level security");
    expect(migration).toContain("revoke all on table public.uc_whatsapp_auth_state from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.uc_whatsapp_auth_state to service_role");
    expect(server).toContain('from("uc_whatsapp_auth_state")');
    expect(server).toContain("BufferJSON.replacer");
    expect(server).toContain("BufferJSON.reviver");
    expect(server).not.toContain("useMultiFileAuthState");
  });

  test("requires authenticated routes and Owner approval for pairing lifecycle", async () => {
    const pair = await readFile("src/app/api/whatsapp/pair/route.ts", "utf8");
    const disconnect = await readFile("src/app/api/whatsapp/disconnect/route.ts", "utf8");
    const send = await readFile("src/app/api/whatsapp/send/route.ts", "utf8");
    const stream = await readFile("src/app/api/whatsapp/stream/route.ts", "utf8");

    for (const source of [pair, disconnect, send, stream]) {
      expect(source).toContain("requireSession(request)");
    }
    expect(pair).toContain('user.role !== "Owner"');
    expect(pair).toContain('QRCode.toDataURL(update.qr');
    expect(pair).toContain('"Content-Type": "text/event-stream"');
    expect(pair).not.toContain("requestPairingCode");
    expect(pair).toContain("shouldReconnectWhatsApp(update)");
    expect(pair).toContain("createUrbanCastleWhatsAppSocket(undefined, handleConnectionUpdate)");
    expect(disconnect).toContain('user.role !== "Owner"');
    expect(stream).toContain('"Content-Type": "text/event-stream"');
    expect(stream).toContain("createUrbanCastleWhatsAppSocket");
    expect(stream).toContain("shouldReconnectWhatsApp(update)");
    expect(stream).toContain('status: "reconnecting"');
  });

  test("sends through the provider before committing the canonical communication", async () => {
    const centre = await readFile("src/components/rdash/modules/CommunicationCentreModule.tsx", "utf8");
    const providerIndex = centre.indexOf('fetch("/api/whatsapp/send"');
    const canonicalIndex = centre.indexOf("sendComm({ ...data, channel: composeChannel, status: \"sent\" })");

    expect(providerIndex).toBeGreaterThan(-1);
    expect(canonicalIndex).toBeGreaterThan(providerIndex);
    expect(centre).toContain("await onSend(payload)");
    expect(centre).toContain("asset.sync_status !== \"uploaded\"");
    expect(centre).toContain("<WhatsAppConnectionPanel");
  });

  test("keeps Baileys external to the Turbopack server bundle", async () => {
    const config = await readFile("next.config.ts", "utf8");
    expect(config).toContain('serverExternalPackages: ["@whiskeysockets/baileys"]');
  });

  test("keeps WhatsApp provider history module-scoped instead of bloating bootstrap", async () => {
    const centre = await readFile("src/components/rdash/WhatsAppConnectionPanel.tsx", "utf8");
    const bootstrap = await readFile("src/app/api/bootstrap/route.ts", "utf8");

    expect(centre).toContain('fetch("/api/whatsapp/messages?limit=12"');
    expect(centre).toContain('new EventSource("/api/whatsapp/stream")');
    expect(centre).toContain('new EventSource("/api/whatsapp/pair")');
    expect(centre).toContain("WhatsApp linked-device QR code");
    expect(centre).not.toContain("Link with phone number");
    expect(bootstrap).not.toContain("uc_whatsapp_messages");
    expect(bootstrap).not.toContain("uc_whatsapp_auth_state");
  });

  test("sends uploaded Drive attachments and journals inbound WhatsApp messages", async () => {
    const server = await readFile("src/lib/whatsapp/server.ts", "utf8");

    expect(server).toContain("loadSendableAttachments");
    expect(server).toContain("DisconnectReason.restartRequired");
    expect(server).toContain("shouldReconnectWhatsApp");
    expect(server).toContain("Object.assign(state.creds as any, update || {})");
    expect(server).toContain("state.creds.registered = true");
    expect(server).toContain("await saveCreds();");
    expect(server).toContain('asset.sync_status !== "uploaded"');
    expect(server).toContain('message_type: extracted.messageType');
    expect(server).toContain('direction: "inbound"');
    expect(server).toContain("getPNForLID");
    expect(server).toContain('direction: "outbound"');
    expect(server).toContain("sock.ev.on(\"messages.upsert\"");
  });
});
