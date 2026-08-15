import { describe, expect, test } from "bun:test";
import { allowsInMemoryWorkspaceFallback } from "../src/lib/rdash/server/workspace";

describe("workspace storage fallback", () => {
  test("is always disabled in production", () => {
    expect(allowsInMemoryWorkspaceFallback({
      NODE_ENV: "production",
      UC_ALLOW_IN_MEMORY_WORKSPACE_FALLBACK: "1",
    })).toBe(false);
  });

  test("requires explicit opt-in outside production", () => {
    expect(allowsInMemoryWorkspaceFallback({ NODE_ENV: "development" })).toBe(false);
    expect(allowsInMemoryWorkspaceFallback({
      NODE_ENV: "development",
      UC_ALLOW_IN_MEMORY_WORKSPACE_FALLBACK: "1",
    })).toBe(true);
  });
});
