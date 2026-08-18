from pathlib import Path
import json
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one exact match, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))

def regex_once(path, pattern, repl, flags=0):
    text = read(path)
    next_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: expected one regex match, found {count}: {pattern}')
    write(path, next_text)

# 1) Canonical Customer contract: remove the abandoned role/segment concept.
replace_once(
    'src/lib/rdash/types.ts',
    '//   1.  Primitives          — ID, CustomerSegment, EntityStatus',
    '//   1.  Primitives          — ID, EntityStatus',
)
replace_once(
    'src/lib/rdash/types.ts',
    'export type CustomerSegment = "walk_in" | "service_customer" | "product_buyer" | "repeat_customer" | "trade_customer";\n',
    '',
)
replace_once(
    'src/lib/rdash/types.ts',
    '    customer_segments: CustomerSegment[];\n',
    '',
)

# 2) Identity logic is identity-only; remove role defaults/normalization.
replace_once(
    'src/lib/rdash/customer-identity.ts',
    'import type { CustomerSegment, ID, Customer } from "./types";',
    'import type { ID, Customer } from "./types";',
)
regex_once(
    'src/lib/rdash/customer-identity.ts',
    r'export const DEFAULT_CUSTOMER_SEGMENTS: CustomerSegment\[\] = \["service_customer"\];\nexport function normalizeCustomerSegments\(value\?: CustomerSegment\[\] \| CustomerSegment \| null\): CustomerSegment\[\] \{\n    const candidates = Array\.isArray\(value\) \? value : value \? \[value\] : \[\];\n    const valid = candidates\.filter\(\(segment\): segment is CustomerSegment => \["walk_in", "service_customer", "product_buyer", "repeat_customer", "trade_customer"\]\.includes\(String\(segment\)\)\);\n    return Array\.from\(new Set\(valid\.length > 0 \? valid : DEFAULT_CUSTOMER_SEGMENTS\)\);\n\}\n',
    '',
)

# 3) Add/Edit Customer form model no longer carries or saves roles.
replace_once(
    'src/components/rdash/customer-sites-form-model.ts',
    'import type { Customer, CustomerSegment, Site } from "@/lib/rdash/types";',
    'import type { Customer, Site } from "@/lib/rdash/types";',
)
replace_once('src/components/rdash/customer-sites-form-model.ts', '  segments: CustomerSegment[];\n', '')
regex_once(
    'src/components/rdash/customer-sites-form-model.ts',
    r'export const CUSTOMER_SEGMENTS: Array<\[CustomerSegment, string\]> = \[\n(?:  .*\n){5}\];\n\n',
    '',
)
replace_once('src/components/rdash/customer-sites-form-model.ts', '    segments: ["service_customer"],\n', '')
replace_once(
    'src/components/rdash/customer-sites-form-model.ts',
    '    segments: customer.customer_segments?.length ? customer.customer_segments : ["service_customer"],\n',
    '',
)
replace_once('src/components/rdash/customer-sites-form-model.ts', '    customer_segments: draft.segments,\n', '')

# 4) Remove Customer Roles controls from the shared Customer details fields.
replace_once(
    'src/components/rdash/CustomerDetailsFields.tsx',
    '  CUSTOMER_SEGMENTS,\n  validEmail,',
    '  validEmail,',
)
regex_once(
    'src/components/rdash/CustomerDetailsFields.tsx',
    r'\n  const toggleSegment = \(segment: Customer\["customer_segments"\]\[number\]\) => setCustomer\(\(current\) => \{\n    const next = current\.segments\.includes\(segment\)\n      \? current\.segments\.filter\(\(value\) => value !== segment\)\n      : \[\.\.\.current\.segments, segment\];\n    return \{ \.\.\.current, segments: next\.length \? next : \["service_customer"\] \};\n  \}\);\n',
    '\n',
)
regex_once(
    'src/components/rdash/CustomerDetailsFields.tsx',
    r'\n      <div className="rounded-lg border border-border bg-muted/20 p-3">\n        <p className="text-\[10px\] font-semibold uppercase text-muted-foreground">Customer roles</p>\n        <div className="mt-2 flex flex-wrap gap-1\.5">\n          \{CUSTOMER_SEGMENTS\.map\(\(\[segment, label\]\) => \(\n            <button key=\{segment\} type="button" aria-pressed=\{customer\.segments\.includes\(segment\)\} onClick=\{\(\) => toggleSegment\(segment\)\} className=\{cn\("min-h-9 rounded-md border px-2\.5 py-1\.5 text-\[11px\]", customer\.segments\.includes\(segment\) \? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"\)\}>\{label\}</button>\n          \)\)\}\n        </div>\n      </div>\n',
    '\n',
)

