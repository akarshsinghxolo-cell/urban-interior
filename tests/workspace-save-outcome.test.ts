import { describe, expect, test } from "vitest";
import { classifyWorkspaceSaveOutcome } from "../src/lib/rdash/workspace-save-outcome";

describe("workspace save acknowledgement", () => {
  test("only a completed 2xx response is confirmed", () => {
    expect(classifyWorkspaceSaveOutcome(200, "applied")).toBe("confirmed");
    expect(classifyWorkspaceSaveOutcome(202, "processing")).toBe("pending");
    expect(classifyWorkspaceSaveOutcome(200, "processing")).toBe("pending");
  });

  test("server rejections are not reported as saves", () => {
    expect(classifyWorkspaceSaveOutcome(422)).toBe("rejected");
    expect(classifyWorkspaceSaveOutcome(500, "processing")).toBe("rejected");
  });
});
