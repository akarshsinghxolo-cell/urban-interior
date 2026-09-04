import { resolve } from "node:path";

/**
 * Shared e2e filesystem constants.
 * Resolved from process.cwd() because Playwright compiles specs to CJS
 * (import.meta is unavailable) and always runs from the repo root.
 */
export const STORAGE_STATE_PATH = resolve(process.cwd(), "test-results", ".auth", "owner.json");
