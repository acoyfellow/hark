import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const targets = [
  ['docs/brand/hark-icon.svg', 'public/icons/favicon-32.png', 32],
  ['docs/brand/hark-icon.svg', 'public/icons/apple-touch-icon.png', 180],
  ['docs/brand/hark-icon.svg', 'public/icons/icon-192.png', 192],
  ['docs/brand/hark-icon.svg', 'public/icons/icon-512.png', 512],
  ['docs/brand/hark-icon-maskable.svg', 'public/icons/maskable-512.png', 512],
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [source, target, size] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${readFileSync(source, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: target, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(target);
}

await browser.close();
