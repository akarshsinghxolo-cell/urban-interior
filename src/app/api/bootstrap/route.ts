import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspaceSubset } from "@/lib/rdash/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
});

function errorResponse(error: string, status: number, retryAfter?: string) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        ...PRIVATE_HEADERS,
        ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return errorResponse("Your session is missing or expired.", 401);
    }
    console.error("[api/bootstrap] session verification failed:", error);
    return errorResponse("The authentication service is temporarily unavailable.", 503, "5");
  }

  try {
    const startedAt = performance.now();
    const workspace = await getWorkspaceSubset({});
    const loadMs = performance.now() - startedAt;
    const body = JSON.stringify({
      revision: workspace.revision,
      updatedAt: workspace.updatedAt,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        expiresAt: user.expiresAt,
      },
      readStrategy: "module-scoped",
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...PRIVATE_HEADERS,
        "X-UC-Read-Mode": "bootstrap",
        "X-UC-Read-Strategy": "bootstrap",
        "X-UC-Read-Queries": String(workspace.queryCount),
        "X-UC-Response-Bytes": String(Buffer.byteLength(body)),
        "Server-Timing": `workspace-bootstrap;dur=${loadMs.toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error("[api/bootstrap] workspace bootstrap failed:", error);
    return errorResponse("The workspace bootstrap service is temporarily unavailable.", 503, "5");
  }
}
