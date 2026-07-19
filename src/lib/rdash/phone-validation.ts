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

/**
 * Validates an Indian mobile number.
 * Must be exactly 10 digits, starting with 6/7/8/9.
 */
export function isValidIndianMobile(input: string): boolean {
  const cleaned = sanitizeIndianMobile(input);
  return /^[6-9]\d{9}$/.test(cleaned);
}

/**
 * Formats an Indian mobile number for display: +91 XXXXX XXXXX
 */
export function formatIndianMobile(input: string): string {
  const cleaned = sanitizeIndianMobile(input);
  if (!cleaned) return "";
  if (cleaned.length <= 5) return cleaned;
  return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5, 10)}`.trim();
}

/**
 * Returns an error message if invalid, null if valid.
 */
export function validateIndianMobile(input: string): string | null {
  if (!input || !input.trim()) return "Mobile number is required";
  const cleaned = sanitizeIndianMobile(input);
  if (cleaned.length === 0) return "Enter digits only";
  if (cleaned.length < 10) return `Mobile number must be 10 digits (you entered ${cleaned.length})`;
  if (cleaned.length > 10) return "Mobile number must be exactly 10 digits";
  if (!/^[6-9]/.test(cleaned)) return "Indian mobile must start with 6, 7, 8, or 9";
  return null;
}

/**
 * Input handler for phone number fields — strips non-digits in real-time.
 * Use: onChange={(e) => setPhone(sanitizeIndianMobile(e.target.value))}
 */
export function indianMobileOnChange(value: string): string {
  return sanitizeIndianMobile(value);
}
