#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
[[ -f .scratch/test-env.sh ]] && source .scratch/test-env.sh
: "${HARK_TEST_ACCOUNT_ID:?set HARK_TEST_ACCOUNT_ID to a test account (not one in deploy/*.conf)}"
: "${HARK_TEST_TOKEN:?set HARK_TEST_TOKEN to a token with Workers AI Run on that account}"
fail=0
step() { printf '\n== %s\n' "$1"; }
step check
bun run check 2>&1 | tail -1 | tee .scratch/gate-check.txt
grep -q "all checks passed" .scratch/gate-check.txt || fail=1
step e2e
bun run build >/dev/null 2>&1
BASE=http://localhost:8791 bun run e2e 2>&1 | grep -E "^FAIL|scenarios passed" | tee .scratch/gate-e2e.txt
e2e=$(grep -oE "^[0-9]+/[0-9]+ scenarios passed" .scratch/gate-e2e.txt | head -1)
[[ "${e2e%% *}" =~ ^([0-9]+)/([0-9]+)$ && "${BASH_REMATCH[1]}" == "${BASH_REMATCH[2]}" ]] || fail=1
step "text suite (real Workers AI)"
bun scripts/hark-debug.ts stop >/dev/null 2>&1
[[ -n "${HARK_TEST_TOKEN_CMD:-}" ]] && export HARK_TEST_TOKEN=$(eval "$HARK_TEST_TOKEN_CMD")
bun scripts/hark-eval.ts scenarios --out=receipts/hark-eval-text.json; text=$?
[[ $text -eq 0 ]] || fail=1
step "audio suite (Aura into the socket, Flux transcribes)"
bun scripts/hark-debug.ts stop >/dev/null 2>&1
[[ -n "${HARK_TEST_TOKEN_CMD:-}" ]] && export HARK_TEST_TOKEN=$(eval "$HARK_TEST_TOKEN_CMD")
bun scripts/hark-eval.ts scenarios --audio --out=receipts/hark-eval-audio.json
bun scripts/hark-debug.ts stop >/dev/null 2>&1
node -e '
const fs=require("fs");
const t=JSON.parse(fs.readFileSync("receipts/hark-eval-text.json"));
const a=JSON.parse(fs.readFileSync("receipts/hark-eval-audio.json"));
const need=Math.max(10,Math.ceil(a.of*10/12));
const out={at:new Date().toISOString(),text:{passed:t.passed,of:t.of},audio:{passed:a.passed,of:a.of,need},e2e:process.argv[1],check:process.argv[2]};
fs.writeFileSync("receipts/hark-debug.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out));
process.exit(a.passed>=need?0:1);
' "$e2e" "$(cat .scratch/gate-check.txt)" || fail=1
[[ $fail -eq 0 ]] && echo "GATE PASSED" || echo "GATE FAILED"
exit $fail
