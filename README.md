<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/hark-wordmark.svg">
    <img src="docs/brand/hark-wordmark-dark.svg" width="230" alt="hark">
  </picture>
</p>

<p align="center"><b>A voice you talk to. There is no chat box.</b><br>
It listens, thinks, and answers out loud, and every word is heard, thought, and spoken on <i>your own</i> Cloudflare account.</p>

<p align="center">
  <a href="https://hark.coey.dev">hark.coey.dev</a> ·
  <a href="#what-happens-when-you-talk">How it works</a> ·
  <a href="#built-on-cloudflare">Built on Cloudflare</a> ·
  <a href="#deploy">Deploy</a> ·
  <a href="#proof">Proof</a> ·
  <a href="#limits">Limits</a>
</p>

<img src="docs/hero-desktop.png" alt="hark answering a question about the weather in Lisbon: a glowing ear in the middle of a dark screen, a weather card beside it, and the time from the end of speech to the first spoken word in the corner.">

You open it and tap the ear (or press space). From then on you just talk. hark knows when you have finished a thought, often before you do, and starts answering in a voice. Talk over it and it stops. Ask it what is in front of you and it looks through your camera. Ask it for a picture and one appears. Say goodbye and it closes the microphone.

The only things on screen are the ear, which moves with your voice and with its own, and the cards it chooses to show you: the weather, a picture it painted, a timer, what it just remembered. There is no transcript and nowhere to type.

