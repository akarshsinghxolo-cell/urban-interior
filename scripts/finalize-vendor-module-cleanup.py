from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    content = path.read_text()
    if content.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one marker")
    path.write_text(content.replace(old, new, 1))


test_path = Path("tests/vendor-module-consistency.test.ts")
lines = test_path.read_text().splitlines()
lines = [
    "  expect(procurement.includes('status: v.status || \"active\"')).toBe(true);"
    if "procurement.includes" in line and "status: v.status" in line
    else line
    for line in lines
]
test_path.write_text("\n".join(lines) + "\n")

helper_path = Path("src/lib/rdash/partner-form-consistency.ts")
helper_lines = helper_path.read_text().splitlines()
start = helper_lines.index("function normalizedVendorName(value: unknown): string {")
end = start + 1
while helper_lines[end] != "}":
    end += 1
helper_lines[start : end + 1] = [
    "function normalizedVendorName(value: unknown): string {",
    '  return String(value || "")',
    '    .normalize("NFKC")',
    "    .toLowerCase()",
    '    .replace(/[^a-z0-9]+/g, "");',
    "}",
]
helper_path.write_text("\n".join(helper_lines) + "\n")

unified_path = Path("src/components/rdash/UnifiedPartnerFormDialog.tsx")
unified = unified_path.read_text()
old_dependencies = "  }, [db, referralQuery]);"
new_dependencies = "  }, [db.master.sourcePartners, db.master.vendors, db.master.contractors, referralQuery]);"
if unified.count(old_dependencies) != 1:
    raise SystemExit("Unified referral dependencies: expected exactly one marker")
unified = unified.replace(old_dependencies, new_dependencies, 1)
old_effect_start = """  React.useEffect(() => {
    if (!open) return;
    setReservedId(editId || reserveEntityId(type));"""
new_effect_start = """  /* Background synchronization must not reset an in-progress partner form. */
  /* eslint-disable react-hooks/exhaustive-deps */
  React.useEffect(() => {
    if (!open) return;
    setReservedId(editId || reserveEntityId(type));"""
if unified.count(old_effect_start) != 1:
    raise SystemExit("Unified initialization effect start: expected exactly one marker")
unified = unified.replace(old_effect_start, new_effect_start, 1)
old_effect_end = """    // Database dependencies are intentionally omitted: background sync must not
    // reset an in-progress form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, editId]);"""
new_effect_end = """  }, [open, type, editId]);
  /* eslint-enable react-hooks/exhaustive-deps */"""
if unified.count(old_effect_end) != 1:
    raise SystemExit("Unified initialization effect end: expected exactly one marker")
unified_path.write_text(unified.replace(old_effect_end, new_effect_end, 1))

partner_path = Path("src/components/rdash/modules/Partner360Module.tsx")
partner = partner_path.read_text()

module_helper = '''function partnerBusinessPayload(
  mode: Partner360Mode,
  value: Record<string, any>,
): Record<string, any> {
  const numberOrUndefined = (entry: any) =>
    entry === "" || entry == null ? undefined : Number(entry);
  const common = {
    legal_name: String(value.legal_name || "").trim() || undefined,
    email: String(value.email || "").trim() || undefined,
    whatsapp: String(value.whatsapp || "").trim() || undefined,
    alternate_phone: String(value.alternate_phone || "").trim() || undefined,
    status: value.status || "active",
    notes: String(value.notes || "").trim() || undefined,
  };
  return mode === "vendor"
    ? {
        ...common,
        gstin: String(value.gstin || "").trim() || undefined,
        pan: String(value.pan || "").trim() || undefined,
        bank_account: String(value.bank_account || "").trim() || undefined,
        ifsc: String(value.ifsc || "").trim() || undefined,
        payment_terms: String(value.payment_terms || "").trim() || undefined,
        credit_days: numberOrUndefined(value.credit_days),
        credit_limit: numberOrUndefined(value.credit_limit),
        minimum_order_value: numberOrUndefined(value.minimum_order_value),
        standard_lead_time_days: numberOrUndefined(value.standard_lead_time_days),
        warranty_terms: String(value.warranty_terms || "").trim() || undefined,
        udyam_no: String(value.udyam_no || "").trim() || undefined,
        verified_bank: Boolean(value.verified_bank),
      }
    : {
        ...common,
        business_gst: String(value.gstin || "").trim() || undefined,
        pan: String(value.pan || "").trim() || undefined,
        bank_account: String(value.bank_account || "").trim() || undefined,
        ifsc: String(value.ifsc || "").trim() || undefined,
        supervisor_name: String(value.supervisor_name || "").trim() || undefined,
        supervisor_phone: String(value.supervisor_phone || "").trim() || undefined,
        available_workers: numberOrUndefined(value.available_workers),
        concurrent_site_limit: numberOrUndefined(value.concurrent_site_limit),
        earliest_mobilisation_date: value.earliest_mobilisation_date || undefined,
        service_radius_km: numberOrUndefined(value.service_radius_km),
        labour_registration_no:
          String(value.labour_registration_no || "").trim() || undefined,
        insurance_expiry: value.insurance_expiry || undefined,
        pf_no: String(value.pf_no || "").trim() || undefined,
        esi_no: String(value.esi_no || "").trim() || undefined,
        bank_verified: Boolean(value.bank_verified),
      };
}

'''
function_marker = "function PartnerBusinessDialog({ mode, partner, open, onClose }:"
if partner.count(function_marker) != 1:
    raise SystemExit("Partner business dialog marker not found")
