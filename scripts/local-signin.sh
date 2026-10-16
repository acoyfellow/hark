#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
keychain() { security find-generic-password -a hark-dev -s "$1" -w; }
mkdir -p .wrangler
vars=".wrangler/signin.vars"
umask 077
printf 'OAUTH_CLIENT_ID=%s\nOAUTH_CLIENT_SECRET=%s\nSESSION_SECRET=%s\nOAUTH_EXTRA_SCOPES=%s\n' \
  "$(keychain hark-oauth-client-id)" "$(keychain hark-oauth-client-secret)" "$(keychain hark-session-secret)" "${HARK_LOCAL_SCOPES:-all}" > "$vars"
mkdir -p .wrangler/logs
node scripts/with-local-image.mjs
npx wrangler dev --config wrangler.local.jsonc --port "${PORT:-8790}" --ip 127.0.0.1 --env-file "$vars" > ".wrangler/logs/dev-${PORT:-8790}.log" 2>&1 &
dev=$!
echo $dev > ".wrangler/dev-${PORT:-8790}.pid"
( while kill -0 "$dev" 2>/dev/null; do sleep 2; done; rm -f "$vars" ) &
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${PORT:-8790}/manifest.webmanifest" -o /dev/null 2>/dev/null && { echo "hark on http://127.0.0.1:${PORT:-8790} with Sign in with Cloudflare"; exit 0; }
  sleep 1
done
echo "wrangler dev did not start"; tail -40 ".wrangler/logs/dev-${PORT:-8790}.log"; exit 1
