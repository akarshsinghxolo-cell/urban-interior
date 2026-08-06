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

  test("encrypts reusable Drive credentials and keeps OAuth secrets out of browser writes", async () => {
    const connections = await readFile("src/lib/rdash/server/drive-connections.ts", "utf8");
    const configRoute = await readFile("src/app/api/google-drive/oauth/config/route.ts", "utf8");
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");

    expect(connections).toContain('const TOKEN_CIPHER = "aes-256-gcm"');
    expect(connections).toContain('const TOKEN_KEY_ENV = "DRIVE_TOKEN_ENCRYPTION_KEY"');
    expect(connections).toContain("refreshTokenEncrypted");
    expect(connections).toContain("createCipheriv");
    expect(connections).toContain("createDecipheriv");
    expect(connections).toContain("Legacy plaintext value. Read only so old vaults can be migrated");
    expect(configRoute).toContain("status: 405");
    expect(configRoute).not.toContain("request.json");
    expect(manager).toContain("Google OAuth Environment Setup");
    expect(manager).not.toContain("Save Credentials");
    expect(manager).not.toContain("setClientSecret");
  });

  test("recognizes encrypted refresh tokens in owner diagnostics", async () => {
    const diagnostics = await readFile("src/lib/rdash/server/drive-security-diagnostics.ts", "utf8");

    expect(diagnostics).toContain("refreshTokenEncrypted?: StoredEncryptedSecret");
    expect(diagnostics).toContain("hasReusableRefreshToken(connection)");
    expect(diagnostics).toContain("refreshTokenFingerprint(connection)");
    expect(diagnostics).not.toContain("if (!connection.id || !connection.refreshToken)");
    expect(diagnostics).not.toContain("configured: Boolean(connection?.refreshToken)");
  });

  test("requests only app-created or explicitly selected Drive files", async () => {
    const connections = await readFile("src/lib/rdash/server/drive-connections.ts", "utf8");
    const diagnostics = await readFile("src/lib/rdash/server/drive-security-diagnostics.ts", "utf8");

    expect(connections).toContain('export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"');
    expect(connections).toContain('url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE)');
    expect(connections).not.toContain('url.searchParams.set("scope", "https://www.googleapis.com/auth/drive")');
    expect(diagnostics).toContain("accessTokenForDriveConnection, GOOGLE_DRIVE_SCOPE");
    expect(diagnostics).not.toContain('const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"');
  });

  test("makes the copied-link security boundary explicit", async () => {
    const policy = await readFile("docs/google-drive-access-policy.md", "utf8");
    const open = await readFile("src/app/api/google-drive/open/route.ts", "utf8");
    const download = await readFile("src/app/api/google-drive/download/route.ts", "utf8");
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");

    expect(policy).toContain("anyone who obtains the Google Drive URL can read it without an Urban Castle session");
    expect(policy).toContain("Do not treat the current Drive sharing model as strong confidentiality");
    expect(open).toContain("canReadManagedFileAsset");
    expect(download).toContain("canReadManagedFileAsset");
    expect(manager).toContain("Managed Drive files are link-readable");
  });
});
