from pathlib import Path
import json
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{label}: start marker not found")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[:start_index] + replacement + text[end_index:]

# CRM canonical action and obsolete API removal.
path = Path("src/lib/rdash/store/slices/crm.ts")
text = path.read_text()
text = replace_once(
    text,
    'import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "../../customer-identity";\n',
    'import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "../../customer-identity";\nimport { applyCustomerWithSitesSave } from "../../customer-sites-save";\n',
    "crm import",
)
text = text.replace(
    " *   Group 2: addCustomer, createCustomerWithFirstSite, updateCustomer, mergeCustomers\n *   Group 3: addSite, updateSite, archiveSite\n",
    " *   Group 2: saveCustomerWithSites, mergeCustomers\n *   Group 3: addSite, updateSite, archiveSite (low-level compatibility paths)\n",
)
start = '        addCustomer: (p) => {'
end = '        mergeCustomers: (survivingCustomerId, duplicateCustomerId) => {'
replacement = '''        saveCustomerWithSites: (input) => {
            const beforeDatabase = get().db;
            const result = applyCustomerWithSitesSave(beforeDatabase, input, {
                now: nowIso(),
                createId: (prefix) => genId(prefix),
            });
            if (!result.changed) {
                return {
                    customerId: result.customerId,
                    siteIds: result.siteIds,
                    changed: false,
                };
            }
            commitState({ db: result.db });
            const actor = get().currentUser();
            const customer = result.db.customers.find((row: Customer) => row.id === result.customerId)!;
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: result.customerCreated
                    ? `Created customer "${customer.name}" with ${result.siteIds.length} Site${result.siteIds.length === 1 ? "" : "s"}`
                    : `Updated customer "${customer.name}"${result.customerChanges.length ? ` (${result.customerChanges.map((change) => String(change.field)).join(", ")})` : ""}`,
                entity_type: "customer",
                entity_id: customer.id,
                entity_label: customer.name,
                kind: result.customerCreated ? "create" : "update",
                before: result.customerCreated ? undefined : beforeDatabase.customers.find((row: Customer) => row.id === customer.id),
                after: customer,
                changes: result.customerChanges.map((change) => ({
                    field: String(change.field),
                    before: change.before,
                    after: change.after,
                })),
                cross_post: result.siteIds.map((siteId) => ({
                    entity_type: "site",
                    entity_id: siteId,
                    entity_label: result.db.sites.find((site: Site) => site.id === siteId)?.name,
                })),
            });
            for (const change of result.siteChanges) {
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `${change.kind === "create" ? "Created" : "Updated"} Site "${change.after.name}" for ${customer.name}`,
                    entity_type: "site",
                    entity_id: change.siteId,
                    entity_label: change.after.name,
                    kind: change.kind,
                    before: change.before,
                    after: change.after,
                    cross_post: [{ entity_type: "customer", entity_id: customer.id, entity_label: customer.name }],
                });
            }
            if (result.detachedAttachmentIds.length) {
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Detached ${result.detachedAttachmentIds.length} Site file${result.detachedAttachmentIds.length === 1 ? "" : "s"} while saving ${customer.name}`,
                    entity_type: "customer",
                    entity_id: customer.id,
                    entity_label: customer.name,
                    kind: "update",
                });
            }
            return {
                customerId: result.customerId,
                siteIds: result.siteIds,
                changed: true,
            };
        },
'''
text = replace_between(text, start, end, replacement, "crm legacy customer actions")
path.write_text(text)

# Store contract.
path = Path("src/lib/rdash/store/types.ts")
text = path.read_text()
text = replace_once(
    text,
    '} from "../types";\n',
    '} from "../types";\nimport type { SaveCustomerWithSitesInput } from "../customer-sites-save";\n',
    "store type import",
)
old = '''  addCustomer: (p: Partial<Customer>) => string;
  createCustomerWithFirstSite: (customer: Partial<Customer>, firstSite?: Partial<Site>) => { customerId: string; siteId?: string };
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
'''
new = '''  saveCustomerWithSites: (input: SaveCustomerWithSitesInput) => { customerId: string; siteIds: string[]; changed: boolean };
'''
text = replace_once(text, old, new, "store customer API")
path.write_text(text)

# Customer Desk uses the unified dialog for both create and edit.
path = Path("src/components/rdash/modules/CustomerDesk.tsx")
text = path.read_text()
text = replace_once(text, 'import { EntityFormDialog } from "../EntityFormDialog";\n', 'import { CustomerSitesDialog } from "../CustomerSitesDialog";\n', "CustomerDesk import")
text = text.replace('<EntityFormDialog type="customer"', '<CustomerSitesDialog')
text = text.replace('Local state for the top-level customer Edit dialog (EntityFormDialog in edit mode).', 'Local state for the unified Customer and Sites edit dialog.')
text = text.replace('Top-level Edit dialog for customer — opened by the context-menu Edit action.', 'Unified Customer and Sites editor — opened by the context-menu Edit action.')
if '<EntityFormDialog type="customer"' in text:
    raise SystemExit("CustomerDesk still contains legacy customer EntityFormDialog usage")
path.write_text(text)

