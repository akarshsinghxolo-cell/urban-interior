# Contractor profile architecture

The Contractor module uses one canonical Contractor profile and one canonical capability/rate representation.

## Canonical write path

All normal Contractor create/update operations pass through the public store policy before reaching the underlying Contractor slice. The policy normalizes identity/contact data, validates lifecycle requirements, enforces Contractor write permissions, blocks hard duplicates, validates Source Partner references, derives work categories from subcategories, and synchronizes the read-only rate projection.

New Contractors begin in `onboarding`. Creating a Contractor or moving one into `active` requires a valid primary mobile number, a city, and at least one work capability.

## Capabilities and rates

`work_capabilities` is authoritative. Each capability is keyed by `subcategory_id` and may carry default labour/with-material rates plus material-specific Article rates, unit/capacity metadata, and status.

`master.contractorRates` is a derived read projection only. It exists for rate-oriented read surfaces and persistence indexing; it is not an independent write model. Free-form Contractor Rate writes without a Work Subcategory are rejected. Updating a mapped Contractor Rate updates the corresponding canonical capability and then rebuilds the projection.

Contractor Governance does not persist a second `capabilities_v2` model. It derives its transient Governance rows from `work_capabilities` and converts Governance edits back into `work_capabilities` before saving.

Contractor category labels are derived from the capability subcategories and category masters; they are not independently editable.

## Editing

Contractors use `ContractorFormDialog` for the full editable profile: identity, contact, lifecycle, location, referral, files, capabilities/rates, quality/crew characteristics, tax/banking, capacity/optional records, and notes. Contractor 360 routes its edit action to this same editor. `UnifiedPartnerFormDialog` is Vendor-only and contains no Contractor create/update path. The separate Partner Business Details editor also remains Vendor-only.

Dirty-state comparison is limited to fields owned by the Contractor form and includes the raw coordinate input. Render-time validation uses reactive baseline state; refs are reserved for event/effect-only reset snapshots so React's render rules are not bypassed.

## Duplicate policy

Create/update is hard-blocked when another Contractor has the same normalized GSTIN, PAN, primary phone, or bank account. A normalized same-name + same-city match is surfaced as a warning in the form and requires explicit acknowledgement before saving.

## Referral policy

Contractor referrals may point only to `master.sourcePartners`. Unlinked/free-text referral values are not part of the canonical Contractor write model.

## Bank verification

Bank verification is evidence-derived from a verified Governance `bank_proof` document. The canonical Contractor editor shows verified evidence but does not provide a self-certification checkbox.
