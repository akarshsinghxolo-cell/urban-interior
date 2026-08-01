from pathlib import Path

path = Path("src/components/rdash/ContractorFormDialog.tsx")
text = path.read_text()

anchor = '  const [baselineStatus, setBaselineStatus] = React.useState<string | undefined>();\n'
insert = anchor + '  const [baselineComplianceDocuments, setBaselineComplianceDocuments] = React.useState<ContractorProfileRecord["compliance_documents"]>();\n'
if anchor not in text:
    raise SystemExit("baseline status anchor not found")
if 'baselineComplianceDocuments' not in text:
    text = text.replace(anchor, insert, 1)

old = '      compliance_documents: baselineRef.current.compliance_documents,\n'
new = '      compliance_documents: baselineComplianceDocuments,\n'
if old not in text and new not in text:
    raise SystemExit("compliance document payload anchor not found")
text = text.replace(old, new, 1)

deps_anchor = '    allArticles,\n    businessCard,\n'
if '    baselineComplianceDocuments,\n' not in text:
    if deps_anchor not in text:
        raise SystemExit("build payload deps anchor not found")
    text = text.replace(deps_anchor, '    allArticles,\n    baselineComplianceDocuments,\n    businessCard,\n', 1)

effect_anchor = '  React.useEffect(() => {\n    if (!open) return;\n    const id = editId || reserveEntityId("contractor");\n'
if 'eslint-disable react-hooks/set-state-in-effect' not in text:
    if effect_anchor not in text:
        raise SystemExit("hydration effect anchor not found")
    text = text.replace(
        effect_anchor,
        '  /* eslint-disable react-hooks/set-state-in-effect -- Opening the dialog intentionally hydrates a resettable draft snapshot from the selected Contractor. */\n' + effect_anchor,
        1,
    )

status_anchor = '    setBaselineStatus(String(normalized.status || "onboarding"));\n'
if 'setBaselineComplianceDocuments(normalized.compliance_documents);' not in text:
    if status_anchor not in text:
        raise SystemExit("baseline status hydration anchor not found")
    text = text.replace(
        status_anchor,
        status_anchor + '    setBaselineComplianceDocuments(normalized.compliance_documents);\n',
        1,
    )

effect_end = '  }, [open, editId]);\n\n  let currentPayload: ContractorProfileRecord;\n'
if 'eslint-enable react-hooks/set-state-in-effect' not in text:
    if effect_end not in text:
        raise SystemExit("hydration effect end anchor not found")
    text = text.replace(
        effect_end,
        '  }, [open, editId]);\n  /* eslint-enable react-hooks/set-state-in-effect */\n\n  let currentPayload: ContractorProfileRecord;\n',
        1,
    )

save_anchor = '      baselineRef.current = currentPayload;\n      baselineCoordinateRef.current = coordinates;\n'
if 'setBaselineComplianceDocuments(currentPayload.compliance_documents);' not in text:
    if save_anchor not in text:
        raise SystemExit("save baseline anchor not found")
    text = text.replace(
        save_anchor,
        '      baselineRef.current = currentPayload;\n      baselineCoordinateRef.current = coordinates;\n      setBaselineComplianceDocuments(currentPayload.compliance_documents);\n',
        1,
    )

path.write_text(text)
