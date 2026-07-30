from pathlib import Path


def require_once(text: str, needle: str, label: str) -> None:
    count = text.count(needle)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")


def remove_between(text: str, start: str, end: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{label}: start marker missing")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{label}: end marker missing")
    return text[:start_index] + text[end_index:]


# Remove the dead Customer implementation from the still-active Vendor/Contractor dialog.
path = Path("src/components/rdash/EntityFormDialog.tsx")
text = path.read_text()
for line, label in [
    ('import type { CustomerSegment } from "@/lib/rdash/types";\n', "CustomerSegment import"),
    ('import { findCustomerIdentityMatches } from "@/lib/rdash/customer-identity";\n', "customer identity import"),
    ('    const saveCustomerWithSites = useRDashStore((s) => s.saveCustomerWithSites);\n', "legacy customer selector"),
    ('    const [reservedFirstSiteId, setReservedFirstSiteId] = React.useState("");\n', "reserved first Site state"),
    ('        setReservedFirstSiteId(reserveEntityId("site"));\n', "reserved first Site reset"),
]:
    require_once(text, line, label)
    text = text.replace(line, "", 1)
require_once(text, 'export type EntityType = "customer" | "vendor" | "contractor";', "EntityType")
text = text.replace('export type EntityType = "customer" | "vendor" | "contractor";', 'export type EntityType = "vendor" | "contractor";', 1)

text = remove_between(
    text,
    '    const [whatsapp, setWhatsapp] = React.useState("");\n',
    '    const [address, setAddress] = React.useState("");\n',
    "customer state block",
)
text = remove_between(
    text,
    '    const [firstSitePhotos, setFirstSitePhotos]',
    '    const [businessCardPhoto, setBusinessCardPhoto]',
    "customer file and interest state block",
)
text = remove_between(
    text,
    '            if (type === "customer") {\n',
    '            if (type === "vendor") {\n',
    "customer edit hydration",
)
text = remove_between(
    text,
    '        setWhatsapp("");\n',
    '        setAddress("");\n',
    "customer create reset",
)
text = remove_between(
    text,
    '    const toggleCustomerSegment = (segment: CustomerSegment) => {\n',
    '    const handleCaptureGps = () => {\n',
    "customer segment toggle",
)
text = remove_between(
    text,
    '    const updateFirstSiteCoordinateInput = (value: string) => {\n',
    '    const handlePhotoUpload = async (\n',
    "first Site GPS handlers",
)
text = remove_between(
    text,
    '    const handleFirstSitePhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {\n',
    '    const removePendingMedia = async',
    "first Site upload handler",
)
text = remove_between(
    text,
    '    const removeFirstSitePhoto = async',
    '    const allSubcategories = db.master.workSubcategories;\n',
    "first Site removal and customer identity matcher",
)
text = remove_between(
    text,
    '    const toggleCustomerInterestSubcategory = (id: string) => {\n',
    '    const toggleVendorArticle = (articleId: string) => {\n',
    "customer interest toggles",
)

old_validation = '''        if (type !== "customer") {
            const coordinateError = coordinateInputError(coordinateInput);
            if (coordinateError) {
                toast.error(coordinateError);
                return;
            }
        }
'''
new_validation = '''        const coordinateError = coordinateInputError(coordinateInput);
        if (coordinateError) {
            toast.error(coordinateError);
            return;
        }
'''
require_once(text, old_validation, "partner coordinate validation")
text = text.replace(old_validation, new_validation, 1)

handle_start = text.find('    const handleSave = async () => {')
if handle_start < 0:
    raise SystemExit("handleSave marker missing")
customer_start = text.find('        if (type === "customer") {\n', handle_start)
vendor_start = text.find('        else if (type === "vendor") {\n', customer_start)
if customer_start < 0 or vendor_start < 0:
    raise SystemExit("legacy customer save branch markers missing")
text = text[:customer_start] + '        if (type === "vendor") {\n' + text[vendor_start + len('        else if (type === "vendor") {\n'):]

