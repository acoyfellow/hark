import { mark, wordmark } from './duotone';
import { accent, siteFooter, siteLayout, tile } from './layout';
import type { Swatch } from './tokens';

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


type ButtonOption = { readonly name: string; readonly ratio: string; readonly note: string; readonly dark: string; readonly light: string };

const SOLID = 'background:#d93d00;color:#fff';
const SOLID_DEPTH = 'background:linear-gradient(180deg,#ff5a0a,#d93d00);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 6px 16px -8px rgba(217,61,0,.8)';
const QUIET_DARK = 'background:#f2f2f2;color:#0b0b0b';
const QUIET_LIGHT = 'background:#111;color:#fff';
const GHOST_DARK = 'background:transparent;color:#f2f2f2;border:1px solid rgba(255,255,255,.22)';
const GHOST_LIGHT = 'background:transparent;color:#111;border:1px solid rgba(0,0,0,.18)';

const BUTTON_OPTIONS: readonly ButtonOption[] = [
  { name: 'A1 · Signal, flat', ratio: '4.6:1', note: 'Duotone orange #d93d00, white text. Passes AA.', dark: SOLID, light: SOLID },
  { name: 'A2 · Signal, lit', ratio: '4.6:1 base', note: 'Same orange, lit from the top like a pressed metal key.', dark: SOLID_DEPTH, light: SOLID_DEPTH },
  { name: 'B · Quiet', ratio: '17:1', note: 'Secondary. White on dark, ink on light. No orange.', dark: QUIET_DARK, light: QUIET_LIGHT },
  { name: 'C · Ghost', ratio: '17:1', note: 'Tertiary. Hairline only.', dark: GHOST_DARK, light: GHOST_LIGHT },
];

const BUTTON_SHAPE = 'duo-button inline-flex h-11 items-center rounded-full text-[14.5px] font-medium no-underline';

const sampleButton = (style: string) => `<a href="#buttons" class="${BUTTON_SHAPE}" style="${style}">Sign in with Cloudflare</a>`;

const buttonOption = ({ name, ratio, note, dark, light }: ButtonOption) =>
  `<li class="tile"><div class="tile-bar"><i></i><i></i><span class="ml-1.5">${name}</span><span class="ml-auto">${ratio}</span></div><div class="grid gap-2 p-2"><div class="flex items-center justify-center rounded-lg" style="padding:28px 16px;background:#0b0b0b">${sampleButton(dark)}</div><div class="flex items-center justify-center rounded-lg" style="padding:28px 16px;background:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)">${sampleButton(light)}</div><p class="px-2 pb-2 font-mono text-[11px] tracking-[0.04em] text-muted uppercase">${note}</p></div></li>`;

type Concept = { readonly name: string; readonly idea: string; readonly shapes: string };

const SIGNAL_FILL = 'var(--color-signal)';

const CONCEPTS: readonly Concept[] = [
  {
    name: 'C1 · Cube',
    idea: 'A Durable Object, drawn as one: a solid block that stays. The lit face is the one orange thing.',
    shapes: `<path d="M32 6 54.5 19 32 32 9.5 19Z" fill="${SIGNAL_FILL}"/><path d="M9.5 19 32 32V58L9.5 45Z" fill="currentColor"/><path d="M32 32 54.5 19V45L32 58Z" fill="currentColor" opacity=".55"/>`,
  },
  {
    name: 'C1A · Cut',
    idea: 'One orange hexagon. The cube edges are cut out of it, so the page draws the block.',
    shapes: `<defs><mask id="cube-cut"><rect width="64" height="64" fill="#fff"/><path d="M32 32V60M32 32 8 18M32 32 56 18" stroke="#000" stroke-width="4.5"/></mask></defs><path d="M32 6 54.5 19V45L32 58 9.5 45V19Z" fill="${SIGNAL_FILL}" mask="url(#cube-cut)"/>`,
  },
  {
    name: 'C1B · Open',
    idea: 'The lid lifts off. The orange top floats over an ink box: something lives inside.',
    shapes: `<path d="M32 3 54.5 16 32 29 9.5 16Z" fill="${SIGNAL_FILL}"/><path d="M9.5 23 32 36V60L9.5 47Z" fill="currentColor"/><path d="M32 36 54.5 23V47L32 60Z" fill="currentColor" opacity=".55"/>`,
  },
  {
    name: 'C1C · Stack',
    idea: 'A small orange cube sits on a big ink one. Memory on top of the object that keeps it.',
    shapes: `<path d="M32 28 52 39.5 32 51 12 39.5Z" fill="currentColor" opacity=".3"/><path d="M12 39.5 32 51V62L12 50.5Z" fill="currentColor"/><path d="M32 51 52 39.5V50.5L32 62Z" fill="currentColor" opacity=".55"/><path d="M32 8 44 15 32 22 20 15Z" fill="${SIGNAL_FILL}"/><path d="M20 15 32 22V36L20 29Z" fill="${SIGNAL_FILL}" opacity=".8"/><path d="M32 22 44 15V29L32 36Z" fill="${SIGNAL_FILL}" opacity=".6"/>`,
  },
  {
    name: 'C1D · Wire',
    idea: 'A line drawing of the cube. Only the top face is filled. Lighter, more technical.',
    shapes: `<path d="M32 6 54.5 19 32 32 9.5 19Z" fill="${SIGNAL_FILL}"/><path d="M32 6 54.5 19V45L32 58 9.5 45V19ZM9.5 19 32 32 54.5 19M32 32V58" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`,
  },
];

