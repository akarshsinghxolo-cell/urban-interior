from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:90]!r}")
    target.write_text(text.replace(old, new, 1))


governance = "src/components/rdash/modules/PartnerGovernanceModule.tsx"

replace_once(
    governance,
    '''  const updatePartner = React.useCallback((id: string, patch: Record<string, unknown>) => {\n    if (mode === "vendor") updateVendor(id, patch as any);\n    else if (Array.isArray(patch.capabilities_v2)) {\n      const workCapabilities = contractorCapabilitiesFromGovernance(\n        patch.capabilities_v2 as Array<Record<string, unknown>>,\n      );\n      updateContractor(id, {\n        work_capabilities: workCapabilities,\n        categories: derivedContractorCategoryNames(db, workCapabilities),\n      } as any);\n    } else updateContractor(id, patch as any);\n  }, [db, mode, updateVendor, updateContractor]);\n''',
    '''  const updatePartner = React.useCallback((id: string, patch: Record<string, unknown>) => {\n    if (mode === "vendor") updateVendor(id, patch as any);\n    else updateContractor(id, patch as any);\n  }, [mode, updateVendor, updateContractor]);\n\n  const updateCapabilities = React.useCallback((next: Array<Record<string, unknown>>) => {\n    if (!selected) return;\n    if (mode === "vendor") {\n      updateVendor(selected.id, { capabilities_v2: next } as any);\n      return;\n    }\n    const workCapabilities = contractorCapabilitiesFromGovernance(next);\n    updateContractor(selected.id, {\n      work_capabilities: workCapabilities,\n      categories: derivedContractorCategoryNames(db, workCapabilities),\n    } as any);\n  }, [db, mode, selected, updateVendor, updateContractor]);\n''',
)

replace_once(
    governance,
    '              const capabilityCount = mode === "contractor" ? partnerCapabilities(partner).length : 0;\n',
    '              const capabilityCount = mode === "contractor" ? canonicalContractorCapabilities(partner, db).length : 0;\n',
)

replace_once(
    governance,
    '''<p className="mt-0.5 text-xs text-muted-foreground">{selected.legal_name || (mode === "vendor" ? selected.category : selected.trade || selected.categories?.join(", ") || (capabilities[0] as any)?.work_subcategory_name) || "Legal identity not recorded"}</p>''',
    '''<p className="mt-0.5 text-xs text-muted-foreground">{selected.legal_name || (mode === "vendor" ? selected.category : selected.categories?.join(", ") || (capabilities[0] as any)?.work_subcategory_name) || "Legal identity not recorded"}</p>''',
)

replace_once(
    governance,
    '''          {tab === "capabilities" && <CapabilitiesSection mode={mode} selected={selected} capabilities={capabilities} onAdd={() => setCapabilityDialog({ open: true })} onEdit={(editId) => setCapabilityDialog({ open: true, editId })} onToggle={(id) => updatePartner(selected.id, { capabilities_v2: capabilities.map((capability: any) => capability.id === id ? { ...capability, status: capability.status === "active" ? "inactive" : "active", updated_at: new Date().toISOString() } : capability) })} />}\n''',
    '''          {tab === "capabilities" && <CapabilitiesSection mode={mode} selected={selected} capabilities={capabilities} onAdd={() => setCapabilityDialog({ open: true })} onEdit={(editId) => setCapabilityDialog({ open: true, editId })} onToggle={(id) => updateCapabilities(capabilities.map((capability: any) => capability.id === id ? { ...capability, status: capability.status === "active" ? "inactive" : "active", updated_at: new Date().toISOString() } : capability))} />}\n''',
)

replace_once(
    governance,
    '''      <CapabilityDialog mode={mode} partner={selected} open={capabilityDialog.open} editId={capabilityDialog.editId} onClose={() => setCapabilityDialog({ open: false })} onSave={(next) => { updatePartner(selected.id, { capabilities_v2: next }); setCapabilityDialog({ open: false }); }} />\n''',
    '''      <CapabilityDialog mode={mode} partner={selected} open={capabilityDialog.open} editId={capabilityDialog.editId} onClose={() => setCapabilityDialog({ open: false })} onSave={(next) => { updateCapabilities(next); setCapabilityDialog({ open: false }); }} />\n''',
)

