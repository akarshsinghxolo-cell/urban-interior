#!/usr/bin/env bun
/**
 * QA mock Supabase stack — GoTrue + PostgREST + workspace RPCs in one Bun process.
 *
 * Purpose: durable local QA backend for urban-castle so browser QA never needs
 * cloud credentials. Start with `bun run qa:mock` (listens on 127.0.0.1:3210).
 *
 * The in-memory database IS the canonical seed: `buildSeedDatabase()` from
 * src/lib/rdash/seed.ts is flattened into PostgREST-style entity tables
 * (entity_<collection> rows shaped {id, workspace_id, revision, updated_at,
 * updated_by, data}).
 *
 * Surface emulated (everything the Next.js server calls via supabase-js):
 * - GoTrue:  POST /auth/v1/token?grant_type=password|refresh_token,
 *            GET /auth/v1/user, POST /auth/v1/logout,
 *            GET/POST /auth/v1/admin/users, GET/PUT/DELETE /auth/v1/admin/users/:id
 * - PostgREST: GET/HEAD/POST/PATCH/DELETE /rest/v1/:table with select
 *            projections (incl. `alias:data->field` / `data->>key` json paths),
 *            filters eq/neq/gt/gte/lt/lte/in/is/like/ilike (plus `not.` prefix
 *            and `or=`), order/limit/offset (supabase-js `.range()` emits
 *            offset/limit), `Prefer: count=exact` via Content-Range,
 *            `return=representation`, `resolution=merge-duplicates` upserts,
 *            `columns=` projection and 23505 duplicate handling, unknown-table
 *            auto-create on write (uc_workspace_operations receipts, uc_upload_*,
 *            uc_drive_folders, GenericRecord, ...). The generated column
 *            entity_master_staff.auth_user_id_gen is always re-derived from
 *            data.auth_user_id and never required in writes.
 * - RPCs:    commit_workspace_operations (workspace + row CAS, receipts),
 *            get_workspace_health_summary_v2, sync_staff_identity_bundle,
 *            get_auth_user_by_email, uc_bump_workspace_revision.
 *
 * QA identities (seeded staff, ANY password accepted):
 *   owner@urban.test  ops@urban.test  field@urban.test
 *   finance@urban.test  sales@urban.test  procurement@urban.test
 */

import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { COLLECTION_TO_TABLE } from "../src/lib/rdash/server/commit-rest";

const PORT = Number(process.env.QA_MOCK_PORT || 3210);
const HOST = "127.0.0.1";
const WORKSPACE_ID = process.env.UC_WORKSPACE_ID || "default";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ utils */

const nowIso = () => new Date().toISOString();

function deterministicUuid(seed: string): string {
  const h = new Bun.CryptoHasher("md5").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeJwtPayload(token: string): Row | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Row;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- database */

const tables = new Map<string, Row[]>();

const STATIC_AUX_TABLES = [
  "entity_workspace_revision",
  "entity_workspace_change_batches",
  "uc_user_roles",
  "uc_workspace_operations",
  "uc_upload_items",
  "uc_upload_batches",
  "uc_upload_events",
  "uc_drive_folders",
  "GenericRecord",
  "StaffRouteBundle",
];

/** Canonical entity_* tables from the workspace collection registry. */
const CANONICAL_ENTITY_TABLES = new Set(Object.values(COLLECTION_TO_TABLE));

let seedRowCount = 0;

/* -------------------------------------------------------- QA auth identities */

const QA_IDENTITY_BY_STAFF: Record<string, string> = {
  "staff-owner": "owner@urban.test",
  "staff-ops": "ops@urban.test",
  "staff-field": "field@urban.test",
  "staff-finance": "finance@urban.test",
  "staff-sales": "sales@urban.test",
  "staff-procurement": "procurement@urban.test",
};

interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  userMetadata: Row;
}

const authUsers = new Map<string, AuthUserRecord>(); // auth user id -> user
const emailToUserId = new Map<string, string>(); // email -> auth user id
const refreshTokens = new Map<string, string>(); // refresh token -> auth user id

function goTrueUser(user: AuthUserRecord, at: string): Row {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.createdAt,
    phone: "",
    confirmed_at: user.createdAt,
    last_sign_in_at: at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.userMetadata,
    identities: [],
    created_at: user.createdAt,
    updated_at: at,
  };
}

function issueSession(user: AuthUserRecord): Row {
  const at = nowIso();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const refreshToken = `qa-refresh-${crypto.randomUUID()}`;
  refreshTokens.set(refreshToken, user.id);
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: "authenticated",
    aud: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.userMetadata,
    session_id: deterministicUuid(`qa-session:${user.id}:${expiresAt}`),
    iat: Math.floor(Date.now() / 1000),
    exp: expiresAt,
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return {
    access_token: `${header}.${body}.qa-mock-signature`,
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 7,
    expires_at: expiresAt,
    refresh_token: refreshToken,
    user: goTrueUser(user, at),
  };
}

function authError(status: number, errorCode: string, msg: string): Response {
  return Response.json({ code: status, error_code: errorCode, msg }, { status });
}

/* ------------------------------------------------------------------ seeding */

function refreshGeneratedColumns(table: string, row: Row): void {
  // entity_master_staff.auth_user_id_gen is GENERATED ALWAYS AS
  // (nullif(data->>'auth_user_id','')) STORED in the real database.
  if (table === "entity_master_staff") {
    const data = row.data as Row | null;
    const authId = data && typeof data === "object" && data.auth_user_id ? String(data.auth_user_id) : null;
    row.auth_user_id_gen = authId;
  }
}

