<img src="docs/brand/hark-mark.svg" width="72" alt="">

# hark

**A voice agent that stays.** Sign in with Cloudflare, tap, and talk. It runs on *your* account, remembers you, and has its own computer.

[hark.coey.dev](https://hark.coey.dev) · [How it works](#how-it-works) · [Deploy](#deploy) · [Proof](#proof) · [Limits](#limits)

<img src="docs/hero-desktop.png" alt="hark asleep: a ring of orange embers on a dark screen, the block mark top left, and Tap to talk.">

## What it is

- **Voice only.** No chat box, no transcript. You talk and it answers out loud. Cards appear only for what words carry badly: a forecast, a picture, a timer, a 3D shape.
- **Your account.** Sign in with Cloudflare (OAuth). Every model call runs on your own Workers AI with your own token. hark has no model bill.
- **It stays.** Each person gets one Durable Object. Memory, history, timers, and connected tools survive a closed tab.
- **Its own computer.** A durable Linux container with a file tree and a live terminal.
- **Any MCP server.** Connect one by URL, with or without OAuth, and hark calls its tools by voice.
- **Fast.** It starts answering before you finish, and stops when you talk over it.

## What you can ask

| Say | What happens |
| --- | --- |
| "What's the weather in Lisbon?" | A forecast card and a spoken answer |
| "Set a timer for ten minutes" | A countdown. hark tells you when it ends |
| "Remember I take my coffee black" | Saved in your Durable Object |
| "What am I holding?" | It looks through your camera |
| "Paint a lighthouse in a storm" | A picture forms in the swarm |
| "Build me a 3D rocket" | The swarm sculpts it and spins it |
| "Open my computer" | Files and a terminal on your container |
| "How are my Workers doing?" | It calls the Cloudflare API with your sign-in |
| "Thanks, that's all" | It says goodbye and closes the mic |

## How it works

```
mic ─▶ AudioWorklet (16 kHz PCM) ─▶ WebSocket ─▶ your Durable Object
                                                     │
            Deepgram Flux ◀──── your Workers AI ─────┤
              EagerEndOfTurn ─▶ start thinking, hold the audio
              TurnResumed    ─▶ throw it away
              EndOfTurn      ─▶ play it
                                                     │
            brain + tools ─▶ sentences ─▶ Aura ─▶ speaker
```

- **Eager turns.** When Flux thinks you are done, hark starts the brain and the voice, but holds the audio in an [Effect](https://effect.website) `Deferred` until Flux confirms.
- **Barge-in.** Talk over it and the turn is interrupted. The model request is aborted, so you stop paying for words nobody hears.
- **In order.** Up to three sentences synthesize at once, and they always play in order.
- **The token never reaches the browser.** It lives in a Durable Object. The browser gets only a signed cookie.

Built with [Workers](https://developers.cloudflare.com/workers/), [Durable Objects](https://developers.cloudflare.com/durable-objects/), [Workers AI](https://developers.cloudflare.com/workers-ai/) (Flux, Aura, GPT-OSS, Gemma 4, Kimi, FLUX.2), [Containers](https://developers.cloudflare.com/containers/), the [Agents SDK](https://github.com/cloudflare/agents), and [Foldkit](https://foldkit.dev).

## Deploy

You need Bun, a Cloudflare zone for the hostname, `npx wrangler login`, and an OAuth client (Manage Account → OAuth clients) with the redirect URL `https://<host>/oauth/callback`.

```sh
git clone https://github.com/acoyfellow/hark && cd hark && bun install
cp deploy/example.conf deploy/mine.conf   # git ignores deploy/*.conf
$EDITOR deploy/mine.conf                   # account, host, OAuth client id
bun run ship -- deploy/mine.conf
```

`ship` runs the checks, deploys, and then checks the live site: the landing page, the OAuth redirect, and a voice socket that refuses strangers.

hark always asks for `offline_access ai.read ai.write`. Set `OAUTH_EXTRA_SCOPES` to ask for more. hark.coey.dev uses the 41 in `scripts/demo-scopes.txt`. Your OAuth client must allow each one.

### Run locally

```sh
bun install && npx playwright install chromium
bun run dev    # http://127.0.0.1:8790 against a fake Cloudflare, no sign-in
bun run e2e    # real Chromium, fake microphone, the whole conversation
```

## Proof

**Against the fakes** (`scripts/fake-cloudflare.mjs`, `scripts/fake-ax-mcp.mjs`):

- `bun run check`: build, types, lint, and 101 unit tests.
- `bun run e2e`: 22/22 scenarios, from waking up to goodbye, on desktop and phone. Every upstream call carried the token. [Receipt](receipts/e2e-local.json).
- `node scripts/verify-demo.mjs`: 12/12 for the workspace and MCP with OAuth. [Receipt](receipts/demo-verify.json).

**Against real Workers AI** (`scripts/bench.mjs`: 5 runs each, from the end of speech to the first audio byte, [receipt](receipts/bench-live-direct.json)):

| Pipeline | p50 / p95 | p50 on the eager end of turn |
| --- | --- | --- |
| **Flux + GPT-OSS 20B + Aura 1** (default) | 1,642 / 1,789 ms | 1,395 ms |
| Flux + GPT-OSS 120B + Aura 1 | 1,720 / 2,367 ms | 1,568 ms |
| Flux + GPT-OSS 20B + Aura 2 | 1,871 / 1,992 ms | 1,778 ms |

`node scripts/probe.mjs` checks a real account without a browser: Aura speaks, Flux hears it, the brain calls a tool, and FLUX paints.

## Limits

- English only.
- It bills the account you pick. Flux costs about $0.008 a minute while hark is awake, so it sleeps after two quiet minutes.
- Echo cancellation depends on your browser and speakers.
- One tab at a time. No wake word.
- It keeps the last 24 messages as text. It never stores audio or camera frames.

## Where things live

| Path | What |
| --- | --- |
| [`src/hark.ts`](src/hark.ts) | The per-person Durable Object |
| [`src/upstream.ts`](src/upstream.ts) | Every model call |
| [`src/tools.ts`](src/tools.ts) | What it can do |
| [`src/auth/`](src/auth) | Sign in with Cloudflare |
| [`src/computer.ts`](src/computer.ts), [`src/terminal.ts`](src/terminal.ts) | Your computer |
| [`src/mcp-servers.ts`](src/mcp-servers.ts) | MCP servers |
| [`client/src/`](client/src) | The page |
| [`shared/protocol.ts`](shared/protocol.ts) | Every socket frame, as a Schema |

[Spec](SPEC.md) · [Security](SECURITY.md) · MIT
