import { accent, siteFooter, siteLayout, tile } from './layout';

const PLANNED = '<p><strong>Planned.</strong> This section describes where hark is going. It is not built yet. <a href="https://github.com/acoyfellow/hark/blob/main/SECURITY.md">SECURITY.md</a> is the source of truth.</p>';


type DocSection = { readonly id: string; readonly number: string; readonly title: string; readonly body: string };

const SECTIONS: readonly DocSection[] = [
  {
    id: 'start',
    number: '01',
    title: 'Start talking',
    body: `<ol>
<li>Sign in with Cloudflare and pick the account hark should think with.</li>
<li>Turn on authentication for an AI Gateway in that account. hark uses <code>default</code> unless told otherwise, and tells you where the toggle is if it is missing.</li>
<li>Tap the ear, or press space. Allow the microphone once.</li>
<li>Talk. Interrupt it when you like. Say &ldquo;thanks, that is all&rdquo; to put it to sleep.</li>
</ol>`,
  },
  {
    id: 'ask',
    number: '02',
    title: 'What to ask',
    body: `<table><thead><tr><th>Say</th><th>You get</th></tr></thead><tbody>
<tr><td>&ldquo;What is the weather in Lisbon?&rdquo;</td><td>A forecast card and a spoken answer.</td></tr>
<tr><td>&ldquo;Who was Ada Lovelace?&rdquo;</td><td>An article card and a short answer.</td></tr>
<tr><td>&ldquo;Set a timer for ten minutes.&rdquo;</td><td>A live countdown. hark speaks when it ends.</td></tr>
<tr><td>&ldquo;Remember that I take my coffee black.&rdquo;</td><td>A saved memory. &ldquo;Forget that&rdquo; removes it.</td></tr>
<tr><td>&ldquo;What am I holding?&rdquo; (camera on)</td><td>One frame, described by a vision model.</td></tr>
<tr><td>&ldquo;Paint me a lighthouse in a storm.&rdquo;</td><td>A FLUX picture on screen.</td></tr>
<tr><td>&ldquo;Build me a 3D rocket.&rdquo;</td><td>The embers sculpt it and spin it.</td></tr>
<tr><td>&ldquo;Scaffold a node project and run it.&rdquo;</td><td>A terminal card from your own durable Linux box.</td></tr>
<tr><td>&ldquo;Give me a status report on my account.&rdquo;</td><td>A report card. Changes will need your passkey (<a href="#approvals">planned</a>).</td></tr>
<tr><td>&ldquo;Connect my server&rdquo; and a URL</td><td>Your MCP server&rsquo;s tools, by voice.</td></tr>
</tbody></table>`,
  },
  {
    id: 'turn',
    number: '03',
    title: 'How a turn works',
    body: `<pre>mic → 16 kHz PCM, 80 ms frames → WebSocket → your Durable Object
      → Deepgram Flux (through your AI Gateway)
        EagerEndOfTurn → start thinking, hold audio behind a gate
        TurnResumed    → throw that work away
        EndOfTurn      → same words? open the gate : start over
      → Workers AI brain, streamed, with tools
      → sentence chunker → Aura, three in flight
      → 24 kHz PCM tagged with its turn → your speaker</pre>
<p>When you talk over it, hark ducks its volume at once. If what you said is words, the turn is interrupted, the model request is aborted, and the browser drops queued audio for that turn. Speaking ends only when the browser reports its buffer is empty.</p>`,
  },
  {
    id: 'account',
    number: '04',
    title: 'Your account, your token',
    body: `<ul>
<li>Sign-in asks for <code>offline_access ai.read ai.write</code> and gateway access. That is all hark needs.</li>
<li>Your grant lives in a Durable Object. Your browser gets only a signed session cookie. The token is never sent to the page.</li>
<li>Every model call goes through your own authenticated AI Gateway, so you see every request and its cost there.</li>
<li>Revoke access at any time in your Cloudflare profile. Signing out revokes it too.</li>
</ul>`,
  },
  {
    id: 'servers',
    number: '05',
    title: 'Connect your MCP servers',
    body: `<p>hark is an MCP client. Connect a server and its tools are available by voice.</p>
<ol>
<li>Say &ldquo;connect my server&rdquo; with a name and an https URL, or add it in Settings, Your MCP servers.</li>
<li>If the server uses OAuth, hark puts a sign-in link in Settings. It never reads the link aloud. Open it and sign in.</li>
<li>When the server shows <code>ready</code>, ask for what you want: &ldquo;what can my docs server do?&rdquo;</li>
</ol>
<p>Up to 12 servers. They must be public https. Tokens go in Settings, never spoken. Your sign-in for each server stays in your Durable Object.</p>`,
  },
  {
    id: 'approvals',
    number: '06',
    title: 'Approvals: your passkey, not your voice',
    body: `${PLANNED}
<p>Anyone in the room can talk to hark, and so can a web page it reads or an agent connected to it. So nothing that matters runs on words. Changing your account, running a command or code, calling or connecting an MCP server, and deleting memory all wait for a passkey: Face ID, Touch ID, Windows Hello or a security key.</p>
<ol>
<li>Ask for it: &ldquo;delete the pasta-timer worker&rdquo;.</li>
<li>hark says it needs your approval and shows a card with exactly what will change.</li>
<li>Tap Approve. Your device asks for your face, finger or PIN.</li>
<li>The signature covers that one action. hark checks it in your Durable Object and runs it once.</li>
</ol>
<p>Talk over hark, decline, or wait a minute, and nothing runs. Reads, timers, memories, voices and pictures never need approval. There is no voiceprint and no face matching.</p>`,
  },
  {
    id: 'reach',
    number: '07',
    title: 'Let your agents reach you',
    body: `${PLANNED}
<p>Your other agents and systems (my.ax, Pi, a terraloop, CI) can talk to you through hark. There are two doors. Both treat what they bring like a stranger in the room: hark will say it, but it can never approve anything.</p>
<h3>Webhooks: the doorbell</h3>
<p>For events that should reach you even when hark is asleep: a deploy finished, CI failed, a teammate answered.</p>
<ol>
<li>In Settings, Webhooks, create a hook and name it, for example &ldquo;CI: hark repo&rdquo;. Pick what it may do: <code>notify</code> (default), <code>store</code>, or <code>wake</code>.</li>
<li>Copy the URL and secret. The secret is shown once.</li>
<li>Sign every request: an HMAC-SHA256 of the timestamp and raw body, in a header. Unsigned, old, or replayed requests are dropped.</li>
</ol>
<pre>POST https:&#47;&#47;&lt;host&gt;/hook/&lt;hook id&gt;
hark-timestamp: 1767225600
hark-signature: v1=&lt;hex hmac of "timestamp.body"&gt;
content-type: application/json

{ "title": "CI failed on main", "detail": "3 tests", "level": "bad" }</pre>
<p>What happens next depends on hark:</p>
<table><thead><tr><th>hark is</th><th>It</th></tr></thead><tbody>
<tr><td>Listening</td><td>Says it at the next pause, from a template. Never over you.</td></tr>
<tr><td>In a turn</td><td>Waits for the turn to end.</td></tr>
<tr><td>Asleep</td><td>Queues it, sends a push notification, and tells you when you wake it.</td></tr>
</tbody></table>
<p><code>notify</code> speaks a template and never hands the payload to the model. <code>wake</code> starts a turn so hark can act, and anything gated still needs your passkey. Each hook has a rate limit, quiet hours, a delivery log, and can be rotated or revoked in Settings.</p>
<h3>MCP: the conversation</h3>
<p>hark is also an MCP server at <code>https:&#47;&#47;&lt;host&gt;/mcp</code>, so an agent can talk to it while it works.</p>
<ol>
<li>Add the URL to your MCP client: Pi, Claude, chat.ax.</li>
<li>The client opens hark&rsquo;s consent page. Sign in with Cloudflare and choose what it may do.</li>
<li>hark gives the client its own token. Your Cloudflare token never leaves your Durable Object.</li>
</ol>
<table><thead><tr><th>Scope</th><th>Tool</th><th>What it does</th></tr></thead><tbody>
<tr><td><code>hark:tell</code></td><td><code>hark_tell(text)</code></td><td>hark says it to you out loud. No model turn. The default.</td></tr>
<tr><td><code>hark:read</code></td><td><code>hark_status</code></td><td>Presence, timers, memories.</td></tr>
<tr><td><code>hark:say</code></td><td><code>hark_say(text)</code></td><td>Starts a turn as that agent and streams the reply back. Voice goes first.</td></tr>
</tbody></table>
<p>A request for a gated action comes back as a pending task while your passkey decides. There is no approve tool. Settings, Connected agents lists every client with its scopes and last use, and revokes it at once. Every turn records whether it came from your voice or from which agent.</p>
<h3>MCP events, while hark is awake</h3>
<p>hark can subscribe to the MCP servers you connected and speak their updates as they happen, for example a Chat AX request that changed state. That works only while hark is awake. Asleep, nothing is connected and nothing is billed, so events that must not be missed should also send a webhook. Webhooks wake hark. MCP lets it reply and fetch details.</p>`,
  },
  {
    id: 'cost',
    number: '08',
    title: 'What it costs',
    body: `<p>hark has no model bill of its own. It bills the account you pick. Flux is billed per minute of audio while hark is awake, so it sleeps after two quiet minutes and when you say goodbye. Aura is billed per character spoken. Asleep, nothing streams and nothing is billed.</p>`,
  },
  {
    id: 'deploy',
    number: '09',
    title: 'Run your own',
    body: `<p>You need Bun, a Cloudflare account with a zone, <code>npx wrangler login</code>, and an OAuth client with the redirect URL <code>https://&lt;host&gt;/oauth/callback</code>.</p>
<pre>git clone https:&#47;&#47;github.com/acoyfellow/hark && cd hark && bun install
cp deploy/example.conf deploy/mine.conf
bun run ship -- deploy/mine.conf</pre>
<p>To work on it locally, against a fake Cloudflare with no sign-in:</p>
<pre>bun run dev
bun run e2e</pre>`,
  },
  {
    id: 'limits',
    number: '10',
    title: 'Limits',
    body: `<ul>
<li>English only, because Flux and Aura 2 are English models.</li>
<li>Echo cancellation depends on your browser. Loud speakers can make it hear itself. A headset works best.</li>
<li>One tab at a time. A second tab takes the line over.</li>
<li>No wake word. Tap the ear or press space.</li>
<li>Timers speak only while hark is open. Otherwise it tells you the next time you wake it.</li>
</ul>`,
  },
];

