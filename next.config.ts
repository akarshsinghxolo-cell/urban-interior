import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true, // STAGE-6-FIX: was false — enables double-invoke bug detection in dev
  // Pin the Turbopack workspace root to this repo. Without this, Next infers
  // the root from lockfiles up the tree (e.g. an outer scaffold project) and
  // then ignores this repo's .env.local — the app silently boots on the
  // in-memory fallback instead of the configured Supabase/mock backend.
  turbopack: { root: repoRoot },
  // Local QA stack: the browser reaches the dev server through the sandbox
  // gateway host (LAN IP via Caddy :81 → localhost:3000). Without this,
  // Next.js dev blocks /_next resources for that origin and the app never
  // hydrates in agent-browser QA sessions.
  allowedDevOrigins: ["localhost", "127.0.0.1", "21.0.10.248"],
};

export default nextConfig;
