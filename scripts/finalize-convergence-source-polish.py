from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)

# Align the shared Contractor/Staff contracts with the canonical runtime model.
types_path = Path("src/lib/rdash/types.ts")
types = types_path.read_text()
types = replace_once(
    types,
    '        status?: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";\n',
    '        status?: "active" | "inactive";\n',
    "Contractor capability status",
)
types = replace_once(
    types,
    '    status?: "active" | "inactive" | "blacklisted";\n',
    '    status?: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";\n',
    "Contractor lifecycle status",
)
types = replace_once(
    types,
    '    status?: EntityStatus | "blacklisted" | "exited";\n',
    '    status?: EntityStatus | "pending" | "blacklisted" | "exited";\n',
    "Staff pending status",
)
types_path.write_text(types)

# Do not offer an auth-linked email edit that the database must reject.
staff_path = Path("src/components/rdash/StaffEditDialog.tsx")
staff = staff_path.read_text()
staff = replace_once(
    staff,
    '      email: draft.email?.trim() || undefined,\n',
    '      email: staff?.auth_user_id ? staff.email : draft.email?.trim() || undefined,\n',
    "Staff auth-linked email payload",
)
staff = replace_once(
    staff,
    '            Staff profile, login identity, role permissions, attendance policy, salary, documents and lifecycle status stay connected.\n',
    '            Staff profile, role permissions, attendance policy, salary, documents and lifecycle status stay connected. Login identity stays in User Approvals.\n',
    "Staff dialog description",
)
staff = replace_once(
    staff,
    '<div>{fieldLabel("Email")}<Input value={draft.email || ""} onChange={(e) => patch({ email: e.target.value })} className="h-9"/></div>',
    '<div>{fieldLabel(staff?.auth_user_id ? "Email (managed in User Approvals)" : "Email")}<Input value={draft.email || ""} onChange={(e) => patch({ email: e.target.value })} disabled={Boolean(staff?.auth_user_id)} className="h-9"/></div>',
    "Staff email field lock",
)
staff_path.write_text(staff)
