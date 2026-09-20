import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import {
  createUrbanCastleWhatsAppSocket,
  shouldReconnectWhatsApp,
  startWhatsAppQrPairing,
  whatsappDisconnectCode,
} from "@/lib/whatsapp/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    if (user.role !== "Owner") {
      return NextResponse.json({ error: "Only Owner can pair the Urban Castle WhatsApp account." }, { status: 403 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        let lifetime: ReturnType<typeof setTimeout> | undefined;
        let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
        let reconnectPending = false;

        const send = (event: string, payload: unknown) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        };

        const close = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          if (lifetime) clearTimeout(lifetime);
          if (reconnectTimer) clearTimeout(reconnectTimer);
          try { controller.close(); } catch { /* stream already closed */ }
        };

        const failAndClose = (message: string) => {
          send("failed", { error: message });
          close();
        };

        const handleConnectionUpdate = async (update: any) => {
          if (closed) return;

          if (update?.qr) {
            const image = await QRCode.toDataURL(update.qr, {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 320,
            });
            send("qr", {
              image,
              generatedAt: new Date().toISOString(),
            });
          }

          if (update?.connection === "open") {
            send("paired", { paired: true, at: new Date().toISOString() });
            close();
            return;
          }

          if (update?.connection !== "close") return;

          const code = whatsappDisconnectCode(update);
          if (!shouldReconnectWhatsApp(update)) {
            failAndClose(update?.lastDisconnect?.error?.message || "WhatsApp logged this linked device out.");
            return;
          }

          // Emnex/Baileys reconnects every non-loggedOut close. In particular,
          // status 515 (restartRequired) is expected after a successful QR scan:
          // the new socket must be created from the freshly persisted credentials.
          send("status", {
            status: "reconnecting",
            code,
            reason: code === 515 ? "restart_required" : "connection_closed",
          });

          if (reconnectPending || closed) return;
          reconnectPending = true;
          reconnectTimer = setTimeout(() => {
            reconnectPending = false;
            if (closed) return;
            void createUrbanCastleWhatsAppSocket(undefined, handleConnectionUpdate).catch((error) => {
              failAndClose(error instanceof Error ? error.message : "Could not reconnect WhatsApp after device linking.");
            });
          }, 600);
        };

        try {
          await startWhatsAppQrPairing(handleConnectionUpdate);

          heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 25_000);
          lifetime = setTimeout(() => {
            send("expired", { error: "QR pairing session expired. Generate a fresh QR code and scan it again." });
            close();
          }, 240_000);

          request.signal.addEventListener("abort", close, { once: true });
        } catch (error) {
          failAndClose(error instanceof Error ? error.message : "Could not start WhatsApp QR pairing.");
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start WhatsApp QR pairing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
