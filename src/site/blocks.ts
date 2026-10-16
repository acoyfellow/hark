type Spot = readonly [number, number, number];

type Formation = readonly Spot[];

export type Morph = { readonly formations: readonly Formation[]; readonly hold: number; readonly duration: number; readonly stagger: number };

type Faces = { readonly top: string; readonly left: string; readonly right: string };

export type Palette = { readonly gray: Faces; readonly ember: Faces };

const ISO = 0.578;

const UNIT = 10;

const CUBE_EDGE = 1.1547;

const REST: Formation = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 2.6]];

const LISTEN: Formation = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [1.5, -0.5, 0], [-0.5, 0.5, 0], [-0.5, 1.5, 0], [1.5, 0.5, 0], [0.5, 1.5, 0], [0.5, 0.5, 1.4]];

const SPEAK: Formation = [[0, 1, 0], [1, 1, 0], [1, 0, 0], [1, 1, 1], [0, 1, 1], [1, 0, 1], [1, 1, 2], [1, 1, 3.4]];

const MELT: Formation = [[-1, 0.5, 0], [0, 0.5, 0], [1, 0.5, 0], [2, 0.5, 0], [-1, 1.5, 0], [0, 1.5, 0], [1, 1.5, 0], [0.5, 1, 1.2]];

const WAVE: Formation = [[-1, 1, 0], [0, 1, 0.5], [1, 1, 0.9], [2, 1, 0.5], [-1, 0, 0.3], [0, 0, 0.9], [1, 0, 1.3], [1, 0, 2.6]];

export const HARK_MORPH: Morph = { formations: [REST, LISTEN, MELT, WAVE, SPEAK, REST], hold: 0.4, duration: 11, stagger: 0.08 };

export const SUMMON_MORPH: Morph = { formations: [REST, LISTEN, SPEAK, REST], hold: 0.45, duration: 7.2, stagger: 0.06 };

export const LIQUID_MORPH: Morph = { formations: [REST, MELT, WAVE, REST], hold: 0.35, duration: 6.4, stagger: 0.1 };

const STILL: Morph = { formations: [REST], hold: 1, duration: 1, stagger: 0 };

const fill = (value: string) => `style="fill:${value}"`;

const faces = (top: string, left: string, right: string): Faces => ({ top: fill(top), left: fill(left), right: fill(right) });

const mixVar = (percent: number, stage: string) => `color-mix(in srgb, currentColor ${percent}%, ${stage})`;

const emberMix = (percent: number) => `color-mix(in srgb, var(--color-signal) ${percent}%, #000)`;

export const pagePalette = (stage = 'var(--color-ink, #0b0b0b)'): Palette => ({
  gray: faces(mixVar(22, stage), mixVar(62, stage), mixVar(40, stage)),
  ember: faces('var(--color-signal, #ff5200)', emberMix(78), emberMix(58)),
});

const channel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);

const mixHex = (front: string, back: string, percent: number) =>
  `#${[0, 1, 2].map((index) => Math.round((channel(front, index) * percent + channel(back, index) * (100 - percent)) / 100).toString(16).padStart(2, '0')).join('')}`;

export const hexPalette = (stage: string, ink: string, signal: string): Palette => ({
  gray: faces(mixHex(ink, stage, 22), mixHex(ink, stage, 62), mixHex(ink, stage, 40)),
  ember: faces(signal, mixHex(signal, '#000000', 78), mixHex(signal, '#000000', 58)),
});

export const DARK_PALETTE = hexPalette('#0b0b0b', '#f2f2f2', '#ff5200');

export const LIGHT_PALETTE = hexPalette('#ffffff', '#111111', '#d93d00');

const cellTop = ([i, j, k]: Spot) => ({ x: (i - j) * UNIT, y: (i + j) * UNIT * ISO - k * UNIT * CUBE_EDGE });

const spotAt = (formation: Formation | undefined, block: number): Spot => formation?.[block] ?? [0, 0, 0];

