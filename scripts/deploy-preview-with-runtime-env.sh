#!/usr/bin/env bash
set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${UC_SESSION_SECRET:?UC_SESSION_SECRET is required}"
: "${UC_PREVIEW_VERIFY_TOKEN:?UC_PREVIEW_VERIFY_TOKEN is required}"

publishable_key="${SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_ANON_KEY:-}}"
secret_key="${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

if [[ -z "$publishable_key" ]]; then
  echo "A Supabase publishable key is required." >&2
  exit 1
fi
if [[ -z "$secret_key" ]]; then
  echo "A Supabase server key is required." >&2
  exit 1
fi

args=(
  vercel deploy
  --prebuilt
  --archive=tgz
  --token="$VERCEL_TOKEN"
  --env "SUPABASE_URL=$SUPABASE_URL"
  --env "SUPABASE_PUBLISHABLE_KEY=$publishable_key"
  --env "SUPABASE_SECRET_KEY=$secret_key"
  --env "UC_SESSION_SECRET=$UC_SESSION_SECRET"
  --env "UC_WORKSPACE_ID=${UC_WORKSPACE_ID:-default}"
  --env "UC_PREVIEW_VERIFY_TOKEN=$UC_PREVIEW_VERIFY_TOKEN"
)

if [[ -n "${SUPABASE_JWKS_URL:-}" ]]; then
  args+=(--env "SUPABASE_JWKS_URL=$SUPABASE_JWKS_URL")
fi

exec "${args[@]}"