function seedDatabase(): void {
  const seedData = buildSeedDatabase() as unknown as Record<string, unknown>;
  const master = (seedData.master ?? {}) as Record<string, unknown>;
  const seededAt = nowIso();

  for (const [collection, table] of Object.entries(COLLECTION_TO_TABLE)) {
    const source = collection.startsWith("master.")
      ? (master[collection.slice("master.".length)] as Row[] | undefined)
      : (seedData[collection] as Row[] | undefined);
    const rows: Row[] = [];
    for (const raw of Array.isArray(source) ? source : []) {
      const data = clone(raw as Row) as Row;
      const row: Row = {
        id: String(data.id ?? deterministicUuid(`${table}:${rows.length}`)),
        workspace_id: WORKSPACE_ID,
        revision: 1,
        updated_at: typeof data.updated_at === "string" ? data.updated_at : seededAt,
        updated_by: null,
        data,
      };
      refreshGeneratedColumns(table, row);
      rows.push(row);
      seedRowCount += 1;
    }
    tables.set(table, rows);
  }

  // Bind QA emails to seeded staff records exactly the way
  // sync_staff_identity_bundle would (data.auth_user_id + generated column),
  // and create matching active uc_user_roles assignments.
  const staff = tables.get("entity_master_staff") ?? [];
  const roleRows = tables.get("uc_user_roles") ?? tables.set("uc_user_roles", []).get("uc_user_roles")!;
  for (const row of staff) {
    const staffId = String(row.id);
    const email = QA_IDENTITY_BY_STAFF[staffId];
    if (!email) continue;
    const data = row.data as Row;
    const userId = deterministicUuid(`qa-auth:${staffId}`);
    data.auth_user_id = userId;
    data.login_email = email;
    data.login_enabled = true;
    row.auth_user_id_gen = userId;
    authUsers.set(userId, {
      id: userId,
      email,
      name: String(data.name || staffId),
      createdAt: new Date(Date.now() - 90 * 86400_000).toISOString(),
      userMetadata: { full_name: String(data.name || staffId) },
    });
    emailToUserId.set(email, userId);
    roleRows.push({
      id: deterministicUuid(`qa-role:${staffId}`),
      user_id: userId,
      email,
      role: String(data.role_key || "OWNER"),
      staff_id: staffId,
      display_name: String(data.name || staffId),
      status: "active",
      approved_by: null,
      approved_at: new Date(Date.now() - 89 * 86400_000).toISOString(),
      rejected_at: null,
      created_at: new Date(Date.now() - 90 * 86400_000).toISOString(),
      updated_at: new Date(Date.now() - 89 * 86400_000).toISOString(),
    });
  }

  tables.set("entity_workspace_revision", [
    { id: WORKSPACE_ID, workspace_id: WORKSPACE_ID, revision: 0, updated_at: seededAt },
  ]);
  for (const table of STATIC_AUX_TABLES) {
    if (!tables.has(table)) tables.set(table, []);
  }
}

function totalRowCount(): number {
  let total = 0;
  for (const rows of tables.values()) total += rows.length;
  return total;
}

/* ----------------------------------------------------- PostgREST: filtering */

const RESERVED_QUERY_KEYS = new Set(["select", "order", "limit", "offset", "or", "columns", "on_conflict", "apikey"]);
const OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"] as const;
type Operator = (typeof OPERATORS)[number];

interface Filter {
  path: string;
  op: Operator;
  value: string;
  negated: boolean;
}

const FILTER_OP_PATTERN = "(not\\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)";

function parseFilterTerm(term: string, separator: "=" | "." = "."): Filter | null {
  // Query params use `column=op.value`; `or=(...)` terms use `column.op.value`.
  const escaped = separator === "=" ? "=" : "\\.";
  const match = term.match(new RegExp(`^(.*?)${escaped}${FILTER_OP_PATTERN}\\.([\\s\\S]*)$`));
  if (!match) return null;
  return {
    path: match[1],
    op: match[3] as Operator,
    value: match[4],
    negated: Boolean(match[2]),
  };
}

function parseInList(raw: string): string[] {
  const body = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
  const values: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  for (const ch of body) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const ch of input) {
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
      continue;
    }
    if (!quoted) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Resolve `col`, `data->key`, `data->>key`, `data->a->b` style paths. */
function resolvePath(row: Row, path: string): unknown {
  const segments = path.split("->");
  let value: unknown = row[segments[0]];
  for (let i = 1; i < segments.length; i += 1) {
    const raw = segments[i];
    const asText = raw.startsWith(">");
    const key = asText ? raw.slice(1) : raw;
    if (value === null || value === undefined || typeof value !== "object") return null;
    value = (value as Row)[key];
    if (asText && value !== null && value !== undefined) {
      value = typeof value === "object" ? JSON.stringify(value) : String(value);
    }
  }
  return value;
}

function comparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function compareValues(actual: unknown, expected: string, op: Operator): boolean | null {
  const left = comparable(actual);
  if (op === "is") {
    if (expected === "null") return left === null;
    if (expected === "true") return left === true;
    if (expected === "false") return left === false;
    return left === expected;
  }
  if (left === null) return null;
  if (op === "eq") return String(left) === expected;
  if (op === "neq") return String(left) !== expected;
  if (op === "in") return parseInList(expected).includes(String(left));
  if (op === "like" || op === "ilike") {
    const pattern = expected
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    const flags = op === "ilike" ? "i" : "";
    return new RegExp(`^${pattern}$`, flags).test(String(left));
  }
  const leftNumber = Number(left);
  const rightNumber = Number(expected);
  const numeric =
    typeof left === "number" &&
    expected.trim() !== "" &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber);
  if (numeric) {
    if (op === "gt") return leftNumber > rightNumber;
    if (op === "gte") return leftNumber >= rightNumber;
    if (op === "lt") return leftNumber < rightNumber;
    if (op === "lte") return leftNumber <= rightNumber;
  }
  const leftText = String(left);
  if (op === "gt") return leftText > expected;
  if (op === "gte") return leftText >= expected;
  if (op === "lt") return leftText < expected;
  if (op === "lte") return leftText <= expected;
  return null;
}

function rowMatchesFilter(row: Row, filter: Filter): boolean {
  const result = compareValues(resolvePath(row, filter.path), filter.value, filter.op);
  const matched = result === null ? false : result;
  return filter.negated ? !matched : matched;
}

function parseQueryFilters(url: URL): Filter[] {
  const filters: Filter[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (RESERVED_QUERY_KEYS.has(key)) continue;
    const filter = parseFilterTerm(`${key}=${value}`, "=");
    if (filter) filters.push(filter);
  }
  return filters;
}

function parseOrFilters(url: URL): Filter[] {
  const orValue = url.searchParams.get("or");
  if (!orValue) return [];
  const filters: Filter[] = [];
  for (const term of splitTopLevel(orValue)) {
    const filter = parseFilterTerm(term.trim());
    if (filter) filters.push(filter);
  }
  return filters;
}

/* ------------------------------------------------------ PostgREST: ordering */

