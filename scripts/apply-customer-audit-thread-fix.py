from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/lib/rdash/store/slices/core.ts",
    'import { mapEntityTypeToThreadKind } from "../../entity-thread-map";\n',
    'import { mapEntityTypeToThreadKind } from "../../entity-thread-map";\nimport { canonicalThreadRecordIdForParent } from "../../thread-record-id";\n',
)

replace_once(
    "src/lib/rdash/store/slices/core.ts",
    '''            // Collect all thread IDs to post to: the primary entity + cross-posts.\n            const threadTargets: Array<{ kind: any; recordId: string; title: string; }> = [];\n            if (threadKind && entityId && threadParentExists(get().db, threadKind, entityId)) {\n                threadTargets.push({\n                    kind: threadKind,\n                    recordId: entityId,\n                    title: entry.entity_label || entityId,\n                });\n            }\n            // Add cross-post targets.\n            if (entry.cross_post) {\n                for (const cp of entry.cross_post) {\n                    const cpKind = mapEntityTypeToThreadKind(cp.entity_type);\n                    if (cpKind && cp.entity_id && threadParentExists(get().db, cpKind, cp.entity_id)) {\n                        threadTargets.push({\n                            kind: cpKind,\n                            recordId: cp.entity_id,\n                            title: cp.entity_label || cp.entity_id,\n                        });\n                    }\n                }\n            }\n''',
    '''            // Collect all thread IDs to post to: the primary entity + cross-posts.\n            // Canonicalize the persisted thread record ID before validating the\n            // parent. Customer entities therefore always resolve to the single\n            // customer-conversation:<customer_id> thread identity.\n            const threadTargets: Array<{ kind: any; recordId: string; title: string; }> = [];\n            const addThreadTarget = (entityType: string, targetEntityId: string | undefined, title?: string) => {\n                const kind = mapEntityTypeToThreadKind(entityType);\n                if (!kind || !targetEntityId) return;\n                const recordId = canonicalThreadRecordIdForParent(get().db, kind, targetEntityId);\n                if (!threadParentExists(get().db, kind, recordId)) return;\n                threadTargets.push({\n                    kind,\n                    recordId,\n                    title: title || targetEntityId,\n                });\n            };\n            addThreadTarget(entityType, entityId, entry.entity_label);\n            // Add cross-post targets.\n            if (entry.cross_post) {\n                for (const cp of entry.cross_post) {\n                    addThreadTarget(cp.entity_type, cp.entity_id, cp.entity_label);\n                }\n            }\n''',
)

path = Path("tests/customer-thread-canonicalization.test.ts")
text = path.read_text()
text = text.replace(
    'import { createThreadsSlice } from "../src/lib/rdash/store/slices/threads";\n',
    'import { createThreadsSlice } from "../src/lib/rdash/store/slices/threads";\nimport { createCoreSlice } from "../src/lib/rdash/store/slices/core";\n',
    1,
)
needle = '''  test("reuses the same canonical Customer conversation thread", () => {\n'''
integration = '''  test("posts Customer audit lifecycle events into the canonical conversation", () => {\n    const db = structuredClone(buildSeedDatabase()) as RDashDatabase;\n    const customer = db.customers[0];\n    db.threads = [];\n    db.auditLog = [];\n\n    const state: any = { db };\n    const ctx: any = {\n      get: () => state,\n      isNestedTransaction: () => false,\n      commitState: (update: any) => {\n        const partial = typeof update === "function" ? update(state) : update;\n        Object.assign(state, partial);\n      },\n      setBase: (update: any) => {\n        const partial = typeof update === "function" ? update(state) : update;\n        Object.assign(state, partial);\n      },\n    };\n    Object.assign(state, createThreadsSlice(ctx));\n    const core = createCoreSlice(ctx);\n\n    core.logAudit({\n      actor: "Owner",\n      actor_role: "Owner",\n      action: `Created customer "${customer.name}"`,\n      entity_type: "customer",\n      entity_id: customer.id,\n      entity_label: customer.name,\n      kind: "create",\n    });\n\n    expect(state.db.threads).toHaveLength(1);\n    const thread = state.db.threads[0];\n    expect(thread.record_id).toBe(customerConversationThreadRecordId(customer.id));\n    expect(thread.messages.some((message: any) => message.body.includes(`Created customer "${customer.name}"`))).toBe(true);\n    expect(state.db.auditLog[0]?.thread_id).toBe(thread.id);\n  });\n\n'''
if text.count(needle) != 1:
    raise SystemExit("Could not locate canonical thread reuse test insertion point")
text = text.replace(needle, integration + needle, 1)
path.write_text(text)

print("Applied Customer audit canonical-thread fix.")
