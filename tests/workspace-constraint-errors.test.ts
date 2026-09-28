import { beforeEach, describe, expect, test, vi } from "vitest";
import { commitRestOperations } from "../src/lib/rdash/server/commit-rest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({ getSupabaseAdminClient: () => ({ rpc }) }));

describe("database constraints at the shared save boundary", () => {
  beforeEach(() => rpc.mockReset());

  test.each(["23502", "23503", "23505", "23514"])("returns validation failure for SQLSTATE %s, not a retryable server failure", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Business relationship is invalid" } });
    await expect(commitRestOperations([], 0)).rejects.toThrow("INVALID:Business relationship is invalid");
  });

  test("keeps infrastructure errors retryable and concurrency conflicts distinct", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "08006", message: "Connection failure" } });
    await expect(commitRestOperations([], 0)).rejects.toThrow("Workspace transaction failed: Connection failure");
    rpc.mockResolvedValueOnce({ error: { code: "P0001", message: "ROW_CONFLICT" } });
    await expect(commitRestOperations([], 0)).rejects.toThrow(/^CONFLICT$/);
  });
});
