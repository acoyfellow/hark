# Upstream: what hark adds to Cloudflare's Agents SDK voice

hark runs on `withVoice(Agent)` and `VoiceClient` from `agents/voice`. These are the places where it needed more than the SDK provided. P1, P2, P3, P5 and P6 are implemented on [acoyfellow/agents `voice/eager-turns-and-playback`](https://github.com/acoyfellow/agents/tree/voice/eager-turns-and-playback). That branch passes the monorepo's own CI gate: `pnpm run build`, `pnpm run check` (sherif, exports, oxfmt, oxlint, typecheck of all projects), and the voice test suite (255 tests, 15 new), with docs and a changeset. hark pins a tarball built from that branch (`vendor/agents-0.28.1-voice-93aa507.tgz`) until the change lands upstream. No pull request has been opened against `cloudflare/agents` yet.

| # | Gap | Where in the SDK | Evidence | Status |
| --- | --- | --- | --- | --- |
| P1 | Eager end of turn was dropped | `FluxSession` treated `EagerEndOfTurn` and `TurnResumed` as interim transcripts; `withVoice` only ran a turn on `onUtterance` | The internal showcase benchmark measured 769 ms from speech end to final transcript, 24% of its 2,416 ms baseline | Fork: `withVoice({ speculativeTurns: true })`, `onEagerUtterance` / `onTurnResumed`, every frame held until the final transcript confirms the words. hark e2e: reply started 319 ms before confirmation, first audio 63 ms after it (fake services) |
| P2 | "listening" before the browser finished playing | `#streamResponse` sends `listening` once the last chunk is sent | Local trace: `speaking` at 11,752 ms, `listening` at 11,881 ms while audio still played | Fork: `VoiceClient.status` stays `speaking` until playback drains; `isPlaying` |
| P3 | Barge-in on loudness, not words | `VoiceClient` stopped playback when mic RMS passed `interruptThreshold` | Echo or a cough cut the agent off | Fork: `interruptMode: "duck"` lowers playback on sound and cuts only on the user's words; hark uses it |
| P4 | Bring-your-own inference | Providers take an `AiLike` with `run()`, which is enough | hark passes `userAI()`: Flux through the signed-in person's AI Gateway with their OAuth token | Shipped in hark. Upstream candidate: a documented `gatewayAI()` helper, plus the Aura finding below |
| P5 | No playback level | `VoiceClient` emitted `audiolevelchange` for the mic only | hark's ear moves with the assistant's voice | Fork: `playbacklevelchange`, `playbackLevel`; hark's ear uses it |
| P6 | Tools on a speculative turn | Arises with P1 | Pipecat: "tool calls are never executed for an unconfirmed turn" | Fork: `context.speculative` and `context.confirmed`; hark's tools await `confirmed` |

Speculative turn metrics are honest: `finalInputToFirstAudioMs` is measured from the confirmed transcript (audio prepared earlier counts as 0) and `speculativeLeadMs` reports how far ahead the prediction was.

## Production findings worth passing on

- **Aura through the gateway's per-model route rejects user OAuth tokens** (401, code 10000). Workers AI REST with `cf-aig-gateway-id` accepts the same token and still logs to the gateway. Chat through `/workers-ai/v1/chat/completions` and Flux over the gateway WebSocket accept it. Evidence: `receipts/live-signin.json`.
- **`gpt-oss-20b` on the gateway's OpenAI-compatible route rejects `role: tool` messages** with a 400. hark flattens tool results to text (`src/flatten.ts`). Evidence: `receipts/live-probe-direct.json`.

## What hark took from the SDK and deleted from itself

- Sentence chunking, per-sentence TTS prefetch, ordered drain, streaming TTS: the SDK's `#streamResponse`
- Mic capture worklet, playback queue, mute, reconnects: `VoiceClient`
- Call lifecycle, keep-alive, conversation history: `withVoice`
- Per-turn timings: `turn_metrics`, shown in hark's latency readout
- Timers: `Agent.schedule()`; announcements: `speak()` and `speakAll()`
- Eager hold, playback-complete, duck barge-in, speaking level: now the fork's `speculativeTurns`, playback-aware status, `interruptMode: "duck"`, `playbacklevelchange`