hark is one Cloudflare Worker. Each person gets a [Durable Object](https://developers.cloudflare.com/durable-objects/) that holds their voice line, memory, and timers. You sign in with your Cloudflare account, and every model call runs on your own Workers AI with your own token. hark has no model bill of its own.

<img src="docs/hero-phone.png" width="260" align="right" alt="hark on a phone with a weather card under the ear">

## What happens when you talk

```
mic ─▶ AudioWorklet: 16 kHz PCM, 80 ms frames ─▶ WebSocket ─▶ your Durable Object
                                                                   │
                     ┌──────────── your Workers AI, your token ────┤
                     ▼                                             │
     Deepgram Flux (WebSocket)  StartOfTurn · EagerEndOfTurn · TurnResumed · EndOfTurn
                     │
       EagerEndOfTurn ─▶ start thinking now, hold the audio behind a gate
       TurnResumed    ─▶ throw that away, keep listening
       EndOfTurn      ─▶ same words? open the gate : start over
                     │
     Workers AI brain (streamed, with tools) ─▶ sentence chunker ─▶ Aura 1 or 2, 3 in flight, streamed
                     │                                                    │
                     └─ tools: weather, look up, timers, memory, camera, paint, voice, sleep
                                                                          ▼
                     speaker ◀─ AudioWorklet ring buffer ◀─ 24 kHz PCM, tagged with its turn
```

- **It starts before you finish.** Flux sends `EagerEndOfTurn` when it thinks you are probably done. hark starts the model and the voice right then, but holds every byte of audio behind an [Effect](https://effect.website) `Deferred`. If you keep talking (`TurnResumed`), that work is interrupted and thrown away. If Flux confirms the same words (`EndOfTurn`), the gate opens and the first sentence is often ready already. The corner of the screen shows the real number: milliseconds from the moment Flux decided you were done to the first audio hark sent.
- **You can talk over it.** When you start speaking while it talks, it ducks its own volume at once. If what you say turns out to be words and not a cough, the turn's fiber is interrupted, the model request is aborted (so your account stops paying for tokens nobody will hear), and the browser drops everything already queued. What it had said so far goes into its memory of the conversation, marked as cut off.
- **It speaks in sentences, in order.** The reply streams from the model into a chunker that cuts the first piece early, at a comma if need be, so the voice starts fast. Later pieces are longer, so they sound natural. Up to three sentences are synthesized at once. Each one streams to your speaker as its audio arrives, and they always play in order.
- **The browser says when it has finished speaking.** Audio arrives faster than it plays. The playback worklet reports when its buffer runs dry, and only then does hark go back to listening.

## What it can do

| Ask | What happens | Runs on |
| --- | --- | --- |
| "What's the weather in Lisbon?" | A forecast card, and a spoken answer | [Open-Meteo](https://open-meteo.com) |
| "Who was Ada Lovelace?" | A card with the article, and a short spoken answer | Wikipedia |
| "Set a timer for ten minutes for the pasta" | A live countdown. When it ends, hark says so, even mid-silence | Durable Object alarm |
| "Remember that I take my coffee black" / "Forget that" | Saved to, or deleted from, your own memory | Durable Object SQLite |
| "What am I holding?" (camera on) | It takes one frame and a vision model describes it, so any brain can see | Gemma 4 vision, your account |
| "Paint me a lighthouse in a storm" | The picture appears on your screen | FLUX.2 klein, your account |
| "Talk like a man" / "Use the Orion voice" | It switches voice mid-conversation | Aura, your account |
| "Thanks, that's all" | It says goodbye and closes the microphone | |
| "Scaffold a node project and run it" | It works in your own durable Linux computer and shows a terminal card. `/workspace` survives restarts | Containers, on your Durable Object |
| "Search the web for what's new in Workers" | A sources card and a short spoken answer | Web search from your computer |
| "Open example.com" | A browser card with a screenshot or the page text | Browser Rendering on your token, or your computer |
| "Give me a status report on my account" | It calls the Cloudflare API with your sign-in and shows a report card. It asks before it deletes or changes anything | Cloudflare API, your token |
| "Build me a 3D rocket" | It sculpts the object from parts in the embers and spins it | Your browser |
| "Make that your resting shape" | The swarm loops it whenever nothing else is showing | Durable Object SQLite |

## Built on Cloudflare

| Product | What hark uses it for |
| --- | --- |
| [Workers](https://developers.cloudflare.com/workers/) | The whole app: sign-in, the page, the voice socket. Static assets ship with it |
| [Durable Objects](https://developers.cloudflare.com/durable-objects/) | One per person. It holds the browser socket and the Flux socket, runs each turn as a fiber, keeps memory and history in SQLite, and wakes itself with alarms for timers |
| [Workers AI](https://developers.cloudflare.com/workers-ai/): [Deepgram Flux](https://developers.cloudflare.com/workers-ai/models/flux/) | Hearing, with turn detection made for voice agents: `StartOfTurn`, `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn` |
| Workers AI: [Aura 1](https://developers.cloudflare.com/workers-ai/models/aura-1/) and [Aura 2](https://developers.cloudflare.com/workers-ai/models/aura-2-en/) | The voice. Aura 1 by default because it starts talking about 4.7 times sooner; Aura 2 when you want it richer. 18 voices, raw 24 kHz PCM, so nothing gets decoded in the browser |
| Workers AI: [GPT-OSS 20B](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/) and 120B, [Gemma 4](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), [Kimi K2.6](https://developers.cloudflare.com/workers-ai/models/kimi-k2.6/) | The brain, streamed with tool calls. GPT-OSS 20B by default: it was the fastest in our benchmark below. Gemma 4 also gives hark its eyes. OpenAI brains are optional and go through your own AI Gateway |
| Workers AI: [FLUX.2 klein](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/) | Pictures, with FLUX.1 schnell as a fallback |
| [Containers](https://developers.cloudflare.com/containers/) | Your computer: a durable Linux box with a file tree and a live terminal in the page |
| MCP | Connect any MCP server, with or without OAuth, and hark calls its tools by voice |
| Sign in with Cloudflare (OAuth) | PKCE. The token never reaches the browser |

## Sign in

How it works (`src/auth/`):

1. `/oauth/login` sends you to Cloudflare's consent screen with PKCE. hark always asks for `offline_access ai.read ai.write`, plus the scopes in `OAUTH_EXTRA_SCOPES` (`scripts/demo-scopes.txt` lists the 41 that hark.coey.dev asks for).
2. `/oauth/callback` exchanges the code and reads your user and your first granted account.
3. The grant (account, access and refresh tokens) goes into the `Directory` Durable Object. Your browser gets only an HMAC-signed `__Host-hark_session` cookie.
4. Your `Hark` Durable Object reads the grant when it wakes and refreshes the token a minute before it expires. Signing out revokes it at Cloudflare.
5. Workers AI is the only thing hark needs. Extra scopes let the agent do real work on your account. Your OAuth client must allow each scope first (dashboard, Manage account, OAuth clients). A product that refuses the token does not sign you out.

## Deploy

One command per instance, with one config file that never leaves your machine.

**You need** Bun, a Cloudflare account with a zone for the hostname, and `npx wrangler login`. You also need an OAuth client from **Manage Account → OAuth clients** with the redirect URL `https://<host>/oauth/callback` and the scopes above.

```sh
git clone https://github.com/acoyfellow/hark && cd hark && bun install
cp deploy/example.conf deploy/mine.conf      # git ignores deploy/*.conf
$EDITOR deploy/mine.conf                      # account, host, OAuth client id
bun run ship -- deploy/mine.conf
```

`ship` runs the gate, builds the client, and deploys to the hostname. It then checks that the `OAUTH_CLIENT_SECRET` and `SESSION_SECRET` Worker secrets exist, and fails unless the live site serves the landing page, redirects `/oauth/login` to Cloudflare with the AI scopes, and refuses the voice socket to a stranger (`scripts/check-edge.sh`).

### Run locally

```sh
bun install && npx playwright install chromium
bun run dev            # hark on http://127.0.0.1:8790 against a fake Cloudflare, no sign-in
bun run e2e            # real Chromium with a fake microphone, the whole conversation
```

`scripts/fake-cloudflare.mjs` stands in for Cloudflare. It has a Flux that detects speech by energy and emits real Flux events, a scripted brain that streams text and makes tool calls, an Aura that returns PCM, and a FLUX that returns an image. It refuses any call that lacks the token. Weather and Wikipedia stay real.

To talk to it with your own Workers AI instead, put `LOCAL_CF_TOKEN` (from `npx wrangler auth token`), and `LOCAL_CF_ACCOUNT` in `.dev.vars` and run `npx wrangler dev --var LOCAL_DEV_WITHOUT_AUTH:1`. All of the local-only switches work only on loopback hosts, and `bun run check` fails if any of them appear in `wrangler.jsonc`.

## Proof

`bun run check` builds the client, typechecks both sides, lints, and runs 101 tests: sign-in and forged state, token refresh and sign-out, the upstream routes, the turn (order, streaming, tools, eager gate, barge-in, filler and recovery), tool calls a brain writes as text, the echo gate, MCP server URLs, speech prep, and the client stories.

`bun run e2e` drives the real Worker, Durable Object, worklets, and socket in headless Chromium. A synthesized voice plays into the fake microphone. Result ([`receipts/e2e-local.json`](receipts/e2e-local.json)):

```
pass  the page renders asleep with the ear and no chat box
pass  tapping the ear opens the line to the account and starts listening
pass  a spoken question gets a tool call, an article card, and a spoken answer
pass  the browser plays the whole answer and reports it, then hark listens again
pass  remember stores a fact and shows it
pass  show_form plays a two-beat particle movie (3D heart, then a drawing), with no card
pass  paint forms the picture in the swarm first, then hands it to a card
pass  talking over a long answer interrupts it (barge-in)
pass  a timer counts down and hark announces it when it ends (Durable Object alarm)
pass  with the camera on, asking about it takes one frame and looks
pass  saying goodbye puts hark to sleep and closes the microphone
pass  one tap wakes it again after it slept, and it listens
pass  report and alert widgets appear beside the swarm
pass  a 3D model beat sculpts an object in the swarm
pass  the durable computer runs a command and shows a terminal card
pass  the settings sheet shows the stack, voices, and brains
pass  every upstream call went straight to Workers AI with the account token
pass  the desktop layout keeps cards off the ear and nothing overflows
pass  the phone layout renders asleep, then talks and shows a card
pass  the phone never zooms or scrolls: double tap, pinch and swipe leave scale 1 and scroll 0
pass  the landing page offers Sign in with Cloudflare on desktop and phone
pass  no uncaught page errors
```

`node scripts/verify-demo.mjs` proves the workspace and MCP paths against a fake MCP server with OAuth: 12/12 ([`VERIFY.md`](VERIFY.md), [`receipts/demo-verify.json`](receipts/demo-verify.json)).

All of the above runs against the fake. The numbers below were measured against real Workers AI.


`scripts/bench.mjs` measures latency on a real account: speech end → Flux end of turn → first sentence of text → first audio, per brain and voice engine, with completion rates next to p50 and p95. It writes `receipts/bench-live.json`.

First live run, from a laptop straight to Workers AI on a real account (`HARK_ROUTE=direct`, 5 runs per pipeline, [`receipts/bench-live-direct.json`](receipts/bench-live-direct.json)):

| Pipeline | Completed | Speech end → first audio, p50 / p95 | Starting on the eager end of turn, p50 |
| --- | --- | --- | --- |
| **Flux + GPT-OSS 20B + Aura 1** (default) | 5/5 | 1,642 / 1,789 ms | 1,395 ms |
| Flux + GPT-OSS 120B + Aura 1 | 5/5 | 1,720 / 2,367 ms | 1,568 ms |
| Flux + GPT-OSS 20B + Aura 2 | 4/5 | 1,871 / 1,992 ms | 1,778 ms |
| Flux + Gemma 4 (thinking off) + Aura 1 | 4/5 | 2,388 / 2,462 ms | 1,731 ms |

These stop at the first audio byte on the laptop, not at playback in a browser. The four incomplete runs never got an `EndOfTurn` because the benchmark stopped sending audio too early; the benchmark now keeps sending silence the way hark's microphone does.

`scripts/probe.mjs` checks the real thing without a browser. Aura says a sentence, Flux hears it back, the brain calls a tool, and FLUX paints, all on a real account. It writes `receipts/live-probe.json`.

## What it learned from

Never stop feeding the recognizer, wait for the browser to finish playing, fill slow tools, default to the pipeline that measured fastest, and log every turn.

## Limits

- **English only.** Flux and `aura-2-en` are English models.
- **It bills the account you pick.** Flux is billed per minute of audio streamed while hark is awake (about $0.008 a minute at list price), so it sleeps after two quiet minutes and when you say goodbye. Aura is billed per character spoken.
- **Echo depends on your browser.** hark asks for echo cancellation. Where that is weak (loud speakers, some Bluetooth headsets), it may hear itself. It only ducks on sound, and it stops talking only after real words, so a stray echo dims it without cutting it off.
- **One tab at a time.** Opening hark somewhere else takes the line over, and the first tab says so.
- **No wake word.** Tap the ear or press space.
- **Timers speak only while hark is open.** If one ends while it sleeps, it tells you the next time you wake it.
- **It keeps a short memory of the conversation** (the last 24 messages, text only) and the facts you ask it to remember, in your Durable Object. Audio and camera frames are never stored.
- **Weather and Wikipedia are public APIs** called from the Worker, not from your account.

## Where things live

| Path | What |
| --- | --- |
| [`src/hark.ts`](src/hark.ts) | The per-person Durable Object: sockets, Flux turn events, eager gate, barge-in, memory, timers |
| [`src/turn.ts`](src/turn.ts) | One turn as an Effect: stream, chunk, speak in order, tools, interruptible |
| [`src/upstream.ts`](src/upstream.ts) | Every model call: Flux, the brain, Aura, and FLUX on the person's Workers AI |
| [`src/tools.ts`](src/tools.ts), [`src/prompt.ts`](src/prompt.ts) | What it can do and how it talks |
| [`src/auth/`](src/auth) | Sign in with Cloudflare |
| [`src/computer.ts`](src/computer.ts), [`src/terminal.ts`](src/terminal.ts) | Your computer: the container, files, and the terminal |
| [`src/mcp-servers.ts`](src/mcp-servers.ts), [`src/mcp-oauth.ts`](src/mcp-oauth.ts) | Any MCP server, with OAuth |
| [`client/src/`](client/src) | The page ([Foldkit](https://foldkit.dev) on Effect, Tailwind 4): the ear, the cards, the dock |
| [`client/src/engine.ts`](client/src/engine.ts), [`public/audio/`](public/audio) | Microphone, speaker, and the two AudioWorklets |
| [`shared/protocol.ts`](shared/protocol.ts) | Every frame that crosses the socket, as a Schema |
| [`scripts/fake-cloudflare.mjs`](scripts/fake-cloudflare.mjs), [`scripts/e2e.mjs`](scripts/e2e.mjs) | The local proof |

## License

MIT
