from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old!r}")
    file_path.write_text(text.replace(old, new, 1))


# Bun is the test/runtime toolchain for this repository, so TypeScript must load
# its globals and bun:test declarations when tests are included by tsconfig.
replace_once(
    "tsconfig.json",
    '    "isolatedModules": true,\n',
    '    "types": ["bun-types"],\n    "isolatedModules": true,\n',
)

# Canonical Task Staff identity was accidentally declared twice.
replace_once(
    "src/lib/rdash/types.ts",
    '    /** @deprecated Derived from canonical Staff at read time. */\n    assignee_name?: string;\n    assigned_staff_id?: ID;\n    /** @deprecated Derived from canonical Staff at read time. */\n    assigned_to?: string;\n',
    '    /** @deprecated Derived from canonical Staff at read time. */\n    assignee_name?: string;\n    /** @deprecated Derived from canonical Staff at read time. */\n    assigned_to?: string;\n',
)

# Vendor performance reconciliation already preserves an existing rating; expose
# that persisted compatibility field in the shared Vendor type.
replace_once(
    "src/lib/rdash/types.ts",
    '    reliability_score?: number;\n    on_time_pct?: number;\n    latitude?: number;\n',
    '    reliability_score?: number;\n    on_time_pct?: number;\n    rating?: number;\n    latitude?: number;\n',
)

# The generated Staff lookup column exists in production but is not yet part of
# the generated row-key union. Keep the escape hatch local to this query.
replace_once(
    "src/lib/rdash/server/auth.ts",
    '.eq("auth_user_id_gen", data.user.id)\n',
    '.eq("auth_user_id_gen" as never, data.user.id)\n',
)

# A default parameter inherits the narrow WorkspaceOutboxStatus type unless the
# operation-id parameter is explicitly declared as a string.
replace_once(
    "tests/workspace-exit-guard.test.ts",
    "function item(status: WorkspaceOutboxStatus, id = status): WorkspaceCommitOutboxRecord {\n",
    "function item(status: WorkspaceOutboxStatus, id: string = status): WorkspaceCommitOutboxRecord {\n",
)

# Preserve literal collection unions in test loops so Bun's typed `toContain`
# matcher can prove every expected value belongs to the readonly plan.
replace_once(
    "tests/runtime-efficiency-hardening.test.ts",
    '      "auditLog",\n    ]) {\n',
    '      "auditLog",\n    ] as const) {\n',
)
for old, new in [
    ('for (const collection of ["tasks", "followups", "actions", "blocked", "risks", "threads"]) {',
     'for (const collection of ["tasks", "followups", "actions", "blocked", "risks", "threads"] as const) {'),
    ('for (const collection of ["quotations", "commercialTerms", "master.customerRateSuggestions"]) {',
     'for (const collection of ["quotations", "commercialTerms", "master.customerRateSuggestions"] as const) {'),
    ('for (const collection of ["visits", "attendance", "executionLogs"]) {',
     'for (const collection of ["visits", "attendance", "executionLogs"] as const) {'),
    ('for (const collection of ["boqs", "vendorRfqs", "purchaseOrders", "inventory", "master.vendorRates"]) {',
     'for (const collection of ["boqs", "vendorRfqs", "purchaseOrders", "inventory", "master.vendorRates"] as const) {'),
    ('for (const collection of ["payments", "invoices", "vendorBills", "contractorBills", "workOrderCostLines"]) {',
     'for (const collection of ["payments", "invoices", "vendorBills", "contractorBills", "workOrderCostLines"] as const) {'),
]:
    replace_once("tests/workspace-module-scoped-read.test.ts", old, new)

replace_once(
    "tests/workspace-entity-routes.test.ts",
    "      expect(location.canonicalPath).toBe(path);\n",
    "      expect(location.canonicalPath).toBe(path!);\n",
)

# Once the explicit tsc gate is clean, Next.js must enforce the same type safety.
replace_once(
    "next.config.ts",
    '  typescript: {\n    ignoreBuildErrors: true,\n  },\n',
    "",
)