# 5) Customer save transformation no longer defaults/diffs/persists roles.
replace_once(
    'src/lib/rdash/customer-sites-save.ts',
    'import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "./customer-identity";',
    'import { assertUniqueCustomerIdentity } from "./customer-identity";',
)
replace_once('src/lib/rdash/customer-sites-save.ts', '  "customer_segments",\n', '')
replace_once(
    'src/lib/rdash/customer-sites-save.ts',
    '    customer_segments: normalizeCustomerSegments(suppliedValue(input, "customer_segments", existing?.customer_segments)),\n',
    '',
)

# 6) The canonical Customer row shape is explicit, so stale clients/old JSON cannot reintroduce abandoned fields.
write('src/lib/rdash/customer-record.ts', '''import type { Customer } from "./types";\n\nexport const CUSTOMER_RECORD_FIELDS = [\n  "id",\n  "name",\n  "phone",\n  "whatsapp",\n  "alternate_phone",\n  "email",\n  "status",\n  "interest_category_ids",\n  "interest_work_subcategory_ids",\n  "source_partner_id",\n  "source_partner_name",\n  "notes",\n  "created_at",\n  "updated_at",\n] as const satisfies readonly (keyof Customer)[];\n\nexport function canonicalizeCustomerRow(row: Record<string, unknown>): Record<string, unknown> {\n  const safe: Record<string, unknown> = {};\n  for (const field of CUSTOMER_RECORD_FIELDS) {\n    if (Object.prototype.hasOwnProperty.call(row, field)) safe[field] = row[field];\n  }\n  return safe;\n}\n\nfunction stringArray(value: unknown): string[] {\n  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];\n}\n\nexport function normalizeCustomerRow(row: unknown): Customer {\n  const source = row && typeof row === "object" ? row as Record<string, unknown> : {};\n  const safe = canonicalizeCustomerRow(source);\n  const status = safe.status === "inactive" || safe.status === "blocked" ? safe.status : "active";\n  return {\n    id: String(safe.id || ""),\n    name: String(safe.name || ""),\n    phone: String(safe.phone || ""),\n    whatsapp: typeof safe.whatsapp === "string" ? safe.whatsapp : undefined,\n    alternate_phone: typeof safe.alternate_phone === "string" ? safe.alternate_phone : undefined,\n    email: typeof safe.email === "string" ? safe.email : undefined,\n    status,\n    interest_category_ids: stringArray(safe.interest_category_ids),\n    interest_work_subcategory_ids: stringArray(safe.interest_work_subcategory_ids),\n    source_partner_id: typeof safe.source_partner_id === "string" ? safe.source_partner_id : undefined,\n    source_partner_name: typeof safe.source_partner_name === "string" ? safe.source_partner_name : undefined,\n    notes: typeof safe.notes === "string" ? safe.notes : undefined,\n    created_at: String(safe.created_at || ""),\n    updated_at: String(safe.updated_at || ""),\n  };\n}\n''')

# 7) Workspace normalization uses the canonical Customer row whitelist.
replace_once(
    'src/lib/rdash/work-category-master.ts',
    'import type { Customer, CustomerSegment } from "./types";\nimport { normalizeCustomerSegments } from "./customer-identity";',
    'import type { Customer } from "./types";\nimport { normalizeCustomerRow } from "./customer-record";',
)
regex_once(
    'src/lib/rdash/work-category-master.ts',
    r'function normalizeCustomers\(rows: unknown\): Customer\[\] \{\n    if \(!Array\.isArray\(rows\)\)\n        return \[\];\n    return rows\.map\(\(row\) => \{\n        const candidate = \(row \|\| \{\}\) as Partial<Customer> & \{\n            customer_segments\?: CustomerSegment\[\] \| CustomerSegment;\n        \};\n        return \{\n            \.\.\.candidate,\n            customer_segments: normalizeCustomerSegments\(candidate\.customer_segments\),\n        \} as Customer;\n    \}\);\n\}',
    'function normalizeCustomers(rows: unknown): Customer[] {\n    if (!Array.isArray(rows))\n        return [];\n    return rows.map((row) => normalizeCustomerRow(row));\n}',
)

