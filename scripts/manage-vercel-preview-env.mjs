#!/usr/bin/env node

const mode = process.argv[2];
if (mode !== "enable" && mode !== "restore") {
  console.error("Usage: manage-vercel-preview-env.mjs <enable|restore>");
  process.exit(2);
}

const token = String(process.env.VERCEL_TOKEN || "").trim();
const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
const teamId = String(process.env.VERCEL_ORG_ID || "").trim();
if (!token || !projectId || !teamId) {
  console.error("VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_ORG_ID are required.");
  process.exit(2);
}

const managedKeys = new Set([
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWKS_URL",
  "UC_SESSION_SECRET",
  "UC_WORKSPACE_ID",
]);

const apiBase = "https://api.vercel.com";
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

function targets(row) {
  if (Array.isArray(row.target)) return row.target.filter(Boolean);
  if (typeof row.target === "string" && row.target) return [row.target];
  return [];
}

async function api(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = body && typeof body === "object"
      ? body.error?.message || body.message || JSON.stringify(body)
      : String(body || response.statusText);
    throw new Error(`${init.method || "GET"} ${path} failed (${response.status}): ${detail}`);
  }
  return body;
}

async function listEnvironmentVariables() {
  const body = await api(`/v10/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(teamId)}`);
  const rows = Array.isArray(body) ? body : body?.envs;
  if (!Array.isArray(rows)) throw new Error("Vercel returned no environment-variable list.");
  return rows;
}

async function deleteVariable(id) {
  await api(
    `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(id)}?teamId=${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
}

async function patchTargets(id, nextTargets) {
  await api(
    `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(id)}?teamId=${encodeURIComponent(teamId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ target: nextTargets }),
    },
  );
}

function assertRequiredKeys(rows) {
  const productionKeys = new Set(
    rows
      .filter((row) => managedKeys.has(row.key) && targets(row).includes("production"))
      .map((row) => row.key),
  );
  const missing = [];
  if (!productionKeys.has("SUPABASE_URL")) missing.push("SUPABASE_URL");
  if (!productionKeys.has("SUPABASE_PUBLISHABLE_KEY") && !productionKeys.has("SUPABASE_ANON_KEY")) {
    missing.push("Supabase publishable key");
  }
  if (!productionKeys.has("SUPABASE_SECRET_KEY") && !productionKeys.has("SUPABASE_SERVICE_ROLE_KEY")) {
    missing.push("Supabase server key");
  }
  if (!productionKeys.has("UC_SESSION_SECRET")) missing.push("UC_SESSION_SECRET");
  if (missing.length) throw new Error(`Production is missing required variables: ${missing.join(", ")}`);
}

async function enable() {
  let rows = await listEnvironmentVariables();

  // Earlier failed attempts created Preview-only copies containing encrypted
  // CLI references. Production originally had no Preview Supabase variables,
  // so remove only managed Preview-only entries before sharing real records.
  const previewOnly = rows.filter((row) => {
    const rowTargets = targets(row);
    return managedKeys.has(row.key) &&
      rowTargets.includes("preview") &&
      !rowTargets.includes("production");
  });
  for (const row of previewOnly) await deleteVariable(row.id);

  rows = await listEnvironmentVariables();
  assertRequiredKeys(rows);
  const productionRows = rows.filter((row) =>
    managedKeys.has(row.key) && targets(row).includes("production"),
  );
  for (const row of productionRows) {
    const nextTargets = [...new Set([...targets(row), "preview"])];
    await patchTargets(row.id, nextTargets);
  }
  console.log(`Temporarily enabled ${productionRows.length} Production variable record(s) for Preview.`);
}

async function restore() {
  const rows = await listEnvironmentVariables();
  const sharedRows = rows.filter((row) => {
    const rowTargets = targets(row);
    return managedKeys.has(row.key) &&
      rowTargets.includes("production") &&
      rowTargets.includes("preview");
  });
  for (const row of sharedRows) {
    await patchTargets(row.id, targets(row).filter((target) => target !== "preview"));
  }
  console.log(`Restored ${sharedRows.length} variable record(s) to their non-Preview targets.`);
}

await (mode === "enable" ? enable() : restore());
