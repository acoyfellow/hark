# hark handoff (2026-10-15)

Status when written. Branch `agents-voice` @ 70068e5. Production `hark.coey.dev` still runs `main` @ dc64ab6, the homegrown pipeline. **Nothing on this branch is deployed.**

## Goal (Jordan's definition of done)

1. hark runs on our fork of `agents/voice`, with every upgrade the homegrown pipeline had, so the fork can become one upstream PR.
2. That PR includes an end-to-end "a2a" proof: a scripted caller that really talks to the real hark over real audio, checks the answers, and measures timings.
3. Polished SEO and PWA, deployed.
4. No dead code paths.
5. Verified auth story: when a person signs in and grants permissions, inference runs on **their** Cloudflare account, not Jordan's.

## Where things are

### Fork: `acoyfellow/agents`, branch `voice/eager-turns-and-playback` (93aa507, on upstream f56cd20)
- `1b59e11` Speculative turns. Flux `EagerEndOfTurn`/`TurnResumed` reach the session as `onEagerUtterance`/`onTurnResumed`. `withVoice({ speculativeTurns: true })` starts `onTurn` early and holds every frame (a Proxy around `connection.send`) until the final transcript confirms the same words. Adds `context.speculative` and `context.confirmed`.
- `1e13964` Metrics: `finalInputToFirstAudioMs` is measured from confirmation; new `speculativeLeadMs`.
- `93aa507` `VoiceClient`: status stays `speaking` until playback drains, plus `isPlaying`, `interruptMode: "duck"` (`duckVolume`, `duckReleaseMs`), and `playbacklevelchange`/`playbackLevel`. Also updates `docs/agents/voice.md` and adds the changeset (`agents` minor).
- **Local gate (passed):** root `pnpm run build`, `pnpm run check` (133 projects), voice-workers 255 tests (15 new), no retries.
- **GitHub gate:** throwaway branch `ci/voice-gate` runs the PR workflow on push, with `nx run-many -t test`. Run 38712204424 passed build and check, but the full test step was still `in_progress` past 30 minutes (35-minute cap). **Check its result once. Do not sleep-poll.** If it timed out, rerun only the `agents` package projects, or open the real PR and let upstream CI run it. Delete `ci/voice-gate` afterwards.
- Before the PR: rebase on upstream `main`, and squash into the three commits above.
- **Do not open the upstream PR. Jordan sends it.**

### hark branch `agents-voice`
- `Hark extends withVoice(Agent, { speculativeTurns: true, audioFormat: 'pcm16', sampleRate: 24000 })`.
- Flux and Aura run through the user's gateway via `src/user-ai.ts` and `src/speech.ts`.
- `onTurn` returns `reply()` (`src/reply.ts`). Tools await `context.confirmed`.
- Client wraps `VoiceClient` with `interruptMode: 'duck'`. The ear follows `playbacklevelchange`.
- `package.json` pins `"agents": "file:./vendor/agents-0.28.1-voice-93aa507.tgz"`. Rebuild with `pnpm pack` in the fork's `packages/agents` after a root build, and bump the filename when the fork changes.
- Gate: `bash scripts/check.sh` passes (45 unit tests). e2e is 17/17 locally and on CI (workflow_dispatch run 38710476713).
- Fake-service numbers prove the mechanism only: first turn speculative, lead 319 ms, first audio 63 ms after confirmation. No real-service numbers exist for this branch yet.
- `docs/upstream.md` tracks gaps P1–P6.

## What is left

### 1. Parity with the homegrown pipeline (verify, do not assume)
| Upgrade | Branch status |
| --- | --- |
| Eager hold, no tools on unconfirmed turn | Fork P1/P6, e2e proves on fake Flux. **Unproven on real Flux** through the user gateway: does the gateway WebSocket pass `eager_eot_threshold` and emit `EagerEndOfTurn`? Tune `EAGER_EOT_THRESHOLD` (0.5) |
| Browser playback-complete | Client-side only now (status follows playback). The homegrown server got a `SpeechEnd` from the browser. The server no longer knows when audio finished. Decide whether goodbye/sleep and timer announcements need that; if so, add a client→server `playback_complete` to the fork |
| Duck-first barge-in | Fork P3. Unproven with real echo on a laptop speaker, or on iOS Safari |
| Real speaking meter | Fork P5. Unproven on real devices |
| Filler, recovery line, flattened tool results, timers (`schedule`), missed-timer announcement, camera look, goodbye sleep, one-tap rewake, settings, gateway picker, latency readout | e2e covers these against fake services. Re-verify on prod |
| Live latency | Homegrown benchmark: 1,642/1,789 ms p50/p95 (`receipts/bench-live-direct.json`). **Rerun on the branch with the audio probe and compare** |

### 2. Dead code (found, not yet removed)
- `SpeechEnd`: still in `shared/protocol.ts:143` and `client/src/update.ts:88`, but nothing sends it. The e2e maps SDK `metrics` to `SpeechEnd` (`scripts/e2e.mjs:89`). So the scenario "the browser plays the whole answer and reports it" **no longer proves browser playback completion**: `metrics` is a server-side signal. Rewrite that scenario to assert on the client's `speaking`→`listening` timing against the audio it received, or remove `SpeechEnd` entirely.
- `primeAudio` is a no-op (`client/src/engine.ts:21`, wired in `client/src/entry.ts:12`). Delete it, or make it unlock the AudioContext on first gesture (iOS needs this; check).
- `scripts/probe.mjs` and `scripts/bench.mjs` were written for the homegrown socket. Fold them into the audio probe or delete them.
- `src/chat.ts` holds types only. Check every export is used.
- `latency.eager` semantics changed: it now means "speculative". Rename it or document it.
- Run an unused-export pass (e.g. `knip`) and add it to `scripts/check.sh`, so "no dead code" is part of the gate.

