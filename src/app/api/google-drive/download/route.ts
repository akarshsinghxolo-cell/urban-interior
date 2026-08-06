import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
  if (!fileId) {
    return NextResponse.json({ error: "A Google Drive file ID is required." }, { status: 400 });
  }

  const destination = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "public, max-age=300");
  return response;
}
