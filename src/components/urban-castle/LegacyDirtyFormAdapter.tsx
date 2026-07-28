"use client";

import * as React from "react";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";

interface LegacyDialogConfig {
  title: RegExp;
  label: string;
  saveButton: RegExp;
  cancelButton?: RegExp;
}

const LEGACY_DIALOG_CONFIGS: readonly LegacyDialogConfig[] = [
  {
    title: /^New quotation$/i,
    label: "Quotation draft",
    saveButton: /^Create quotation$/i,
  },
  {
    title: /^Edit BOQ rate$/i,
    label: "BOQ rate edit",
    saveButton: /^Save rate$/i,
  },
  {
    title: /^Create Purchase Order$/i,
    label: "Purchase Order form",
    saveButton: /^Create PO(?:\s*&\s*update rates)?$/i,
  },
  {
    title: /^Direct Award PO$/i,
    label: "Direct Award Purchase Order",
    saveButton: /^Create direct-award PO$/i,
  },
  {
    title: /^Record vendor bid$/i,
    label: "Vendor bid form",
    saveButton: /^Record bid$/i,
  },
  {
    title: /^Record Article-wise Vendor Bid$/i,
    label: "Vendor bid form",
    saveButton: /^Record bid$/i,
  },
  {
    title: /^Invite contractor bid\b/i,
    label: "Contractor bid form",
    saveButton: /^Record bid$/i,
  },
  {
    title: /^Direct Award Contractor\b/i,
    label: "Direct Award Contractor form",
    saveButton: /^Create direct-award Work Order$/i,
  },
  {
    title: /^Add New Customer$/i,
    label: "Customer form",
    saveButton: /^Create customer$/i,
  },
  {
    title: /^Edit Customer$/i,
    label: "Customer form",
    saveButton: /^Save changes$/i,
  },
  {
    title: /^Add Site$/i,
    label: "Site form",
    saveButton: /^Add Site$/i,
  },
  {
    title: /^Edit Site$/i,
    label: "Site form",
    saveButton: /^Save Site$/i,
  },
  {
    title: /^Record Supplier Invoice$/i,
    label: "Vendor bill form",
    saveButton: /^Create draft invoice$/i,
  },
  {
    title: /^Request contractor payment$/i,
    label: "Contractor RA bill form",
    saveButton: /^Submit bill$/i,
  },
  {
    title: /^Add Staff Operations Profile$/i,
    label: "Staff Operations profile",
    saveButton: /^Create staff$/i,
  },
  {
    title: /^Edit Staff Operations Profile$/i,
    label: "Staff Operations profile",
    saveButton: /^Save changes$/i,
  },
  {
    title: /^New Approval Policy$/i,
    label: "Approval Policy form",
    saveButton: /^Create Policy$/i,
  },
  {
    title: /^Edit Policy$/i,
    label: "Approval Policy form",
    saveButton: /^Save Changes$/i,
  },
] as const;

const DEFAULT_CANCEL_BUTTON = /^(?:Cancel|Close)$/i;
const CONTROL_SELECTOR = [
  'input:not([type="hidden"])',
  "textarea",
  "select",
  '[role="combobox"]',
  '[role="switch"]',
  'button[aria-pressed]',
  'button[title^="Preview "]',
].join(",");

interface ManagedLegacyDialog {
  id: string;
  dialog: HTMLElement;
  config: LegacyDialogConfig;
  baseline: string;
  unregister: () => void;
}

function normalizedText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dialogTitle(dialog: HTMLElement): string {
  const title = dialog.querySelector<HTMLElement>(
    '[data-slot="dialog-title"], [role="heading"], h2',
  );
  return normalizedText(title?.textContent);
}

function dialogConfig(title: string): LegacyDialogConfig | undefined {
  return LEGACY_DIALOG_CONFIGS.find((config) => {
    config.title.lastIndex = 0;
    return config.title.test(title);
  });
}

function controlValue(control: Element): unknown {
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox" || control.type === "radio") {
      return [control.tagName, control.type, control.name, control.checked];
    }
    if (control.type === "file") {
      return [
        control.tagName,
        control.type,
        control.name,
        [...(control.files || [])].map((file) => [file.name, file.size, file.lastModified]),
      ];
    }
    return [control.tagName, control.type, control.name, control.value];
  }
  if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
    return [control.tagName, control.getAttribute("name") || "", control.value];
  }
  return [
    control.tagName,
    control.getAttribute("role") || "",
    control.getAttribute("aria-label") || control.getAttribute("name") || "",
    control.getAttribute("aria-checked") || "",
    control.getAttribute("aria-pressed") || "",
    control.getAttribute("data-state") || "",
    control.getAttribute("title") || "",
    normalizedText(control.textContent),
  ];
}

