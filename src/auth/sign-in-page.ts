import { FONTS } from '../ui/page';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const CLOUD = '<img class="cloud" src="/brand/cloudflare-cloud.svg" alt="" width="33" height="15">';

const GITHUB =
  '<svg class="gh" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';

type Point = { readonly icon: string; readonly title: string; readonly body: string };

const POINTS: readonly Point[] = [
  {
    icon: 'M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3',
    title: 'Knows when you are done talking',
    body: 'Deepgram Flux hears the end of your turn, and hark starts thinking before you finish.',
  },
  {
    icon: 'M18 6 6 18M6 6l12 12',
    title: 'Talk over it',
    body: 'Cut in at any point. It ducks, listens, and drops the rest of what it was saying.',
  },
  {
    icon: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    title: 'Sees, and paints',
    body: 'Show it something through your camera. Ask for a picture and FLUX puts one on your screen.',
  },
  {
    icon: 'M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z',
    title: 'Remembers you',
    body: 'Memories, timers, and your voice choice live in your own Durable Object. Ask it to forget, and it does.',
  },
];

const point = ({ icon, title, body }: Point) =>
  `<li><span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg></span><div><strong>${title}</strong><span>${body}</span></div></li>`;

const STEPS: readonly string[] = [
  'Pick an account on Cloudflare&rsquo;s consent screen.',
  'hark runs <b>Workers AI</b> on that account with your own token.',
  'Usage lands on that account. <b>Revoke anytime</b> in your Cloudflare profile.',
];

const STYLE = `
:root{color-scheme:dark;--bg:#09090b;--text:#fafafa;--dim:#a1a1aa;--faint:#71717a;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--ember:#f6913e;--flare:#f38020;--amber:#fbad41;--bad:#ff6b5b;
--sans:"Google Sans Flex","Google Sans",ui-sans-serif,system-ui,sans-serif;--mono:"Google Sans Code",ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
html,body{min-height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 var(--sans);font-optical-sizing:auto;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.field{position:fixed;inset:0;z-index:-2;background:url(/brand/hark-field.jpg) center/cover no-repeat;opacity:.5;filter:saturate(.8) brightness(.6)}
.field::after{content:'';position:absolute;inset:0;background:radial-gradient(70% 70% at 70% 40%,transparent,var(--bg) 80%),linear-gradient(to bottom,transparent 60%,var(--bg))}
.glow{position:fixed;width:900px;height:900px;right:-260px;top:-300px;z-index:-1;pointer-events:none;background:radial-gradient(circle,color-mix(in srgb,var(--flare) 18%,transparent),transparent 62%)}
.page{min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;max-width:1180px;margin:0 auto;padding:28px 40px}
header{display:flex;align-items:center;justify-content:space-between}
header img{height:26px;display:block}
nav{display:flex;gap:4px;align-items:center}
nav a{display:flex;align-items:center;gap:8px;color:var(--dim);font-size:13.5px;text-decoration:none;padding:8px 12px;border-radius:10px}
nav a:hover{color:var(--text);background:rgba(255,255,255,.05)}
.gh{width:20px;height:20px;display:block}
.hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);gap:72px;align-items:center;padding:56px 0}
.eyebrow{display:inline-flex;align-items:center;gap:9px;font:500 12px/1 var(--mono);letter-spacing:.02em;color:var(--ember);background:color-mix(in srgb,var(--flare) 12%,transparent);border:1px solid color-mix(in srgb,var(--flare) 25%,transparent);padding:8px 12px 8px 10px;border-radius:99px;margin:0 0 26px}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--ember);animation:beat 2.4s ease-in-out infinite}
@keyframes beat{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ember) 45%,transparent)}50%{box-shadow:0 0 0 6px transparent}}
h1{font-size:clamp(42px,5.6vw,72px);line-height:.98;letter-spacing:-.045em;font-weight:600;margin:0 0 24px}
h1 em{font-style:normal;background:linear-gradient(100deg,#f38020 10%,#fbad41 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{font-size:18.5px;line-height:1.5;color:var(--dim);max-width:31em;margin:0 0 40px}
.lede b{color:var(--text);font-weight:500}
ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:22px 28px;max-width:40em}
li{display:grid;grid-template-columns:38px 1fr;gap:14px;align-items:start}
.icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.03);border:1px solid var(--line2)}
.icon svg{width:19px;height:19px;fill:none;stroke:var(--amber);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
li strong{display:block;font-weight:600;font-size:14.5px;letter-spacing:-.005em;margin:1px 0 3px}
li span{color:var(--dim);font-size:13.5px}
.stage{position:relative;isolation:isolate}
.ear{position:relative;width:180px;height:180px;margin:0 auto 18px;display:grid;place-items:center}
.ear .core{width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 38% 36%,#fff4e3,#fbad41 45%,#f38020);box-shadow:0 0 60px -6px var(--flare);animation:swell 3.2s ease-in-out infinite}
.ear .ring{position:absolute;inset:0;margin:auto;width:58px;height:58px;border-radius:50%;border:1.5px solid var(--amber);opacity:0;animation:ripple 3.6s cubic-bezier(.2,.6,.3,1) infinite}
.ear .ring:nth-child(2){animation-delay:.9s}.ear .ring:nth-child(3){animation-delay:1.8s}.ear .ring:nth-child(4){animation-delay:2.7s}
@keyframes ripple{0%{transform:scale(1);opacity:.7}100%{transform:scale(3);opacity:0}}
@keyframes swell{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
.card{position:relative;background:rgba(18,18,20,.72);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid var(--line2);border-radius:26px;padding:34px;box-shadow:0 40px 90px -40px rgba(0,0,0,.8)}
.card::before{content:'';position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:linear-gradient(160deg,color-mix(in srgb,var(--flare) 60%,transparent),transparent 42%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.card h2{font-size:23px;letter-spacing:-.02em;font-weight:600;margin:0 0 6px;text-align:center}
.card p{color:var(--dim);font-size:14px;margin:0 0 26px;text-align:center}
.cta{display:flex;align-items:center;justify-content:center;gap:12px;height:54px;border-radius:15px;background:var(--text);color:var(--bg);font-weight:500;font-size:15.5px;letter-spacing:-.005em;text-decoration:none;transition:transform .14s ease,box-shadow .14s ease}
.cta:hover{transform:translateY(-1px);box-shadow:0 14px 30px -12px color-mix(in srgb,var(--flare) 70%,transparent)}
.cta:focus-visible{outline:2px solid var(--ember);outline-offset:3px}
.cloud{width:33px;height:15px;flex:none;display:block}
.steps{list-style:none;margin:26px 0 0;padding:22px 0 0;border-top:1px dashed var(--line2);display:grid;grid-template-columns:1fr;gap:12px;counter-reset:step;max-width:none}
.steps li{grid-template-columns:24px 1fr;gap:12px;font-size:13.5px;color:var(--dim);counter-increment:step;align-items:center}
.steps li::before{content:counter(step);width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:500 11.5px var(--mono);background:rgba(255,255,255,.06);color:var(--text)}
.steps b{color:var(--text);font-weight:500}
.alert{display:grid;grid-template-columns:18px 1fr;gap:10px;padding:13px 14px;margin:0 0 20px;border-radius:12px;background:color-mix(in srgb,var(--bad) 10%,transparent);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);font-size:13.5px;text-align:left}
.alert svg{width:18px;height:18px;fill:none;stroke:var(--bad);stroke-width:2;stroke-linecap:round;margin-top:2px}
footer{display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between;align-items:center;color:var(--faint);font-size:12.5px;padding-top:12px}
footer .stack{font-family:var(--mono);font-size:11.5px}
@media (max-width:960px){.page{padding:20px}.hero{grid-template-columns:1fr;gap:36px;padding:28px 0}ul{grid-template-columns:1fr}.card{padding:26px}.lede{margin-bottom:28px;font-size:17px}.stage{order:-1}.hero>section:first-child{order:0}}
@media (prefers-reduced-motion:reduce){.cta,.eyebrow i,.ear .core,.ear .ring{transition:none;animation:none}.ear .ring{opacity:.25}}
`;

