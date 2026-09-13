import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

/**
 * Mobile horizontal-overflow contracts at 390px.
 */
describe("Mobile round 16 — drawer / dialog overflow fixes", () => {
  test("DetailPanel drawer body clamps horizontal overflow and header actions keep their size", async () => {
    const panel = await source("src/components/rdash/DetailPanel.tsx");
    expectTokens(panel, ['<div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden rd-scroll">']);
    expectTokens(panel, ['<div className="flex shrink-0 items-center gap-0.5">']);
  });

  test("CustomerSitesDialog body hides horizontal overflow and the form can shrink as a grid item", async () => {
    const dialog = await source("src/components/rdash/CustomerSitesDialog.tsx");
    expectTokens(dialog, ['className="max-h-[75vh] space-y-5 overflow-y-auto overflow-x-hidden px-5 py-4 rd-scroll"']);
    expectTokens(dialog, ['<form className="min-w-0" onSubmit=']);
  });

  test("CustomerSiteDraftCard header button no longer contributes nowrap min-content", async () => {
    const card = await source("src/components/rdash/CustomerSiteDraftCard.tsx");
    expectTokens(card, ['className="w-0 min-w-0 flex-1 flex items-center gap-2 text-left"']);
  });

  test("CustomerWorkRequiredDraftSection select shrinks instead of forcing a min-w-40 track", async () => {
    const section = await source("src/components/rdash/CustomerWorkRequiredDraftSection.tsx");
    expectTokens(section, ["w-auto min-w-0 max-w-full shrink basis-28"]);
    expect(section).not.toContain("min-w-40");
  });

  test("ThreadPanel LineItemTable scrolls horizontally inside its own wrapper", async () => {
    const thread = await source("src/components/rdash/ThreadPanel.tsx");
    expectTokens(thread, ['className="rd-scroll overflow-x-auto rounded-lg border border-border"']);
  });

  test("RDashApp module content host clamps horizontal overflow", async () => {
    const app = await source("src/components/rdash/RDashApp.tsx");
    expectTokens(app, ['className="rd-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0"']);
  });
});

describe("Mobile round 16 — lean Customer Desk", () => {
  test("customer cards and drawer identity blocks can shrink", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expectTokens(desk, ['<div className="min-w-0 flex-1">']);
    expectTokens(desk, ['<p className="min-w-0 flex-1 truncate text-sm font-bold">']);
    expectTokens(desk, ['<div className="flex min-w-0 flex-1 items-start gap-3">']);
  });

  test("customer tabs scroll inside their own horizontal strip", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expectTokens(desk, ["overflow-x-auto border-b border-border"]);
    expectTokens(desk, ["rd-scroll rd-scroll-fade"]);
  });

  test("Customer Timeline panes use minmax tracks and shrinkable content", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expectTokens(desk, ["grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"]);
    expectTokens(desk, ['<div className="flex min-w-0 flex-col gap-3">']);
    expectTokens(desk, ['<div className="min-w-0">']);
  });

  test("finance sheets stay retired while detailed work capture is isolated in its own responsive dialog", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    const capture = await source("src/components/rdash/CustomerWorkCaptureDialog.tsx");
    for (const retired of ["advances", "liabilities", "RecordPaymentDialog"]) {
      expect(desk).not.toContain(retired);
    }
    expect(desk).toContain("CustomerWorkCaptureDialog");
    expect(capture).toContain('className="max-h-[94vh] overflow-hidden p-0 sm:max-w-4xl"');
    expect(capture).toContain('className="rd-scroll max-h-[68vh] space-y-2 overflow-y-auto px-5 py-4"');
  });
});
