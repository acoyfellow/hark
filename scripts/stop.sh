#!/usr/bin/env bash
cd "$(dirname "$0")/.."
for pid in .wrangler/dev.pid .wrangler/fake.pid; do [ -f "$pid" ] && kill "$(cat "$pid")" 2>/dev/null; rm -f "$pid"; done
pkill -f "wrangler dev --port" 2>/dev/null; pkill -f workerd 2>/dev/null; pkill -f fake-cloudflare 2>/dev/null; true
