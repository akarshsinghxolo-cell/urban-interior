from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


# 1) Contractor 360: Contractor gets one canonical editor. The legacy business
# dialog stays available for Vendor only, where it is still part of that flow.
partner360 = Path("src/components/rdash/modules/Partner360Module.tsx")
replace_once(
    partner360,
    '''                <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Basic profile</Button>\n                <Button size="sm" variant="outline" onClick={() => setBusinessDialogOpen(true)}><ShieldCheck className="mr-1 h-3.5 w-3.5" />Business details</Button>''',
    '''                <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="mr-1 h-3.5 w-3.5" />{mode === "contractor" ? "Edit contractor" : "Basic profile"}</Button>\n                {mode === "vendor" && <Button size="sm" variant="outline" onClick={() => setBusinessDialogOpen(true)}><ShieldCheck className="mr-1 h-3.5 w-3.5" />Business details</Button>}''',
)
replace_once(
    partner360,
    '''      <EntityFormDialog type={mode} editId={entityEditId} open={entityDialogOpen} onClose={() => { setEntityDialogOpen(false); setEntityEditId(undefined); }} onSaved={(id) => setSelectedId(id)} />\n      <PartnerBusinessDialog mode={mode} partner={selected} open={businessDialogOpen} onClose={() => setBusinessDialogOpen(false)} />''',
    '''      <EntityFormDialog type={mode} editId={entityEditId} open={entityDialogOpen} onClose={() => { setEntityDialogOpen(false); setEntityEditId(undefined); }} onSaved={(id) => setSelectedId(id)} />\n      {mode === "vendor" && <PartnerBusinessDialog mode="vendor" partner={selected} open={businessDialogOpen} onClose={() => setBusinessDialogOpen(false)} />}''',
)

# 2) Shared Contractor type: reflect the fields that the unified editor and
# governance layers actually persist instead of relying on `any`.
types = Path("src/lib/rdash/types.ts")
replace_once(
    types,
    '''export interface Contractor {\n    id: ID;\n    name: string;\n    phone?: string;\n    city?: string;\n    locality?: string;''',
    '''export interface Contractor {\n    id: ID;\n    name: string;\n    legal_name?: string;\n    phone?: string;\n    whatsapp?: string;\n    alternate_phone?: string;\n    email?: string;\n    city?: string;\n    locality?: string;''',
)
replace_once(
    types,
    '''        labour_rate?: number;\n        with_material_rate?: number;\n    }>;''',
    '''        labour_rate?: number;\n        with_material_rate?: number;\n        article_ids?: ID[];\n        unit_id?: ID;\n        crew_required?: number;\n        max_daily_capacity?: number;\n        preferred?: boolean;\n        status?: "active" | "inactive";\n        notes?: string;\n    }>;\n    /** Compatibility projection for the governance UI. `work_capabilities` is canonical. */\n    capabilities_v2?: Array<{\n        id: ID;\n        work_subcategory_id: ID;\n        work_subcategory_name?: string;\n        unit_id?: ID;\n        labour_rate?: number;\n        with_material_rate?: number;\n        crew_required?: number;\n        max_daily_capacity?: number;\n        preferred?: boolean;\n        status: "active" | "inactive";\n        notes?: string;\n        created_at?: string;\n        updated_at?: string;\n    }>;''',
)
replace_once(
    types,
    '''    categories?: string[];\n    // FIX-CONTRACTOR-BATCH2 / F.13: Soft-delete / archive support.''',
    '''    categories?: string[];\n    supervisor_name?: string;\n    supervisor_phone?: string;\n    available_workers?: number;\n    concurrent_site_limit?: number;\n    earliest_mobilisation_date?: string;\n    service_radius_km?: number;\n    labour_registration_no?: string;\n    insurance_expiry?: string;\n    pf_no?: string;\n    esi_no?: string;\n    notes?: string;\n    bank_verified?: boolean;\n    compliance_documents?: Array<{\n        id?: ID;\n        kind?: string;\n        label?: string;\n        document_no?: string;\n        issue_date?: string;\n        expiry_date?: string;\n        verified?: boolean;\n        verified_at?: string;\n        verified_by?: string;\n        attachment_id?: ID;\n        mandatory?: boolean;\n        notes?: string;\n        created_at?: string;\n        updated_at?: string;\n    }>;\n    duplicate_of_id?: ID;\n    duplicate_resolved_at?: string;\n    duplicate_resolution_note?: string;\n    // FIX-CONTRACTOR-BATCH2 / F.13: Soft-delete / archive support.''',
)
# Broaden contractor status to the lifecycle values used in Contractor 360.
replace_once(
    types,
    '''    status?: "active" | "inactive";''',
    '''    status?: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";''',
)

# 3) Bank verification is evidence-derived. Any old UI trying to write the
# boolean gets normalized back to the verified bank-proof document state.
profile = Path("src/lib/rdash/contractor-profile.ts")
replace_once(
    profile,
    '''  notes?: string;\n  compliance_documents?: Array<Record<string, unknown>>;''',
    '''  notes?: string;\n  bank_verified?: boolean;\n  compliance_documents?: Array<Record<string, unknown>>;''',
)
replace_once(
    profile,
    '''    notes: String(input.notes || "").trim() || undefined,\n    status: input.status || "onboarding",''',
    '''    notes: String(input.notes || "").trim() || undefined,\n    bank_verified: verifiedContractorBankProof(input),\n    status: input.status || "onboarding",''',
)

# 4) Remove the contractor validation hook from the old UI-mounted bridge. The
# permanent public store policy now owns contractor invariants. Vendor bridge
# behavior remains untouched.
bridge = Path("src/lib/rdash/partner-form-store-bridge.ts")
text = bridge.read_text()
text = text.replace('''  contractorCapabilityRateError,\n  fieldChanges,''', '''  fieldChanges,''')
text = text.replace('''  const originalAddContractor = initial.addContractor;\n''', '')
old_add = '''  const addContractor = (input: Record<string, unknown>) => {\n    if (isActiveCreate("contractor")) {\n      const error = contractorCapabilityRateError(input.work_capabilities);\n      if (error) throw new Error(error);\n    }\n    return originalAddContractor(input as never);\n  };\n\n'''
text = text.replace(old_add, '')
old_update_guard = '''    const after = { ...before, ...patch };\n    const error = contractorCapabilityRateError(after.work_capabilities);\n    if (error) throw new Error(error);\n    if (!fieldChanges(before, after).length) return;'''
text = text.replace(old_update_guard, '''    const after = { ...before, ...patch };\n    if (!fieldChanges(before, after).length) return;''')
text = text.replace('''    addContractor: addContractor as never,\n    updateVendor:''', '''    updateVendor:''')
text = text.replace('''      addContractor:\n        current.addContractor === addContractor\n          ? originalAddContractor\n          : current.addContractor,\n      updateVendor:''', '''      updateVendor:''')
bridge.write_text(text)

print("Contractor profile finalization applied.")
