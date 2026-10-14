#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<'USAGE'
usage: bun run ship -- deploy/<instance>.conf

Copy deploy/example.conf to deploy/<instance>.conf (git ignores it), fill it in,
and pass its path. One file per instance.
USAGE
  exit 2
}

conf="${1:-}"
[ -n "$conf" ] && [ -f "$conf" ] || usage

set -a
. "$conf"
set +a

missing=""
for key in HARK_ACCOUNT_ID HARK_DOMAIN HARK_OAUTH_CLIENT_ID; do
  [ -n "${!key:-}" ] || missing="$missing $key"
done
[ -z "$missing" ] || { echo "missing in $conf:$missing" >&2; exit 2; }

export CLOUDFLARE_ACCOUNT_ID="$HARK_ACCOUNT_ID"
instance=$(basename "$conf" .conf)
config="wrangler.$instance.local.jsonc"

[ "${HARK_SKIP_CHECK:-0}" = 1 ] || bash scripts/check.sh
[ "${HARK_SKIP_CHECK:-0}" != 1 ] || node scripts/build-client.mjs

sed "s/\"name\": \"hark\"/\"name\": \"hark-$instance\"/" wrangler.jsonc > "$config"

vars=(--var "OAUTH_CLIENT_ID:$HARK_OAUTH_CLIENT_ID")
[ -z "${HARK_USER_GATEWAY:-}" ] || vars+=(--var "HARK_USER_GATEWAY:$HARK_USER_GATEWAY")

deploy() { npx wrangler deploy -c "$config" --domain "$HARK_DOMAIN" "${vars[@]}"; }
deploy || deploy

secrets=$(npx wrangler secret list -c "$config" 2>/dev/null || true)
for name in OAUTH_CLIENT_SECRET SESSION_SECRET; do
  case "$secrets" in
    *"\"name\": \"$name\""* | *"\"name\":\"$name\""*) ;;
    *) echo "set the Worker secret $name: CLOUDFLARE_ACCOUNT_ID=$HARK_ACCOUNT_ID npx wrangler secret put $name -c $config" >&2; exit 1 ;;
  esac
done

bash scripts/check-edge.sh "$HARK_DOMAIN"
