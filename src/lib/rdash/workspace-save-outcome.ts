type WorkspaceSaveOutcome = "confirmed" | "pending" | "rejected";

export function classifyWorkspaceSaveOutcome(
  httpStatus: number,
  payloadStatus?: "applied" | "processing",
): WorkspaceSaveOutcome {
  if (httpStatus < 200 || httpStatus >= 300) return "rejected";
  if (httpStatus === 202 || payloadStatus === "processing") return "pending";
  return "confirmed";
}