replace_once(
    governance,
    '''function DocumentsSection({ mode, selected, documents, onAdd, onEdit, onVerify, onDelete }: any) {\n  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]"><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap items-center justify-between gap-3"><SectionHeader title="Typed document register" count={documents.length} /><Button size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add document</Button></div><div className="mt-4 space-y-2">{documents.map((document: PartnerComplianceDocument) => { const status = documentStatus(document); const days = daysUntilExpiry(document); return <div key={document.id} className="rounded-xl border border-border bg-muted/10 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{document.label}</p><StatusBadge label={titleCase(status)} className={statusClass(status)} />{mode === "vendor" && document.mandatory && <StatusBadge label="Mandatory" />}</div><p className="mt-1 text-[10px] text-muted-foreground">{document.document_no || "Number not recorded"}{document.expiry_date ? ` · Expires ${formatDate(document.expiry_date)}${days != null ? ` (${days} days)` : ""}` : " · No expiry"}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => onEdit(document.id)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => onDelete(document.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{document.attachment_id ? `Attachment ${document.attachment_id}` : "File can be attached in the evidence panel"}</span><Button size="sm" variant={document.verified ? "outline" : "default"} onClick={() => onVerify(document.id)}>{document.verified ? <><BadgeCheck className="mr-1 h-3.5 w-3.5" />Verified</> : <><ShieldCheck className="mr-1 h-3.5 w-3.5" />Verify</>}</Button></div></div>; })}{!documents.length && <EmptyState title={mode === "vendor" ? "No compliance documents" : "No documents"} description={mode === "vendor" ? "Add tax, bank, licence, insurance and agreement records with verification and expiry dates." : "Add any optional reference documents you want to keep with this contractor."} action={<Button onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add first document</Button>} />}</div></section><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Evidence files" /><div className="mt-3"><OperationalMediaPanel entityType={selected.business_gst != null || selected.trade != null ? "contractor" : "vendor"} entityId={selected.id} title="Compliance evidence and supporting files" /></div></section></div>;\n}\n''',
    '''function DocumentsSection({ mode, selected, documents, onAdd, onEdit, onVerify, onDelete }: any) {\n  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]"><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap items-center justify-between gap-3"><SectionHeader title="Typed document register" count={documents.length} /><Button size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add document</Button></div><div className="mt-4 space-y-2">{documents.map((document: PartnerComplianceDocument) => { const status = documentStatus(document); const days = daysUntilExpiry(document); return <div key={document.id} className="rounded-xl border border-border bg-muted/10 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{document.label}</p><StatusBadge label={titleCase(status)} className={statusClass(status)} />{mode === "vendor" && document.mandatory && <StatusBadge label="Mandatory" />}</div><p className="mt-1 text-[10px] text-muted-foreground">{document.document_no || "Number not recorded"}{document.expiry_date ? ` · Expires ${formatDate(document.expiry_date)}${days != null ? ` (${days} days)` : ""}` : " · No expiry"}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => onEdit(document.id)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => onDelete(document.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{document.attachment_id ? `Attachment ${document.attachment_id}` : "File can be attached in the evidence panel"}</span><Button size="sm" variant={document.verified ? "outline" : "default"} onClick={() => onVerify(document.id)}>{document.verified ? <><BadgeCheck className="mr-1 h-3.5 w-3.5" />Verified</> : <><ShieldCheck className="mr-1 h-3.5 w-3.5" />Verify</>}</Button></div></div>; })}{!documents.length && <EmptyState title={mode === "vendor" ? "No compliance documents" : "No documents"} description={mode === "vendor" ? "Add tax, bank, licence, insurance and agreement records with verification and expiry dates." : "Add any optional reference documents you want to keep with this contractor."} action={<Button onClick={onAdd}><Plus className="mr-1 h-4 w-4" />Add first document</Button>} />}</div></section><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Evidence files" /><div className="mt-3"><OperationalMediaPanel entityType={mode} entityId={selected.id} title="Compliance evidence and supporting files" /></div></section></div>;\n}\n''',
)

replace_once(
    governance,
    '''  const current = partnerCapabilities(partner) as any[];\n''',
    '''  const current = (mode === "contractor"\n    ? contractorGovernanceCapabilityProjection(\n        partner.id,\n        canonicalContractorCapabilities(partner, db),\n      )\n    : partnerCapabilities(partner)) as any[];\n''',
)

# Strengthen the permanent source regression suite for the re-audit findings.
test_path = "tests/contractor-legacy-removal.test.ts"
replace_once(
    test_path,
    '''    expect(governance).not.toContain("capabilities_v2: contractorGovernanceCapabilityProjection");\n''',
    '''    expect(governance).not.toContain("capabilities_v2: contractorGovernanceCapabilityProjection");\n    expect(governance).not.toContain("else if (Array.isArray(patch.capabilities_v2))");\n    expect(governance).toContain("canonicalContractorCapabilities(partner, db).length");\n    expect(governance).toContain("OperationalMediaPanel entityType={mode}");\n''',
)

# Remove the one-shot CI plumbing from the final committed tree.
workflow = Path(".github/workflows/application-ci.yml")
workflow_text = workflow.read_text()
for marker in ("GOVERNANCE-CLEANUP-CHECKOUT", "GOVERNANCE-CLEANUP-APPLY", "GOVERNANCE-CLEANUP-COMMIT"):
    start = f"      # {marker}-BEGIN\n"
    end = f"      # {marker}-END\n"
    if start not in workflow_text or end not in workflow_text:
        raise RuntimeError(f"Missing workflow marker {marker}")
    before, remainder = workflow_text.split(start, 1)
    _, after = remainder.split(end, 1)
    workflow_text = before + after
workflow.write_text(workflow_text)

print("Final Contractor governance cleanup applied.")
