import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace, resetWorkspace } from "@/lib/rdash/server/workspace";
export const runtime = "nodejs";
function payload(workspace: {
    revision: number;
    data: unknown;
}) {
    return { revision: workspace.revision, data: workspace.data };
}
export async function POST(request: NextRequest) {
    try {
        const user = await requireSession(request);
        const body = (await request.json().catch(() => ({}))) as {
            confirmation?: unknown;
        };
        const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
        const reset = await resetWorkspace(user, confirmation);
        return NextResponse.json(payload(reset), {
            headers: { "Cache-Control": "no-store" },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Workspace reset was rejected.";
        let workspace: Awaited<ReturnType<typeof getWorkspace>> | null = null;
        try {
            workspace = await getWorkspace();
        }
        catch {
            workspace = null;
        }
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
                .replace(/^CONFLICT$/, "The workspace changed on another device. No reset was applied."),
            ...(workspace ? payload(workspace) : {}),
        }, { status, headers: { "Cache-Control": "no-store" } });
    }
}