const tocEntry = ({ id, number, title }: DocSection) =>
  `<a class="flex gap-3 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-layer-2 hover:text-text" href="#${id}"><span class="font-mono text-[11px] leading-[1.9] text-faint">${number}</span>${title}</a>`;

const sectionTile = ({ id, number, title, body }: DocSection) =>
  `<article class="scroll-mt-6" id="${id}">${tile(number, `<div class="px-5 py-5 md:px-7 md:py-6.5"><h2 class="mt-0 mb-3.5 text-2xl font-semibold tracking-[-0.025em]">${title}</h2><div class="prose-doc">${body}</div></div>`)}</article>`;

export const docsPage = () =>
  siteLayout({
    title: 'hark · docs',
    description: 'How to talk to hark, how a turn works, what it costs, and how to run your own.',
    current: '/docs',
    body: `<div class="pt-16 pb-12"><p class="index">hark / docs</p><h1 class="mt-4 mb-4.5 text-[clamp(44px,6vw,76px)] leading-[0.95] font-bold tracking-[-0.05em]">Talk to it. ${accent('That is the manual.')}</h1><p class="m-0 max-w-[32em] text-[17px] text-muted">Everything else is here: what to ask, how a turn works, where your token lives, how your servers and agents connect, what it costs, and how to run your own.</p></div>
<div class="grid items-start gap-10 md:grid-cols-[220px_minmax(0,1fr)]">
<nav class="flex min-w-0 flex-row flex-wrap gap-0.5 md:sticky md:top-8 md:flex-col" aria-label="On this page">${SECTIONS.map(tocEntry).join('')}</nav>
<div class="flex min-w-0 flex-col gap-4">${SECTIONS.map(sectionTile).join('')}</div>
</div>`,
    footer: siteFooter({ href: '/brand', label: 'Brand' }),
  });
