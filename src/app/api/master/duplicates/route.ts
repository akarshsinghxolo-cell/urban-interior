import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import {
  collectCustomerIdentityDuplicateGroups,
} from "@/lib/rdash/server/customer-duplicates";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Owner-facing audit of historical duplicate customer contact identities.
 *
 * Writes are already guarded twice (UI conflict check + DB unique indexes
 * entity_customers_phone_uidx / entity_customers_email_uidx). This report
 * surfaces anything that predates those guards so it can be merged by hand.
 * Read-only over the caller's normal workspace scope.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const workspace = await getWorkspace(false);
    const customers = workspace.data.customers || [];
    const groups = collectCustomerIdentityDuplicateGroups(customers);
    return NextResponse.json(
      {
        ok: true,
        scannedAt: new Date().toISOString(),
        totalCustomers: customers.length,
        duplicateGroups: groups.length,
        groups,
        user: { name: user.name, email: user.email, role: user.role },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Duplicates unavailable.";
    const status = message === "UNAUTHORIZED" ? 401 : 503;
    console.error("[customer-duplicates] report failed", { status, error: message });
    return NextResponse.json(
      { ok: false, error: status === 401 ? "Authentication is required." : "Duplicate report is temporarily unavailable." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
