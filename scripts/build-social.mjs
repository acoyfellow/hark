import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const background = '#0b0b0b';
const wordmark = readFileSync('docs/brand/hark-wordmark.svg', 'utf8').replace('<svg ', '<svg width="300" ');
const html = `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,300..700&display=swap">
<style>
body{margin:0;width:1200px;height:630px;background:${background};font-family:"Google Sans Flex",system-ui,sans-serif;color:#fafafa;overflow:hidden}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,#0b0b0b 0%,rgba(11,11,11,.92) 34%,rgba(11,11,11,.2) 70%,transparent)}
.copy{position:absolute;left:84px;top:150px;width:620px}
h1{font-size:64px;line-height:1;letter-spacing:-.045em;font-weight:600;margin:46px 0 22px}
h1 em{font-style:normal;color:#ff5200}
p{font-size:24px;line-height:1.4;color:#9a9a9a;margin:0}
.blocks{position:absolute;right:90px;top:115px;width:400px;height:400px}.stack{position:absolute;left:84px;bottom:56px;font:500 17px ui-monospace,monospace;color:#6b6b6b;letter-spacing:.02em}
</style></head><body><div class="shade"></div><div class="copy">${wordmark}<h1>Talk to it.<br><em>It talks back.</em></h1><p>A voice with no chat box, on your own Cloudflare account.</p></div><img class="blocks" src="data:image/svg+xml;base64,${readFileSync('docs/brand/hark-icon.svg').toString('base64')}"><div class="stack">Workers · Durable Objects · Workers AI · AI Gateway</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => page.setContent(html));
await page.waitForTimeout(400);
await page.screenshot({ path: 'public/brand/hark-social.png' });
await browser.close();
console.log('public/brand/hark-social.png');