# 8) Server commit boundary strips any unknown Customer keys from stale clients before validation/persistence.
replace_once(
    'src/lib/rdash/server/authorized-commit.ts',
    'import { attachCustomerLabels } from "../customer";\n',
    'import { attachCustomerLabels } from "../customer";\nimport { canonicalizeCustomerRow } from "../customer-record";\n',
)
old_sanitize = '''function sanitizeWorkspaceOperations(operations: WorkspaceOperation[]): WorkspaceOperation[] {\n  assertCanonicalThreadOperations(operations);\n  return operations.map((operation) => {\n    if (operation.collection !== "master.staff") return operation;\n    return {\n      ...operation,\n      upsert: (operation.upsert || []).map((row) => {\n        const safe = { ...row };\n        delete safe.temporary_password;\n        delete safe.force_password_change;\n        return safe;\n      }),\n    };\n  });\n}\n'''
new_sanitize = '''function sanitizeWorkspaceOperations(operations: WorkspaceOperation[]): WorkspaceOperation[] {\n  assertCanonicalThreadOperations(operations);\n  return operations.map((operation) => {\n    if (operation.collection === "customers") {\n      return {\n        ...operation,\n        upsert: (operation.upsert || []).map((row) => canonicalizeCustomerRow(row)),\n      };\n    }\n    if (operation.collection !== "master.staff") return operation;\n    return {\n      ...operation,\n      upsert: (operation.upsert || []).map((row) => {\n        const safe = { ...row };\n        delete safe.temporary_password;\n        delete safe.force_password_change;\n        return safe;\n      }),\n    };\n  });\n}\n'''
replace_once('src/lib/rdash/server/authorized-commit.ts', old_sanitize, new_sanitize)

# 9) Remove stale defaults from generic store import, CSV import, seed data, and fixtures.
replace_once(
    'src/lib/rdash/raw-store.ts',
    'import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "./customer-identity";',
    'import { assertUniqueCustomerIdentity } from "./customer-identity";',
)

# Remove simple object properties wherever test/seed/import fixtures still carry the abandoned field.
for path in [
    'src/components/rdash/modules/DataImportModule.tsx',
    'src/lib/rdash/seed.ts',
    'tests/workspace-session-merge.test.ts',
    'tests/sales-pipeline-progress.test.ts',
    'tests/customer-sites-save.test.ts',
    'tests/google-drive-folder-naming.test.ts',
    'tests/customer-thread-canonicalization.test.ts',
]:
    text = read(path)
    text = re.sub(r'\s*customer_segments:\s*\[[^\]]*\],?', '', text)
    write(path, text)

