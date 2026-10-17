# Working on hark

Read the README and SPEC first.

## Before you say a change works

- `bun run check` must print `all checks passed`.
- If you touched the voice path (worklets, engine, socket, Durable Object, turn, protocol), also run `bun run dev` and `bun run e2e`. It must print `22/22 scenarios passed`.
- If you touched anything that calls Cloudflare, run `node scripts/probe.mjs` against a real account (see the header of the script) and commit `receipts/live-probe.json`.
- If you changed the UI, look at the screenshots `bun run e2e` writes to `receipts/shots/`.

## Rules

- Voice comes first. A swipe-up overlay may show the live transcript: what was heard, what hark said, each tool call and each error. It is hidden by default. A text input may come later. There are never saved conversations: no conversation list, no threads, no history browser, no resuming an old chat. Visual cards are allowed only for what words cannot carry well (a forecast, a picture, a countdown).
- Effect stays at exactly `4.0.0` and Foldkit at `0.168.0`.
- Every frame that crosses the socket is a Schema in `shared/protocol.ts`.
- The token never leaves the Durable Object. Do not add a route that returns it or forwards it to the browser.
- Every model call goes through `src/upstream.ts`, on the person's own Workers AI with their token.
- Keep `workers_dev: false` and `preview_urls: false`. Local-only switches (`LOCAL_DEV_WITHOUT_AUTH`, `HARK_FAKE_ORIGIN`, `LOCAL_CF_*`) work only on loopback hosts and never go in `wrangler.jsonc`.
- An interrupted turn must abort its requests. If you add a new upstream call inside a turn, give it the turn's signal.
- Never commit account IDs, tokens, or `deploy/*.conf`.
- Do not add source comments. Use names, types, and small functions.

## Honesty in docs

- Say what was measured against the fake and what was measured against real Workers AI, and keep the two apart.
- Latency numbers come from `Measured` frames or receipts, never from estimates.
