import { NextRequest, NextResponse } from "next/server";
import { createPendingAccessRequest } from "@/lib/rdash/server/auth-users";
import { rateLimit, clientIp } from "@/lib/rdash/server/ratelimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 signup requests per IP per hour.
    const ip = clientIp(request);
    const rl = rateLimit(`signup:${ip}`, 3, 60 * 60);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many access requests from this address. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json() as { email?: string; password?: string; displayName?: string; requestedRole?: string };
    const result = await createPendingAccessRequest(body);
    return NextResponse.json({
      status: result.status,
      message: "Access request created. The owner must approve this user before login is enabled.",
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create access request." }, { status: 400 });
  }
}
