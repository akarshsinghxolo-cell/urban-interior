import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { commitAuthorizedPostgresOperations, type CommitResult } from "@/lib/rdash/server/authorized-commit";
import type { WorkspaceOperation } from "@/lib/rdash/workspace-operations";

export const runtime = "nodejs";

function payload(workspace: CommitResult | Awaited<ReturnType<typeof getWorkspace>>) {
  const p: Record<string, unknown> = { revision: workspace.revision, data: workspace.data };
  if ("bumpedRowVersions" in workspace && workspace.bumpedRowVersions) {
    p.rowVersions = workspace.bumpedRowVersions;
  } else if ("rowVersions" in workspace && workspace.rowVersions) {
    p.rowVersions = workspace.rowVersions;
  }
  return p;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const body = (await request.json().catch(() => ({}))) as {
      revision?: number;
      operations?: WorkspaceOperation[];
      expectedRevisions?: Record<string, number>;
      expectedRowVersions?: Record<string, number>;
    };
    if (typeof body.revision !== "number" || !Array.isArray(body.operations)) {
      return NextResponse.json({ error: "revision and operations are required." }, { status: 400 });
    }
    if (!body.operations.length) {
      const current = await getWorkspace(true);
      return NextResponse.json(payload(current), { headers: { "Cache-Control": "no-store" } });
    }
    const saved = await commitAuthorizedPostgresOperations(
      user,
      body.revision,
      body.operations,
      body.expectedRevisions,
      body.expectedRowVersions,
    );
    return NextResponse.json(payload(saved), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation commit was rejected.";
    const current = await getWorkspace().catch(() => null);
    const status = message === "UNAUTHORIZED"
      ? 401
      : message.startsWith("FORBIDDEN:")
        ? 403
        : message.startsWith("INVALID:")
          ? 422
          : message === "CONFLICT"
            ? 409
            : 500;
    return NextResponse.json({
      error: message
        .replace(/^(FORBIDDEN:|INVALID:)/, "")
        .replace(/^CONFLICT$/, "The workspace changed on another device. The server version was restored."),
      ...(current ? payload(current) : {}),
    }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
