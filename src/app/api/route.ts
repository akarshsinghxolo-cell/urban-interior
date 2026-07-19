import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Urban Castle Supabase PostgreSQL API",
    status: "ok",
    storage: "postgresql",
    workspace: "/api/workspace",
    commit: "/api/operations/commit",
  });
}
