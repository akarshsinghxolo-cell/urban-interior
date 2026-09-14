"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

export type CustomerAreaDimensionsDraft = {
  length: string;
  breadth: string;
  height: string;
};

export function positiveDimension(value: string | number | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeAreaDimensions(value: CustomerAreaDimensionsDraft) {
  return {
    length: positiveDimension(value.length),
    breadth: positiveDimension(value.breadth),
    height: positiveDimension(value.height),
  };
}

/**
 * Customer-owned dimension editor. Work capture and Measurement both use this
 * exact L/B/H control so Area dimensions never acquire a second set of field
 * semantics, parsing or validation in another module.
 */
export function CustomerAreaDimensionsFields({
  value,
  onChange,
  disabled,
}: {
  value: CustomerAreaDimensionsDraft;
  onChange: (next: CustomerAreaDimensionsDraft) => void;
  disabled?: boolean;
}) {
  const field = (key: keyof CustomerAreaDimensionsDraft, label: string, placeholder = "—") => (
    <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
      {label}
      <Input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        disabled={disabled}
        value={value[key]}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
        placeholder={placeholder}
        className="h-8 text-xs font-normal text-foreground"
      />
    </label>
  );

  return (
    <div className="grid grid-cols-3 gap-2">
      {field("length", "Length (ft)")}
      {field("breadth", "Breadth (ft)")}
      {field("height", "Height (ft)", "empty = run ft")}
    </div>
  );
}
