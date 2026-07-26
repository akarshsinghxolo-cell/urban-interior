# Partner Governance Phase 2

This release is stacked on `agent/partner-360-workspaces` and adds a governance layer for Vendors and Contractors.

## Included

- Structured Vendor–Article capability records
- Structured Contractor–Trade capability records
- Typed compliance document register
- Verification and 30-day expiry status
- Payment-readiness blockers and warnings
- One-click expiry task generation with duplicate-task protection
- Duplicate detection using normalized name, city, phone, GSTIN, PAN and bank account
- Duplicate impact preview across linked transaction collections
- Safe duplicate quarantine that preserves historical references

## Deliberate safety boundary

Phase 2 does not silently rewrite partner IDs across financial and operational collections. The current workspace transaction API does not expose an atomic cross-collection partner merge action. A suspected duplicate can be quarantined as inactive and linked to its canonical record while historical references remain unchanged.

A later phase can add an atomic merge command with validation, rollback and audit support.
