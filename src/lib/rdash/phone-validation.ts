/**
 * Canonical Indian mobile-number contract for Urban Castle.
 *
 * Storage:
 * - exactly 10 digits
 * - starts with 6, 7, 8, or 9
 * - no +91 / 91 country prefix
 * - no trunk-zero prefix
 *
 * Every UI, write path, duplicate check, search and WhatsApp dial conversion
 * must use this module instead of defining its own phone normalizer.
 */

const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Normalizes user input to the canonical 10-digit storage candidate.
 *
 * It accepts the common Indian input shapes:
 * - 9876543210
 * - +91 9876543210 / 91 9876543210
 * - 09876543210
 * - 0091 9876543210
 *
 * It deliberately does not slice arbitrary long numbers down to the last ten
 * digits. Invalid input must remain invalid rather than being silently changed
 * into a different phone number.
 */
export function sanitizeIndianMobile(value: unknown): string {
  let digits = digitsOnly(value);
  if (digits.length === 14 && digits.startsWith("0091")) {
    digits = digits.slice(4);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

export function isValidIndianMobile(value: unknown, options: { allowEmpty?: boolean } = {}): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return options.allowEmpty !== false;
  return INDIAN_MOBILE_PATTERN.test(sanitizeIndianMobile(raw));
}

/**
 * Canonicalizes and validates a value at a persistence boundary.
 * Empty optional values become undefined; required values throw.
 */
export function indianMobileForWrite(
  value: unknown,
  options: { required?: boolean; label?: string } = {},
): string | undefined {
  const label = options.label || "Mobile number";
  const raw = String(value ?? "").trim();
  if (!raw) {
    if (options.required) throw new Error(`${label} is required.`);
    return undefined;
  }
  const mobile = sanitizeIndianMobile(raw);
  if (!INDIAN_MOBILE_PATTERN.test(mobile)) {
    throw new Error(`${label} must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.`);
  }
  return mobile;
}

/**
 * Digits used for partial phone search. Full Indian prefixes are normalized;
 * short search fragments remain unchanged.
 */
export function indianPhoneSearchDigits(value: unknown): string {
  return sanitizeIndianMobile(value);
}

/** Provider/wa.me dial form for a canonical Indian mobile. */
export function indianWhatsAppDialDigits(value: unknown): string {
  const mobile = indianMobileForWrite(value, { required: true, label: "WhatsApp number" })!;
  return `91${mobile}`;
}