old_titles = '''    const titleLabel = isEditMode
        ? (type === "customer" ? "Edit Customer" : type === "vendor" ? "Edit Vendor" : "Edit Contractor")
        : (type === "customer" ? "Add New Customer" : type === "vendor" ? "Add New Vendor" : "Add New Contractor");
    const nameLabel = type === "customer" ? "Customer name" : "Firm / Enterprise name";
'''
new_titles = '''    const titleLabel = isEditMode
        ? (type === "vendor" ? "Edit Vendor" : "Edit Contractor")
        : (type === "vendor" ? "Add New Vendor" : "Add New Contractor");
    const nameLabel = "Firm / Enterprise name";
'''
require_once(text, old_titles, "partner title block")
text = text.replace(old_titles, new_titles, 1)
old_description = '{type === "customer" ? (isEditMode ? "Update customer contact, account status and broad work interests. Site details are managed per property." : "Create the customer and optionally capture the first Site in the same flow.") : (isEditMode ? "Update the fields below. Changes are saved to the record." : "Fill in the details below. GPS and photos can be captured directly.")}'
require_once(text, old_description, "legacy dialog description")
text = text.replace(old_description, '{isEditMode ? "Update the fields below. Changes are saved to the record." : "Fill in the details below. GPS and photos can be captured directly."}', 1)
old_placeholder = 'placeholder={type === "customer" ? "e.g. Mr. Das" : "e.g. Sharma Interiors"}'
require_once(text, old_placeholder, "legacy name placeholder")
text = text.replace(old_placeholder, 'placeholder="e.g. Sharma Interiors"', 1)
old_location_open = '            {type !== "customer" && <div className="rounded-lg border border-border bg-muted/20 p-3">'
require_once(text, old_location_open, "conditional location block")
text = text.replace(old_location_open, '            <div className="rounded-lg border border-border bg-muted/20 p-3">', 1)
old_location_close = '            </div>}\n            <div className="relative">'
require_once(text, old_location_close, "conditional location close")
text = text.replace(old_location_close, '            </div>\n            <div className="relative">', 1)
old_referral_label = '{type === "customer" ? "Recommended by" : "Referred by"}'
require_once(text, old_referral_label, "referral label")
text = text.replace(old_referral_label, 'Referred by', 1)
text = remove_between(
    text,
    '            {type === "customer" && (<>\n',
    '            {type === "vendor" && (<>\n',
    "legacy customer JSX",
)

# The component remains active for partner records, but no Customer code remains.
path.write_text(text)

# Remove the now-unused low-level Site APIs. All current create/update callers use saveCustomerWithSites.
path = Path("src/lib/rdash/store/slices/crm.ts")
text = path.read_text()
text = remove_between(text, '        addSite: (s) => {\n', '        archiveSite: (id, options) => {\n', "low-level Site create/update actions")
path.write_text(text)

path = Path("src/lib/rdash/store/types.ts")
text = path.read_text()
for line, label in [
    ('  addSite: (s: Partial<Site>) => string;\n', "addSite contract"),
    ('  updateSite: (id: string, patch: Partial<Site>) => void;\n', "updateSite contract"),
]:
    require_once(text, line, label)
    text = text.replace(line, "", 1)
path.write_text(text)

# Expand the static removal guard to cover all removed legacy paths.
path = Path("tests/customer-sites-legacy-removal.test.ts")
text = path.read_text()
text = text.replace(
    'const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");\n',
    'const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");\nconst partnerDialog = readFileSync("src/components/rdash/EntityFormDialog.tsx", "utf8");\n',
)
text = text.replace(
    '  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:"]) {',
    '  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:", "addSite:", "updateSite:"]) {',
)
text = text.replace(
    '  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);\n',
    '  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);\n  expect(partnerDialog.includes("type === \\\"customer\\\"")).toBe(false);\n  expect(partnerDialog.includes("createCustomerWithFirstSite")).toBe(false);\n  expect(partnerDialog.includes("saveCustomerWithSites")).toBe(false);\n',
)
path.write_text(text)

print("Final Customer and Site legacy cleanup applied")
