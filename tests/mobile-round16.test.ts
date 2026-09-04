import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

/**
 * Task 26/27 re-land: mobile horizontal overflow fixes at 390px.
 *
 * Root causes pinned here (all verified in-browser at 390px in the original
 * round): grid/flex items with `min-width:auto` refusing to shrink, scroll
 * hosts only clamping overflow-y so wide atoms scrolled the whole panel, a
 * fixed `min-w-40` select inside a non-wrapping flex row, a nowrap header
 * button feeding min-content into a dialog grid track, and the Customer
 * Timeline two-pane grid items growing past their 374px track.
 */
describe("Mobile round 16 — drawer / dialog overflow fixes", () => {
  test("DetailPanel drawer body clamps horizontal overflow and header actions keep their size", async () => {
    const panel = await source("src/components/rdash/DetailPanel.tsx");
    expect(panel).toContain(
      '<div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden rd-scroll">',
    );
    expect(panel).toContain('<div className="flex shrink-0 items-center gap-0.5">');
  });

  test("CustomerSitesDialog body hides horizontal overflow and the form can shrink as a grid item", async () => {
    const dialog = await source("src/components/rdash/CustomerSitesDialog.tsx");
    expect(dialog).toContain(
      'className="max-h-[75vh] space-y-5 overflow-y-auto overflow-x-hidden px-5 py-4 rd-scroll"',
    );
    expect(dialog).toContain('<form className="min-w-0" onSubmit=');
  });

  test("CustomerSiteDraftCard header button no longer contributes nowrap min-content", async () => {
    const card = await source("src/components/rdash/CustomerSiteDraftCard.tsx");
    expect(card).toContain(
      'className="w-0 min-w-0 flex-1 flex items-center gap-2 text-left"',
    );
  });

  test("CustomerWorkRequiredDraftSection select shrinks instead of forcing a min-w-40 track", async () => {
    const section = await source("src/components/rdash/CustomerWorkRequiredDraftSection.tsx");
    expect(section).toContain("w-auto min-w-0 max-w-full shrink basis-28");
    expect(section).not.toContain("min-w-40");
  });

  test("ThreadPanel LineItemTable scrolls horizontally inside its own wrapper", async () => {
    const thread = await source("src/components/rdash/ThreadPanel.tsx");
    expect(thread).toContain('className="rd-scroll overflow-x-auto rounded-lg border border-border"');
  });

  test("RDashApp module content host clamps horizontal overflow", async () => {
    const app = await source("src/components/rdash/RDashApp.tsx");
    expect(app).toContain(
      'className="rd-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0"',
    );
  });
});

describe("Mobile round 16 — Customer Desk scope / advances / capture sheet", () => {
  test("scope site header shrinks: min-w-0 card + header, truncating title, shrink-0 counters", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain(
      'className="min-w-0 rounded-md border border-border bg-muted/20 p-2.5"',
    );
    expect(desk).toContain('className="flex min-w-0 items-start justify-between gap-2"');
    expect(desk).toContain('className="break-words text-xs font-semibold truncate"');
    expect(desk).toContain(
      'className="shrink-0 text-[10px] text-muted-foreground">{scopedAreas.length}',
    );
  });

  test("scope work rows stack in a column instead of forcing wide grid tracks", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain('<div className="mt-2 flex flex-col gap-1">');
  });

  test("Work Required block header keeps its trailing button from forcing width", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain('className="flex min-w-0 items-center justify-between gap-2"');
    expect(desk).toContain('className="h-7 shrink-0 text-xs"');
  });

  test("advances grid and rows can shrink (min-w-0 items)", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain('className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3"');
    expect(desk).toContain(
      'className="min-w-0 rounded-lg border border-border bg-background px-3 py-2"',
    );
    expect(desk).toContain('className="flex min-w-0 items-center justify-between gap-2"');
    expect(desk).toContain('className="min-w-0">\n                        <p className="text-sm font-medium">');
  });

  test("capture detailed area sheet: header min-w-0, body overflow-x-hidden, footer wraps", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain(
      'className="flex min-w-0 items-center justify-between border-b border-border px-5 py-3"',
    );
    expect(desk).toContain(
      'className="max-h-[60vh] overflow-y-auto overflow-x-hidden px-5 py-4 rd-scroll"',
    );
    expect(desk).toContain(
      'className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3',
    );
    expect(desk).toContain('cn("min-w-0 text-[11px]", canSave || idle ?');
  });

  test("Customer Timeline two-pane grid panes can shrink below their min-content", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    // Do NOT "fix" the minmax( class: it is byte-valid grid-cols-[minmax(...)].
    expect(desk).toContain('grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]');
    // BOTH panes (list + timeline detail) must be shrinkable grid items.
    expect((desk.match(/className="flex min-w-0 flex-col gap-3"/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
