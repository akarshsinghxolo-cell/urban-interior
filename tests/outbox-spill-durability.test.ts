import { afterEach, describe, expect, test } from "vitest";
import {
  readSpilledWorkspaceCommits,
  replaceSpilledWorkspaceCommits,
  spillWorkspaceCommit,
} from "../src/lib/uploads/workspace-outbox-spill";
import { expectNoTokens, expectTokens, readSrc } from "./helpers/source-contract";

/**
 * Task 36-a: the outbox capture used to fail open — if the IndexedDB capture
 * threw, the commit went out with no durable copy, so a tab closed mid-request
 * silently lost the change. The fix: a secondary localStorage spill
 * (independent storage backend) plus promotion back into the outbox queue on
 * the next hydrate. These tests pin the spill behavior and the wiring.
 */

const SPILL_KEY = "uc_workspace_outbox_spill_v1";

type MinimalStorage = {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
  clear(): void;
};

function installWindowStorage(overrides: Partial<MinimalStorage> = {}): void {
  const backing = new Map<string, string>();
  const storage: MinimalStorage = {
    getItem: (name) => (backing.has(name) ? backing.get(name)! : null),
    setItem: (name, value) => backing.set(name, value),
    removeItem: (name) => backing.delete(name),
    clear: () => backing.clear(),
    ...overrides,
  };
  (globalThis as { window?: unknown }).window = { localStorage: storage };
}

function uninstallWindowStorage(): void {
  delete (globalThis as { window?: unknown }).window;
}

afterEach(() => {
  uninstallWindowStorage();
});

function commitPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    revision: 7,
    operations: [{ collection: "customers", upsert: [{ id: "cust-1" }], deleteIds: [] }],
    ...overrides,
  });
}

describe("workspace outbox spill — secondary durability", () => {
  test("spills a valid commit payload to localStorage and reads it back", () => {
    installWindowStorage();
    expect(spillWorkspaceCommit(commitPayload())).toBe(true);
    const spilled = readSpilledWorkspaceCommits();
    expect(spilled).toHaveLength(1);
    expect(spilled[0].revision).toBe(7);
    expect(spilled[0].operations).toHaveLength(1);
  });

  test("rejects payloads that could never be replayed", () => {
    installWindowStorage();
    expect(spillWorkspaceCommit("not json")).toBe(false);
    expect(spillWorkspaceCommit(JSON.stringify({ revision: "x", operations: [] }))).toBe(false);
    expect(spillWorkspaceCommit(JSON.stringify({ revision: 1, operations: [] }))).toBe(false);
    expect(spillWorkspaceCommit(null)).toBe(false);
    expect(readSpilledWorkspaceCommits()).toHaveLength(0);
  });

  test("is inert without a window (SSR / node)", () => {
    expect(spillWorkspaceCommit(commitPayload())).toBe(false);
    expect(readSpilledWorkspaceCommits()).toHaveLength(0);
  });

  test("returns false without throwing when localStorage is broken", () => {
    installWindowStorage({
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    expect(spillWorkspaceCommit(commitPayload())).toBe(false);
  });

  test("a broken spill read never breaks the caller; writes still land", () => {
    installWindowStorage({
      getItem: () => {
        throw new Error("access denied");
      },
    });
    expect(readSpilledWorkspaceCommits()).toHaveLength(0);
    // Reads are broken, writes are not: the payload is still durable.
    expect(spillWorkspaceCommit(commitPayload())).toBe(true);
  });

  test("caps the spill at 20 entries, dropping the oldest", () => {
    installWindowStorage();
    for (let index = 0; index < 25; index += 1) {
      expect(
        spillWorkspaceCommit(commitPayload({ operationId: `workspace-op-${index}` })),
      ).toBe(true);
    }
    const spilled = readSpilledWorkspaceCommits();
    expect(spilled).toHaveLength(20);
    expect(spilled[0].operationId).toBe("workspace-op-5");
    expect(spilled[19].operationId).toBe("workspace-op-24");
  });

  test("re-spilling the same operationId replaces instead of duplicating", () => {
    installWindowStorage();
    const body = commitPayload({ operationId: "workspace-op-same" });
    expect(spillWorkspaceCommit(body)).toBe(true);
    expect(spillWorkspaceCommit(commitPayload({ operationId: "workspace-op-same", revision: 8 }))).toBe(true);
    const spilled = readSpilledWorkspaceCommits();
    expect(spilled).toHaveLength(1);
    expect(spilled[0].revision).toBe(8);
  });

  test("replaceSpilledWorkspaceCommits clears the spill when everything was promoted", () => {
    installWindowStorage();
    spillWorkspaceCommit(commitPayload());
    expect(readSpilledWorkspaceCommits()).toHaveLength(1);
    replaceSpilledWorkspaceCommits([]);
    expect(readSpilledWorkspaceCommits()).toHaveLength(0);
    const storage = (globalThis.window as unknown as { localStorage: MinimalStorage }).localStorage;
    expect(storage.getItem(SPILL_KEY)).toBeNull();
  });
});

describe("source contract — spill wiring closes the fail-open capture", () => {
  test("client-auth spills the raw payload when durable capture fails", () => {
    const source = readSrc("src/lib/rdash/client-auth.ts");
    expectTokens(source, [
      "import { spillWorkspaceCommit } from \"@/lib/uploads/workspace-outbox-spill\";",
      "Could not durably capture this commit; continuing with the online save.",
      "spillWorkspaceCommit(body);",
    ]);
  });

  test("the outbox promotes spilled commits on hydrate", () => {
    const source = readSrc("src/lib/uploads/workspace-outbox.ts");
    expectTokens(source, [
      "import { readSpilledWorkspaceCommits, replaceSpilledWorkspaceCommits, } from \"./workspace-outbox-spill\";",
      "async function promoteSpilledCommits(): Promise<void> {",
      "await captureWorkspaceCommit(JSON.stringify(payload));",
      "if (!captured.operationId) remaining.push(payload);",
      "replaceSpilledWorkspaceCommits(remaining);",
      "await promoteSpilledCommits();",
    ]);
  });

  test("the spill module stays a leaf (no import cycle with the outbox)", () => {
    const source = readSrc("src/lib/uploads/workspace-outbox-spill.ts");
    expectTokens(source, [
      "from \"./workspace-outbox-types\"",
    ]);
    expectNoTokens(source, [
      // Only the type module may be imported; importing the outbox itself
      // would create a cycle (outbox imports the spill for promotion).
      "from \"./workspace-outbox\"",
      "from \"@/lib/uploads/workspace-outbox\"",
    ]);
  });
});
