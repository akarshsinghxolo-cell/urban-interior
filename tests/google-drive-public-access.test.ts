import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("public Google Drive files", () => {
  test("removes configurable Drive file-access policy", async () => {
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");
    expect(manager).not.toContain("type AccessPolicy");
    expect(manager).not.toContain('label="File Access"');
    expect(manager).not.toContain("Private - Google account only");
    expect(manager).not.toContain("Customer-shareable");
    expect(manager).not.toContain("Vendor restricted");
    expect(manager).not.toContain("Contractor restricted");
  });

  test("publishes managed and test uploads as anyone-reader links", async () => {
    const finalize = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");
    const testUpload = await readFile("src/app/api/google-drive/test-upload/route.ts", "utf8");
    for (const source of [finalize, testUpload]) {
      expect(source).toContain('type: "anyone"');
      expect(source).toContain('role: "reader"');
      expect(source).toContain("allowFileDiscovery: false");
    }
    expect(finalize).toContain("await makeDriveFilePublic(accessToken, file.id)");
    expect(testUpload).toContain('["drive-test", "public"]');
  });
});
