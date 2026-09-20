import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import { getWhatsAppAccountSnapshot } from "@/lib/whatsapp/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request);
    const account = await getWhatsAppAccountSnapshot();
    return NextResponse.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read WhatsApp status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
