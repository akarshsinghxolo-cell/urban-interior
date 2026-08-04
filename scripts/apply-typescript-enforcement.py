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
# that persisted compatibility field in the shared Vendor type as contractors do.
types_path = Path("src/lib/rdash/types.ts")
types_text = types_path.read_text()
start = types_text.index("export interface Vendor {")
end = types_text.index("export type VendorRateSourceType", start)
vendor_block = types_text[start:end]
if "    rating?: number;\n" not in vendor_block:
    needle = "    on_time_pct?: number;\n"
    if needle not in vendor_block:
        raise SystemExit("Vendor on_time_pct field not found")
    vendor_block = vendor_block.replace(needle, needle + "    rating?: number;\n", 1)
    types_text = types_text[:start] + vendor_block + types_text[end:]
    types_path.write_text(types_text)

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

# Once the explicit tsc gate is clean, Next.js must enforce the same type safety.
replace_once(
    "next.config.ts",
    '  typescript: {\n    ignoreBuildErrors: true,\n  },\n',
    "",
)
