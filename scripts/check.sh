#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }

step "build the client (Foldkit + Tailwind)"
node scripts/build-client.mjs

step "typecheck"
npx tsc -p . && npx tsc -p tsconfig.client.json

step "lint"
npx oxlint --deny-warnings

step "tests: auth round trip, turn pipeline, barge-in, sentences, client stories"
npx vitest run

step "wrangler configs keep public URLs off"
for config in $(git ls-files '*wrangler*.jsonc'); do
  grep -Eq '"workers_dev":[[:space:]]*false' "$config" || { echo "$config: workers_dev must be false"; exit 1; }
  grep -Eq '"preview_urls":[[:space:]]*false' "$config" || { echo "$config: preview_urls must be false"; exit 1; }
done

step "the deployed config cannot skip sign-in or point at a fake Cloudflare"
if grep -Eq 'LOCAL_DEV_WITHOUT_AUTH|HARK_FAKE_ORIGIN|LOCAL_CF_TOKEN' wrangler.jsonc; then
  echo "wrangler.jsonc must not set local-only variables"
  exit 1
fi

step "no account IDs or tokens in tracked files"
if git ls-files -z | xargs -0 grep -nE '(account_id|ACCOUNT_ID|CLOUDFLARE_API_TOKEN)[^\n]{0,8}[=:][^\n]{0,4}[0-9a-f]{32}' 2>/dev/null; then
  echo "found a secret-looking value"
  exit 1
fi

step "every receipt the README links to exists"
for linked in $(grep -oE '\((receipts|docs)/[^)#]+\)' README.md | tr -d '()' | sort -u); do
  [ -e "$linked" ] || { echo "README links to $linked, which does not exist"; exit 1; }
done

printf '\nall checks passed\n'
