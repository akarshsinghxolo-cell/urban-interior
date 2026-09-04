import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Source-contract helpers.
 *
 * These tests pin load-bearing implementation details (class tokens, handler
 * names, security-relevant literals, wiring imports) by reading repository
 * source files. Exact substring matching couples every such pin to the file's
 * formatting, so matching happens on whitespace-collapsed text instead: the
 * contract survives re-indenting, re-wrapping and attribute reordering, while
 * every required token still has to be present (forbidden ones still absent).
 */

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Read a repository-relative file as UTF-8 text. Throws when it is missing. */
export function readSrc(repoRelativePath: string): string {
  return readFileSync(join(REPOSITORY_ROOT, repoRelativePath), "utf8");
}

/** Collapse every whitespace run to a single space and trim the ends. */
export function collapse(ws: string): string {
  return ws.replace(/\s+/g, " ").trim();
}

function findMissingTokens(source: string, tokens: string[]): string[] {
  const haystack = collapse(source);
  return tokens
    .map((token) => collapse(token))
    .filter((token) => token.length > 0 && !haystack.includes(token));
}

/**
 * Assert every token occurs in the whitespace-collapsed source. Multi-word
 * tokens must appear as a phrase (single spaces); single-word tokens may sit
 * anywhere in the file. On failure the error names every missing token.
 */
export function expectTokens(source: string, tokens: string[]): void {
  const missing = findMissingTokens(source, tokens);
  if (missing.length > 0) {
    throw new Error(
      `source contract violated — missing token(s): ${missing
        .map((token) => JSON.stringify(token))
        .join(", ")}`,
    );
  }
}

/**
 * Assert none of the tokens occur in the whitespace-collapsed source. On
 * failure the error names every forbidden token that is still present.
 */
export function expectNoTokens(source: string, tokens: string[]): void {
  const haystack = collapse(source);
  const present = tokens
    .map((token) => collapse(token))
    .filter((token) => token.length > 0 && haystack.includes(token));
  if (present.length > 0) {
    throw new Error(
      `source contract violated — forbidden token(s) present: ${present
        .map((token) => JSON.stringify(token))
        .join(", ")}`,
    );
  }
}
