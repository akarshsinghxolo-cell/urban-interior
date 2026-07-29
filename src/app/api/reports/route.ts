import { NextRequest } from "next/server";
import { handleModuleScopedRead } from "@/lib/rdash/server/module-scoped-route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleModuleScopedRead(request, {
    moduleId: "reportsDesk",
    errorLabel: "Reports workspace",
    timingLabel: "workspace-reports",
  });
}
