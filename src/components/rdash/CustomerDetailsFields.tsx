"use client";

import * as React from "react";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Customer, RDashDatabase } from "@/lib/rdash/types";
import type { CustomerIdentityMatch } from "@/lib/rdash/customer-identity";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import {
  validEmail,
  validIndianPhone,
  type CustomerDraft,
} from "./customer-sites-form-model";

export function CustomerDetailsFields({
  db,
  customer,
  setCustomer,
  isEdit,
  duplicateMatches,
  sameNameMatches,
  sameNameAcknowledged,
  setSameNameAcknowledged,
  openExistingCustomer,
}: {
  db: RDashDatabase;
  customer: CustomerDraft;
  setCustomer: React.Dispatch<React.SetStateAction<CustomerDraft>>;
  isEdit: boolean;
  duplicateMatches: CustomerIdentityMatch[];
  sameNameMatches: Customer[];
  sameNameAcknowledged: boolean;
  setSameNameAcknowledged: (value: boolean) => void;
  openExistingCustomer: (customerId: string) => void;
}) {
  const [showReferralDropdown, setShowReferralDropdown] = React.useState(false);
  const [activeReferralIndex, setActiveReferralIndex] = React.useState(0);
  const referralOptions = React.useMemo(() => {
    const query = customer.referralQuery.trim().toLowerCase();
    if (!query) return [];
    return db.master.sourcePartners
      .filter((row) => row.name.toLowerCase().includes(query))
      .slice(0, 10)
      .map((row) => ({ id: row.id, name: row.name, type: row.type || "Source partner" }));
  }, [customer.referralQuery, db.master.sourcePartners]);

  const selectReferral = (option: { id: string; name: string }) => {
    setCustomer((current) => ({ ...current, referralQuery: option.name, referralSelected: option }));
    setShowReferralDropdown(false);
  };

  const handleReferralKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setShowReferralDropdown(true);
      setActiveReferralIndex((index) => Math.min(index + 1, Math.max(0, referralOptions.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveReferralIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && showReferralDropdown && referralOptions.length) {
      event.preventDefault();
      selectReferral(referralOptions[activeReferralIndex] || referralOptions[0]);
    } else if (event.key === "Escape") {
      setShowReferralDropdown(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Customer details</h3></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name *" htmlFor="customer-name">
          <Input id="customer-name" value={customer.name} onChange={(event) => {
            setCustomer((current) => ({ ...current, name: event.target.value }));
            setSameNameAcknowledged(false);
          }} placeholder="e.g. Mr. Das" autoFocus={!isEdit} />
        </Field>
        <Field label="Contact number" htmlFor="customer-phone">
          <PhoneInput id="customer-phone" value={customer.phone} onChange={(phone) => setCustomer((current) => ({ ...current, phone }))} placeholder="9876543210" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="WhatsApp number" htmlFor="customer-whatsapp">
          <PhoneInput id="customer-whatsapp" value={customer.whatsapp} onChange={(whatsapp) => setCustomer((current) => ({ ...current, whatsapp }))} placeholder="Defaults to contact" />
        </Field>
        <Field label="Alternate number" htmlFor="customer-alternate-phone">
          <PhoneInput id="customer-alternate-phone" value={customer.alternatePhone} onChange={(alternatePhone) => setCustomer((current) => ({ ...current, alternatePhone }))} placeholder="Optional" />
        </Field>
        <Field label="Email" htmlFor="customer-email">
          <Input id="customer-email" type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" aria-invalid={!validEmail(customer.email)} />
          {!validEmail(customer.email) && <p className="text-[10px] text-destructive">Enter a valid email address</p>}
        </Field>
      </div>

      {duplicateMatches.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-semibold">This contact identity already belongs to:</p>
          {duplicateMatches.map((match) => (
            <div key={match.customer.id} className="mt-2 flex items-center justify-between gap-2">
              <span>{match.customer.name} · {match.fields.join(", ")}</span>
              <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => openExistingCustomer(match.customer.id)}>Open existing</Button>
            </div>
          ))}
        </div>
      )}

      {sameNameMatches.length > 0 && (
        <div id="same-name-warning" tabIndex={-1} className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          <p className="font-semibold">Customers with the same name already exist.</p>
          {sameNameMatches.map((match) => {
            const matchSites = db.sites.filter((site) => site.customer_id === match.id && !site.is_archived);
            const location = matchSites.map((site) => site.locality || site.city || site.name).filter(Boolean).join(", ");
            return (
              <div key={match.id} className="mt-2 flex items-center justify-between gap-2 rounded border border-warning/20 p-2">
                <span>{match.name}{match.phone ? ` · ${match.phone}` : ""}{location ? ` · ${location}` : ""}</span>
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => openExistingCustomer(match.id)}>Open existing</Button>
              </div>
            );
          })}
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={sameNameAcknowledged} onChange={(event) => setSameNameAcknowledged(event.target.checked)} />
            <span>I reviewed these records and this is a different customer.</span>
          </label>
        </div>
      )}

      <div className="relative">
        <Field label="Recommended by (source partner)" htmlFor="customer-referral">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="customer-referral"
              className="pl-8"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showReferralDropdown && referralOptions.length > 0}
              aria-controls="customer-referral-options"
              aria-activedescendant={showReferralDropdown && referralOptions[activeReferralIndex] ? `customer-referral-option-${referralOptions[activeReferralIndex].id}` : undefined}
              value={customer.referralQuery}
              onChange={(event) => {
                setCustomer((current) => ({ ...current, referralQuery: event.target.value, referralSelected: null }));
                setActiveReferralIndex(0);
                setShowReferralDropdown(true);
              }}
              onFocus={() => setShowReferralDropdown(true)}
              onBlur={() => window.setTimeout(() => setShowReferralDropdown(false), 120)}
              onKeyDown={handleReferralKeyDown}
              placeholder="Search source partners"
            />
          </div>
        </Field>
        {showReferralDropdown && referralOptions.length > 0 && (
          <div id="customer-referral-options" role="listbox" className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card shadow-popover">
            {referralOptions.map((option, index) => (
              <button
                id={`customer-referral-option-${option.id}`}
                key={option.id}
                type="button"
                role="option"
                aria-selected={index === activeReferralIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectReferral(option)}
                className={cn("flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-accent/40", index === activeReferralIndex && "bg-accent/40")}
              >
                <span>{option.name}</span><span className="text-muted-foreground">{option.type}</span>
              </button>
            ))}
          </div>
        )}
        {customer.referralSelected ? (
          <p className="mt-1 text-[10px] text-success">Linked to source partner: {customer.referralSelected.name}</p>
        ) : customer.referralQuery.trim() ? (
          customer.referralQuery.trim() === customer.referralLegacyName ? (
            <p className="mt-1 text-[10px] text-muted-foreground">Legacy unlinked referrer preserved. Select a source partner to replace it.</p>
          ) : (
            <p className="mt-1 text-[10px] text-warning">Select a source partner from the list; new free-text referrers are not saved.</p>
          )
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Account condition" htmlFor="customer-status">
          <select id="customer-status" value={customer.status} onChange={(event) => setCustomer((current) => ({ ...current, status: event.target.value as Customer["status"] }))} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option>
          </select>
        </Field>
        <Field label="Customer notes" htmlFor="customer-notes">
          <Textarea id="customer-notes" value={customer.notes} onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Preferences, communication notes, or customer-level instructions" />
        </Field>
      </div>
    </section>
  );
}

function PhoneInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const invalid = Boolean(value && !validIndianPhone(value));
  return <div><Input id={id} value={value} onChange={(event) => onChange(sanitizeIndianMobile(event.target.value))} placeholder={placeholder} type="tel" inputMode="tel" autoComplete="tel" aria-invalid={invalid} />{invalid && <p className="text-[10px] text-destructive">Enter 10 digits starting with 6, 7, 8, or 9</p>}</div>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label htmlFor={htmlFor} className="block text-[10px] font-semibold uppercase text-muted-foreground">{label}</label>{children}</div>;
}
