import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * GET /api/changelog
 * Public (no auth — needed before login on the signin page).
 *
 * Reads CHANGELOG.md from the project root, parses it into structured
 * entries (version, date, items with tag/label/description), and returns
 * the latest N entries (default 6) so the signin "What's new" panel can
 * render them without hardcoding.
 *
 * Format expected in CHANGELOG.md:
 *   ## v0.4.2 — Jul 2026
 *
 *   - **FEATURE** — description
 *   - **FIX** — description
 *   - **POLISH** — description
 *
 * The parser is tolerant: lines that don't match are skipped.
 */

interface ChangelogItem {
  tag: "FEATURE" | "FIX" | "POLISH";
  description: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  items: ChangelogItem[];
}

const VALID_TAGS = new Set(["FEATURE", "FIX", "POLISH"]);

function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = markdown.split("\n");
  let current: ChangelogEntry | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Version header: ## v0.4.2 — Jul 2026  (or with em-dash, en-dash, hyphen)
    const versionMatch = line.match(/^##\s+(v?[\d.]+)\s*[—–-]\s*(.+)$/i);
    if (versionMatch) {
      if (current) entries.push(current);
      current = {
        version: versionMatch[1],
        date: versionMatch[2].trim(),
        items: [],
      };
      continue;
    }
    // List item: - **FEATURE** — description
    const itemMatch = line.match(/^-\s+\*\*(FEATURE|FIX|POLISH)\*\*\s*[—–-]\s*(.+)$/i);
    if (itemMatch && current) {
      const tag = itemMatch[1].toUpperCase() as ChangelogItem["tag"];
      if (VALID_TAGS.has(tag)) {
        current.items.push({
          tag,
          description: itemMatch[2].trim(),
        });
      }
      continue;
    }
  }
  if (current) entries.push(current);
  return entries;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "CHANGELOG.md");
    const markdown = await fs.readFile(filePath, "utf-8");
    const entries = parseChangelog(markdown).slice(0, 6);
    return NextResponse.json(
      { status: "ok", entries },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (error) {
    // If the file can't be read, return an empty array so the signin page
    // renders gracefully without the changelog panel.
    return NextResponse.json(
      { status: "ok", entries: [], error: "Changelog unavailable" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
