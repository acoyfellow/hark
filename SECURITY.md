# Security

Report a vulnerability privately through GitHub Security Advisories on this repository.

This document is the source of truth for how hark protects your account. Code follows this page. If the code and this page disagree, the code has a bug.

## The promise

**hark can listen to anyone, but it acts only for you.**

Anyone in the room can talk to hark. A roommate, a television, a podcast, or a web page that hark reads aloud can all put words in front of the model. So hark never trusts words to change anything that matters. Every action that changes your account, runs code, or destroys data waits for a passkey: Face ID, Touch ID, Windows Hello, or a security key. The passkey signs that one action, on your device, at that moment. Without the signature, the action does not run.

There is no voiceprint and no face recognition. hark never stores what you sound like or what you look like.

## Status

| Part | Status |
| --- | --- |
| Cloudflare OAuth sign-in, token kept in the Durable Object | Shipped |
| Local-only switches refused on non-loopback hosts | Shipped |
| Passkey approval for actions (this page, from "Passkey approval" on) | **Planned. Not implemented.** |

Until the passkey approval ships, a spoken "yes" is the only check before a Cloudflare API change. Anyone who can speak to an open hark can approve one. `POST` is not checked at all today. See "Open findings".

## What hark already does

- You sign in with Cloudflare OAuth. Your token lives in the `Directory` Durable Object and your hark reads it on wake. The browser holds only a signed session cookie. No route returns the token or forwards it to the browser.
- Every model call is made by the Worker, on your account, through your own authenticated AI Gateway (`src/upstream.ts`).
- Audio and camera frames are never stored. History keeps text.
- `workers_dev` and `preview_urls` are off. Switches that skip sign-in or point at a fake Cloudflare (`LOCAL_DEV_WITHOUT_AUTH`, `HARK_FAKE_ORIGIN`, `LOCAL_CF_*`) work only on loopback hosts, and the check fails if they appear in the deployed config.

## Who we defend against

| Threat | Example | Defended by |
| --- | --- | --- |
| A bystander | A roommate says "delete that worker" while hark is listening | Passkey |
| Played audio | A TV, a video, or a speakerphone call says "yes, go ahead" | Passkey |
| A cloned or recorded voice of you | A deepfake of you asks for a change | Passkey. Voice is never trusted, so a clone gains nothing |
| Prompt injection | A web page, a search result, an MCP tool, or a file tells the model to run a command | Passkey. The model can ask for anything. It cannot approve anything |
| A stolen session | Someone gets your session cookie and opens a socket | Passkey. The cookie can talk. It cannot sign |
| A tampered browser | Someone edits the client to send "approved" | The server checks a signature from your authenticator, not a flag from the page |

We do not defend against:

- Someone who has your unlocked device **and** can pass its biometric or PIN check. That person is you, as far as any passkey can tell.
- A compromised Cloudflare account, OAuth provider, or operating system.
- Data leaving through a read. See "Open findings".

## Passkey approval

### Setting up

After your first Cloudflare sign-in, hark asks you to create a passkey for this hark. It is a system prompt, not a form. The Durable Object stores the credential id, the public key, and the signature counter in its own SQLite. hark never sees the biometric. Your device keeps it.

A passkey works only on the domain where it was made. A passkey made on one hark deployment does not work on another, and passkeys from other sites (for example bio.coey.dev) do not work on hark.

You can add more than one passkey (phone and laptop) and remove any of them from Settings. Adding or removing a passkey itself needs an existing passkey. Removing the last passkey means gated actions cannot run until you add one again.

### What needs a passkey

The rule: **if an action changes your account, runs code, sends data to a new place, or destroys something, it needs a passkey.** Everything else runs on your word.

| Tool | Needs a passkey | Runs on your word |
| --- | --- | --- |
| `cloudflare` | `POST`, `PUT`, `PATCH`, `DELETE` | `GET` |
| `terminal` | Every command | |
| `run_code` | Every run | |
| `files` | `write` | `list`, `read` |
| `mcp` | `call`, `connect`, `disconnect` | `list` |
| `forget` | Every deletion | |
| `look_up`, `web_search`, `browse`, `look` | | All |
| `set_timer`, `cancel_timer`, `remember`, `change_voice`, `imagine`, `show_form`, `show_widget`, `rest` | | All |

Why these choices:

- `terminal` and `run_code` cannot be proven read-only. A command that looks like a read can write, delete, or reach the network.
- `mcp` calls go to tools whose side effects hark cannot see. `connect` adds a new place your words and data can go.
- `files` writes can plant scripts that a later command runs.
- `remember` runs on your word because blocking it would break conversation. A planted memory can steer later turns, but anything harmful it leads to still needs a passkey.