const alert = (error: string) =>
  `<div class="alert" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg><div>${escapeHtml(error)}</div></div>`;

export type SignInPage = { readonly origin: string; readonly error?: string };

const TITLE = 'hark · a voice on your own Cloudflare';

const DESCRIPTION = 'Talk to it. It talks back. A voice assistant with no chat box, heard, thought, and spoken on your own Workers AI.';

export const signInPage = ({ origin, error }: SignInPage) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="${escapeHtml(origin)}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="hark">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${escapeHtml(origin)}/">
<meta property="og:image" content="${escapeHtml(origin)}/brand/hark-social.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="hark: talk to it, it talks back. Runs on your own Cloudflare.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESCRIPTION}">
<meta name="twitter:image" content="${escapeHtml(origin)}/brand/hark-social.png">
<meta name="theme-color" content="#09090b">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<div class="field" aria-hidden="true"></div>
<div class="glow" aria-hidden="true"></div>
<div class="page">
<header>
<img src="/brand/hark-wordmark.svg" alt="hark" width="102" height="26">
<nav><a href="https://github.com/acoyfellow/hark" aria-label="Source on GitHub">${GITHUB}</a></nav>
</header>
<main class="hero">
<section>
<p class="eyebrow"><i></i>Bring your own Cloudflare</p>
<h1>Talk to it.<br><em>It talks back.</em></h1>
<p class="lede">hark is a voice assistant with <b>no chat box</b>. You talk, it listens, thinks, and answers out loud. Every word is heard, thought, and spoken on <b>your</b> Cloudflare account.</p>
<ul>${POINTS.map(point).join('')}</ul>
</section>
<div class="stage"><section class="card" aria-labelledby="start">
<div class="ear" aria-hidden="true"><span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="core"></span></div>
<h2 id="start">Wake hark</h2>
<p>Choose the Cloudflare account hark should think with. You stay in control of it the whole time.</p>
${error === undefined ? '' : alert(error)}
<a class="cta" id="sign-in" href="/oauth/login">${CLOUD}Sign in with Cloudflare</a>
<ol class="steps">${STEPS.map((step) => `<li><span>${step}</span></li>`).join('')}</ol>
</section></div>
</main>
<footer>
<span>A showcase of the Cloudflare Developer Platform. Open source.</span>
<span class="stack">Workers · Durable Objects · Workers AI · Flux · Aura 2 · FLUX.2</span>
</footer>
</div>
</body>
</html>`;
