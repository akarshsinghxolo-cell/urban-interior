# Canonical Google Drive hierarchy

Urban Castle uses one immutable folder identity per business entity. Visible names include a short record ID, while the full internal ID remains in the Drive folder key and Supabase registry.

```text
Urban Castle
├── Customers
│   └── CUST-<short-id> - Customer Name
│       ├── Customer Documents
│       │   ├── KYC
│       │   └── General
│       ├── Communications
│       └── SITE-<short-id> - Site Name
│           ├── Site Evidence
│           ├── Visits
│           ├── Measurements
│           ├── Drawings
│           │   ├── Current
│           │   └── Superseded
│           ├── Commercial
│           │   ├── Quotations
│           │   ├── Customer Invoices
│           │   └── Approvals
│           └── WO-001
│               ├── Documents
│               ├── Execution
│               ├── Material Receipts
│               ├── Variations
│               └── Completion
├── Procurement
│   └── PO-001
│       ├── Purchase Order
│       ├── GRNs
│       ├── Delivery Challans
│       ├── Receiving Evidence
│       └── Vendor Bills
├── Vendors
│   └── VEND-<short-id> - Vendor Name
│       ├── Business Documents
│       ├── Catalogues
│       └── Bills
├── Contractors
│   └── CONT-<short-id> - Contractor Name
│       ├── Profile
│       ├── Business Documents
│       └── Payment Documents
├── Staff
│   └── STAFF-<short-id> - Staff Name
│       └── Documents
├── Library
│   ├── Catalogues
│   └── Reference Media
└── _System
    ├── Staging
    ├── Imports
    └── Diagnostics
```

## Identity and duplicate prevention

- Customer-name duplicate checks remain part of Customer creation.
- Drive folder uniqueness is based on the immutable entity ID, not only its visible name.
- Renaming a Customer, Site, Vendor, Contractor or Staff member renames the canonical folder without changing its identity.
- If a registered canonical folder is under the wrong parent, Urban Castle moves that folder instead of creating a replacement.
- Legacy folder keys may be adopted into the canonical hierarchy.
- New folders are created only when the corresponding file category is first used.

## Current routing

- Site files route to Site Evidence, Visits, Measurements or Drawings/Current.
- Customer communications route to Communications.
- Quotations and Customer invoices route under the Site Commercial folder.
- Work Order documents and execution files route under the Site's Work Order.
- Purchase Orders, GRNs and Vendor Bills route under their Purchase Order.
- Vendor, Contractor and Staff files route to their canonical entity folder.
- Catalogues and reference media remain in the shared Library.
- Staging, imports and diagnostics remain under _System.
