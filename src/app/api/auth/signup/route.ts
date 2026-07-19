import { NextRequest, NextResponse } from "next/server";
import { createPendingAccessRequest } from "@/lib/rdash/server/auth-users";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
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
