from pathlib import Path
import subprocess


def main_bytes(path: str) -> bytes:
    return subprocess.check_output(["git", "show", f"origin/main:{path}"])


def replace_once(data: bytes, old: bytes, new: bytes, label: str) -> bytes:
    count = data.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return data.replace(old, new, 1)

# Rebuild the shared Customer form model from exact main bytes, deleting only
# Customer Roles lines/blocks so every untouched byte and historical line ending stays intact.
form_path = "src/components/rdash/customer-sites-form-model.ts"
form = main_bytes(form_path)
form = replace_once(
    form,
    b'import type { Customer, CustomerSegment, Site } from "@/lib/rdash/types";',
    b'import type { Customer, Site } from "@/lib/rdash/types";',
    "form import",
)
form = replace_once(form, b'  segments: CustomerSegment[];\r\n', b'', "form draft segment")
form = replace_once(
    form,
    b'export const CUSTOMER_SEGMENTS: Array<[CustomerSegment, string]> = [\r\n'
    b'  ["walk_in", "Walk-in"],\r\n'
    b'  ["service_customer", "Service customer"],\r\n'
    b'  ["product_buyer", "Product buyer"],\r\n'
    b'  ["repeat_customer", "Repeat customer"],\r\n'
    b'  ["trade_customer", "Trade customer"],\r\n'
    b'];\r\n\r\n',
    b'',
    "form segment options",
)
form = replace_once(form, b'    segments: ["service_customer"],\r\n', b'', "form new default")
form = replace_once(
    form,
    b'    segments: customer.customer_segments?.length ? customer.customer_segments : ["service_customer"],\r\n',
    b'',
    "form edit default",
)
form = replace_once(form, b'    customer_segments: draft.segments,\r\n', b'', "form payload")
Path(form_path).write_bytes(form)

# Rebuild the save test from exact main bytes. Four fixtures use a standalone
# role line; the duplicate-identity fixture keeps the Customer object on the same
# line, so remove only its inline property instead of deleting the object.
test_path = "tests/customer-sites-save.test.ts"
test_data = main_bytes(test_path)
standalone = b'    customer_segments: ["service_customer"],\r\n'
if test_data.count(standalone) != 4:
    raise SystemExit(f"save test: expected four standalone role lines, found {test_data.count(standalone)}")
test_data = test_data.replace(standalone, b'')
inline = b', customer_segments: ["service_customer"]'
if test_data.count(inline) != 1:
    raise SystemExit(f"save test: expected one inline role property, found {test_data.count(inline)}")
test_data = test_data.replace(inline, b'', 1)
Path(test_path).write_bytes(test_data)

print("Rebuilt mixed-line-ending files from exact main bytes with only Customer Roles edits.")