### 3. SEO and PWA polish (status unverified on this branch)
v1 shipped a manifest, icons (`scripts/build-icons.mjs`) and social images (`scripts/build-social.mjs`). Still to check:
- title, description, canonical, Open Graph and Twitter tags
- `robots.txt`, `sitemap.xml`
- manifest fields, maskable icons, `theme-color`, iOS meta tags
- whether a service worker or offline shell exists
- Lighthouse SEO, PWA and best-practices scores on the deployed URL

Add a Lighthouse or edge check to `scripts/check-edge.sh` so ship fails if they regress.

### 4. Audio probe (not started), to become its own repo
Proposed repo: `acoyfellow/audio-probe` (private until Jordan says). hark uses it as a dev dependency; the upstream PR includes an example run.
- **Caller side:** a script, not a second LLM. It speaks scripted lines: WAV fixtures rendered once (macOS `say`, or Aura on the test account).
- **Real browser path:** Playwright Chromium loads the real hark URL. `navigator.mediaDevices.getUserMedia` is overridden to return a MediaStream that the probe feeds in real time. The page's output is tapped by patching `AudioNode.prototype.connect`, so anything going to `ctx.destination` or a `MediaStreamAudioDestinationNode` is also recorded and shipped back to Node. This exercises `VoiceClient`'s real capture worklet, resampling, socket, playback and barge-in. It's app-agnostic, so it works for any web voice agent.
- **Checks:** transcribe hark's received audio (Whisper/Nova on the test account) and assert content per line (keywords: weather, timer, goodbye). Detect hark's speech with a simple energy VAD on the received audio, not with protocol frames.
- **Timings, measured at the probe ear:**
  - caller speech end → first audible hark audio (p50/p95)
  - eager lead (from `turn_metrics`)
  - barge-in: caller starts talking → hark audio stops
  - playback end → hark status `listening`
  - one full turn round trip
- **Artifacts:**
  - a JSON receipt per run
  - a video: Playwright `recordVideo` of the hark UI muxed with ffmpeg with both audio tracks (caller and hark) on one timeline; a caption overlay with timings is fine since it's a test artifact
  - a junit-style pass/fail for CI
- **Run modes:** `--target local` (fake Cloudflare, runs in CI) and `--target https://hark.coey.dev --session <storageState>` (real).

### 5. The auth story: how the probe talks to real hark, and how to prove whose account pays
Real hark needs a signed-in session. Use a **separate test Cloudflare account** (not Jordan's), so attribution is provable.
1. One time, headed: run the probe's `login` command. A human signs in with the test account in Playwright, picks it in the consent account picker, and grants permissions. The probe saves Playwright `storageState` (hark's session cookie only; the OAuth token never leaves the Durable Object). Store it as a local file, or as a CI secret for scheduled runs. When it expires the probe must fail clearly with "signed out", never fall back.
2. Every run, verify **whose account ran inference**:
   - before talking, call hark `/oauth/me` and record the account id
   - after the run, with the **test account's own** API token (read-only AI Gateway logs), list that account's gateway logs for the run window, and match counts per model (Flux, gpt-oss, Aura, FLUX image) to the turns spoken
   - negative check: Jordan's account gateway logs show **zero** entries in the same window from hark's Worker
   - write all three into the receipt
3. Static guarantee in the gate: `wrangler.jsonc` has no `ai` binding and no account API token secret, and every model call goes through `src/upstream.ts`, which uses the session's token. Add a grep test to `scripts/check.sh`.
4. Also re-verify with Jordan's real account (the existing `receipts/live-signin.json` flow), since he is the first real user.

### 6. Deploy (Stage C)
Run from the hark Pi on Jordan's Mac (`~/cloudflare/hark`, `deploy/coey.conf`):
1. `git checkout agents-voice && bun install && bash scripts/check.sh`
2. `bun run ship -- deploy/coey.conf` (the edge check must pass)
3. Run the audio probe against prod with the test account, then check gateway attribution
4. Real sign-in turn with Jordan's account

**Rollback:** check out `main` and ship again. Merge to `main` only after the probe receipt is green.

## Rules that still apply
- No transcript, captions or text box in hark.
- The token never leaves the Durable Object. Every model call goes through `src/upstream.ts`.
- `workers_dev: false`, `preview_urls: false`.
- Local-only vars never go in `wrangler.jsonc`.
- No source comments. Never commit secrets, account ids or `deploy/*.conf`.
- Use only the dedicated hark Pi (cmux workspace 77A21490…, surface B60A7EA5…). Never the coil Pi. Do not drive Jordan's browser without asking.
- hark stays a private repo. The fork is public by nature.
- Long CI: start it and check later. Never sleep-poll for minutes.
- An unverified read-only prompt was sent to the hark Pi at ~09:36 UTC (asking how `/tmp/prod-turn.mjs` authenticates, whether a Workers AI token exists, whether ffmpeg is installed). Check its terminal; ignore it if it did not land.
