import { beforeEach, describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";

beforeEach(() => {
  dirtyFormRegistry.resetForTests();
});

describe("dirty form registry", () => {
  test("clean navigation proceeds immediately", () => {
    let proceeded = false;
    const immediate = dirtyFormRegistry.requestNavigation(() => {
      proceeded = true;
    }, { reason: "open another module" });

    expect(immediate).toBe(true);
    expect(proceeded).toBe(true);
    expect(dirtyFormRegistry.getSnapshot().pendingNavigation).toBeNull();
  });

  test("Stay preserves the dirty form and cancels navigation", async () => {
    dirtyFormRegistry.register({
      id: "quotation:draft-1",
      label: "Quotation draft",
      dirty: true,
      save: () => true,
      discard: () => true,
    });

    let proceeded = false;
    expect(dirtyFormRegistry.requestNavigation(() => {
      proceeded = true;
    }, { reason: "open another Customer" })).toBe(false);

    expect(dirtyFormRegistry.getSnapshot().pendingNavigation?.reason).toBe("open another Customer");
    expect(await dirtyFormRegistry.resolve("stay")).toBe(true);
    expect(proceeded).toBe(false);
    expect(dirtyFormRegistry.hasDirtyForms()).toBe(true);
    expect(dirtyFormRegistry.getSnapshot().pendingNavigation).toBeNull();
  });

  test("Discard resets every dirty form before navigation proceeds", async () => {
    const discarded: string[] = [];
    for (const id of ["boq:1", "purchase-order:1"]) {
      dirtyFormRegistry.register({
        id,
        label: id,
        dirty: true,
        save: () => true,
        discard: () => {
          discarded.push(id);
          return true;
        },
      });
    }

    let proceeded = false;
    dirtyFormRegistry.requestNavigation(() => {
      proceeded = true;
    });

    expect(await dirtyFormRegistry.resolve("discard")).toBe(true);
    expect(discarded).toEqual(["boq:1", "purchase-order:1"]);
    expect(proceeded).toBe(true);
    expect(dirtyFormRegistry.hasDirtyForms()).toBe(false);
  });

  test("a failed Save keeps the user on the form with an actionable error", async () => {
    dirtyFormRegistry.register({
      id: "customer:edit-1",
      label: "Customer form",
      dirty: true,
      save: () => false,
      discard: () => true,
    });

    let proceeded = false;
    dirtyFormRegistry.requestNavigation(() => {
      proceeded = true;
    });

    expect(await dirtyFormRegistry.resolve("save")).toBe(false);
    expect(proceeded).toBe(false);
    expect(dirtyFormRegistry.hasDirtyForms()).toBe(true);
    expect(dirtyFormRegistry.getSnapshot().pendingNavigation).not.toBeNull();
    expect(dirtyFormRegistry.getSnapshot().error).toContain("Customer form could not be saved");
  });
});

describe("dirty form integration boundaries", () => {
  test("the persistent shell, browser history and document exit guard are wired", async () => {
    const app = await testFile("src/components/urban-castle/UrbanCastleApp.tsx").text();
    const history = await testFile("src/lib/rdash/use-browser-history-sync.ts").text();
    const exitGuard = await testFile("src/lib/uploads/use-workspace-exit-guard.ts").text();
    const header = await testFile("src/components/rdash/WorkspaceHeader.tsx").text();

    expect(app).toContain("useInstallDirtyFormNavigationGuards");
    expect(app).toContain("DirtyFormNavigationGuard");
    expect(app).toContain("LegacyDirtyFormAdapter");
    expect(history).toContain("dirtyFormRegistry.hasDirtyForms()");
    expect(history).toContain('phase: "reverting"');
    expect(exitGuard).toContain("dirtyForms.dirtyForms.length > 0");
    expect(header).toContain('reason: "reload the workspace"');
    expect(header).toContain('reason: "sign out"');
  });

  test("the shared edit dialog registers Save and Discard callbacks", async () => {
    const source = await testFile("src/components/rdash/EditDetailsDialog.tsx").text();
    expect(source).toContain("useDirtyFormRegistration");
    expect(source).toContain("save: persistChanges");
    expect(source).toContain("discard: () =>");
    expect(source).toContain("dirtyFormRegistry.markClean(formId)");
  });

  test("legacy high-risk dialogs use the compatibility registry adapter", async () => {
    const source = await testFile("src/components/urban-castle/LegacyDirtyFormAdapter.tsx").text();

    for (const title of [
      "New quotation",
      "Edit BOQ rate",
      "Create Purchase Order",
      "Direct Award PO",
      "Record vendor bid",
      "Invite contractor bid",
      "Direct Award Contractor",
      "Add New Customer",
      "Edit Customer",
      "Add Site",
      "Edit Site",
      "Record Supplier Invoice",
      "Request contractor payment",
      "Add Staff Operations Profile",
      "Edit Staff Operations Profile",
      "New Approval Policy",
      "Edit Policy",
    ]) {
      expect(source).toContain(title);
    }
    expect(source).toContain('[role="switch"]');
    expect(source).toContain('button[title^="Preview "]');
    expect(source).toContain("selectedButtonValues");
    expect(source).toContain("saveTimeoutMs: 4_000");
    expect(source).toContain("entry.config.saveTimeoutMs");
    expect(source).toContain("syncAllManagedDialogs");
    expect(source).toContain("onFormValueCapture");
    expect(source).toContain("onClickCapture");
    expect(source).toContain("onKeyDownCapture");
    expect(source).toContain("onPointerDownCapture");
    expect(source).toContain("closeBypass");
    expect(source).toContain("requestDialogClose");
    expect(source).toContain("event.stopImmediatePropagation()");
    expect(source).toContain("legacyDialogFingerprint");
    expect(source).toContain("MutationObserver");
    expect(source).toContain("dirtyFormRegistry.register");
    expect(source).toContain("dirtyFormRegistry.markClean(entry.id)");
    expect(source).toContain("waitForDialogClose");
  });
});
