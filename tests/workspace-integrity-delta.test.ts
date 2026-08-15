import { describe, expect, test } from "vitest";
import { introducedIntegrityIssues } from "../src/lib/rdash/server/integrity-delta";

describe("workspace integrity delta", () => {
  test("does not block an unrelated edit because of an existing issue", () => {
    expect(introducedIntegrityIssues(
      ["Site references missing attachment old"],
      ["Site references missing attachment old"],
    )).toEqual([]);
  });

  test("rejects a newly introduced issue", () => {
    expect(introducedIntegrityIssues(
      ["Site references missing attachment old"],
      ["Site references missing attachment old", "Site references missing attachment new"],
    )).toEqual(["Site references missing attachment new"]);
  });

  test("preserves duplicate issue multiplicity", () => {
    expect(introducedIntegrityIssues(["duplicate"], ["duplicate", "duplicate"]))
      .toEqual(["duplicate"]);
  });
});
