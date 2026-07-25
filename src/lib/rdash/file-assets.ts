/** Shared picker constraints for the durable direct-to-Drive upload queue. */
export const MANAGED_FILE_ACCEPT = "image/*,video/*,application/pdf,.pdf";

/** Detect temporary browser-only previews that must never be persisted. */
export function looksLikeEmbeddedBinary(value?: string) {
  return Boolean(value && /^(data:|blob:)/i.test(value));
}
