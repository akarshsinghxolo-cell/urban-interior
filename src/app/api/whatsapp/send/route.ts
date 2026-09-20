import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/rdash/server/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await requireSession(request);
    const body = await request.json().catch(() => ({})) as {
      customerId?: unknown;
      subject?: unknown;
      body?: unknown;
      sourceAttachmentIds?: unknown;
      commSendId?: unknown;
    };
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const messageBody = typeof body.body === "string" ? body.body.trim() : undefined;
    const sourceAttachmentIds = Array.isArray(body.sourceAttachmentIds)
      ? body.sourceAttachmentIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      : undefined;
    const commSendId = typeof body.commSendId === "string" ? body.commSendId.trim() : undefined;

    if (!customerId || !subject) {
      return NextResponse.json({ error: "Customer and subject are required." }, { status: 400 });
    }

    const result = await sendWhatsAppMessage({
      customerId,
      subject,
      body: messageBody,
      sourceAttachmentIds,
      commSendId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp message could not be sent.";
    const status = /not paired|pair/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
