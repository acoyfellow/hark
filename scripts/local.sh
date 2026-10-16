#!/usr/bin/env bash
# Runs hark locally against a fake Cloudflare: no account, no OAuth, real browser audio path.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .wrangler/logs
node scripts/fake-cloudflare.mjs > .wrangler/logs/fake.log 2>&1 &
echo $! > .wrangler/fake.pid
node scripts/with-local-image.mjs
npx wrangler dev --config wrangler.local.jsonc --port "${PORT:-8790}" --ip 127.0.0.1 \
  --var LOCAL_DEV_WITHOUT_AUTH:1 --var HARK_FAKE_ORIGIN:http://127.0.0.1:8799 \
  > .wrangler/logs/dev.log 2>&1 &
echo $! > .wrangler/dev.pid
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${PORT:-8790}/manifest.webmanifest" -o /dev/null 2>/dev/null && { echo "hark on http://127.0.0.1:${PORT:-8790}"; exit 0; }
  curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT:-8790}/" 2>/dev/null | grep -q 200 && { echo "hark on http://127.0.0.1:${PORT:-8790}"; exit 0; }
  sleep 1
done
echo "wrangler dev did not start"; tail -40 .wrangler/logs/dev.log; exit 1
