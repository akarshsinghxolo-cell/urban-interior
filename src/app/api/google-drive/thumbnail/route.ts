import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function size(value: string | null) {
  const parsed = Number(value || "360");
  return Number.isFinite(parsed) ? Math.max(120, Math.min(1600, Math.round(parsed))) : 360;
}

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
  if (!fileId) {
    return NextResponse.json({ error: "A Google Drive file ID is required." }, { status: 400 });
  }

  const width = size(request.nextUrl.searchParams.get("w"));
  const destination = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "public, max-age=300");
  return response;
}