interface OrderKey {
  path: string;
  descending: boolean;
  nullsFirst?: boolean;
}

function parseOrder(orderValue: string | null): OrderKey[] {
  if (!orderValue) return [];
  return orderValue.split(",").map((part) => {
    const tokens = part.trim().split(".");
    const key: OrderKey = { path: tokens[0], descending: tokens[1] === "desc" };
    if (tokens[2] === "nullsfirst") key.nullsFirst = true;
    if (tokens[2] === "nullslast") key.nullsFirst = false;
    return key;
  });
}

function sortRows(rows: Row[], keys: OrderKey[]): Row[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const key of keys) {
      const va = comparable(resolvePath(a, key.path));
      const vb = comparable(resolvePath(b, key.path));
      if (va === null && vb === null) continue;
      // SQL default: NULLS LAST for ASC, NULLS FIRST for DESC.
      const nullsFirst = key.nullsFirst ?? key.descending;
      if (va === null) return nullsFirst ? -1 : 1;
      if (vb === null) return nullsFirst ? 1 : -1;
      if (va === vb) continue;
      let result: number;
      if (typeof va === "number" && typeof vb === "number") result = va - vb;
      else result = String(va) < String(vb) ? -1 : 1;
      return key.descending ? -result : result;
    }
    return 0;
  });
  return sorted;
}

/* ------------------------------------------------------ PostgREST: selecting */

type SelectItem = { alias: string; path: string } | "*";

function parseSelect(spec: string | null): SelectItem[] {
  if (!spec || spec.trim() === "" || spec.trim() === "*") return ["*"];
  const items: SelectItem[] = [];
  for (const raw of spec.split(",")) {
    const item = raw.trim();
    if (!item) continue;
    if (item === "*") {
      items.push("*");
      continue;
    }
    const colon = item.indexOf(":");
    if (colon > 0) items.push({ alias: item.slice(0, colon).trim(), path: item.slice(colon + 1).trim() });
    else items.push({ alias: item, path: item });
  }
  return items.length ? items : ["*"];
}

function projectRow(row: Row, items: SelectItem[]): Row {
  if (items.includes("*")) return clone(row);
  const out: Row = {};
  for (const item of items) {
    if (item === "*") continue;
    out[item.alias] = clone(resolvePath(row, item.path) ?? null);
  }
  return out;
}

/* ----------------------------------------------------------------- response */

function jsonResponse(body: unknown, status: number, headers?: Headers, isHead = false): Response {
  const text = body === null || body === undefined ? "null" : JSON.stringify(body);
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("Content-Type")) responseHeaders.set("Content-Type", "application/json");
  if (isHead) {
    responseHeaders.set("Content-Length", String(text.length));
    return new Response(null, { status, headers: responseHeaders });
  }
  return new Response(text, { status, headers: responseHeaders });
}

function postgrestError(status: number, code: string, message: string, details: string | null = null): Response {
  return Response.json({ code, message, details, hint: null }, { status });
}

function rowsResponse(rows: Row[], url: URL, req: Request, offset: number, total: number): Response {
  const items = parseSelect(url.searchParams.get("select"));
  const accept = req.headers.get("accept") || "";
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Content-Range", total === 0 ? `*/${total}` : `${offset}-${offset + rows.length - 1}/${total}`);
  const projected = rows.map((row) => projectRow(row, items));
  if (accept.includes("application/vnd.pgrst.object+json")) {
    // .single() / .maybeSingle() semantics
    if (projected.length > 1) {
      return jsonResponse(
        {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `Results contain ${projected.length} rows`,
          hint: null,
        },
        406,
        headers,
      );
    }
    return jsonResponse(projected.length === 1 ? projected[0] : null, 200, headers, req.method === "HEAD");
  }
  return jsonResponse(projected, 200, headers, req.method === "HEAD");
}

/* --------------------------------------------------------- PostgREST: reads */

function readRows(req: Request, url: URL, table: string, source?: Row[]): Response {
  const rows = source ?? tables.get(table) ?? [];
  const filters = [...parseQueryFilters(url), ...parseOrFilters(url)];
  const matched = rows.filter((row) => filters.every((filter) => rowMatchesFilter(row, filter)));
  const total = matched.length;

  const ordered = sortRows(matched, parseOrder(url.searchParams.get("order")));
  let offset = Number(url.searchParams.get("offset") || 0) || 0;
  let limitRaw = url.searchParams.get("limit");
  const rangeHeader = req.headers.get("range");
  if (limitRaw === null && rangeHeader && /^\d+-\d+$/.test(rangeHeader.trim())) {
    const [start, end] = rangeHeader.trim().split("-").map(Number);
    offset = start;
    limitRaw = String(end - start + 1);
  }
  const limit = limitRaw === null ? undefined : Math.max(0, Number(limitRaw) || 0);
  const page = limit === undefined ? ordered.slice(offset) : ordered.slice(offset, offset + limit);
  return rowsResponse(page, url, req, offset, total);
}

/* --------------------------------------------------------- PostgREST: writes */

const isEntityTable = (table: string) => CANONICAL_ENTITY_TABLES.has(table);

function cleanPayload(input: Row, table: string, allowedColumns: string[] | null): Row {
  const payload: Row = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (allowedColumns && !allowedColumns.includes(key)) continue;
    if (table === "entity_master_staff" && key === "auth_user_id_gen") continue; // generated column
    payload[key] = value;
  }
  return payload;
}

function applyEntityDefaults(table: string, payload: Row): Row {
  if (!isEntityTable(table)) return payload;
  const merged: Row = { ...payload };
  if (typeof merged.data === "string") {
    try {
      merged.data = JSON.parse(merged.data);
    } catch {
      /* keep as string */
    }
  }
  if (!merged.data || typeof merged.data !== "object") merged.data = {};
  if (merged.workspace_id === undefined) merged.workspace_id = WORKSPACE_ID;
  if (merged.revision === undefined) merged.revision = 0;
  if (merged.updated_at === undefined) merged.updated_at = nowIso();
  if (merged.updated_by === undefined) merged.updated_by = null;
  return merged;
}

function findRow(table: string, conflictColumns: string[], payload: Row): Row | null {
  const rows = tables.get(table) ?? [];
  for (const row of rows) {
    let matched = true;
    for (const column of conflictColumns) {
      if (String(row[column]) !== String(payload[column])) {
        matched = false;
        break;
      }
    }
    if (matched) return row;
  }
  return null;
}

