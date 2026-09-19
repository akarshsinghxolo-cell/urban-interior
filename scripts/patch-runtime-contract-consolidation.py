from pathlib import Path

root = Path(__file__).resolve().parents[1]


def replace_once(relative_path: str, old: str, new: str, label: str) -> None:
    path = root / relative_path
    value = path.read_text()
    if old not in value:
        raise RuntimeError(f"{label} not found in {relative_path}")
    path.write_text(value.replace(old, new, 1))


# Keep the one-time consolidation codemod aligned with the current Visit shape.
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

# Quotation Desk is finance-owned. Remove the standalone Workspace module and
# register the desk plus its settings as Finance submodules instead.
quotation_module = '''      {
        id: "quotationDesk",
        label: "Quotation Desk",
        description: "Customer quotations, coverage, revisions and acceptance",
        icon: "🧾",
        renderer: "quotations",
        activePredicate: (db) =>
          db.quotations.some(
            (quotation) =>
              quotation.status === "draft" || quotation.status === "sent",
          ),
        dataSource: "quotations",
        submodules: [
          {
            id: "quotationConfig",
            label: "Terms & Settings",
            renderer: "quotation-config",
            dataSource: "none",
          },
        ],
      },
'''
replace_once(
    "src/lib/rdash/modules.ts",
    quotation_module,
    "",
    "standalone Quotation Desk module",
)
replace_once(
    "src/lib/rdash/modules.ts",
    '''        description:
          "Customer collections, partner payables, unified profitability, commissions and GST",''',
    '''        description:
          "Quotations, customer collections, partner payables, profitability, commissions and GST",''',
    "Finance description",
)
replace_once(
    "src/lib/rdash/modules.ts",
    '''        activePredicate: (db) =>
          db.quotations.some((quotation) => quotation.status === "accepted") ||''',
    '''        activePredicate: (db) =>
          db.quotations.length > 0 ||''',
    "Finance quotation activity predicate",
)
replace_once(
    "src/lib/rdash/modules.ts",
    '''        submodules: [
          {
            id: "payments",''',
    '''        submodules: [
          {
            id: "quotationDesk",
            label: "Quotation Desk",
            renderer: "quotations",
            dataSource: "quotations",
            hint: "Customer quotations, coverage, revisions and acceptance",
          },
          {
            id: "quotationConfig",
            label: "Quotation Terms & Settings",
            renderer: "quotation-config",
            dataSource: "none",
          },
          {
            id: "payments",''',
    "Finance submodule list",
)
replace_once(
    "src/lib/rdash/modules.ts",
    '  "quotationDesk",\n',
    "",
    "top-level Quotation Desk display order entry",
)

# Canonical navigation and entity detail URLs now live inside Finance.
workspace_routes = root / "src/lib/rdash/workspace-routes.ts"
workspace_route_text = workspace_routes.read_text()
if '/workspace/quotations' not in workspace_route_text:
    raise RuntimeError("Quotation workspace route not found")
workspace_routes.write_text(
    workspace_route_text.replace(
        '/workspace/quotations',
        '/workspace/finance/quotations',
    )
)

entity_routes = root / "src/lib/rdash/workspace-entity-routes.ts"
entity_route_text = entity_routes.read_text()
if 'basePath: "/workspace/quotations"' not in entity_route_text:
    raise RuntimeError("Quotation entity route not found")
entity_routes.write_text(
    entity_route_text.replace(
        'basePath: "/workspace/quotations"',
        'basePath: "/workspace/finance/quotations"',
        1,
    )
)

for relative_path in [
    "tests/workspace-entity-routes.test.ts",
    "tests/workspace-history-url.test.ts",
]:
    path = root / relative_path
    text = path.read_text()
    if "/workspace/quotations" not in text:
        raise RuntimeError(f"Quotation URL expectations not found in {relative_path}")
    path.write_text(text.replace("/workspace/quotations", "/workspace/finance/quotations"))

# Lock the ownership relationship into the navigation contract tests.
replace_once(
    "tests/module-navigation-ids.test.ts",
    '''  test("the corrected call sites navigate to their canonical modules", () => {''',
    '''  test("Quotation Desk is owned by Finance", () => {
    const quotationDesk = MODULE_ROUTE_REGISTRY.get("quotationDesk");
    expect(quotationDesk).toMatchObject({
      groupId: "operations",
      moduleId: "financeDesk",
      isSubmodule: true,
      renderer: "quotations",
      dataSource: "quotations",
    });
    expect(MODULE_ROUTE_REGISTRY.get("quotationConfig")).toMatchObject({
      groupId: "operations",
      moduleId: "financeDesk",
      isSubmodule: true,
      renderer: "quotation-config",
    });
  });

  test("the corrected call sites navigate to their canonical modules", () => {''',
    "Quotation Desk Finance ownership regression test insertion point",
)

Path(__file__).unlink()
