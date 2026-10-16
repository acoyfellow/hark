import { siteFooter, siteLayout } from './layout';
import {SIGNAL, SURFACE, type Swatch } from './tokens';

const tile = (label: string, body: string, extra = '') =>
  `<div class="tile ${extra}"><div class="tile-bar"><i></i><i></i><span class="ml-1.5">${label}</span></div>${body}</div>`;

const swatch = ({ token, name, dark, light, use }: Swatch) =>
  `<li class="grid grid-cols-[72px_1fr] gap-3.5 rounded-xl border border-line bg-layer p-3.5"><div class="grid h-[72px] grid-rows-2 overflow-hidden rounded-[10px] border border-line"><span style="background:${dark}"></span><span style="background:${light}"></span></div><div><strong class="block text-[14.5px]">${name}</strong><code class="code text-[11px]">${token}</code><p class="mt-1 font-mono text-[11px] text-faint">dark ${dark} · light ${light}</p><p class="mt-1 text-[13px] text-muted">${use}</p></div></li>`;

type Principle = { readonly title: string; readonly line: string };

const PRINCIPLES: readonly Principle[] = [
  { title: 'Voice first, screen second', line: 'The ear is the product. Anything else on screen must show what words cannot carry.' },
  { title: 'One orange thing', line: 'Each screen gets one signal orange action. Orange means: do this now.' },
  { title: 'Gallery, not dashboard', line: 'Objects sit in numbered tiles with room around them. Panels are flat and hairline.' },
  { title: 'Say the real number', line: 'Latency and state are shown as measured, in mono. Never as adjectives.' },
];

const principle = ({ title, line }: Principle, index: number) =>
  `<li>${tile(`0${index + 1}`, `<div class="p-4.5"><h3 class="mb-1.5 text-[15.5px] font-semibold tracking-tight">${title}</h3><p class="text-sm text-muted">${line}</p></div>`, 'h-full')}</li>`;

type TypeSample = { readonly label: string; readonly className: string; readonly sample: string; readonly spec: string };

const TYPE: readonly TypeSample[] = [
  { label: '52 / Display', className: 'text-4xl sm:text-[52px] leading-none font-bold tracking-[-0.045em]', sample: 'A voice agent <span class="font-serif font-normal italic tracking-normal text-amber">that stays.</span>', spec: 'Inter 700 · -0.045em · one serif italic accent' },
  { label: '28 / Section', className: 'text-[28px] leading-tight font-semibold tracking-[-0.03em]', sample: 'Answers before you finish', spec: 'Inter 600 · 1.1 · -0.03em' },
  { label: '15 / Body', className: 'text-muted', sample: 'Tap the ear and talk. hark listens, thinks and answers out loud.', spec: 'Inter 400 · 1.6 · muted' },
  { label: '11 / System', className: 'font-mono text-[11px] font-medium tracking-[0.12em] text-amber uppercase', sample: 'turn_024 · listening · your account', spec: 'IBM Plex Mono 500 · 0.12em · uppercase' },
  { label: 'Number', className: 'font-mono text-[32px] font-medium tabular-nums', sample: '1,269 ms', spec: 'IBM Plex Mono 500 · tabular figures' },
];

const SPEC = 'font-mono text-xs text-faint';

const typeRow = ({ label, className, sample, spec }: TypeSample) =>
  `<div class="grid items-baseline gap-2 border-t border-line py-5 first:border-t-0 first:pt-1 md:grid-cols-[120px_1fr_280px] md:gap-6"><span class="${SPEC}">${label}</span><div class="${className}">${sample}</div><span class="${SPEC}">${spec}</span></div>`;

type Rule = { readonly say: string; readonly not: string };

const VOICE: readonly Rule[] = [
  { say: 'Tap the ear and talk.', not: 'Unlock frictionless conversational AI.' },
  { say: 'It runs on your own Cloudflare account.', not: 'Enterprise-grade, privacy-first infrastructure.' },
  { say: 'First audio in 1,269 ms, live on Workers AI.', not: 'Blazing fast.' },
  { say: 'It asks before it changes anything.', not: 'Safe and secure by design.' },
];

