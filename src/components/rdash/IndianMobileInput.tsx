"use client";

import { Input } from "@/components/ui/input";
import { isValidIndianMobile, sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { cn } from "@/lib/utils";

export function IndianMobileInput({
  value,
  onChange,
  id,
  placeholder = "9876543210",
  required = false,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const invalid = Boolean(value) && !isValidIndianMobile(value, { allowEmpty: !required });
  return (
    <div className="min-w-0">
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(sanitizeIndianMobile(event.target.value))}
        placeholder={placeholder}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        required={required}
        disabled={disabled}
        className={cn(className)}
      />
      {invalid ? (
        <p className="mt-1 text-[10px] text-destructive">
          Enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9.
        </p>
      ) : null}
    </div>
  );
}
