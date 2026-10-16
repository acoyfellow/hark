#!/usr/bin/env bash
# Proves a deployed hark answers like coil does: a public landing page with Sign in with Cloudflare,
# an OAuth redirect with the AI scopes, and a voice socket that refuses strangers.
set -euo pipefail
host="${1:?usage: check-edge.sh <host>}"
base="https://$host"
fail() { echo "edge check failed: $1" >&2; exit 1; }

page=$(curl -fsS "$base/") || fail "$base/ did not answer"
grep -q 'Sign in with Cloudflare' <<<"$page" || fail "landing page has no Sign in with Cloudflare"

location=$(curl -s -o /dev/null -w '%{redirect_url}' "$base/oauth/login")
grep -q '^https://dash.cloudflare.com/oauth2/auth' <<<"$location" || fail "/oauth/login does not redirect to Cloudflare ($location)"
grep -q 'aig.run' <<<"$location" || fail "OAuth request is missing the aig.run scope"
grep -q "redirect_uri=https%3A%2F%2F$host%2Foauth%2Fcallback" <<<"$location" || fail "redirect_uri is not $base/oauth/callback"

status=$(curl -s -o /dev/null -w '%{http_code}' "$base/agents/hark")
[ "$status" = 401 ] || fail "/agents/hark answered $status to a stranger, expected 401"

status=$(curl -s -o /dev/null -w '%{http_code}' "$base/manifest.webmanifest")
[ "$status" = 200 ] || fail "manifest answered $status"

echo "edge ok: $base (landing, OAuth redirect with AI scopes, socket refuses strangers)"
