import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

describe("public Google Drive files", () => {
  test("removes configurable Drive file-access policy", async () => {
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");
    expectNoTokens(manager, ["type AccessPolicy"]);
    expectNoTokens(manager, ['label="File Access"']);
    expectNoTokens(manager, ["Private - Google account only"]);
    expect(manager).not.toContain("Customer-shareable");
    expectNoTokens(manager, ["Vendor restricted"]);
    expectNoTokens(manager, ["Contractor restricted"]);
  });

  test("publishes managed and test uploads as anyone-reader links", async () => {
    const finalize = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");
    const testUpload = await readFile("src/app/api/google-drive/test-upload/route.ts", "utf8");
    for (const source of [finalize, testUpload]) {
      expectTokens(source, ['type: "anyone"']);
      expectTokens(source, ['role: "reader"']);
      expectTokens(source, ["allowFileDiscovery: false"]);
    }
    expectTokens(finalize, ["await makeDriveFilePublic(accessToken, file.id)"]);
    expectTokens(testUpload, ['["drive-test", "public"]']);
  });

  test("encrypts reusable Drive credentials and keeps OAuth secrets out of browser writes", async () => {
    const connections = await readFile("src/lib/rdash/server/drive-connections.ts", "utf8");
    const configRoute = await readFile("src/app/api/google-drive/oauth/config/route.ts", "utf8");
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");

    expectTokens(connections, ['const TOKEN_CIPHER = "aes-256-gcm"']);
    expectTokens(connections, ['const TOKEN_KEY_ENV = "DRIVE_TOKEN_ENCRYPTION_KEY"']);
    expect(connections).toContain("refreshTokenEncrypted");
    expect(connections).toContain("createCipheriv");
    expect(connections).toContain("createDecipheriv");
    expectTokens(connections, ["Legacy plaintext value. Read only so old vaults can be migrated"]);
    expectTokens(configRoute, ["status: 405"]);
    expect(configRoute).not.toContain("request.json");
    expectTokens(manager, ["Google OAuth Environment Setup"]);
    expectNoTokens(manager, ["Save Credentials"]);
    expect(manager).not.toContain("setClientSecret");
  });

  test("recognizes encrypted refresh tokens in owner diagnostics", async () => {
    const diagnostics = await readFile("src/lib/rdash/server/drive-security-diagnostics.ts", "utf8");

    expectTokens(diagnostics, ["refreshTokenEncrypted?: StoredEncryptedSecret"]);
    expect(diagnostics).toContain("hasReusableRefreshToken(connection)");
    expect(diagnostics).toContain("refreshTokenFingerprint(connection)");
    expectNoTokens(diagnostics, ["if (!connection.id || !connection.refreshToken)"]);
    expectNoTokens(diagnostics, ["configured: Boolean(connection?.refreshToken)"]);
  });

  test("requests only app-created or explicitly selected Drive files", async () => {
    const connections = await readFile("src/lib/rdash/server/drive-connections.ts", "utf8");
    const diagnostics = await readFile("src/lib/rdash/server/drive-security-diagnostics.ts", "utf8");

    expectTokens(connections, ['export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"']);
    expectTokens(connections, ['url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE)']);
    expectNoTokens(connections, ['url.searchParams.set("scope", "https://www.googleapis.com/auth/drive")']);
    expectTokens(diagnostics, ["accessTokenForDriveConnection, GOOGLE_DRIVE_SCOPE"]);
    expectNoTokens(diagnostics, ['const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"']);
  });

  test("uses public Drive links directly for preview, open, thumbnail and download", async () => {
    const policy = await readFile("docs/google-drive-access-policy.md", "utf8");
    const open = await readFile("src/app/api/google-drive/open/route.ts", "utf8");
    const preview = await readFile("src/app/api/google-drive/preview/route.ts", "utf8");
    const download = await readFile("src/app/api/google-drive/download/route.ts", "utf8");
    const thumbnail = await readFile("src/app/api/google-drive/thumbnail/route.ts", "utf8");
    const previewComponent = await readFile("src/components/rdash/FilePreview.tsx", "utf8");
    const manager = await readFile("src/components/rdash/modules/GoogleDriveManagerCoreModule.tsx", "utf8");

    expectTokens(policy, ["anyone who obtains the Google Drive URL can read it without an Urban Castle session"]);
    expectTokens(policy, ["Do not treat the current Drive sharing model as strong confidentiality"]);
    for (const route of [open, preview, download, thumbnail]) {
      expect(route).toContain("NextResponse.redirect");
      expect(route).not.toContain("canReadManagedFileAsset");
      expect(route).not.toContain("getGoogleDriveAccessToken");
    }
    expect(open).toContain("https://drive.google.com/file/d/");
    expect(preview).toContain("https://drive.google.com/file/d/");
    expect(download).toContain("https://drive.google.com/uc?export=download&id=");
    expect(thumbnail).toContain("https://drive.google.com/thumbnail?id=");
    expect(previewComponent).toContain("publicDrivePreviewUrl");
    expect(previewComponent).toContain("publicDriveThumbnailUrl");
    expect(previewComponent).toContain("publicDriveDownloadUrl");
    expect(previewComponent).not.toContain("/api/google-drive/preview?fileId=");
    expect(previewComponent).not.toContain("/api/google-drive/download?fileId=");
    expectTokens(manager, ["Managed Drive files are link-readable"]);
  });

  test("removes the local-file architecture from active file handling", async () => {
    const files = await readFile("src/lib/rdash/store/slices/files.ts", "utf8");
    const thumbnail = await readFile("src/app/api/google-drive/thumbnail/route.ts", "utf8");

    expect(files).not.toContain("/api/local-file/");
    expectNoTokens(files, ['storage_provider: "local"']);
    expectNoTokens(files, ['storageAccountId === "local"']);
    expectTokens(files, ['storage_provider: "google_drive"']);
    expect(thumbnail).not.toContain('fileId.startsWith("local-")');
    expect(thumbnail).not.toContain("extractSessionToken");
  });
});
