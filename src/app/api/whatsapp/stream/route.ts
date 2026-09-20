import { NextRequest } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import {
  createUrbanCastleWhatsAppSocket,
  getWhatsAppAccountSnapshot,
  isWhatsAppQaMode,
  shouldReconnectWhatsApp,
  whatsappDisconnectCode,
} from "@/lib/whatsapp/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireSession(request);

  if (isWhatsAppQaMode()) {
    return new Response("WhatsApp stream disabled in local QA mode.", { status: 204 });
  }

  const snapshot = await getWhatsAppAccountSnapshot();
  if (!snapshot.paired) {
    return new Response("WhatsApp is not paired.", { status: 409 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let reconnectPending = false;
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;

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
        try { controller.close(); } catch { /* already closed */ }
      };

      const connect = async (): Promise<void> => {
        if (closed) return;
        try {
          const { sock } = await createUrbanCastleWhatsAppSocket(undefined, handleConnectionUpdate);
          sock.ev.on("messages.upsert", (upsert: any) => {
            if (
              upsert?.type === "notify"
              && (upsert.messages || []).some((message: any) => !message?.key?.fromMe)
            ) {
              send("message", { received: true, at: new Date().toISOString() });
            }
          });
        } catch (error) {
          send("status", {
            status: "error",
            error: error instanceof Error ? error.message : "WhatsApp reconnect failed.",
          });
          close();
        }
      };

      const handleConnectionUpdate = async (update: any) => {
        if (closed) return;

        if (update?.connection === "open") {
          send("status", { status: "connected" });
          return;
        }

        if (update?.connection !== "close") return;

        const code = whatsappDisconnectCode(update);
        if (!shouldReconnectWhatsApp(update)) {
          send("status", {
            status: "logged_out",
            code,
            error: update?.lastDisconnect?.error?.message || "WhatsApp logged out.",
          });
          close();
          return;
        }

        send("status", {
          status: "reconnecting",
          code,
          reason: code === 515 ? "restart_required" : "connection_closed",
        });

        if (reconnectPending || closed) return;
        reconnectPending = true;
        reconnectTimer = setTimeout(() => {
          reconnectPending = false;
          void connect();
        }, 600);
      };

      send("status", { status: "connecting" });
      await connect();

      heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 25_000);
      lifetime = setTimeout(close, 240_000);
      request.signal.addEventListener("abort", close, { once: true });
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
}
