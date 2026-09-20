import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import { disconnectWhatsApp } from "@/lib/whatsapp/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    if (user.role !== "Owner") {
      return NextResponse.json({ error: "Only Owner can disconnect the Urban Castle WhatsApp account." }, { status: 403 });
    }
    await disconnectWhatsApp();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not disconnect WhatsApp.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