A new tool is gated by default. To make it run on your word, it must be added to the ungated list in code, with a reason in this table.

### How one approval works

1. The model calls a gated tool.
2. The Durable Object does not run it. It stores the exact call (tool name and arguments) and makes a challenge:
   `sha256(tool, canonical arguments, turn number, random nonce)`.
3. The server sends an `Approve` frame with the challenge and one plain line that says what will change, for example "Delete the worker `pasta-timer`".
4. The browser shows an approval card with that line and an Approve button. Tapping the button opens the system passkey prompt. The tap is required: some browsers, like Safari on iPhone, block passkey prompts that do not start from a tap.
5. The browser sends an `Approved` frame with the signed assertion, or a `Declined` frame.
6. The Durable Object verifies the assertion against the stored public key. It checks that the challenge matches the pending one, that the origin and relying party are this hark's own host, that user verification happened, and that the signature counter moved forward.
7. Only then does it run the call **it stored in step 2**. It never runs arguments sent back from the browser.
8. The model is told the result: done, declined, timed out, or interrupted.

hark says out loud that it needs your approval. It does not read the challenge, and it does not ask you to say yes.

### Rules the code must keep

1. **The model cannot approve.** No tool argument, prompt text, or model output can mark a call as approved. The `confirmed` argument on the `cloudflare` tool is removed.
2. **One signature, one action.** A challenge covers exactly one stored call and can be used once. A signature for one call cannot run a different call, or the same call twice.
3. **Challenges expire.** A pending approval is dropped after 60 seconds.
4. **Interrupting cancels.** A pending approval belongs to its turn. If you talk over hark, close the socket, or the turn ends, the approval is dropped and its call never runs.
5. **Only one pending approval per hark.** A second gated call in the same turn waits until the first is decided.
6. **Server-side checks only.** The decision is made in the Durable Object. The browser only carries the signature.
7. **User verification is required.** An authenticator that only checks presence (a tap with no biometric or PIN) is refused.
8. **Every frame is a Schema.** `Approve`, `Approved`, and `Declined` are defined in `shared/protocol.ts` like every other frame.
9. **Nothing new is stored about you.** The Durable Object keeps credential ids, public keys, and counters. No audio, no images, and no biometric templates.
10. **Fail closed.** If verification throws, the passkey is missing, or the clock is wrong, the action does not run.

### Frames

Server to client:

- `Approve`: `{ id, challenge, summary, tool }`. `summary` is one line for the card.
- `ApprovalEnded`: `{ id, outcome }`, where `outcome` is `ran`, `declined`, `expired`, `interrupted`, or `failed`. The card closes.

Client to server:

- `Approved`: `{ id, assertion }`, the WebAuthn assertion as JSON.
- `Declined`: `{ id }`.

Setting up and removing passkeys use the same pattern with registration in place of assertion.

## Open findings

These are known gaps. Each one names what fixes it.

1. **Spoken approval only.** Today a spoken "yes" lets the model set `confirmed: true` on `cloudflare` writes. Anyone in earshot, or injected text, can trigger it. *Fixed by passkey approval.*
2. **`POST` is not gated.** `DESTRUCTIVE` in `src/tools.ts` is `DELETE`, `PUT`, `PATCH`. A `POST` to the Cloudflare API runs with no check. *Fixed by passkey approval, which gates every non-`GET` method.*
3. **`terminal`, `run_code`, `files` write, and `mcp` are not gated at all.** *Fixed by passkey approval.*
4. **Data can leave through a read.** `browse`, `web_search`, and `look_up` fetch URLs the model chooses. Injected text could make the model put a memory or a file into a URL. A passkey does not stop this, because reads are not gated. *Not yet planned. Needs its own design.*
5. **The echo gate is not a security control.** `src/echo-gate.ts` drops speech that matches what hark just said. It decides by words, not by who spoke. Do not rely on it to keep anyone out.

## How this is checked

When the passkey approval ships, these tests must exist and pass in `bun run check`:

- Every gated tool, called by the model, sends `Approve` and does not run.
- Every ungated tool runs without `Approve`.
- A new tool with no entry in the ungated list is gated.
- A valid assertion runs the stored call exactly once. Replaying it runs nothing.
- An assertion for a different challenge, a different origin, a missing user-verification flag, or a counter that did not move is refused, and the call does not run.
- Arguments sent back from the browser are ignored.
- An approval that is interrupted, declined, or older than 60 seconds never runs.
- No model output can produce an approved call.

And in `bun run e2e`, against the fake:

- A spoken "yes, delete it" with no passkey changes nothing.
- An approval card appears, a fake authenticator approves, and the change happens once.
- Talking over hark while the card is open closes it, and nothing runs.

Results from the fake and from a real browser with a real authenticator are reported separately.