# CSV import uses the same canonical mutation for new customers and existing-customer Sites.
path = Path("src/components/rdash/modules/DataImportModule.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''    const createCustomerWithFirstSite = useRDashStore((state) => state.createCustomerWithFirstSite);
    const addSite = useRDashStore((state) => state.addSite);
''',
    '''    const saveCustomerWithSites = useRDashStore((state) => state.saveCustomerWithSites);
''',
    "DataImport selectors",
)
text = replace_once(
    text,
    '''                if (row.disposition === "existing_customer_add_site" && row.matchedCustomer) {
                    addSite({ ...firstSite, customer_id: row.matchedCustomer.id });
                    sitesAdded.push({ customerId: row.matchedCustomer.id, name: row.matchedCustomer.name, siteName: firstSite.name || "Site" });
                }
                else if (row.disposition === "new_customer") {
                    const result = createCustomerWithFirstSite({
                        name: row.data.name,
                        phone: row.data.phone || "",
                        whatsapp: row.data.whatsapp || row.data.phone || "",
                        alternate_phone: row.data.alternate_phone || undefined,
                        email: row.data.email || undefined,
                        source_partner_name: row.data.source || undefined,
                        status: "active",
                        customer_segments: ["service_customer"],
                    }, includesSite ? firstSite : undefined);
                    created.push({ customerId: result.customerId, name: row.data.name });
                }
''',
    '''                if (row.disposition === "existing_customer_add_site" && row.matchedCustomer) {
                    const existingCustomer = db.customers.find((customer) => customer.id === row.matchedCustomer!.id);
                    if (!existingCustomer) throw new Error("Matched customer no longer exists.");
                    saveCustomerWithSites({
                        customerId: existingCustomer.id,
                        customer: { ...existingCustomer },
                        sites: [{ ...firstSite, id: `site-import-${row.rowIndex}-${Date.now().toString(36)}` }],
                    });
                    sitesAdded.push({ customerId: row.matchedCustomer.id, name: row.matchedCustomer.name, siteName: firstSite.name || "Site" });
                }
                else if (row.disposition === "new_customer") {
                    const result = saveCustomerWithSites({
                        customer: {
                            name: row.data.name,
                            phone: row.data.phone || "",
                            whatsapp: row.data.whatsapp || row.data.phone || "",
                            alternate_phone: row.data.alternate_phone || undefined,
                            email: row.data.email || undefined,
                            source_partner_name: row.data.source || undefined,
                            status: "active",
                            customer_segments: ["service_customer"],
                        },
                        sites: includesSite ? [firstSite] : [],
                    });
                    created.push({ customerId: result.customerId, name: row.data.name });
                }
''',
    "DataImport mutation",
)
path.write_text(text)

# Standalone Site dialog delegates to the canonical customer+Sites action.
path = Path("src/components/rdash/SiteFormDialog.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''    const addSite = useRDashStore((state) => state.addSite);
    const updateSite = useRDashStore((state) => state.updateSite);
''',
    '''    const saveCustomerWithSites = useRDashStore((state) => state.saveCustomerWithSites);
    const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
''',
    "SiteForm selectors",
)
text = replace_once(
    text,
    '''            const id = siteId || addSite({ ...payload, id: reservedSiteId, photo_attachment_ids: photoAttachmentIds });
            if (siteId) updateSite(siteId, { ...payload, photo_attachment_ids: photoAttachmentIds });
            commitBatches();
            toast.success(`Site "${payload.name}" ${siteId ? "updated" : "added"}. Pending files continue in Background Activity.`);
            onSaved?.(id);
''',
    '''            const customer = db.customers.find((row) => row.id === draft.customerId);
            if (!customer) throw new Error("Customer not found.");
            const id = siteId || reservedSiteId;
            saveCustomerWithSites({
                customerId: customer.id,
                customer: { ...customer },
                sites: [{ ...payload, id, photo_attachment_ids: photoAttachmentIds }],
            });
            commitBatches();
            await awaitServerSync();
            toast.success(`Site "${payload.name}" ${siteId ? "updated" : "added"}. Pending files continue in Background Activity.`);
            onSaved?.(id);
''',
    "SiteForm canonical save",
)
path.write_text(text)

# Package test script.
path = Path("package.json")
package = json.loads(path.read_text())
package["scripts"]["test:customer-sites-save"] = "bun test tests/customer-sites-save.test.ts"
path.write_text(json.dumps(package, indent=2) + "\n")

# CI gate.
path = Path(".github/workflows/application-ci.yml")
text = path.read_text()
anchor = '''      - name: Test vendor landed-rate averages
        run: bun run test:vendor-rate-average
'''
addition = anchor + '''      - name: Test unified Customer and Sites saves
        run: bun run test:customer-sites-save
'''
text = replace_once(text, anchor, addition, "CI customer Sites step")
path.write_text(text)

# Static guard: old customer APIs and old CustomerDesk route must be gone.
path = Path("tests/customer-sites-legacy-removal.test.ts")
path.write_text('''import { expect, test } from "bun:test";\nimport { readFileSync } from "node:fs";\n\nconst crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");\nconst types = readFileSync("src/lib/rdash/store/types.ts", "utf8");\nconst customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");\nconst dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");\n\ntest("legacy customer write APIs are removed from active store and UI paths", () => {\n  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:"]) {\n    expect(crm.includes(token)).toBe(false);\n    expect(types.includes(token)).toBe(false);\n  }\n  expect(customerDesk.includes("<EntityFormDialog type=\\\"customer\\\"")).toBe(false);\n  expect(customerDesk.includes("CustomerSitesDialog")).toBe(true);\n  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);\n});\n''')
package = json.loads(Path("package.json").read_text())
package["scripts"]["test:customer-sites-legacy"] = "bun test tests/customer-sites-legacy-removal.test.ts"
Path("package.json").write_text(json.dumps(package, indent=2) + "\n")
text = Path(".github/workflows/application-ci.yml").read_text()
anchor = '''      - name: Test unified Customer and Sites saves
        run: bun run test:customer-sites-save
'''
addition = anchor + '''      - name: Test legacy customer path removal
        run: bun run test:customer-sites-legacy
'''
text = replace_once(text, anchor, addition, "CI legacy step")
Path(".github/workflows/application-ci.yml").write_text(text)

print("Unified customer and Sites integration patch applied")
