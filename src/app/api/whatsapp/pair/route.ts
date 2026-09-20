import { after, NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import { holdPairingSocket, requestWhatsAppPairingCode } from "@/lib/whatsapp/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    if (user.role !== "Owner") {
      return NextResponse.json({ error: "Only Owner can pair the Urban Castle WhatsApp account." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({})) as { phoneNumber?: unknown };
    const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    if (!phoneNumber) {
      return NextResponse.json({ error: "Enter the WhatsApp phone number to pair." }, { status: 400 });
    }
    const pairing = await requestWhatsAppPairingCode(phoneNumber);
    after(async () => {
      await holdPairingSocket(pairing.sock).catch(() => undefined);
    });
    return NextResponse.json({
      code: pairing.code,
      phoneNumber: pairing.phoneNumber,
      expiresInSeconds: pairing.expiresInSeconds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start WhatsApp pairing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
