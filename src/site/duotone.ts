import { blockShapes, blockSvg, LIVE_MARK_STYLE, liveMark, pagePalette } from './blocks';

export const mark = (size: number, label = '') => blockSvg(size, pagePalette(), undefined, label);

export const livingMark = liveMark;

const WORDMARK_LETTERS =
  '<g transform="translate(64 2)" fill="none" stroke="currentColor" stroke-width="7.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6V58"/><path d="M6 40a16 16 0 0 1 32 0V58"/><circle cx="68" cy="41.5" r="16"/><path d="M84 26V58"/><path d="M102 58V27"/><path d="M102 43a17 17 0 0 1 24-15.5"/><path d="M140 6V58"/><path d="M170 27 142.5 47.5"/><path d="M153 40 171 58"/></g>';

export const wordmark = (height: number) =>
  `<svg viewBox="0 0 248 64" height="${height}" width="${Math.round((height * 248) / 64)}" role="img" aria-label="hark"><svg x="0" y="0" width="64" height="64" viewBox="0 0 64 64">${blockShapes(pagePalette())}</svg>${WORDMARK_LETTERS}</svg>`;

export const DUOTONE_STYLE = `<style>
body.brand-duo{--color-ink:#0b0b0b;--color-layer:#151515;--color-layer-2:#1c1c1c;--color-text:#f2f2f2;--color-muted:#9a9a9a;--color-faint:#6b6b6b;--color-line:rgba(255,255,255,.09);--color-line-2:rgba(255,255,255,.2);--color-amber:#ff5a1f;--color-signal:#ff5200;--color-rust:#d93d00;--color-on-signal:#fff;--color-night:#0b0b0b;--color-paper:#fff;--color-cream:#f2f2f2;--shadow-tile:none;background:#0b0b0b;color:#f2f2f2}
:root[data-theme='light'] body.brand-duo{--color-ink:#fff;--color-layer:#fafafa;--color-layer-2:#f2f2f2;--color-text:#111;--color-muted:#6b6b6b;--color-faint:#9a9a9a;--color-line:rgba(0,0,0,.07);--color-line-2:rgba(0,0,0,.16);--color-amber:#d93d00;--color-signal:#d93d00;--shadow-tile:0 10px 24px -18px rgba(0,0,0,.25);background:#fff;color:#111}
body.brand-duo::before,body.brand-duo::after{display:none}
body.brand-duo .pill{background:#d93d00;color:#fff;border-radius:9999px;box-shadow:none}
body.brand-duo .pill:hover{color:#fff}
body.brand-duo .welcome-swarm{filter:brightness(.7) contrast(1.8);mix-blend-mode:screen;opacity:.9}
:root[data-theme='light'] body.brand-duo .welcome-swarm{filter:grayscale(1) invert(1) contrast(1.6);mix-blend-mode:multiply;opacity:.35}
body.brand-duo .cf-neon{filter:drop-shadow(0 0 6px rgba(255,95,8,.55)) drop-shadow(0 0 18px rgba(255,82,0,.35))}body.brand-duo .pill{box-shadow:0 0 0 1px rgba(255,120,40,.35),0 0 18px rgba(255,82,0,.45),0 0 48px -8px rgba(255,82,0,.55)}body.brand-duo .dragon svg{fill:#f2f2f2;filter:drop-shadow(0 0 4px rgba(255,82,0,.5))}:root[data-theme='light'] body.brand-duo .dragon svg{fill:#111;filter:none}body.brand-duo .dragon .belly{fill:#ff5200}body.brand-duo .dragon .eye{fill:#ff5200}body.brand-duo .dragon .fire rect{fill:#ff5200;filter:drop-shadow(0 0 3px #ff5200)}body.brand-duo .dragon .fire .hot{fill:#ffb37a}body.brand-duo .peek .astronaut{filter:saturate(1.15) contrast(1.05)}
${LIVE_MARK_STYLE}
body.brand-duo .duo-button{padding:0 22px;white-space:nowrap}
</style>`;

export const CLOUDFLARE_MARK = '<svg viewBox="0 0 341 156" width="57" height="26" role="img" aria-label="Cloudflare" class="cf-neon block flex-none"><g><path d="M275.125 68.25C311.507 68.25 341 97.9335 341 134.55C341 141.077 340.063 147.385 338.317 153.343C337.848 154.943 336.363 156 334.706 156H243.056C241.697 156 240.76 154.628 241.247 153.351L242.999 148.76C248.595 134.03 264.56 121.963 279.331 121.256L307.33 119.813C308.826 119.736 310 118.492 310 116.985C310 115.485 308.838 114.245 307.351 114.157L281.059 112.601C266.924 111.877 260.018 99.2932 263.82 86.179L268.195 71.0866C268.64 69.5514 269.971 68.4343 271.557 68.3476C272.738 68.2831 273.928 68.25 275.125 68.25Z" fill="#FF9910"></path><path d="M184.062 0C222 0 253.868 26.1297 262.882 61.4824C263.26 62.967 263.142 64.5333 262.601 65.9662L255.383 85.0897C249.787 99.8196 235.406 112.593 219.134 112.593L93.7928 114.043C92.2801 114.061 91.063 115.3 91.0625 116.823C91.0625 118.344 92.2776 119.585 93.789 119.605L217.365 121.248C231.531 121.248 238.406 134.556 234.606 147.671L233.011 153.189C232.53 154.855 231.014 156 229.291 156H3.90889C1.98075 156 0.330745 154.574 0.17634 152.64C0.0594555 151.175 0 149.695 0 148.2C0 119.723 21.6617 96.3403 49.306 93.8266C48.7387 91.2419 48.4375 88.5564 48.4375 85.8C48.4375 65.3379 64.919 48.75 85.25 48.75C93.3413 48.75 100.822 51.3789 106.897 55.8321C117.716 23.3806 148.176 0 184.062 0Z" fill="#FF5F08"></path></g></svg>';

export const DUOTONE_BODY = 'brand-duo';

const DUOTONE_APP_CSS = `<style id="duotone-app">
:root{--color-ink:#0b0b0b;--color-ember:#ff5200;--color-amber:#ff7a33;--color-flare:#ff5200;--font-sans:Inter,ui-sans-serif,system-ui,sans-serif;--font-mono:"IBM Plex Mono",ui-monospace,monospace}
html,body,#root{background:#0b0b0b}
canvas{filter:brightness(.7) contrast(1.8)}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">`;

export const DUOTONE_APP_SKIN = { style: DUOTONE_APP_CSS, manifest: '/manifest.webmanifest', icon: '/icons/favicon.svg', touchIcon: '/icons/apple-touch-icon.png', themeColor: '#0b0b0b' } as const;
