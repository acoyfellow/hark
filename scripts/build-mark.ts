import { writeFileSync } from 'node:fs';
import { blockShapes, DARK_PALETTE, HARK_MORPH, LIGHT_PALETTE, type Palette } from '../src/site/blocks';
import { wordmark } from '../src/site/duotone';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const tileSvg = (inset: number, radius: number) => `<svg ${NS} viewBox="0 0 64 64"><rect width="64" height="64" rx="${radius}" fill="#0b0b0b"/><g transform="translate(${inset} ${inset}) scale(${(64 - 2 * inset) / 64})">${blockShapes(DARK_PALETTE)}</g></svg>`;
writeFileSync('public/icons/favicon.svg', tileSvg(5, 14));
writeFileSync('docs/brand/hark-icon.svg', tileSvg(8, 0));
writeFileSync('docs/brand/hark-icon-maskable.svg', tileSvg(14, 0));
writeFileSync('public/brand/hark-mark.svg', `<svg ${NS} viewBox="0 0 64 64">${blockShapes(DARK_PALETTE, HARK_MORPH)}</svg>`);
writeFileSync('public/brand/hark-mark-still.svg', `<svg ${NS} viewBox="0 0 64 64">${blockShapes(DARK_PALETTE)}</svg>`);
const word = (palette: Palette, ink: string) =>
  wordmark(64).replace('<svg ', `<svg ${NS} `).replace(/<svg x="0"[\s\S]*?<\/svg>/, `<svg x="0" y="0" width="64" height="64" viewBox="0 0 64 64">${blockShapes(palette)}</svg>`).replace(/currentColor/g, ink);
writeFileSync('public/brand/hark-wordmark.svg', word(DARK_PALETTE, '#f2f2f2'));
writeFileSync('public/brand/hark-wordmark-on-light.svg', word(LIGHT_PALETTE, '#111111'));
writeFileSync('docs/brand/hark-icon.svg', tileSvg(8, 0));
writeFileSync('docs/brand/hark-icon-maskable.svg', tileSvg(14, 0));
writeFileSync('docs/brand/hark-mark.svg', `<svg ${NS} viewBox="0 0 64 64">${blockShapes(DARK_PALETTE, HARK_MORPH)}</svg>`);
writeFileSync('docs/brand/hark-wordmark.svg', word(DARK_PALETTE, '#f2f2f2'));
writeFileSync('docs/brand/hark-wordmark-dark.svg', word(LIGHT_PALETTE, '#111111'));
