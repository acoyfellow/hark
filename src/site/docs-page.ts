import { siteFooter, siteLayout } from './layout';


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
<tr><td>&ldquo;Give me a status report on my account.&rdquo;</td><td>A report card. It asks before it changes anything.</td></tr>
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
    id: 'cost',
    number: '05',
    title: 'What it costs',
    body: `<p>hark has no model bill of its own. It bills the account you pick. Flux is billed per minute of audio while hark is awake, so it sleeps after two quiet minutes and when you say goodbye. Aura is billed per character spoken. Asleep, nothing streams and nothing is billed.</p>`,
  },
  {
    id: 'deploy',
    number: '06',
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
    number: '07',
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
  `<article class="tile scroll-mt-6" id="${id}"><div class="tile-bar"><i></i><i></i><span class="ml-1.5">${number}</span></div><div class="px-5 py-5 md:px-7 md:py-6.5"><h2 class="mt-0 mb-3.5 text-2xl font-semibold tracking-[-0.025em]">${title}</h2><div class="prose-doc">${body}</div></div></article>`;

export const docsPage = () =>
  siteLayout({
    title: 'hark · docs',
    description: 'How to talk to hark, how a turn works, what it costs, and how to run your own.',
    current: '/docs',
    body: `<div class="pt-16 pb-12"><p class="index">hark / docs</p><h1 class="mt-4 mb-4.5 text-[clamp(44px,6vw,76px)] leading-[0.95] font-bold tracking-[-0.05em]">Talk to it. <span class="font-serif font-normal italic tracking-normal text-amber">That is the manual.</span></h1><p class="m-0 max-w-[32em] text-[17px] text-muted">Everything else is here: what to ask, how a turn works, where your token lives, what it costs, and how to run your own.</p></div>
<div class="grid items-start gap-10 md:grid-cols-[220px_minmax(0,1fr)]">
<nav class="flex min-w-0 flex-row flex-wrap gap-0.5 md:sticky md:top-8 md:flex-col" aria-label="On this page">${SECTIONS.map(tocEntry).join('')}</nav>
<div class="flex min-w-0 flex-col gap-4">${SECTIONS.map(sectionTile).join('')}</div>
</div>`,
    footer: siteFooter({ href: '/brand', label: 'Brand' }),
  });
