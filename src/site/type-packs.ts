import { tile } from './layout';

type Face = { readonly family: string; readonly weight: number; readonly tracking: string };

type TypePack = {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly display: Face;
  readonly section: Face;
  readonly body: Face;
  readonly mono: Face;
  readonly accent: string;
};

const PACKS: readonly TypePack[] = [
  {
    id: 'swiss',
    name: 'P1 · Swiss',
    note: 'Inter Tight, heavy and tight. Plex Mono. The accent is a light weight in orange. Calm, very Cloudflare.',
    display: { family: "'Inter Tight'", weight: 800, tracking: '-0.05em' },
    section: { family: "'Inter Tight'", weight: 700, tracking: '-0.03em' },
    body: { family: 'Inter', weight: 400, tracking: '0' },
    mono: { family: "'IBM Plex Mono'", weight: 500, tracking: '0.12em' },
    accent: "font-weight:300;color:var(--color-signal)",
  },
  {
    id: 'grotesk',
    name: 'P2 · Grotesk',
    note: 'Space Grotesk with JetBrains Mono. Square, a little odd, nerdy. Matches the blocks.',
    display: { family: "'Space Grotesk'", weight: 700, tracking: '-0.045em' },
    section: { family: "'Space Grotesk'", weight: 600, tracking: '-0.025em' },
    body: { family: "'Space Grotesk'", weight: 400, tracking: '-0.005em' },
    mono: { family: "'JetBrains Mono'", weight: 600, tracking: '0.1em' },
    accent: 'color:var(--color-signal);font-weight:400',
  },
  {
    id: 'terminal',
    name: 'P3 · Terminal',
    note: 'Mono everywhere except the body. JetBrains Mono display, Inter body. The accent is an orange block cursor.',
    display: { family: "'JetBrains Mono'", weight: 800, tracking: '-0.06em' },
    section: { family: "'JetBrains Mono'", weight: 700, tracking: '-0.04em' },
    body: { family: 'Inter', weight: 400, tracking: '0' },
    mono: { family: "'JetBrains Mono'", weight: 500, tracking: '0.12em' },
    accent: 'background:var(--color-signal);color:#0b0b0b;padding:0 .12em;font-weight:800',
  },
  {
    id: 'editorial',
    name: 'P4 · Editorial',
    note: 'Instrument Sans with one Instrument Serif italic phrase, and Geist Mono. The current look, made sharper.',
    display: { family: "'Instrument Sans'", weight: 700, tracking: '-0.045em' },
    section: { family: "'Instrument Sans'", weight: 600, tracking: '-0.03em' },
    body: { family: "'Instrument Sans'", weight: 400, tracking: '0' },
    mono: { family: "'Geist Mono'", weight: 500, tracking: '0.12em' },
    accent: "font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;letter-spacing:0;color:var(--color-signal)",
  },
];

export const TYPE_PACK_FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;700;800&family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@500;600;700;800&family=Instrument+Sans:wght@400;600;700&family=Instrument+Serif:ital@1&family=Geist+Mono:wght@500&display=swap">';

const faceStyle = ({ family, weight, tracking }: Face) => `font-family:${family},ui-sans-serif,sans-serif;font-weight:${weight};letter-spacing:${tracking}`;

const LABEL = 'font-mono text-xs text-faint';

const specOf = ({ family, weight, tracking }: Face) => `${family.replaceAll("'", '')} ${weight} · ${tracking}`;

const line = (label: string, face: Face, size: string, sample: string, extra = '') =>
  `<div class="grid items-baseline gap-2 border-t border-line py-5 first:border-t-0 first:pt-1 md:grid-cols-[120px_1fr_240px] md:gap-6"><span class="${LABEL}">${label}</span><div style="${faceStyle(face)};font-size:${size};line-height:1.05;${extra}">${sample}</div><span class="${LABEL}">${specOf(face)}</span></div>`;

const scale = (pack: TypePack) =>
  [
    line('52 / Display', pack.display, 'clamp(34px,5vw,52px)', `A voice agent <span style="${pack.accent}">that stays.</span>`),
    line('28 / Section', pack.section, '28px', 'Answers before you finish'),
    line('15 / Body', pack.body, '15px', 'Tap the ear and talk. hark listens, thinks and answers out loud.', 'color:var(--color-muted);line-height:1.6'),
    line('11 / System', pack.mono, '11px', 'TURN_024 · LISTENING · YOUR ACCOUNT', 'color:var(--color-signal);text-transform:uppercase'),
    line('Number', { ...pack.mono, tracking: '0' }, '32px', '1,269 ms', 'font-variant-numeric:tabular-nums'),
  ].join('');

const slideCount = PACKS.length;

const neighbor = (index: number, step: number) => PACKS[(index + step + slideCount) % slideCount]?.id ?? '';

const ARROW = 'grid size-8 cursor-pointer place-items-center rounded-full border border-line font-mono text-sm text-muted hover:border-line-2 hover:text-text';

const slide = (pack: TypePack, index: number) =>
  `<div class="type-slide" data-pack="${pack.id}">${tile(`${pack.name} · ${index + 1}/${slideCount}`, `<div class="p-4.5">${scale(pack)}</div><div class="flex items-center gap-3 border-t border-line px-4.5 py-3"><label for="pack-${neighbor(index, -1)}" class="${ARROW}" aria-label="Previous pack">←</label><label for="pack-${neighbor(index, 1)}" class="${ARROW}" aria-label="Next pack">→</label><p class="ml-2 text-[13px] text-muted">${pack.note}</p></div>`)}</div>`;

const dot = (pack: TypePack) =>
  `<label for="pack-${pack.id}" class="type-dot cursor-pointer rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] tracking-[0.08em] text-muted uppercase hover:text-text" data-dot="${pack.id}">${pack.name}</label>`;

const radio = (pack: TypePack, index: number) =>
  `<input type="radio" name="type-pack" id="pack-${pack.id}" style="position:absolute;opacity:0;pointer-events:none"${index === 0 ? ' checked' : ''}>`;

const packRules = PACKS.map(
  ({ id }) =>
    `#pack-${id}:checked~.type-track [data-pack="${id}"]{display:block}#pack-${id}:checked~.type-dots [data-dot="${id}"]{color:var(--color-signal);border-color:var(--color-signal)}`,
).join('');

const TYPE_PACK_STYLE = `<style>.type-slide{display:none;animation:type-in .35s ease-out}@keyframes type-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}${packRules}</style>`;

export const TYPE_PACKS = `${TYPE_PACK_STYLE}<div>${PACKS.map(radio).join('')}<div class="type-dots mb-3 flex flex-wrap gap-1.5">${PACKS.map(dot).join('')}</div><div class="type-track">${PACKS.map(slide).join('')}</div></div>`;
