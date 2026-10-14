# What we already learned about voice agents, and what hark does with it

Three internal sources, read on 2026-10-14:

1. **My AX voice mode**, the voice agent Jordan uses every day: `acoyfellow/my-ax` issues #213 and #285, PRs #225, #293, and #323, plus the bug write-up from 2026-08-15 (V1 to V3).
2. **The Voice Agents Showcase** (Abdulsaboor Shaikh and Ashu Jainvi, summer 2026). Wiki pages: *Voice Agents Showcase at Cloudflare*, *Voice showcase benchmark results*, *Voice Agent Lifecycle and Metrics*, *Voice Agents Handoff*, and *Voice Agent Playground Research: Deployment*.
3. **The official voice template**, `cloudflare/templates/voice-agent-template`, built on `@cloudflare/voice`.

## Findings, and what hark does about each

| # | Finding | Source | hark |
| --- | --- | --- | --- |
| 1 | **Streaming STT dies if you stop feeding it.** My AX muted the mic while it spoke. The recognizer then never produced a second transcript, so you could never take a second turn. | my-ax #213, PR #225 | The mic is never muted. Every 80 ms frame goes to Flux, including while hark speaks, which is also what makes barge-in possible. If Flux closes, the Durable Object reopens it. |
| 2 | **"Listening" is shown while the agent's audio is still playing.** The SDK reports pipeline completion, not browser playback, and it exposes no playback-complete event. | Lifecycle and Metrics, rows 7, 24, 25 | The playback worklet reports `Played` when its buffer runs dry. Presence returns to `listening` only after that. |
| 3 | **The session dies at the end of a turn, and re-enabling takes two taps.** The cause was incomplete end-of-turn teardown. | my-ax V2, V3 | Turns are fibers. Ending, failing, or interrupting one always clears `running`. e2e: *one tap wakes it again after it slept*. |
| 4 | **Long silence while it works.** Nothing is spoken until the whole answer is ready. | my-ax V1 (P0) | The first sentence is cut early and streamed chunk by chunk. If a tool runs longer than 500 ms with nothing said yet, hark says a short filler ("One moment."), the same rule as the template's `ephemeralSpeech.ts`. |
| 5 | **The agent did not know it was speaking**, so it read markdown tables aloud to someone driving. | my-ax bug write-up | There is no other channel. The prompt is voice-only, `speakable()` strips markdown and URLs, spells acronyms, and turns dashes into pauses (after the template's `speechPreparation.ts`). |
| 6 | **An expired gateway token made every turn fail with `Unauthorized`.** The reconnect noise also filed GitHub issues. | my-ax #285, PR #293 | Tokens refresh a minute before expiry. If refresh fails or the gateway answers 401, the turn ends with "sign in again", the socket closes with 4401, and the page returns to sign-in. Nothing loops. |
| 7 | **Gemma and GLM were 4 to 10 times slower to first text than GPT-OSS** (p50 6.0 s and 11.0 s, against 1.1 s), and Gemma often timed out. Reasoning was left on. | Benchmark results | The default brain is now `gpt-oss-20b` with `reasoning_effort: low`, as in the template. Gemma stays selectable, with thinking off, labeled "measure before you trust it". |
| 8 | **Aura-2 was 4.7 times slower to first audio than Aura-1** (3.56 s against 0.76 s average). | Benchmark results | The default voice engine is now Aura-1 ("Quick"). Aura-2 ("Rich") is one tap away. |
| 9 | **Nova-3 failed to finalize 17 turns**, probably because `@cloudflare/voice` waits for `speech_final` and ignores `UtteranceEnd`. | Benchmark results | hark uses Flux, which reports turns itself (`EndOfTurn`). |
| 10 | **No exchange met the sub-second aim.** The baseline was 2,416 ms p50 and 5,975 ms p95 to first browser audio. Speech end to final transcript was 769 ms of that, 24%. | Benchmark results | hark starts on `EagerEndOfTurn` and holds the audio until the turn is confirmed, so the transcript wait overlaps with thinking and speaking. `scripts/bench.mjs` measures the same path on a real account, with and without the eager start. |
| 11 | **Read latency next to completion.** Nova-3 looked faster but completed 60% of conversations. | Benchmark results | `bench.mjs` reports completion per pipeline next to p50 and p95. |
| 12 | **TTS sometimes returns nothing.** | template `retryingTts.ts` | Speech requests are retried once. |
| 13 | **A turn that produces nothing is silent.** | template recovery phrases | If a turn says nothing or fails before any audio, hark says "Sorry, I lost that. Could you say it again?" |
| 14 | **Telemetry had gaps**: no start, playback-complete, or interrupt events. | Lifecycle and Metrics | Every turn writes one `hark.turn` log line: outcome (spoke, interrupted, failed), whether it was eager and confirmed, brain, engine, tools, think time, first and last audio relative to end of turn. Every `Played` writes `hark.played`. Workers Logs are on. |
| 15 | **"A working demo was not enough reason to launch."** The showcase was a one-time try, and combining primitives is not a story by itself. | Handoff | hark's case: it is free to run (your own account), something to come back to (memory, timers, a voice you picked), and it does things a chat box cannot (talk over it, look, paint). Whether that is enough is for people to decide, not this doc. |
| 16 | **Cost was $0.0167 per connected minute**, about 1.6 times cheaper than Pipecat and 1.9 times cheaper than LiveKit. That was not a dramatic enough difference to lead with. | Handoff | hark sleeps after two quiet minutes and on goodbye, so connected minutes are talking minutes. |
| 17 | **Cross-tenant voice tools**: `@cloudflare/voice-plivo` accepted unsigned WebSocket streams (VULN-156388). | Jira | hark's voice socket refuses cross-origin upgrades and requires a signed session. The test suite covers forged and missing sessions. |

## Directions the handoff left open that hark can test cheaply

- **Conversation timing lab.** hark already exposes the knobs (`eot_threshold`, `eager_eot_threshold`, `eot_timeout_ms` in `src/upstream.ts`), and its e2e harness drives turns with a synthesized voice. A "tune my timing" settings page would be small.
- **Programmable voice sessions** (Workers for Platforms). hark's tools live in one table (`src/tools.ts`). Putting them behind a per-tenant Worker is the same seam.

## First live numbers (2026-10-14)

From a laptop straight to Workers AI on the AX account, 5 runs per pipeline (`receipts/bench-live-direct.json`). Speech end → Flux `EndOfTurn` → first sentence of streamed text → first Aura audio byte:

- **Flux + GPT-OSS 20B + Aura 1: 1,642 ms p50, 1,789 ms p95, 5/5 completed.** Starting on `EagerEndOfTurn` brings p50 to 1,395 ms. The showcase baseline for the same models was 2,416 / 5,975 ms, but it was measured in a browser through `@cloudflare/voice`, so the comparison is not exact.
- **Gemma 4 with thinking off reached first text in 441 ms p50**, not the showcase's 6.0 s. That suggests the showcase's Gemma result came from leaving reasoning on, not from the model or Workers AI.
- **Aura 2's first audio byte arrived in about 500 ms, the same as Aura 1**, not 3.5 s. hark streams each sentence's response body as it arrives. If `@cloudflare/voice` waits for the whole sentence to finish synthesizing before sending it, that would explain the showcase's gap. Worth checking in the SDK.
- Flux took 311 to 736 ms p50 from speech end to `EndOfTurn` across pipelines. Opening its WebSocket took about 2 s, which hark pays once at wake, not per turn.

## What is still unmeasured

The same path through an authenticated AI Gateway with a real user's OAuth token, and time to first audio played in a real browser. Both need hark.coey.dev live with its OAuth client.
