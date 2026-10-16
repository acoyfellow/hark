# hark spec

## The unit

A **hark** is one person's voice. It is one Durable Object, named by the person's owner id (`cf:<cloudflare user id>`). It owns:

| Part | Lives in |
| --- | --- |
| The voice line: the browser socket and the Flux socket | Memory, for as long as hark is awake |
| The running turn: one Effect fiber, its release gate, what it has said so far | Memory |
| Memories, the last 24 messages, settings, timers | The Durable Object's SQLite |

The OAuth grant does not live here. It lives in the `Directory` Durable Object, and hark reads it on wake.

## Invariants

1. **One line per person.** A second socket replaces the first, and the first is closed with code 4000.
2. **The Durable Object is the only caller of the models.** The browser never sees a token or a model URL. It sends PCM and small JSON frames, and gets PCM and small JSON frames back.
3. **Every model call runs on the person's own Workers AI with their OAuth token**, through `src/upstream.ts`. That includes the Flux WebSocket.
4. **Nothing is heard before the turn is confirmed.** An eager turn may think and synthesize, but its audio waits behind a `Deferred` until `EndOfTurn` arrives with the same words.
5. **An interrupted turn stops costing money.** Interrupting the fiber aborts the model request and any pending speech requests, and the browser drops queued audio for that turn and every earlier one. Each audio packet carries its turn number in a 4-byte header.
6. **Speaking ends when the browser says so.** The server sends `SpeechEnd` once the last packet is out. The playback worklet answers `Played` when its buffer is empty, and only then does presence go back to `listening`.
7. **Audio and camera frames are never stored.** History keeps text. A camera frame is replaced by "(showed you a camera frame)".
8. **Asleep costs nothing.** With no socket open, no Flux stream is billed. Only a pending timer alarm can wake the object.

## Frames

Defined as Effect Schemas in `shared/protocol.ts`.

- Server → client: `Ready`, `Presence` (waking, listening, hearing, thinking, speaking), `Duck`, `Interrupt`, `SpeechEnd`, `Doing`, `Show` (a visual card), `Snap` (send me a camera frame), `Measured` (latency), `Fault`, `Sleep`. Binary frames are speech: a `u32` turn followed by 24 kHz s16le PCM.
- Client → server: `Hello` (time zone, locale, camera), `Played`, `Snapped`, `Configure`, `Camera`, `Hush`. Binary frames are microphone audio: 16 kHz s16le PCM, 1280 samples.

## Out of scope

- A text interface of any kind.
- Wake words and always-on listening.
- Languages other than English, until Flux and Aura support them.
- Sharing a hark between people.
