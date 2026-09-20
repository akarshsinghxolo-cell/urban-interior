import { NextRequest } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import {
  createUrbanCastleWhatsAppSocket,
  getWhatsAppAccountSnapshot,
  isWhatsAppQaMode,
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

  const { sock } = await createUrbanCastleWhatsAppSocket();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        try { controller.close(); } catch { /* already closed */ }
      };

      send("status", { status: "connecting" });

      sock.ev.on("connection.update", (update: any) => {
        if (update.connection) send("status", { status: update.connection });
        if (update.connection === "close") close();
      });
      sock.ev.on("messages.upsert", (upsert: any) => {
        if (upsert?.type === "notify" && (upsert.messages || []).some((message: any) => !message?.key?.fromMe)) {
          send("message", { received: true, at: new Date().toISOString() });
        }
      });

      const heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 25_000);
      const lifetime = setTimeout(close, 240_000);
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