function selectedButtonValues(dialog: HTMLElement): unknown[] {
  return Array.from(dialog.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    .filter((button) => {
      if (button.getAttribute("aria-pressed") === "true") return true;
      if (button.getAttribute("aria-checked") === "true") return true;
      if (button.getAttribute("data-state") === "checked") return true;
      const classes = button.className;
      return typeof classes === "string" &&
        classes.includes("bg-primary") &&
        classes.includes("text-primary-foreground");
    })
    .map((button) => [
      button.getAttribute("aria-label") || "",
      button.getAttribute("data-state") || "",
      normalizedText(button.textContent),
    ]);
}

export function legacyDialogFingerprint(dialog: HTMLElement): string {
  const controls = Array.from(dialog.querySelectorAll(CONTROL_SELECTOR));
  return JSON.stringify({
    controls: controls.map(controlValue),
    selectedButtons: selectedButtonValues(dialog),
  });
}

function buttonWithText(dialog: HTMLElement, pattern: RegExp): HTMLButtonElement | undefined {
  return Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => {
      pattern.lastIndex = 0;
      return pattern.test(normalizedText(button.textContent));
    });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForDialogClose(dialog: HTMLElement, timeoutMs = 900): Promise<boolean> {
  const attempts = Math.max(1, Math.ceil(timeoutMs / 50));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(50);
    if (!dialog.isConnected) return true;
  }
  return !dialog.isConnected;
}

/**
 * Compatibility bridge for large legacy dialogs that still own their form state
 * locally. It registers only named high-risk forms, delegates Save to the form's
 * existing validated submit button, and treats Save as successful only when the
 * dialog actually closes. Explicit component integrations can replace entries
 * incrementally without changing the shared registry or navigation guard.
 */
export function LegacyDirtyFormAdapter(): null {
  React.useEffect(() => {
    const managed = new Map<HTMLElement, ManagedLegacyDialog>();
    const pending = new WeakSet<HTMLElement>();
    let sequence = 0;
    let scanFrame: number | null = null;

    const syncManagedDialog = (entry: ManagedLegacyDialog) => {
      if (!entry.dialog.isConnected) return;
      dirtyFormRegistry.update(entry.id, {
        dirty: legacyDialogFingerprint(entry.dialog) !== entry.baseline,
      });
    };

    const saveManagedDialog = async (entry: ManagedLegacyDialog): Promise<boolean> => {
      if (!entry.dialog.isConnected) return true;
      const button = buttonWithText(entry.dialog, entry.config.saveButton);
      if (!button || button.disabled) return false;

      // Allow the form's own successful submit handler to close/navigate without
      // opening a nested dirty-form decision. Failed validation restores dirty.
      dirtyFormRegistry.markClean(entry.id);
      button.click();
      if (await waitForDialogClose(entry.dialog)) return true;

      syncManagedDialog(entry);
      return false;
    };

    const discardManagedDialog = async (entry: ManagedLegacyDialog): Promise<boolean> => {
      if (!entry.dialog.isConnected) return true;
      const button = buttonWithText(
        entry.dialog,
        entry.config.cancelButton || DEFAULT_CANCEL_BUTTON,
      );
      if (!button || button.disabled) return false;

      // Discard means abandon the local component state by closing the dialog.
      // Mark it clean first so its existing close handler is not guarded again.
      dirtyFormRegistry.markClean(entry.id);
      button.click();
      if (await waitForDialogClose(entry.dialog, 500)) return true;

      syncManagedDialog(entry);
      return false;
    };

    const registerDialog = (dialog: HTMLElement) => {
      pending.delete(dialog);
      if (!dialog.isConnected || managed.has(dialog)) return;
      const title = dialogTitle(dialog);
      const config = dialogConfig(title);
      if (!config) return;

      sequence += 1;
      const entry = {
        id: `legacy-dirty-form:${sequence}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        dialog,
        config,
        baseline: legacyDialogFingerprint(dialog),
        unregister: () => {},
      } satisfies ManagedLegacyDialog;

      entry.unregister = dirtyFormRegistry.register({
        id: entry.id,
        label: config.label,
        dirty: false,
        save: () => saveManagedDialog(entry),
        discard: () => discardManagedDialog(entry),
      });
      managed.set(dialog, entry);
    };

    const scheduleRegistration = (dialog: HTMLElement) => {
      if (pending.has(dialog) || managed.has(dialog)) return;
      pending.add(dialog);
      // React effects populate prefilled values after the first commit. Two
      // animation frames keep those defaults in the clean baseline.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => registerDialog(dialog));
      });
    };

    const scan = () => {
      scanFrame = null;
      for (const [dialog, entry] of managed) {
        if (!dialog.isConnected) {
          entry.unregister();
          managed.delete(dialog);
        } else {
          syncManagedDialog(entry);
        }
      }

      for (const dialog of document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      )) {
        if (dialogConfig(dialogTitle(dialog))) scheduleRegistration(dialog);
      }
    };

    const scheduleScan = () => {
      if (scanFrame !== null) return;
      scanFrame = window.requestAnimationFrame(scan);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener("input", scheduleScan, true);
    document.addEventListener("change", scheduleScan, true);
    document.addEventListener("click", scheduleScan, true);
    scheduleScan();

    return () => {
      observer.disconnect();
      document.removeEventListener("input", scheduleScan, true);
      document.removeEventListener("change", scheduleScan, true);
      document.removeEventListener("click", scheduleScan, true);
      if (scanFrame !== null) window.cancelAnimationFrame(scanFrame);
      for (const entry of managed.values()) entry.unregister();
      managed.clear();
    };
  }, []);

  return null;
}
