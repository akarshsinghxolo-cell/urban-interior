from pathlib import Path

root = Path(__file__).resolve().parents[1]
modules_path = root / "src/lib/rdash/modules.ts"
routes_path = root / "src/lib/rdash/workspace-routes.ts"
entity_routes_path = root / "src/lib/rdash/workspace-entity-routes.ts"
test_path = root / "tests/quotation-finance-navigation.test.ts"

modules = modules_path.read_text()
lines = modules.splitlines(keepends=True)
id_line = next(i for i, line in enumerate(lines) if 'id: "quotationDesk"' in line)
start = id_line - 1
while start >= 0 and lines[start].strip() != "{":
    start -= 1
if start < 0:
    raise RuntimeError("quotationDesk module start not found")
depth = 0
end = None
for i in range(start, len(lines)):
    depth += lines[i].count("{") - lines[i].count("}")
    if depth == 0:
        end = i
        break
if end is None:
    raise RuntimeError("quotationDesk module end not found")
del lines[start:end + 1]
modules = "".join(lines)

finance_id = modules.index('id: "financeDesk"')
submodules_pos = modules.index("submodules: [", finance_id) + len("submodules: [")
quotation_children = '''\n          {\n            id: "quotationDesk",\n            label: "Quotation Desk",\n            renderer: "quotations",\n            dataSource: "quotations",\n            hint: "Customer quotations, coverage, revisions and acceptance",\n          },\n          {\n            id: "quotationConfig",\n            label: "Terms & Settings",\n            renderer: "quotation-config",\n            dataSource: "none",\n          },'''
modules = modules[:submodules_pos] + quotation_children + modules[submodules_pos:]
modules_path.write_text(modules)

routes = routes_path.read_text()
routes = routes.replace(
    '{ moduleId: "quotationDesk", canonicalPath: "/workspace/quotations", aliases: ["/workspace/quotationDesk"] },\n  { moduleId: "quotationConfig", canonicalPath: "/workspace/quotations/settings" },',
    '{ moduleId: "quotationDesk", canonicalPath: "/workspace/finance/quotations" },\n  { moduleId: "quotationConfig", canonicalPath: "/workspace/finance/quotations/settings" },',
)
if '/workspace/quotations", aliases:' in routes or 'canonicalPath: "/workspace/quotations/settings"' in routes:
    raise RuntimeError("standalone quotation route survived")
routes_path.write_text(routes)

entity_routes = entity_routes_path.read_text()
entity_routes = entity_routes.replace(
    'basePath: "/workspace/quotations",\n    permissionModule: "quotations",',
    'basePath: "/workspace/finance/quotations",\n    permissionModule: "quotations",',
)
if 'basePath: "/workspace/quotations"' in entity_routes:
    raise RuntimeError("standalone quotation entity route survived")
entity_routes_path.write_text(entity_routes)

test_path.write_text('''import { describe, expect, it } from "vitest";\nimport { MODULE_GROUPS, MODULE_ROUTE_REGISTRY } from "../src/lib/rdash/modules";\nimport { workspacePathForModule } from "../src/lib/rdash/workspace-routes";\nimport { workspaceEntityPath } from "../src/lib/rdash/workspace-entity-routes";\n\ndescribe("quotation finance ownership", () => {\n  it("owns Quotation Desk under Finance instead of Workspace", () => {\n    const workspace = MODULE_GROUPS.find((group) => group.id === "workspace");\n    const operations = MODULE_GROUPS.find((group) => group.id === "operations");\n    const finance = operations?.modules.find((module) => module.id === "financeDesk");\n\n    expect(workspace?.modules.some((module) => module.id === "quotationDesk")).toBe(false);\n    expect(finance?.submodules.map((module) => module.id)).toContain("quotationDesk");\n    expect(finance?.submodules.map((module) => module.id)).toContain("quotationConfig");\n    expect(MODULE_ROUTE_REGISTRY.get("quotationDesk")?.parentId).toBe("financeDesk");\n  });\n\n  it("uses Finance-owned quotation URLs", () => {\n    expect(workspacePathForModule("quotationDesk")).toBe("/workspace/finance/quotations");\n    expect(workspacePathForModule("quotationConfig")).toBe("/workspace/finance/quotations/settings");\n    expect(workspaceEntityPath("quotation", "q-1")).toBe("/workspace/finance/quotations/q-1");\n  });\n});\n''')