const voiceRow = ({ say, not }: Rule) =>
  `<tr class="group"><td class="border-t border-line py-3.5 pr-6 align-top group-first:border-t-0">${say}</td><td class="border-t border-line group-first:border-t-0 py-3.5 align-top text-faint line-through decoration-bad/60">${not}</td></tr>`;

const ROWS: readonly (readonly [string, string])[] = [
  ['Listening', 'yes'],
  ['Timers', '2'],
  ['Memories', '14'],
  ['Asleep in', '2 min'],
];

const row = ([name, value]: readonly [string, string]) =>
  `<li class="flex items-center gap-3 py-2 text-sm"><span>${name}</span><span class="flex-1 border-t border-line"></span><span class="font-mono text-[13px] text-muted">${value}</span></li>`;

const EAR =
  '<div class="size-[46px] rounded-full bg-[radial-gradient(circle_at_38%_34%,#fff8ee,#ffe7c4_18%,#ffb35c_42%,#f6821f_70%,#a8420f)] shadow-[0_0_40px_4px_rgba(246,130,31,0.6)]"></div>';

const STAGE = 'flex min-h-[190px] items-center justify-center gap-5';

type Chapter = { readonly id: string; readonly number: string; readonly title: string; readonly line: string; readonly body: string };

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'principles',
    number: '01',
    title: 'Principles',
    line: 'Four rules. If a new screen breaks one, change the screen.',
    body: `<ul class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">${PRINCIPLES.map(principle).join('')}</ul>`,
  },
  {
    id: 'mark',
    number: '02',
    title: 'Mark',
    line: 'Use the wordmark in headers and the mark alone where it must be small. Never recolor it or put it on orange. The mark itself is still being explored.',
    body: `<div class="grid gap-3.5 md:grid-cols-3">
${tile('Wordmark · dark', `<div class="${STAGE} bg-night"><img src="/brand/hark-wordmark.svg" alt="hark wordmark on dark" width="200" height="52"></div>`)}
${tile('Wordmark · light', `<div class="${STAGE} bg-paper"><img src="/brand/hark-wordmark-on-light.svg" alt="hark wordmark on light" width="200" height="52"></div>`)}
${tile('Mark · 16 · 32 · 96', `<div class="${STAGE} items-end"><img src="/brand/hark-mark.svg" alt="" width="16" height="16"><img src="/brand/hark-mark.svg" alt="" width="32" height="32"><img src="/brand/hark-mark.svg" alt="hark mark" width="96" height="96"></div>`)}
</div>`,
  },
  {
    id: 'color',
    number: '03',
    title: 'Color',
    line: 'Orange signals. Horizon blue is atmosphere only. Every surface has a dark and a light value, and the page follows the system until you pick one.',
    body: `<ul class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">${SIGNAL.map(swatch).join('')}</ul><div class="my-4.5 h-3 rounded-md bg-[linear-gradient(90deg,#0a0604,#3a1607,#a8420f,#f6821f,#ffb35c,#ffe7c4)]" aria-hidden="true"></div><ul class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">${SURFACE.map(swatch).join('')}</ul>`,
  },
  {
    id: 'type',
    number: '04',
    title: 'Type',
    line: 'Inter for everything people read. IBM Plex Mono for machine state, numbers and labels. One Instrument Serif italic phrase per page, never more.',
    body: tile('Scale', `<div class="p-4.5">${TYPE.map(typeRow).join('')}</div>`),
  },
  {
    id: 'parts',
    number: '05',
    title: 'Parts',
    line: 'Numbered tiles from the gallery. Flat rows with a hairline leader and a quiet notice with plain actions from good tools.',
    body: `<div class="grid gap-3.5 md:grid-cols-3">
${tile('000001', `<div class="relative grid aspect-[4/3] place-items-center bg-[radial-gradient(60%_60%_at_50%_50%,rgba(246,130,31,0.25),transparent_70%)]">${EAR}<div class="absolute top-3 right-3.5 text-right font-mono text-[10.5px] leading-normal tracking-[0.08em] uppercase">The ear<span class="block text-faint">Durable Object #01</span></div></div>`)}
${tile('Buttons', `<div class="flex min-h-[190px] flex-col justify-center gap-3.5 p-4.5"><div><a class="pill" href="#parts">Sign in with Cloudflare</a></div><div class="flex flex-wrap items-center gap-2.5"><a class="pill-ghost" href="#parts">Read the docs</a><a class="btn" href="#parts">Retry</a><a class="btn-solid" href="#parts">Wake</a></div></div>`)}
${tile('State', `<ul class="p-4.5">${ROWS.map(row).join('')}</ul>`)}
${tile('Notice', `<div class="p-4.5"><div class="rounded-[10px] border border-line bg-layer-2 px-4 py-3.5"><b class="flex items-center gap-2 text-[13.5px]"><span class="size-[7px] rounded-full bg-signal shadow-[0_0_10px_var(--color-signal)]"></span>Workers AI is busy</b><p class="mt-1.5 mb-3 text-sm text-muted">The thinking model returned a 5xx twice. This turn used the fallback brain.</p><div class="flex gap-2.5"><a class="btn" href="#parts">Retry</a><a class="btn-solid" href="#parts">Keep going</a></div></div></div>`, 'md:col-span-2')}
${tile('Code', `<div class="p-4.5"><pre class="pre">bun run ship -- deploy/mine.conf</pre></div>`)}
</div>`,
  },
  {
    id: 'motion',
    number: '06',
    title: 'Motion',
    line: 'The ember swarm is the one big motion on a screen. It looks the same in both themes. Everything else is quiet.',
    body: `<ul class="grid gap-3.5 md:grid-cols-2">${[
      ['The swarm leads', 'Thousands of embers, additive glow on night. Shapes form, hold and fall back to the ear.'],
      ['Panels arrive', 'Tiles fade and lift 6 px over about 300 ms. No bounces, no springs.'],
      ['The live dot breathes', 'One orange dot pulses while hark is awake. It is the only looping UI motion.'],
      ['Reduced motion means still', 'With reduced motion on, the swarm does not start and nothing loops.'],
    ]
      .map(([title, line]) => `<li class="tile p-4.5"><h3 class="mb-1.5 text-[15.5px] font-semibold">${title}</h3><p class="text-sm text-muted">${line}</p></li>`)
      .join('')}</ul>`,
  },
  {
    id: 'voice',
    number: '07',
    title: 'Voice',
    line: 'Short sentences. Active voice. Plain words. Say what it does and the number it did it in.',
    body: tile('Say · Not', `<div class="p-4.5"><table class="w-full border-collapse text-[14.5px]"><tbody>${VOICE.map(voiceRow).join('')}</tbody></table></div>`),
  },
];

const chapter = ({ id, number, title, line, body }: Chapter) =>
  `<section id="${id}" class="scroll-mt-6 pt-18"><div class="mb-6.5 grid gap-2.5 md:grid-cols-[260px_1fr] md:gap-8"><p class="index">${number} / ${title}</p><p class="max-w-[40em] text-muted">${line}</p></div>${body}</section>`;

const HERO = `<div class="mt-16 mb-2 grid gap-10 md:grid-cols-[1.25fr_1fr] md:items-end">
<h1 class="text-[clamp(44px,7vw,96px)] leading-[0.92] font-bold tracking-[-0.05em]">Ember, <span class="font-serif font-normal italic tracking-normal text-amber">hung like art.</span></h1>
<p class="max-w-[30em] text-[17px] text-muted">Cloudflare orange in a gallery: one glowing object, room around it, mono labels, and calm hairline panels for the few things that need a screen. It holds up in light and in dark.</p>
</div>`;

export const brandPage = () =>
  siteLayout({
    title: 'hark · brand',
    description: 'How hark looks, moves and talks, in light and dark.',
    current: '/brand',
    body: `${HERO}
<nav class="mt-10 flex flex-wrap gap-1.5" aria-label="Chapters">${CHAPTERS.map(({ id, number, title }) => `<a class="rounded-md border border-line bg-layer px-2.5 py-2 font-mono text-[11px] leading-none tracking-[0.08em] text-muted uppercase hover:border-line-2 hover:text-text" href="#${id}">${number} ${title}</a>`).join('')}</nav>
${CHAPTERS.map(chapter).join('')}`,
    footer: siteFooter({ href: '/docs', label: 'Docs' }),
  });