const isoCube = (centerX: number, topY: number, tone: Faces) => {
  const middle = topY + ISO * UNIT;
  const front = topY + 2 * ISO * UNIT;
  const depth = UNIT * CUBE_EDGE;
  return `<path d="M${centerX} ${topY} ${centerX + UNIT} ${middle} ${centerX} ${front} ${centerX - UNIT} ${middle}Z" ${tone.top}/><path d="M${centerX - UNIT} ${middle} ${centerX} ${front}V${front + depth}L${centerX - UNIT} ${middle + depth}Z" ${tone.left}/><path d="M${centerX} ${front} ${centerX + UNIT} ${middle}V${middle + depth}L${centerX} ${front + depth}Z" ${tone.right}/>`;
};

const morphKeys = (morph: Morph) => {
  const steps = morph.formations.length - 1;
  const times: number[] = [];
  const values: number[] = [];
  morph.formations.forEach((_, index) => {
    if (index === steps) {
      times.push(1);
      values.push(index);
      return;
    }
    times.push(index / steps, (index + morph.hold) / steps);
    values.push(index, index);
  });
  return { times, values };
};

const blockMotion = (morph: Morph, block: number) => {
  const { times, values } = morphKeys(morph);
  const base = cellTop(spotAt(morph.formations[0], block));
  const translations = values.map((index) => {
    const spot = cellTop(spotAt(morph.formations[index], block));
    return `${(spot.x - base.x).toFixed(2)} ${(spot.y - base.y).toFixed(2)}`;
  });
  const splines = times.slice(1).map((_, index) => (index % 2 === 0 ? '0 0 1 1' : '0.7 0 0.25 1')).join(';');
  const delay = -(morph.duration - block * morph.stagger);
  return `<animateTransform attributeName="transform" type="translate" values="${translations.join(';')}" keyTimes="${times.map((time) => time.toFixed(4)).join(';')}" keySplines="${splines}" calcMode="spline" dur="${morph.duration}s" begin="${delay.toFixed(2)}s" repeatCount="indefinite"/>`;
};

const restOrder = REST.map((_, block) => block).toSorted((left, right) => {
  const [li, lj, lk] = spotAt(REST, left);
  const [ri, rj, rk] = spotAt(REST, right);
  return li + lj - (ri + rj) || lk - rk;
});

export const blockShapes = (palette: Palette, morph: Morph = STILL) => {
  const tops = morph.formations.flat().map(cellTop);
  const minX = Math.min(...tops.map((top) => top.x)) - UNIT;
  const maxX = Math.max(...tops.map((top) => top.x)) + UNIT;
  const minY = Math.min(...tops.map((top) => top.y));
  const maxY = Math.max(...tops.map((top) => top.y)) + UNIT * (2 * ISO + CUBE_EDGE);
  const scale = 58 / Math.max(maxX - minX, maxY - minY);
  const offsetX = 32 - ((minX + maxX) / 2) * scale;
  const offsetY = 32 - ((minY + maxY) / 2) * scale;
  const moving = morph.formations.length > 1;
  const blocks = restOrder
    .map((block) => {
      const top = cellTop(spotAt(REST, block));
      const cube = isoCube(top.x, top.y, block === REST.length - 1 ? palette.ember : palette.gray);
      return moving ? `<g>${blockMotion(morph, block)}${cube}</g>` : cube;
    })
    .join('');
  return `<g transform="translate(${offsetX.toFixed(3)} ${offsetY.toFixed(3)}) scale(${scale.toFixed(4)})">${blocks}</g>`;
};

const svgLabel = (label: string) => (label === '' ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`);

export const blockSvg = (size: number, palette: Palette, morph?: Morph, label = '') =>
  `<svg viewBox="0 0 64 64" width="${size}" height="${size}" ${svgLabel(label)}>${blockShapes(palette, morph)}</svg>`;

export const liveMark = (size: number, label = '') =>
  `<span class="hark-mark-live inline-block">${blockSvg(size, pagePalette(), HARK_MORPH, label)}</span><span class="hark-mark-still inline-block">${blockSvg(size, pagePalette(), undefined, label)}</span>`;

export const LIVE_MARK_STYLE = '.hark-mark-still{display:none!important}@media (prefers-reduced-motion:reduce){.hark-mark-live{display:none!important}.hark-mark-still{display:inline-block!important}}';
