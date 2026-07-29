#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const mode = process.argv[2];
if (mode !== "enable" && mode !== "restore") {
  console.error("Usage: manage-vercel-preview-env.mjs <enable|restore>");
  process.exit(2);
}

const token = String(process.env.VERCEL_TOKEN || "").trim();
const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
const teamSlug = String(process.env.VERCEL_TEAM_SLUG || "akash264").trim();
if (!token || !projectId || !teamSlug) {
  console.error("VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_TEAM_SLUG are required.");
  process.exit(2);
}

function vercel(args, options = {}) {
  return execFileSync(
    "vercel",
    [...args, "--token", token, "--scope", teamSlug],
    {
      encoding: "utf8",
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );
}

function objects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (!Array.isArray(value)) output.push(value);
  for (const child of Object.values(value)) objects(child, output);
  return output;
}

function text(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function candidateName(row) {
  for (const key of ["name", "resourceName", "slug", "resourceSlug"]) {
    if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
  }
  return "";
}

function resourceScore(row) {
  const providerText = [
    row.integration,
    row.integrationSlug,
    row.integrationName,
    row.provider,
    row.product,
    row.productSlug,
    row.marketplaceIntegration,
  ].map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") return JSON.stringify(entry);
    return "";
  }).join(" ").toLowerCase();
  const rowText = JSON.stringify(row).toLowerCase();
  let score = 0;
  if (providerText.includes("supabase")) score += 10;
  if (rowText.includes("supabase")) score += 3;
  if (candidateName(row)) score += 2;
  if (row.projectId === projectId || row.project?.id === projectId) score += 2;
  return score;
}

function discoverSupabaseResource() {
  const output = vercel([
    "integration",
    "list",
    "--all",
    "--format=json",
  ]);
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(`Could not parse Vercel integration resource list: ${error instanceof Error ? error.message : String(error)}`);
  }

  const candidates = objects(parsed)
    .map((row) => ({ row, name: candidateName(row), score: resourceScore(row) }))
    .filter((candidate) => candidate.name && candidate.score >= 5)
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) {
    throw new Error("No Supabase marketplace resource is visible to the connected Vercel team.");
  }
  return candidates[0].name;
}

function connect(resourceName, environments) {
  const args = [
    "integration",
    "resource",
    "connect",
    resourceName,
    projectId,
    "--yes",
    "--format=json",
  ];
  for (const environment of environments) args.push("--environment", environment);
  vercel(args, { inherit: true });
}

const resourceName = discoverSupabaseResource();
if (mode === "enable") {
  connect(resourceName, ["production", "preview"]);
  console.log(`Enabled Preview for Supabase resource ${resourceName}.`);
} else {
  connect(resourceName, ["production"]);
  console.log(`Restored Supabase resource ${resourceName} to Production-only.`);
}
