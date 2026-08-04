import { describe, expect, test } from "bun:test";

describe("workspace navigation freshness", () => {
  test("revalidates a compatible scope when navigation enters another target", async () => {
    const source = await Bun.file(
      "src/components/urban-castle/WorkspaceScopedReadBoundary.tsx",
    ).text();

    expect(source).toContain(
      "const previousEffectTargetKeyRef = React.useRef(targetKey)",
    );
    expect(source).toContain(
      "const enteredNewTarget = previousEffectTargetKeyRef.current !== targetKey",
    );
    expect(source).toContain(
      "if (!needsExpansion && !enteredNewTarget)",
    );
    expect(source).toContain(
      '"X-UC-Read-Revalidate": enteredNewTarget ? "navigation" : "coverage"',
    );
  });

  test("keeps compatible data visible while navigation refreshes it", async () => {
    const source = await Bun.file(
      "src/components/urban-castle/WorkspaceScopedReadBoundary.tsx",
    ).text();

    expect(source).toContain("if (!needsExpansion) return null");
    expect(source).not.toContain("if (!needsExpansion && !enteredNewTarget) return null");
  });
});
