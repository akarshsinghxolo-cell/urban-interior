from pathlib import Path

root = Path(__file__).resolve().parents[1]
script = root / "scripts/apply-runtime-contract-consolidation.py"
value = script.read_text()
old = '''types = types.replace(
    "    assigned_staff_id?: ID;\\n    /** @deprecated Runtime compatibility alias; persist assigned_staff_id instead. */\\n    staff_id: ID;\\n    /** @deprecated Derived from canonical Staff at read time. */\\n    staff_name: string;",
    "    assigned_staff_id?: ID;\\n    /** Derived from canonical Staff at read time; never persisted. */\\n    readonly assigned_staff_name?: string;",
)
'''
new = '''types = types.replace(
    "    staff_id: ID;\\n    staff_name: string;",
    "    assigned_staff_id: ID;\\n    /** Derived from canonical Staff at read time; never persisted. */\\n    readonly assigned_staff_name?: string;",
)
'''
if old not in value:
    raise RuntimeError("Visit canonicalization block not found in consolidation codemod")
script.write_text(value.replace(old, new))
Path(__file__).unlink()