const conceptSvg = (shapes: string, size: number) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${shapes}</svg>`;

const conceptStage = (shapes: string, background: string, ink: string) =>
  `<div class="grid place-items-center rounded-lg" style="padding:28px 16px;background:${background};color:${ink}">${conceptSvg(shapes, 96)}<div class="mt-5 flex items-end gap-3">${conceptSvg(shapes, 40)}${conceptSvg(shapes, 24)}${conceptSvg(shapes, 16)}</div></div>`;

const concept = ({ name, idea, shapes }: Concept) =>
  `<li>${tile(name, `<div class="grid gap-2 p-2">${conceptStage(shapes, '#0b0b0b', '#f2f2f2')}${conceptStage(shapes, '#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)', '#111')}<p class="px-2 pb-2 font-mono text-[11px] tracking-[0.04em] text-muted uppercase">${idea}</p></div>`)}</li>`;

const DUOTONE: readonly Swatch[] = [
  { token: 'signal', name: 'Signal', dark: '#ff5200', light: '#d93d00', use: 'Actions, the live dot, the ear. Nothing else.' },
  { token: 'ink', name: 'Ink', dark: '#0b0b0b', light: '#ffffff', use: 'The page.' },
  { token: 'layer', name: 'Layer', dark: '#151515', light: '#f4f4f4', use: 'Tiles and panels.' },
  { token: 'text', name: 'Text', dark: '#f2f2f2', light: '#111111', use: 'Headings and body.' },
  { token: 'muted', name: 'Muted', dark: '#9a9a9a', light: '#6b6b6b', use: 'Labels, captions, machine state.' },
];




const STAGE = 'flex min-h-[190px] items-center justify-center gap-5';

type Chapter = { readonly id: string; readonly number: string; readonly title: string; readonly line: string; readonly body: string };

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'concepts',
    number: 'C0',
    title: 'Mark concepts',
    line: 'The cube, then four takes on it. One orange, ink, and the page. Each at 96, 40, 24 and 16 px on dark and on light.',
    body: `<ul class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">${CONCEPTS.map(concept).join('')}</ul>`,
  },
  {
    id: 'buttons',
    number: 'B0',
    title: 'Buttons',
    line: 'Duotone: one orange, black, white, a few greys. Each button is shown on dark and on light with its text contrast.',
    body: `<ul class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">${BUTTON_OPTIONS.map(buttonOption).join('')}</ul>`,
  },
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
    line: 'Use the wordmark in headers and the mark alone where it must be small. Never recolor it or put it on orange. The mark is an orange helmet with one arc cut through it and one outside.',
    body: `<div class="grid gap-3.5 md:grid-cols-3">
${tile('Wordmark · dark', `<div class="${STAGE}" style="background:#0b0b0b;color:#f2f2f2">${wordmark(52)}</div>`)}
${tile('Wordmark · light', `<div class="${STAGE}" style="background:#fff;color:#111">${wordmark(52)}</div>`)}
${tile('Mark · 16 · 32 · 96', `<div class="${STAGE} items-end text-text">${mark(16)}${mark(32)}${mark(96, 'hark mark')}</div>`)}
</div>`,
  },
  {
    id: 'color',
    number: '03',
    title: 'Color',
    line: 'One orange, then black, white and greys. The orange is darker in light mode so white text on it still passes AA.',
    body: `<ul class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">${DUOTONE.map(swatch).join('')}</ul>`,
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
${tile('000001', `<div class="relative grid aspect-[4/3] place-items-center ">${mark(72)}<div class="absolute top-3 right-3.5 text-right font-mono text-[10.5px] leading-normal tracking-[0.08em] uppercase">The ear<span class="block text-faint">Durable Object #01</span></div></div>`)}
${tile('Buttons', `<div class="flex min-h-[190px] flex-col justify-center gap-3.5 p-4.5"><div><a class="pill" href="#parts">Sign in with Cloudflare</a></div><div class="flex flex-wrap items-center gap-2.5"><a class="pill-ghost" href="#parts">Read the docs</a><a class="btn" href="#parts">Retry</a><a class="btn-solid" href="#parts">Wake</a></div></div>`)}
${tile('State', `<ul class="p-4.5">${ROWS.map(row).join('')}</ul>`)}
${tile('Notice', `<div class="p-4.5"><div class="rounded-[10px] border border-line bg-layer-2 px-4 py-3.5"><b class="flex items-center gap-2 text-[13.5px]"><span class="size-[7px] rounded-full bg-signal "></span>Workers AI is busy</b><p class="mt-1.5 mb-3 text-sm text-muted">The thinking model returned a 5xx twice. This turn used the fallback brain.</p><div class="flex gap-2.5"><a class="btn" href="#parts">Retry</a><a class="btn-solid" href="#parts">Keep going</a></div></div></div>`, 'md:col-span-2')}
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
<h1 class="text-[clamp(44px,7vw,96px)] leading-[0.92] font-bold tracking-[-0.05em]">Ember, ${accent('hung like art.')}</h1>
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
