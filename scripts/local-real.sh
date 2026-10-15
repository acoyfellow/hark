#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${LOCAL_CF_ACCOUNT:?set LOCAL_CF_ACCOUNT to the Cloudflare account id that runs Workers AI}"
LOCAL_CF_TOKEN="${LOCAL_CF_TOKEN:-$(npx wrangler auth token 2>/dev/null | tail -1)}"
mkdir -p .wrangler/logs
npx wrangler dev --port "${PORT:-8790}" --ip 127.0.0.1 ${PERSIST_TO:+--persist-to "$PERSIST_TO"} \
  --var LOCAL_DEV_WITHOUT_AUTH:1 --var "LOCAL_CF_ACCOUNT:$LOCAL_CF_ACCOUNT" --var "LOCAL_CF_TOKEN:$LOCAL_CF_TOKEN" \
  > .wrangler/logs/dev.log 2>&1 &
echo $! > .wrangler/dev.pid
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${PORT:-8790}/manifest.webmanifest" -o /dev/null 2>/dev/null && { echo "hark on http://127.0.0.1:${PORT:-8790} with real Workers AI"; exit 0; }
  sleep 1
done
echo "wrangler dev did not start"; tail -40 .wrangler/logs/dev.log; exit 1