partner = partner.replace(function_marker, module_helper + function_marker, 1)

baseline_marker = '  const baselineRef = React.useRef<Record<string, any>>({});\n'
if partner.count(baseline_marker) != 1:
    raise SystemExit("Business baseline marker not found")
partner = partner.replace(
    baseline_marker,
    baseline_marker + '  const baselineDraftRef = React.useRef<Record<string, any>>({});\n',
    1,
)

local_payload_start = partner.find(
    '  const numberOrUndefined = (value: any) => value === "" || value == null ? undefined : Number(value);\n'
)
if local_payload_start < 0:
    raise SystemExit("Local business payload start marker not found")
local_payload_end_marker = "  }, [mode]);\n\n"
local_payload_end = partner.find(local_payload_end_marker, local_payload_start)
if local_payload_end < 0:
    raise SystemExit("Local business payload end marker not found")
partner = (
    partner[:local_payload_start]
    + partner[local_payload_end + len(local_payload_end_marker) :]
)
partner = partner.replace(
    "payloadFromDraft(initial)",
    "partnerBusinessPayload(mode, initial)",
    1,
)
partner = partner.replace(
    "const currentPayload = payloadFromDraft(draft);",
    "const currentPayload = partnerBusinessPayload(mode, draft);",
    1,
)

initial_marker = "    setDraft(initial);\n    baselineRef.current = partnerBusinessPayload(mode, initial);"
if partner.count(initial_marker) != 1:
    raise SystemExit("Business initial baseline marker not found")
partner = partner.replace(
    initial_marker,
    "    setDraft(initial);\n"
    "    baselineDraftRef.current = initial;\n"
    "    baselineRef.current = partnerBusinessPayload(mode, initial);",
    1,
)

business_effect_start = """  React.useEffect(() => {
    if (!open) return;
    const initial = {"""
if partner.count(business_effect_start) != 1:
    raise SystemExit("Business initialization effect start marker not found")
partner = partner.replace(
    business_effect_start,
    """  /* Background synchronization must not reset an in-progress business edit. */
  /* eslint-disable react-hooks/exhaustive-deps */
  React.useEffect(() => {
    if (!open) return;
    const initial = {""",
    1,
)
old_business_effect_end = """    // Partner object changes from background sync must not reset an active edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, partner.id, payloadFromDraft]);"""
new_business_effect_end = """  }, [open, mode, partner.id]);
  /* eslint-enable react-hooks/exhaustive-deps */"""
if partner.count(old_business_effect_end) != 1:
    raise SystemExit("Business initialization effect end marker not found")
partner = partner.replace(old_business_effect_end, new_business_effect_end, 1)

old_discard = """  async function discard(): Promise<boolean> {
    const baseline = baselineRef.current;
    setDraft((current) => ({ ...current, ...baseline }));
    return true;
  }"""
new_discard = """  async function discard(): Promise<boolean> {
    setDraft(baselineDraftRef.current);
    return true;
  }"""
if partner.count(old_discard) != 1:
    raise SystemExit("Business discard marker not found")
partner = partner.replace(old_discard, new_discard, 1)

success_marker = (
    "      baselineRef.current = currentPayload;\n"
    "      dirtyFormRegistry.markClean(formId);"
)
if partner.count(success_marker) != 1:
    raise SystemExit("Business success baseline marker not found")
partner = partner.replace(
    success_marker,
    "      baselineRef.current = currentPayload;\n"
    "      baselineDraftRef.current = draft;\n"
    "      dirtyFormRegistry.markClean(formId);",
    1,
)
partner_path.write_text(partner)

print("Vendor cleanup output finalized.")
