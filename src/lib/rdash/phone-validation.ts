/**
 * Indian mobile number validation and formatting utilities.
 *
 * Indian mobile numbers:
 * - 10 digits
 * - Start with 6, 7, 8, or 9
 * - No country code in the stored value (just 10 digits)
 * - Optional +91 prefix when displaying
 */

/**
 * Sanitizes a phone input to digits only (removes spaces, dashes, +91 prefix).
 */
export function sanitizeIndianMobile(input: string): string {
  if (!input) return "";
  let cleaned = input.replace(/[^\d]/g, ""); // digits only
  // Remove leading 91 if the number is 12 digits (91 + 10)
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    cleaned = cleaned.slice(2);
  }
  // Remove leading 0 if present (some people type 0XXXXXXXXXX)
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}




