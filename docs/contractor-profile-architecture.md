# Contractor profile architecture

The Contractor module uses one canonical contractor profile and one canonical capability/rate representation.

## Canonical write path

All normal Contractor create/update operations pass through the public store policy before reaching the underlying contractor slice. The policy normalizes identity/contact data, validates lifecycle requirements, enforces Contractor write permissions, blocks hard duplicates, validates Source Partner references, derives work categories from subcategories, and synchronizes compatibility rate views.

New Contractors begin in `onboarding`. Creating a Contractor or moving one into `active` requires a valid primary mobile number, a city, and at least one work capability.

## Capabilities and rates

`work_capabilities` is authoritative. Each capability is keyed by `subcategory_id` and may carry labour and with-material rates, article IDs, unit/capacity metadata, and status.

The following are compatibility/read projections rather than independent sources of truth:

- `capabilities_v2` for Governance screens.
- `master.contractorRates` for legacy Contractor Rates screens.
- Contractor category labels, derived from each capability's subcategory and category masters.

Writes through a mapped Contractor Rate update the corresponding canonical capability, preventing rate drift between modules.

## Editing

Contractors use `ContractorFormDialog` for the full editable profile: identity, contact, lifecycle, location, referral, files, capabilities/rates, quality/crew characteristics, tax/banking, capacity/compliance readiness, and notes. Contractor 360 routes its edit action to this same editor. The separate Partner Business Details editor remains Vendor-only.

Dirty-state comparison is limited to fields owned by the Contractor form and includes the raw coordinate input.

## Duplicate policy

Create/update is hard-blocked when another Contractor has the same normalized GSTIN, PAN, primary phone, or bank account. A normalized same-name + same-city match is surfaced as a warning in the form and requires explicit acknowledgement before saving.

## Referral policy

Structured Contractor referrals may point only to `master.sourcePartners`. Existing legacy free-text referral names are preserved until the user deliberately changes them.

## Bank verification

Bank verification is evidence-derived from a verified Governance `bank_proof` document. The canonical Contractor editor shows the verification state but does not provide a self-certification checkbox.
