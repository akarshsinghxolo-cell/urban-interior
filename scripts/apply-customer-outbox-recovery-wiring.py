from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/lib/uploads/workspace-outbox.ts",
    'import { uploadIndexedDb } from "./upload-indexed-db";\n',
    'import { uploadIndexedDb } from "./upload-indexed-db";\nimport { recoverQueuedCustomerConversationRecord } from "./workspace-outbox-canonical-recovery";\n',
)

replace_once(
    "src/lib/uploads/workspace-outbox.ts",
    '''async function refresh(): Promise<void> {\n  emit(await readScopedWorkspaceOutbox());\n}\n\n''',
    '''async function refresh(): Promise<void> {\n  emit(await readScopedWorkspaceOutbox());\n}\n\nasync function recoverCanonicalCustomerConversationOutbox(\n  base?: Pick<RDashDatabase, "customers"> | null,\n): Promise<boolean> {\n  const items = await readScopedWorkspaceOutbox();\n  if (!items.length) return false;\n  const online = typeof navigator === "undefined" ? true : navigator.onLine;\n  let changed = false;\n  for (const item of items) {\n    const recovered = recoverQueuedCustomerConversationRecord(item, { base, online });\n    if (!recovered.changed) continue;\n    await uploadIndexedDb.putWorkspaceOutbox(recovered.record);\n    changed = true;\n  }\n  if (changed) await refresh();\n  return changed;\n}\n\n''',
)

replace_once(
    "src/lib/uploads/workspace-outbox.ts",
    '''  acceptedWorkspace = structuredClone(base) as RDashDatabase;\n  await workspaceOutboxStore.hydrate();\n  const items = (await readScopedWorkspaceOutbox())\n''',
    '''  acceptedWorkspace = structuredClone(base) as RDashDatabase;\n  await workspaceOutboxStore.hydrate();\n  await recoverCanonicalCustomerConversationOutbox(base);\n  const items = (await readScopedWorkspaceOutbox())\n''',
)

replace_once(
    "src/lib/uploads/workspace-outbox.ts",
    '''  flushPromise = (async () => {\n    await workspaceOutboxStore.hydrate();\n    if (typeof navigator !== "undefined" && !navigator.onLine) {\n''',
    '''  flushPromise = (async () => {\n    await workspaceOutboxStore.hydrate();\n    await recoverCanonicalCustomerConversationOutbox(acceptedWorkspace);\n    if (typeof navigator !== "undefined" && !navigator.onLine) {\n''',
)

print("Wired one-way Customer conversation outbox recovery into restore and replay.")
