import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import { listWhatsAppMessages } from "@/lib/whatsapp/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "50");
    const messages = await listWhatsAppMessages(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load WhatsApp messages.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
