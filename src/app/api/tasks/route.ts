import { NextRequest } from "next/server";
import { handleModuleScopedRead } from "@/lib/rdash/server/module-scoped-route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleModuleScopedRead(request, {
    moduleId: "tasks",
    errorLabel: "Task workspace",
    timingLabel: "workspace-tasks",
  });
}