function writeRow(table: string, existing: Row | null, payload: Row, merge: boolean): Row {
  const rows = tables.get(table)!;
  if (existing) {
    const next: Row = merge ? { ...existing, ...payload } : { ...payload };
    for (const key of Object.keys(existing)) if (next[key] === undefined) next[key] = existing[key];
    rows[rows.indexOf(existing)] = next;
    refreshGeneratedColumns(table, next);
    return next;
  }
  const created = applyEntityDefaults(table, payload);
  rows.push(created);
  refreshGeneratedColumns(table, created);
  return created;
}

/* ------------------------------------------------------------- RPC handlers */

interface CommitOperation {
  table: string;
  collection: string;
  upsert: Row[];
  deleteIds: string[];
}

function revisionRow(workspaceId: string): Row {
  let rows = tables.get("entity_workspace_revision");
  if (!rows) {
    rows = [];
    tables.set("entity_workspace_revision", rows);
  }
  let row = rows.find((candidate) => candidate.id === workspaceId);
  if (!row) {
    row = { id: workspaceId, workspace_id: workspaceId, revision: 0, updated_at: nowIso() };
    rows.push(row);
  }
  return row;
}

function bumpWorkspaceRevision(workspaceId: string): number {
  const row = revisionRow(workspaceId);
  row.revision = Number(row.revision || 0) + 1;
  row.updated_at = nowIso();
  return row.revision as number;
}

function appendChangeBatch(revision: number, operations: CommitOperation[], bumpedRowVersions: Row): void {
  const rows = tables.get("entity_workspace_change_batches") ?? [];
  tables.set("entity_workspace_change_batches", rows);
  rows.push({
    id: deterministicUuid(`qa-batch:${revision}:${Date.now()}`),
    workspace_id: WORKSPACE_ID,
    revision,
    operations: operations.map((op) => ({ collection: op.collection, upsert: op.upsert, deleteIds: op.deleteIds })),
    row_versions: bumpedRowVersions,
    is_baseline: false,
    created_at: nowIso(),
  });
}

function rpcCommitWorkspaceOperations(args: Row): Response {
  const workspaceId = String(args.p_workspace_id || WORKSPACE_ID);
  const expectedRevision = Number(args.p_expected_workspace_revision);
  const rawOperations = args.p_operations;
  const expectedRowVersions = (args.p_expected_row_versions || {}) as Row;

  if (!Array.isArray(rawOperations)) return postgrestError(400, "22023", "INVALID_OPERATIONS");

  const revRow = revisionRow(workspaceId);
  const currentRevision = Number(revRow.revision || 0);
  if (currentRevision !== expectedRevision) {
    return postgrestError(409, "40001", "WORKSPACE_CONFLICT");
  }

  const operations: CommitOperation[] = [];
  for (const raw of rawOperations as Row[]) {
    const table = String(raw.table || "");
    const collection = String(raw.collection || "");
    if (!table || !collection || !/^entity_[A-Za-z0-9_]+$/.test(table) || !tables.has(table)) {
      return postgrestError(400, "22023", "INVALID_COLLECTION");
    }
    const upsert = Array.isArray(raw.upsert) ? (raw.upsert as Row[]) : [];
    const deleteIds = Array.isArray(raw.deleteIds) ? raw.deleteIds.map((id) => String(id)) : [];
    for (const rowData of upsert) {
      const rowId = String(rowData?.id || "").trim();
      if (!rowId) return postgrestError(400, "22023", "INVALID_ROW_ID");
    }
    operations.push({ table, collection, upsert, deleteIds });
  }

  // Row-level CAS: expected "collection:id" (or plain "id") must match reality.
  const expectedFor = (collection: string, rowId: string): number | null => {
    const keyed = expectedRowVersions[`${collection}:${rowId}`];
    if (keyed !== undefined) return Number(keyed);
    const plain = expectedRowVersions[rowId];
    return plain !== undefined ? Number(plain) : null;
  };
  const actualRevisionOf = (table: string, rowId: string): number | null => {
    const row = (tables.get(table) ?? []).find((candidate) => candidate.id === rowId);
    return row ? Number(row.revision ?? 0) : null;
  };
  for (const op of operations) {
    for (const rowData of op.upsert) {
      const rowId = String(rowData.id);
      const expected = expectedFor(op.collection, rowId);
      const actual = actualRevisionOf(op.table, rowId);
      if (expected !== null && actual !== expected) {
        return postgrestError(409, "40001", `ROW_CONFLICT:${op.collection}:${rowId}`);
      }
    }
    for (const rowId of op.deleteIds) {
      const expected = expectedFor(op.collection, rowId);
      const actual = actualRevisionOf(op.table, rowId);
      if (expected !== null && actual !== expected) {
        return postgrestError(409, "40001", `ROW_CONFLICT:${op.collection}:${rowId}`);
      }
    }
  }

  // Deletes first (reverse operation order, matching the SQL function).
  let deleted = 0;
  for (let i = operations.length - 1; i >= 0; i -= 1) {
    const op = operations[i];
    const rows = tables.get(op.table)!;
    for (const rowId of op.deleteIds) {
      const index = rows.findIndex((candidate) => candidate.id === rowId);
      if (index >= 0) {
        rows.splice(index, 1);
        deleted += 1;
      }
    }
  }

  // Upserts: new rows land at revision 0, existing rows bump revision + 1.
  let upserted = 0;
  const bumpedRowVersions: Row = {};
  for (const op of operations) {
    const rows = tables.get(op.table)!;
    for (const rowData of op.upsert) {
      const rowId = String(rowData.id);
      const existing = rows.find((candidate) => candidate.id === rowId);
      const nextRevision = existing ? Number(existing.revision ?? 0) + 1 : 0;
      const stored: Row = existing
        ? { ...existing, data: clone(rowData), revision: nextRevision, updated_at: nowIso() }
        : {
            id: rowId,
            workspace_id: workspaceId,
            revision: nextRevision,
            updated_at: nowIso(),
            updated_by: null,
            data: clone(rowData),
          };
      if (existing) rows[rows.indexOf(existing)] = stored;
      else rows.push(stored);
      refreshGeneratedColumns(op.table, stored);
      upserted += 1;
      bumpedRowVersions[`${op.collection}:${rowId}`] = nextRevision;
      bumpedRowVersions[rowId] = nextRevision;
    }
  }

  const newRevision = bumpWorkspaceRevision(workspaceId);
  appendChangeBatch(newRevision, operations, bumpedRowVersions);
  return jsonResponse({ upserted, deleted, conflicts: 0, bumpedRowVersions, newRevision }, 200);
}

