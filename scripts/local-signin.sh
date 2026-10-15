#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
keychain() { security find-generic-password -a hark-dev -s "$1" -w; }
mkdir -p .wrangler
vars=".wrangler/signin.vars"
umask 077
printf 'OAUTH_CLIENT_ID=%s\nOAUTH_CLIENT_SECRET=%s\nSESSION_SECRET=%s\n' \
  "$(keychain hark-oauth-client-id)" "$(keychain hark-oauth-client-secret)" "$(keychain hark-session-secret)" > "$vars"
mkdir -p .wrangler/logs
npx wrangler dev --port "${PORT:-8790}" --ip 127.0.0.1 --env-file "$vars" > .wrangler/logs/dev.log 2>&1 &
dev=$!
echo $dev > .wrangler/dev.pid
( while kill -0 "$dev" 2>/dev/null; do sleep 2; done; rm -f "$vars" ) &
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${PORT:-8790}/manifest.webmanifest" -o /dev/null 2>/dev/null && { echo "hark on http://127.0.0.1:${PORT:-8790} with Sign in with Cloudflare"; exit 0; }
  sleep 1
done
echo "wrangler dev did not start"; tail -40 .wrangler/logs/dev.log; exit 1