# 10) Permanent regression: no active Customer Role vocabulary/field in src; canonicalizers drop unknown keys.
write('tests/customer-role-removal.test.ts', '''import { readdir, readFile } from "node:fs/promises";\nimport { join } from "node:path";\nimport { describe, expect, test } from "vitest";\nimport { canonicalizeCustomerRow, normalizeCustomerRow } from "../src/lib/rdash/customer-record";\nimport { buildSeedDatabase } from "../src/lib/rdash/seed";\nimport { applyCustomerWithSitesSave } from "../src/lib/rdash/customer-sites-save";\n\nasync function sourceFiles(dir: string): Promise<string[]> {\n  const entries = await readdir(dir, { withFileTypes: true });\n  const files: string[] = [];\n  for (const entry of entries) {\n    const path = join(dir, entry.name);\n    if (entry.isDirectory()) files.push(...await sourceFiles(path));\n    else if (/\\.(ts|tsx)$/.test(entry.name)) files.push(path);\n  }\n  return files;\n}\n\nconst removedField = ["customer", "segments"].join("_");\nconst removedType = ["Customer", "Segment"].join("");\nconst removedConstants = [["DEFAULT_CUSTOMER", "SEGMENTS"].join("_"), ["CUSTOMER", "SEGMENTS"].join("_")];\nconst removedValues = [\n  ["walk", "in"].join("_"),\n  ["service", "customer"].join("_"),\n  ["product", "buyer"].join("_"),\n  ["repeat", "customer"].join("_"),\n  ["trade", "customer"].join("_"),\n];\nconst removedUiLabel = ["Customer", "roles"].join(" ");\n\ndescribe("Customer Roles removal", () => {\n  test("active application source has no Customer Roles model, defaults, values, or UI", async () => {\n    const banned = [removedField, removedType, ...removedConstants, ...removedValues, removedUiLabel];\n    for (const path of await sourceFiles("src")) {\n      const text = await readFile(path, "utf8");\n      for (const token of banned) expect(text, `${path} still contains ${token}`).not.toContain(token);\n    }\n  });\n\n  test("canonical Customer rows discard unknown stale-client fields", () => {\n    const input: Record<string, unknown> = {\n      id: "cust-1",\n      name: "Customer",\n      phone: "9876543210",\n      status: "active",\n      created_at: "2026-08-18T00:00:00.000Z",\n      updated_at: "2026-08-18T00:00:00.000Z",\n      [removedField]: ["obsolete"],\n      unrelated_unknown_key: "drop-me",\n    };\n    const canonical = canonicalizeCustomerRow(input);\n    expect(canonical).not.toHaveProperty(removedField);\n    expect(canonical).not.toHaveProperty("unrelated_unknown_key");\n    expect(normalizeCustomerRow(input)).not.toHaveProperty(removedField);\n  });\n\n  test("Customer save transformation cannot persist the removed field from an old caller", () => {\n    const db = structuredClone(buildSeedDatabase());\n    db.customers = [];\n    const result = applyCustomerWithSitesSave(db, {\n      customer: {\n        id: "cust-old-caller",\n        name: "Old caller",\n        phone: "9876543210",\n        status: "active",\n        [removedField]: ["obsolete"],\n      } as never,\n    }, { now: "2026-08-18T00:00:00.000Z" });\n    expect(result.db.customers[0]).not.toHaveProperty(removedField);\n  });\n});\n''')

# 11) Permanent CI coverage alongside Customer/Site saves.
package = json.loads(read('package.json'))
script = package['scripts']['test:customer-sites-save']
extra = ' tests/customer-role-removal.test.ts'
if 'customer-role-removal.test.ts' not in script:
    package['scripts']['test:customer-sites-save'] = script + extra
write('package.json', json.dumps(package, indent=2) + '\n')

# 12) Idempotent production data cleanup migration. Active source does not read this abandoned key.
write('supabase/migrations/20260818164500_remove_customer_roles.sql', '''-- Customer Roles were an abandoned UI-only concept.\n-- Remove the key from canonical Customer JSON so the database matches the application model.\nupdate public.entity_customers\nset data = data - 'customer_segments'\nwhere data ? 'customer_segments';\n''')

# Final local source guard. The removal test intentionally constructs banned tokens dynamically,
# and the migration is the only repository artifact allowed to name the removed JSON key.
banned = [
    'customer_segments', 'CustomerSegment', 'DEFAULT_CUSTOMER_SEGMENTS', 'CUSTOMER_SEGMENTS',
    '"walk_in"', '"service_customer"', '"product_buyer"', '"repeat_customer"', '"trade_customer"',
    '>Customer roles<',
]
violations = []
for root in [Path('src')]:
    for path in root.rglob('*'):
        if path.suffix not in {'.ts', '.tsx'}:
            continue
        text = path.read_text()
        for token in banned:
            if token in text:
                violations.append(f'{path}: {token}')
if violations:
    raise SystemExit('Active Customer Roles leftovers:\n' + '\n'.join(violations))

print('Customer Roles removal patch applied successfully.')