function rpcUcBumpWorkspaceRevision(args: Row): Response {
  return jsonResponse(bumpWorkspaceRevision(String(args.p_workspace_id || WORKSPACE_ID)), 200);
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  OPERATIONS_MANAGER: "Operations Manager",
  FIELD_STAFF: "Field Staff",
  SALES_TELECALLER: "Sales / Telecaller",
  PROCUREMENT_STAFF: "Procurement Staff",
  FINANCE: "Finance",
  ACCOUNTS_ADMIN: "Accounts / Admin",
};

function rpcSyncStaffIdentityBundle(args: Row): Response {
  const email = String(args.p_email || "").trim().toLowerCase();
  const name = String(args.p_display_name || "").trim();
  const userId = String(args.p_user_id || "").trim();
  const role = String(args.p_role || "").trim();
  const status = String(args.p_status || "").trim();
  if (!userId) return postgrestError(400, "22023", "INVALID_USER_ID");
  if (!email) return postgrestError(400, "22023", "INVALID_EMAIL");
  if (!name) return postgrestError(400, "22023", "INVALID_DISPLAY_NAME");
  if (!ROLE_LABELS[role]) return postgrestError(400, "22023", "INVALID_ROLE");
  if (!["pending", "active", "rejected", "inactive"].includes(status)) {
    return postgrestError(400, "22023", "INVALID_STATUS");
  }

  const requestedStaffId = String(args.p_staff_id || "").trim() || null;
  const assignmentId = String(args.p_assignment_id || "").trim() || null;
  const profileStatus = status === "rejected" || status === "inactive" ? "inactive" : status;
  const staffRows = tables.get("entity_master_staff")!;
  const existing = requestedStaffId
    ? staffRows.find((candidate) => candidate.id === requestedStaffId) ?? null
    : staffRows.find((candidate) => {
        const data = candidate.data as Row;
        return String(data?.email || "").toLowerCase() === email;
      }) ?? null;
  const staffId = existing ? String(existing.id) : requestedStaffId || `staff-auth-${userId.replace(/-/g, "").slice(0, 12)}`;
  const code = `AUTH-${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const timestamp = nowIso();
  const existingData = (existing?.data as Row | undefined) ?? {};
  const masterData: Row = {
    phone: "",
    department: "",
    designation: "",
    salary_type: "monthly",
    attendance_policy: {
      id: `policy-${staffId}`,
      grace_period_minutes: 15,
      late_grace_minutes: 15,
      absent_deduction_enabled: false,
      absent_deduction_days: 0,
    },
    ...existingData,
    id: staffId,
    code,
    name,
    email,
    auth_user_id: userId,
    role: ROLE_LABELS[role],
    role_key: role,
    status: profileStatus,
    gps_tracking_enabled: true,
    login_enabled: status === "pending" || status === "active",
    login_email: email,
    created_at: existingData.created_at ? String(existingData.created_at) : timestamp,
    updated_at: timestamp,
  };

  const stored: Row = existing
    ? {
        ...existing,
        revision: Number(existing.revision ?? 0) + 1,
        updated_at: timestamp,
        updated_by: "auth-system",
        data: masterData,
      }
    : {
        id: staffId,
        workspace_id: WORKSPACE_ID,
        revision: 1,
        updated_at: timestamp,
        updated_by: "auth-system",
        data: masterData,
      };
  if (existing) staffRows[staffRows.indexOf(existing)] = stored;
  else staffRows.push(stored);
  refreshGeneratedColumns("entity_master_staff", stored);

  const roleRows = tables.get("uc_user_roles")!;
  let assignment: Row;
  if (assignmentId) {
    const assignmentRow = roleRows.find((candidate) => candidate.id === assignmentId);
    if (!assignmentRow) return postgrestError(400, "P0002", "ROLE_ASSIGNMENT_NOT_FOUND");
    Object.assign(assignmentRow, {
      user_id: userId,
      email,
      role,
      staff_id: staffId,
      display_name: name,
      status,
      approved_by: status === "active" || status === "rejected" ? (args.p_approved_by ?? null) : null,
      approved_at: status === "active" ? (args.p_approved_at ?? timestamp) : null,
      rejected_at: status === "rejected" ? (args.p_rejected_at ?? timestamp) : null,
      updated_at: timestamp,
    });
    assignment = clone(assignmentRow);
  } else {
    assignment = {
      id: deterministicUuid(`qa-role:${userId}:${email}`),
      user_id: userId,
      email,
      role,
      staff_id: staffId,
      display_name: name,
      status,
      approved_by: status === "active" || status === "rejected" ? (args.p_approved_by ?? null) : null,
      approved_at: status === "active" ? (args.p_approved_at ?? timestamp) : null,
      rejected_at: status === "rejected" ? (args.p_rejected_at ?? timestamp) : null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    roleRows.push(assignment);
  }

  const workspaceRevision = bumpWorkspaceRevision(WORKSPACE_ID);
  return jsonResponse({ assignment, staffId, workspaceRevision }, 200);
}

function rpcGetAuthUserByEmail(args: Row): Response {
  const email = String(args.p_email || "").trim().toLowerCase();
  const userId = emailToUserId.get(email);
  const user = userId ? authUsers.get(userId) : null;
  return jsonResponse(user ? goTrueUser(user, nowIso()) : null, 200);
}

const rowsWithData = (table: string): Row[] =>
  (tables.get(table) ?? [])
    .map((row) => (row.data && typeof row.data === "object" ? (row.data as Row) : {}))
    .filter(Boolean);

function rpcGetWorkspaceHealthSummary(_args: Row): Response {
  const today = nowIso().slice(0, 10);
  const month = today.slice(0, 7);
  const num = (value: unknown): number => (typeof value === "number" ? value : Number(value) || 0);
  const statusOf = (row: Row) => String(row.status || "").toLowerCase();

  const tasks = rowsWithData("entity_tasks");
  const openTasks = tasks.filter((task) => !["done", "completed", "cancelled", "archived"].includes(statusOf(task)));
  const dueOf = (task: Row) => String(task.due_date || task.due || task.dueDate || "").slice(0, 10);
  const overdueTasks = openTasks.filter((task) => dueOf(task) && dueOf(task) < today).length;
  const dueTodayTasks = openTasks.filter((task) => dueOf(task) === today).length;

  const openSet = new Set(["pending", "open", "scheduled", "due", "in_progress", "active", "new"]);
  const quotations = rowsWithData("entity_quotations").filter((q) =>
    ["sent", "approved", "accepted"].includes(statusOf(q)));
  const purchaseOrders = rowsWithData("entity_purchaseOrders");
  const directAwardPos = purchaseOrders.filter(
    (po) => po.procurement_type === "direct_award" || po.direct_award === true || po.source_type === "direct_award",
  );
  const variationRequests = rowsWithData("entity_variationRequests");
  const payments = rowsWithData("entity_payments");
  const invoices = rowsWithData("entity_invoices").filter((invoice) => statusOf(invoice) === "overdue");
  const vendorBills = rowsWithData("entity_vendorBills").filter((bill) =>
    ["open", "pending", "approved"].includes(statusOf(bill)));

  const totalReceived = payments.reduce((sum, p) => sum + num(p.amount), 0);
  const totalPaidOut = [...rowsWithData("entity_vendorPayments"), ...rowsWithData("entity_contractorPayments")]
    .reduce((sum, p) => sum + num(p.amount), 0);
  const monthRevenue = payments
    .filter((p) => String(p.date || p.created_at || "").slice(0, 7) === month)
    .reduce((sum, p) => sum + num(p.amount), 0);
  const revenueSeries: Array<{ date: string; value: number }> = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const value = payments
      .filter((p) => String(p.date || "").slice(0, 10) === day)
      .reduce((sum, p) => sum + num(p.amount), 0);
    revenueSeries.push({ date: day, value });
  }

  const recentActivity = rowsWithData("entity_auditLog").slice(0, 8).map((entry) => ({
    id: String(entry.id || ""),
    action: String(entry.action || ""),
    kind: String(entry.kind || "update"),
    entityType: String(entry.entity_type || "workspace"),
    entityLabel: String(entry.entity_label || ""),
    actor: String(entry.actor || "system"),
    actorRole: entry.actor_role ? String(entry.actor_role) : undefined,
    timestamp: String(entry.timestamp || entry.created_at || nowIso()),
  }));

  return jsonResponse(
    {
      revision: Number(revisionRow(WORKSPACE_ID).revision || 0),
      healthBadge: "healthy",
      attentionCount: 0,
      integrity: {
        snapshotAvailable: false,
        healthScore: 100,
        totalIssues: 0,
        critical: 0,
        warning: 0,
        info: 0,
        totalRecords: seedRowCount,
        totalReferences: 0,
        businessRuleIssues: 0,
        calculatedAt: null,
      },
      operations: {
        openTasks: openTasks.length,
        overdueTasks,
        dueTodayTasks,
        activeFollowups: rowsWithData("entity_followups").filter((row) => openSet.has(statusOf(row))).length,
        pendingApprovals: rowsWithData("entity_actions").filter((row) => statusOf(row) === "pending").length,
        unresolvedBlocked: rowsWithData("entity_blocked").filter((row) => !["resolved", "closed"].includes(statusOf(row))).length,
        openRisks: rowsWithData("entity_risks").filter((row) => !["closed", "mitigated"].includes(statusOf(row))).length,
        activeWorkOrders: rowsWithData("entity_workOrders").filter((row) =>
          ["confirmed", "in_progress", "active"].includes(statusOf(row))).length,
        activeVisits: rowsWithData("entity_visits").filter((row) => ["scheduled", "checked_in"].includes(statusOf(row))).length,
      },
      commercial: {
        pipelineValue: quotations.reduce((sum, q) => sum + num(q.total ?? q.total_amount ?? q.amount), 0),
        pipelineQuotations: quotations.length,
        customers: (tables.get("entity_customers") ?? []).length,
      },
      exceptions: {
        directAwardPOs: directAwardPos.length,
        variations: variationRequests.length,
        total: directAwardPos.length + variationRequests.length,
      },
      finance: {
        cashPosition: totalReceived - totalPaidOut,
        monthRevenue,
        overdueInvoiceValue: invoices.reduce((sum, invoice) => sum + num(invoice.total ?? invoice.amount), 0),
        overdueInvoiceCount: invoices.length,
        pendingVendorBillValue: vendorBills.reduce((sum, bill) => sum + num(bill.total ?? bill.amount), 0),
        pendingVendorBillCount: vendorBills.length,
        totalReceived,
        totalPaidOut,
        revenueSeries,
      },
      recentActivity,
    },
    200,
  );
}

function staffIdentityDriftRows(): Row[] {
  const staffRows = new Map(
    (tables.get("entity_master_staff") ?? []).map((row) => [String(row.id), row.data as Row]),
  );
  return (tables.get("uc_user_roles") ?? []).map((assignment) => {
    const staffData = assignment.staff_id ? staffRows.get(String(assignment.staff_id)) : undefined;
    return {
      identity_key: assignment.staff_id ? String(assignment.staff_id) : `role:${String(assignment.id)}`,
      role_assignment_id: assignment.id,
      user_id: assignment.user_id,
      staff_id: assignment.staff_id,
      email: assignment.email,
      role: assignment.role,
      role_status: assignment.status,
      expected_profile_status: ["rejected", "inactive"].includes(String(assignment.status)) ? "inactive" : assignment.status,
      profile_email: staffData?.email ?? null,
      profile_role: staffData?.role_key ?? null,
      profile_status: staffData?.status ?? null,
      profile_auth_user_id: staffData?.auth_user_id ?? null,
      master_email: staffData?.email ?? null,
      master_role: staffData?.role_key ?? null,
      master_status: staffData?.status ?? null,
      master_auth_user_id: staffData?.auth_user_id ?? null,
      profile_exists: Boolean(staffData),
      master_exists: Boolean(staffData),
      drift_reasons: [],
      is_drifted: false,
    };
  });
}

/* ------------------------------------------------------------- GoTrue routes */

async function handleAuth(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (path === "/auth/v1/token" && method === "POST") {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Row;
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const email = String(body.email || "").trim().toLowerCase();
      const userId = emailToUserId.get(email);
      const user = userId ? authUsers.get(userId) : null;
      if (!user) {
        console.log(`[qa-mock] POST /auth/v1/token grant=password email=${email} -> 400 invalid_credentials`);
        return authError(400, "invalid_credentials", "Invalid login credentials");
      }
      console.log(`[qa-mock] POST /auth/v1/token grant=password email=${email} -> 200 (any password accepted)`);
      return jsonResponse(issueSession(user), 200);
    }
    if (grant === "refresh_token") {
      const refreshToken = String(body.refresh_token || "");
      const userId = refreshTokens.get(refreshToken);
      const user = userId ? authUsers.get(userId) : null;
      if (!user) {
        console.log("[qa-mock] POST /auth/v1/token grant=refresh_token -> 400 invalid_grant");
        return authError(400, "invalid_grant", "Invalid Refresh Token");
      }
      refreshTokens.delete(refreshToken); // rotate like real GoTrue
      console.log("[qa-mock] POST /auth/v1/token grant=refresh_token -> 200 (rotated)");
      return jsonResponse(issueSession(user), 200);
    }
    return authError(400, "unsupported_grant_type", "Unsupported grant type");
  }

  if (path === "/auth/v1/user" && method === "GET") {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
    const payload = decodeJwtPayload(token);
    const user = payload?.sub ? authUsers.get(String(payload.sub)) : null;
    if (!user) return authError(401, "bad_jwt", "invalid claim: missing sub claim");
    return jsonResponse(goTrueUser(user, nowIso()), 200);
  }

  if (path === "/auth/v1/logout" && method === "POST") {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
    const payload = decodeJwtPayload(token);
    if (payload?.sub) {
      for (const [refresh, userId] of [...refreshTokens.entries()]) {
        if (userId === payload.sub) refreshTokens.delete(refresh);
      }
    }
    return new Response(null, { status: 204 });
  }

  if (path === "/auth/v1/admin/users" && method === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
    const perPage = Math.max(1, Number(url.searchParams.get("per_page") || 50) || 50);
    const all = [...authUsers.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const slice = all.slice((page - 1) * perPage, page * perPage);
    const headers = new Headers({ "Content-Type": "application/json", "X-Total-Count": String(all.length) });
    if (page * perPage < all.length) {
      headers.set("Link", `</auth/v1/admin/users?page=${page + 1}&per_page=${perPage}>; rel="next"`);
    }
    return jsonResponse(
      { users: slice.map((user) => goTrueUser(user, nowIso())), aud: "authenticated", total: all.length },
      200,
      headers,
    );
  }

  if (path === "/auth/v1/admin/users" && method === "POST") {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Row;
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return authError(422, "validation_failed", "A valid email is required");
    if (emailToUserId.has(email)) return authError(422, "user_already_exists", "User already registered");
    const metadata = (body.user_metadata as Row | undefined) ?? {};
    const user: AuthUserRecord = {
      id: deterministicUuid(`qa-auth-user:${email}`),
      email,
      name: String(metadata.full_name || email.split("@")[0]),
      createdAt: nowIso(),
      userMetadata: metadata,
    };
    authUsers.set(user.id, user);
    emailToUserId.set(email, user.id);
    console.log(`[qa-mock] POST /auth/v1/admin/users created ${email}`);
    return jsonResponse(goTrueUser(user, nowIso()), 200);
  }

  const adminUserMatch = path.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
  if (adminUserMatch) {
    const userId = adminUserMatch[1];
    const user = authUsers.get(userId);
    if (method === "GET") {
      if (!user) return authError(404, "user_not_found", "User from sub claim in JWT does not exist");
      return jsonResponse(goTrueUser(user, nowIso()), 200);
    }
    if (method === "PUT") {
      if (!user) return authError(404, "user_not_found", "User from sub claim in JWT does not exist");
      const body = ((await req.json().catch(() => ({}))) ?? {}) as Row;
      if (body.email) {
        emailToUserId.delete(user.email);
        user.email = String(body.email).toLowerCase();
        emailToUserId.set(user.email, user.id);
      }
      if (body.user_metadata && typeof body.user_metadata === "object") {
        user.userMetadata = { ...user.userMetadata, ...(body.user_metadata as Row) };
      }
      return jsonResponse(goTrueUser(user, nowIso()), 200);
    }
    if (method === "DELETE") {
      if (user) {
        authUsers.delete(userId);
        emailToUserId.delete(user.email);
        for (const [refresh, owner] of [...refreshTokens.entries()]) {
          if (owner === userId) refreshTokens.delete(refresh);
        }
        return jsonResponse(goTrueUser(user, nowIso()), 200);
      }
      return authError(404, "user_not_found", "User from sub claim in JWT does not exist");
    }
  }

  return postgrestError(404, "404", `Not found: ${method} ${path}`);
}

/* ------------------------------------------------------------ PostgREST routes */

async function handleRest(req: Request, url: URL): Promise<Response> {
  const method = req.method;
  const relative = url.pathname.slice("/rest/v1/".length);

  if (relative.startsWith("rpc/")) {
    const fn = relative.slice("rpc/".length);
    const args = ((await req.json().catch(() => ({}))) ?? {}) as Row;
    console.log(`[qa-mock] POST /rest/v1/rpc/${fn}`);
    switch (fn) {
      case "commit_workspace_operations":
        return rpcCommitWorkspaceOperations(args);
      case "uc_bump_workspace_revision":
        return rpcUcBumpWorkspaceRevision(args);
      case "sync_staff_identity_bundle":
        return rpcSyncStaffIdentityBundle(args);
      case "get_auth_user_by_email":
        return rpcGetAuthUserByEmail(args);
      case "get_workspace_health_summary_v2":
        return rpcGetWorkspaceHealthSummary(args);
      default:
        return postgrestError(404, "PGRST202", `Could not find the function public.${fn} in the schema cache`);
    }
  }

  const table = decodeURIComponent(relative);
  if (!table) return postgrestError(404, "PGRST205", "Table name is required");

  if (table === "staff_identity_drift_report") {
    if (method !== "GET" && method !== "HEAD") {
      return postgrestError(405, "42501", "staff_identity_drift_report is read-only");
    }
    return readRows(req, url, table, staffIdentityDriftRows());
  }

  if (method === "GET" || method === "HEAD") {
    if (!tables.has(table)) {
      return postgrestError(
        404,
        "PGRST205",
        `Could not find the table '${table}' in the schema cache`,
        "Hint: the QA mock seeds entity_* collections; unknown tables cannot be read until written.",
      );
    }
    return readRows(req, url, table);
  }

  if (method === "POST") {
    const body = await req.json().catch(() => null);
    if (body === null) return postgrestError(400, "PGRST102", "Could not parse the request body");
    const prefer = parsePrefer(req.headers.get("prefer"));
    const columnsParam = url.searchParams.get("columns");
    const allowedColumns = columnsParam
      ? columnsParam.split(",").map((column) => column.trim().replace(/^"|"$/g, "")).filter(Boolean)
      : null;
    const conflictColumns = (url.searchParams.get("on_conflict") || "id")
      .split(",")
      .map((column) => column.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    const payloadRows = (Array.isArray(body) ? body : [body]) as Row[];

    if (!tables.has(table)) {
      tables.set(table, []); // auto-create unknown tables (receipts, uploads, ...)
      console.log(`[qa-mock] auto-created table ${table}`);
    }

    const written: Row[] = [];
    for (const raw of payloadRows) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return postgrestError(400, "PGRST102", "Insert payload must be a JSON object");
      }
      const payload = cleanPayload(raw, table, allowedColumns);
      const existing = findRow(table, conflictColumns, payload);
      if (existing && !prefer.mergeDuplicates && !prefer.ignoreDuplicates) {
        return postgrestError(409, "23505", `duplicate key value violates unique constraint "${table}_pkey"`);
      }
      if (existing && prefer.ignoreDuplicates) continue;
      written.push(writeRow(table, existing, payload, prefer.mergeDuplicates));
    }

    if (written.length && isEntityTable(table)) {
      revisionRow(WORKSPACE_ID).updated_at = nowIso();
    }

    if (prefer.representation) return rowsResponse(written, url, req, 0, written.length);
    return new Response(null, { status: 201 });
  }

  if (method === "PATCH") {
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return postgrestError(400, "PGRST102", "Update payload must be a JSON object");
    }
    if (!tables.has(table)) {
      return postgrestError(404, "PGRST205", `Could not find the table '${table}' in the schema cache`);
    }
    const prefer = parsePrefer(req.headers.get("prefer"));
    const filters = [...parseQueryFilters(url), ...parseOrFilters(url)];
    const payload = cleanPayload(body, table, null);
    const updatedRows: Row[] = [];
    for (const row of tables.get(table)!) {
      if (!filters.every((filter) => rowMatchesFilter(row, filter))) continue;
      const merged: Row = { ...row, ...payload };
      for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) {
          if (table === "entity_master_staff" && key === "auth_user_id_gen") delete merged[key];
          else merged[key] = row[key];
        }
      }
      Object.assign(row, merged);
      refreshGeneratedColumns(table, row);
      updatedRows.push(row);
    }
    if (prefer.representation) return rowsResponse(updatedRows, url, req, 0, updatedRows.length);
    return new Response(null, { status: 204 });
  }

  if (method === "DELETE") {
    if (!tables.has(table)) {
      return postgrestError(404, "PGRST205", `Could not find the table '${table}' in the schema cache`);
    }
    const prefer = parsePrefer(req.headers.get("prefer"));
    const filters = [...parseQueryFilters(url), ...parseOrFilters(url)];
    const rows = tables.get(table)!;
    const removed: Row[] = [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (filters.every((filter) => rowMatchesFilter(rows[i], filter))) {
        removed.push(rows[i]);
        rows.splice(i, 1);
      }
    }
    if (prefer.representation) return rowsResponse(removed, url, req, 0, removed.length);
    return new Response(null, { status: 204 });
  }

  return postgrestError(405, "405", `Method ${method} is not supported on ${table}`);
}

function parsePrefer(headerValue: string | null) {
  const value = (headerValue || "").toLowerCase();
  return {
    representation: value.includes("return=representation"),
    mergeDuplicates: value.includes("resolution=merge-duplicates"),
    ignoreDuplicates: value.includes("resolution=ignore-duplicates"),
    countExact: /count=(exact|planned|estimated)/.test(value),
  };
}

/* ------------------------------------------------------------------- router */

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const startedAt = Date.now();

  let response: Response;
  if (url.pathname === "/" || url.pathname === "") {
    response = jsonResponse(
      {
        service: "qa-mock-supabase",
        workspace: WORKSPACE_ID,
        tables: tables.size,
        rows: totalRowCount(),
        identities: [...emailToUserId.keys()].sort(),
        endpoints: ["/auth/v1/*", "/rest/v1/:table", "/rest/v1/rpc/:fn"],
      },
      200,
    );
  } else if (url.pathname.startsWith("/auth/v1/")) {
    response = await handleAuth(req, url);
  } else if (url.pathname.startsWith("/rest/v1/")) {
    response = await handleRest(req, url);
  } else {
    response = postgrestError(404, "404", `Unknown path ${url.pathname}`);
  }

  if (!url.pathname.startsWith("/auth/v1/token")) {
    console.log(`[qa-mock] ${method} ${url.pathname}${url.search} -> ${response.status} (${Date.now() - startedAt}ms)`);
  }
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Headers", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,HEAD,OPTIONS");
  return response;
}

/* --------------------------------------------------------------------- boot */

seedDatabase();

try {
  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    async fetch(req) {
      try {
        return await handle(req);
      } catch (error) {
        console.error("[qa-mock] handler error:", error);
        return postgrestError(500, "500", error instanceof Error ? error.message : "Internal mock error");
      }
    },
  });
  console.log(`qa-mock listening on http://${HOST}:${server.port}`);
  console.log(
    `[qa-mock] seeded ${tables.size} tables / ${totalRowCount()} rows ` +
      `(${CANONICAL_ENTITY_TABLES.size} canonical seed tables, ${seedRowCount} seed rows)`,
  );
  console.log(`[qa-mock] QA identities (any password): ${[...emailToUserId.keys()].sort().join(", ")}`);
} catch (error) {
  console.error(`[qa-mock] could not bind ${HOST}:${PORT} — is another instance already running?`, error);
  process.exit(1);
}
