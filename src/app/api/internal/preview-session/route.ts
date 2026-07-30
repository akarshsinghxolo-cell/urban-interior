import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  sessionCookie,
  signSession,
} from "@/lib/rdash/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  if (process.env.VERCEL_ENV !== "preview" || process.env.UC_PREVIEW_DEMO !== "1") {
    return false;
  }
  const expected = String(process.env.UC_PREVIEW_VERIFY_TOKEN || "").trim();
  const supplied = String(request.headers.get("x-uc-preview-verifier") || "").trim();
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = signSession({
    userId: "preview-demo-owner",
    email: "preview-owner@urban-castle.invalid",
    name: "Preview Owner",
    role: "Owner",
  });
  const response = NextResponse.json(
    {
      authenticated: true,
      next: "/workspace/tasks",
      dataSource: "in-memory-preview",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
  response.cookies.set(sessionCookie(token));
  return response;
}
