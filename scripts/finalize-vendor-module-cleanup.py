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
replace_once(
    unified_path,
    "  }, [db, referralQuery]);",
    "  }, [db.master.sourcePartners, db.master.vendors, db.master.contractors, referralQuery]);",
    "Unified referral dependencies",
)

partner_path = Path("src/components/rdash/modules/Partner360Module.tsx")
partner = partner_path.read_text()
marker = '  const baselineRef = React.useRef<Record<string, any>>({});\n'
if marker not in partner:
    raise SystemExit("Business baseline marker not found")
partner = partner.replace(
    marker,
    marker + '  const baselineDraftRef = React.useRef<Record<string, any>>({});\n',
    1,
)
callback_start = (
    "  const payloadFromDraft = React.useCallback((value: Record<string, any>) => {"
)
if callback_start not in partner:
    raise SystemExit("Business payload callback marker not found")
partner = partner.replace(
    callback_start,
    "  function payloadFromDraft(value: Record<string, any>) {",
    1,
)
callback_end = "  }, [mode]);"
callback_pos = partner.find("  function payloadFromDraft(value: Record<string, any>) {")
end_pos = partner.find(callback_end, callback_pos)
if end_pos < 0:
    raise SystemExit("Business payload callback end marker not found")
partner = partner[:end_pos] + "  }" + partner[end_pos + len(callback_end) :]

initial_marker = "    setDraft(initial);\n    baselineRef.current = payloadFromDraft(initial);"
if initial_marker not in partner:
    raise SystemExit("Business initial baseline marker not found")
partner = partner.replace(
    initial_marker,
    "    setDraft(initial);\n    baselineDraftRef.current = initial;\n    baselineRef.current = payloadFromDraft(initial);",
    1,
)
old_effect_tail = """    // Partner object changes from background sync must not reset an active edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, partner.id, payloadFromDraft]);"""
new_effect_tail = """    // Partner object changes from background sync must not reset an active edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, partner.id]);"""
if old_effect_tail not in partner:
    raise SystemExit("Business effect dependency marker not found")
partner = partner.replace(old_effect_tail, new_effect_tail, 1)

old_discard = """  async function discard(): Promise<boolean> {
    const baseline = baselineRef.current;
    setDraft((current) => ({ ...current, ...baseline }));
    return true;
  }"""
new_discard = """  async function discard(): Promise<boolean> {
    setDraft(baselineDraftRef.current);
    return true;
  }"""
if old_discard not in partner:
    raise SystemExit("Business discard marker not found")
partner = partner.replace(old_discard, new_discard, 1)

success_marker = (
    "      baselineRef.current = currentPayload;\n"
    "      dirtyFormRegistry.markClean(formId);"
)
if success_marker not in partner:
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
