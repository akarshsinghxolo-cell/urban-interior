// ============================================================================
// /api/integrity — workspace integrity API
// ============================================================================
// GET  → returns the current IntegrityReport (compute fresh on each call)
// POST → body { action: "repair" | "cascade-delete", collection?, id?, softDelete? }
//        - "repair"          : runs repairIntegrityIssues, commits, returns { result, report }
//        - "cascade-delete"  : runs cascadeDelete, commits, returns { result, report }
//
// Auth: requires a valid session (uc_session cookie or Authorization
// Bearer header). Only Owner / Operations Manager may run repair or
// cascade-delete (mirrors the existing mutation policy).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace, saveWorkspace } from "@/lib/rdash/server/workspace";
import { checkWorkspaceIntegrity } from "@/lib/rdash/integrity/checker";
import { repairIntegrityIssues } from "@/lib/rdash/integrity/repair";
import { cascadeDelete } from "@/lib/rdash/integrity/cascade";
import type { IntegrityReport, RepairResult, CascadeResult } from "@/lib/rdash/types";

export const runtime = "nodejs";

function managerOnly(role: string): boolean {
    return role === "Owner" || role === "Operations Manager";
}

export async function GET(request: NextRequest) {
    try {
        await requireSession(request);
        const ws = await getWorkspace();
        const report = checkWorkspaceIntegrity(ws.data);
        return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Integrity check failed.";
        const status = message === "UNAUTHORIZED" ? 401 : 500;
        return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireSession(request);
        if (!managerOnly(user.role)) {
            return NextResponse.json(
                { error: "FORBIDDEN: Only Owner or Operations Manager may run integrity mutations." },
                { status: 403, headers: { "Cache-Control": "no-store" } },
            );
        }
        const body = (await request.json().catch(() => ({}))) as {
            action?: "repair" | "cascade-delete";
            collection?: string;
            id?: string;
            softDelete?: boolean;
            maxDepth?: number;
        };

        if (body.action === "repair") {
            const ws = await getWorkspace();
            const { db: repairedDb, result } = repairIntegrityIssues(ws.data);
            // Commit via the standard workspace save pipeline. saveWorkspace
            // runs validateBusinessData on the candidate — if the repair
            // produced an invalid db, it throws INVALID:... and we return 422.
            try {
                await saveWorkspace(ws.revision, repairedDb);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Commit failed.";
                if (message.startsWith("INVALID:")) {
                    return NextResponse.json(
                        { error: message.replace(/^INVALID:/, ""), result, report: checkWorkspaceIntegrity(repairedDb) },
                        { status: 422, headers: { "Cache-Control": "no-store" } },
                    );
                }
                throw error;
            }
            const fresh = await getWorkspace();
            const report = checkWorkspaceIntegrity(fresh.data);
            return NextResponse.json(
                { result, report } as { result: RepairResult; report: IntegrityReport },
                { headers: { "Cache-Control": "no-store" } },
            );
        }

        if (body.action === "cascade-delete") {
            if (!body.collection || !body.id) {
                return NextResponse.json(
                    { error: "collection and id are required for cascade-delete." },
                    { status: 400, headers: { "Cache-Control": "no-store" } },
                );
            }
            const ws = await getWorkspace();
            const { db: nextDb, result } = cascadeDelete(ws.data, body.collection, body.id, {
                softDelete: body.softDelete,
                maxDepth: body.maxDepth,
            });
            if (!result.success) {
                // Blocked by restrict — return the result without committing.
                const report = checkWorkspaceIntegrity(ws.data);
                return NextResponse.json(
                    { result, report, blocked: true } as { result: CascadeResult; report: IntegrityReport; blocked: boolean },
                    { status: 409, headers: { "Cache-Control": "no-store" } },
                );
            }
            try {
                await saveWorkspace(ws.revision, nextDb);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Commit failed.";
                if (message.startsWith("INVALID:")) {
                    return NextResponse.json(
                        { error: message.replace(/^INVALID:/, ""), result, report: checkWorkspaceIntegrity(nextDb) },
                        { status: 422, headers: { "Cache-Control": "no-store" } },
                    );
                }
                throw error;
            }
            const fresh = await getWorkspace();
            const report = checkWorkspaceIntegrity(fresh.data);
            return NextResponse.json(
                { result, report } as { result: CascadeResult; report: IntegrityReport },
                { headers: { "Cache-Control": "no-store" } },
            );
        }

        return NextResponse.json(
            { error: "Unknown action. Expected 'repair' or 'cascade-delete'." },
            { status: 400, headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Integrity mutation failed.";
        const status =
            message === "UNAUTHORIZED" ? 401 :
            message.startsWith("FORBIDDEN:") ? 403 :
            message === "CONFLICT" ? 409 :
            500;
        return NextResponse.json(
            { error: message.replace(/^(FORBIDDEN:|INVALID:)/, "").replace(/^CONFLICT$/, "The workspace changed on another device.") },
            { status, headers: { "Cache-Control": "no-store" } },
        );
    }
}
