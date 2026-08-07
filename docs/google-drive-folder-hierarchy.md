# Canonical Google Drive hierarchy

Urban Castle uses one immutable folder identity per business entity, but Google Drive shows human-readable names from the app. Internal record IDs stay hidden in the Drive `appProperties` folder key and Supabase folder registry; they are not part of the visible folder name.

```text
Urban Castle
├── Customers
│   └── Customer Name
│       ├── Customer Documents
│       │   ├── KYC
│       │   └── General
│       ├── Communications
│       └── Site Name - Locality
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
│           └── Work Order Title - WO-001
│               ├── Documents
│               ├── Execution
│               ├── Material Receipts
│               ├── Variations
│               └── Completion
├── Procurement
│   └── PO-001 - Vendor Name
│       ├── Purchase Order
│       ├── GRNs
│       ├── Delivery Challans
│       ├── Receiving Evidence
│       └── Vendor Bills
├── Vendors
│   └── Vendor Name - City
│       ├── Business Documents
│       ├── Catalogues
│       └── Bills
├── Contractors
│   └── Contractor Name - Work Category
│       ├── Profile
│       ├── Business Documents
│       └── Payment Documents
├── Staff
│   └── Staff Name
│       └── Documents
├── Library
│   ├── Catalogues
│   └── Reference Media
└── System
    ├── Staging
    ├── Imports
    └── Diagnostics
```

## Visible naming policy

- Use names and business labels entered in Urban Castle, never internal entity IDs.
- Customer folders use the Customer name.
- Site folders use the Site name and append locality/city when available.
- Work Order folders use the Work Order title and business Work Order number.
- Purchase Order folders use the PO number and Vendor name.
- Vendor, Contractor and Staff folders use their app-entered names, with useful human context when available.
- Unsafe Drive filename characters are normalized, but the wording remains human-readable.

## Identity and duplicate prevention

- Customer-name duplicate checks remain part of Customer creation.
- Drive folder uniqueness is based on the immutable canonical entity key stored in `appProperties` and the Supabase registry, not only its visible name.
- Two records may therefore safely have the same visible name without breaking app linkage.
- Renaming a Customer, Site, Work Order, Purchase Order, Vendor, Contractor or Staff member renames the canonical folder without changing its Google folder ID.
- Existing managed folders with old technical names are renamed when that canonical path is reconciled or used again.
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
- Staging, imports and diagnostics remain under System.
