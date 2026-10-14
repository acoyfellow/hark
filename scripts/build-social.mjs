import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const art = ['docs/brand/hark-social-art.jpg', 'public/brand/hark-field.jpg'].find((path) => existsSync(path));
const background = art
  ? `url(data:image/jpeg;base64,${readFileSync(art).toString('base64')}) right center / cover no-repeat`
  : 'radial-gradient(55% 80% at 78% 50%, rgba(243,128,32,.45), transparent 60%), #09090b';
const wordmark = readFileSync('docs/brand/hark-wordmark.svg', 'utf8').replace('<svg ', '<svg width="300" ');
const html = `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,300..700&display=swap">
<style>
body{margin:0;width:1200px;height:630px;background:${background};font-family:"Google Sans Flex",system-ui,sans-serif;color:#fafafa;overflow:hidden}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,#09090b 0%,rgba(9,9,11,.92) 34%,rgba(9,9,11,.2) 70%,transparent)}
.copy{position:absolute;left:84px;top:150px;width:620px}
h1{font-size:64px;line-height:1;letter-spacing:-.045em;font-weight:600;margin:46px 0 22px}
h1 em{font-style:normal;background:linear-gradient(100deg,#f38020,#fbad41);-webkit-background-clip:text;color:transparent}
p{font-size:24px;line-height:1.4;color:#a1a1aa;margin:0}
.stack{position:absolute;left:84px;bottom:56px;font:500 17px ui-monospace,monospace;color:#71717a;letter-spacing:.02em}
</style></head><body><div class="shade"></div><div class="copy">${wordmark}<h1>Talk to it.<br><em>It talks back.</em></h1><p>A voice with no chat box, on your own Cloudflare account.</p></div><div class="stack">Workers · Durable Objects · Workers AI · AI Gateway</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => page.setContent(html));
await page.waitForTimeout(400);
await page.screenshot({ path: 'public/brand/hark-social.png' });
await browser.close();
console.log(`public/brand/hark-social.png from ${art ?? 'a gradient (no img-gen art yet)'}`);
