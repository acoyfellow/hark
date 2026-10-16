import { FONTS } from '../ui/page';
import { WELCOME_ENTRY } from '../ui/app.generated';
import { FEATURES, type FeatureGroup } from '../../shared/features';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const CLOUDFLARE_CLOUD = '<img class="cfcloud" src="/brand/cloudflare-cloud.svg" alt="" width="44" height="20">';

const CLOUDFLARE_FULL = '<img class="cffull" src="/brand/cloudflare-logo.svg" alt="Cloudflare" width="96" height="32">';

const GITHUB =
  '<svg class="gh" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';

type Point = { readonly icon: string; readonly title: string; readonly body: string };

const POINTS: readonly Point[] = [
  {
    icon: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8',
    title: 'Lives on, durably',
    body: 'hark is one Durable Object that is yours. Close the tab, lose signal, come back tomorrow: its memory, files, timers and connected tools are still there.',
  },
  {
    icon: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    title: 'Bring your own MCP servers',
    body: 'Say &ldquo;connect my server&rdquo; and give it a URL. hark keeps it and calls its tools by voice. Docs, search, code runners, your own services.',
  },
  {
    icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
    title: 'Makes anything',
    body: 'Ask for a rocket, a skyline, a solar system. It writes the code that moves thousands of embers, runs it in a sandbox, and keeps it on its own workbench.',
  },
  {
    icon: 'M18 6 6 18M6 6l12 12',
    title: 'Talk over it',
    body: 'Interrupt at any point. It stops, listens, and picks up from what you said.',
  },
];

const point = ({ icon, title, body }: Point) =>
  `<li><span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg></span><div><strong>${title}</strong><span>${body}</span></div></li>`;

const STEPS: readonly string[] = [
  'Pick an account on Cloudflare&rsquo;s consent screen.',
  'hark thinks with <b>Workers AI</b> on that account, with your own token.',
  '<b>Revoke anytime</b> in your Cloudflare profile.',
];

const BILLING_NOTE = 'Uses your account&rsquo;s Workers AI. Most of it fits the free allocation.';

const STYLE = `
:root{color-scheme:dark;--e0:#0a0604;--e1:#3a1607;--e2:#a8420f;--e3:#f6821f;--e4:#ffb35c;--e5:#ffe7c4;--dim:rgba(255,231,196,.62);--faint:rgba(255,231,196,.38);--edge:rgba(255,190,120,.16);--edge2:rgba(255,190,120,.28);--bad:#ff6b5b;
--sans:"Google Sans Flex","Google Sans",ui-sans-serif,system-ui,sans-serif;--mono:"Google Sans Code",ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
html,body{min-height:100%}
body{margin:0;background:var(--e0);color:var(--e5);font:15px/1.55 var(--sans);font-optical-sizing:auto;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.glow{position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(45% 55% at 74% 46%,rgba(246,130,31,.26),rgba(168,66,15,.08) 50%,transparent 78%),radial-gradient(60% 50% at 10% 110%,rgba(168,66,15,.18),transparent 70%);mix-blend-mode:screen;animation:breathe 5s ease-in-out infinite}
@keyframes breathe{0%,100%{opacity:.8}50%{opacity:1}}
.page{position:relative;z-index:2;min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;max-width:1200px;margin:0 auto;padding:28px 40px}
header{display:flex;align-items:center;justify-content:space-between}
header img{height:26px;display:block}
nav a{display:flex;color:var(--dim);padding:8px;border-radius:10px}
nav a:hover{color:var(--e5);background:rgba(255,170,90,.08)}
.gh{width:20px;height:20px;display:block}
.hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(380px,.85fr);gap:80px;align-items:center;padding:56px 0}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font:500 12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--e4);background:linear-gradient(135deg,rgba(255,170,90,.14),rgba(255,170,90,.03));border:1px solid var(--edge);padding:9px 14px 9px 11px;border-radius:99px;margin:0 0 28px;backdrop-filter:blur(12px)}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--e3);box-shadow:0 0 10px var(--e3);animation:beat 2.4s ease-in-out infinite}
@keyframes beat{0%,100%{box-shadow:0 0 0 0 rgba(246,130,31,.55)}50%{box-shadow:0 0 0 7px transparent}}
h1{font-size:clamp(46px,6vw,80px);line-height:.96;letter-spacing:-.05em;font-weight:600;margin:0 0 26px;color:var(--e5)}
h1 em{font-style:normal;background:linear-gradient(100deg,var(--e2) 0%,var(--e3) 35%,var(--e4) 70%,var(--e5));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 28px rgba(246,130,31,.35))}
.lede{font-size:18.5px;line-height:1.55;color:var(--dim);max-width:31em;margin:0 0 44px}
.lede b{color:var(--e5);font-weight:500}
ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:42em}
.points li{display:grid;grid-template-columns:40px 1fr;gap:14px;align-items:start;padding:16px;border-radius:18px;background:linear-gradient(160deg,rgba(255,170,90,.07),rgba(255,170,90,.01) 60%);border:1px solid rgba(255,190,120,.09);transition:border-color .2s,background .2s}
.points li:hover{border-color:var(--edge2);background:linear-gradient(160deg,rgba(255,170,90,.12),rgba(255,170,90,.02) 60%)}
.icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(255,231,196,.14),rgba(246,130,31,.06));border:1px solid var(--edge)}
.icon svg{width:19px;height:19px;fill:none;stroke:var(--e4);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 6px rgba(255,179,92,.5))}
.points strong{display:block;font-weight:600;font-size:14.5px;margin:1px 0 3px;color:var(--e5)}
.points span{color:var(--dim);font-size:13.5px}
.card{position:relative;border-radius:28px;padding:36px;background:linear-gradient(160deg,rgba(255,170,90,.13),rgba(255,170,90,.025) 60%),rgba(10,6,4,.55);border:1px solid var(--edge);-webkit-backdrop-filter:blur(30px);backdrop-filter:blur(30px);box-shadow:0 40px 120px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,231,196,.08)}
.card::before{content:'';position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:linear-gradient(160deg,rgba(255,179,92,.7),transparent 40%,transparent 70%,rgba(168,66,15,.5));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.ear{position:relative;width:190px;height:190px;margin:-6px auto 14px;display:grid;place-items:center}
.ear .core{width:62px;height:62px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#fff8ee,var(--e5) 18%,var(--e4) 42%,var(--e3) 70%,var(--e2));box-shadow:0 0 40px 4px rgba(246,130,31,.6),0 0 120px 20px rgba(246,130,31,.25);animation:swell 3.2s ease-in-out infinite}
.ear .ring{position:absolute;inset:0;margin:auto;width:62px;height:62px;border-radius:50%;border:1.5px solid var(--e4);box-shadow:0 0 12px rgba(255,179,92,.4);opacity:0;animation:ripple 3.6s cubic-bezier(.2,.6,.3,1) infinite}
.ear .ring:nth-child(2){animation-delay:.9s}.ear .ring:nth-child(3){animation-delay:1.8s}.ear .ring:nth-child(4){animation-delay:2.7s}
@keyframes ripple{0%{transform:scale(1);opacity:.75}100%{transform:scale(3);opacity:0}}
@keyframes swell{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
.card h2{font-size:25px;letter-spacing:-.025em;font-weight:600;margin:0 0 8px;text-align:center;color:var(--e5)}
.card p{color:var(--dim);font-size:14px;margin:0 auto 28px;text-align:center;max-width:22em}
.cta{display:flex;align-items:center;justify-content:center;gap:14px;height:60px;border-radius:16px;background:linear-gradient(180deg,#fff8ee,var(--e5));color:var(--e0);font-weight:600;font-size:15.5px;text-decoration:none;box-shadow:0 0 0 1px rgba(255,231,196,.4),0 18px 40px -16px rgba(246,130,31,.8),inset 0 -2px 0 rgba(168,66,15,.15);transition:transform .14s ease,box-shadow .2s ease}
.cta:hover{transform:translateY(-1px);box-shadow:0 0 0 1px rgba(255,231,196,.6),0 22px 50px -14px rgba(246,130,31,1),inset 0 -2px 0 rgba(168,66,15,.15)}
.cta:focus-visible{outline:2px solid var(--e3);outline-offset:3px}
.cta span{opacity:.75;font-weight:500}
.cfcloud{height:22px;width:auto;display:block;flex:none}
.stage{position:relative}
#welcome-swarm{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.85}
#welcome-swarm canvas{width:100%;height:100%;display:block}
#orb{position:fixed;width:2px;height:2px;right:22%;top:46%;pointer-events:none}
@media (max-width:960px){#orb{right:50%;top:18%}#welcome-swarm{opacity:.5}}
.mark{display:block;width:96px;height:96px;margin:4px auto 22px}

.disclaimer{display:flex;align-items:center;gap:14px;max-width:440px}
.disclaimer p{margin:0;line-height:1.45}
.disclaimer b{color:var(--dim);font-weight:600}
.cffull{height:30px;width:auto;flex:none;opacity:.9}
.billing{margin:12px auto 0!important;font-size:12.5px!important;color:var(--faint)!important;max-width:none!important}
.steps{list-style:none;margin:24px 0 0;padding:22px 0 0;border-top:1px solid rgba(255,190,120,.1);display:grid;grid-template-columns:1fr;gap:12px;counter-reset:step;max-width:none}
.steps li{display:grid;grid-template-columns:24px 1fr;gap:12px;font-size:13.5px;color:var(--dim);counter-increment:step;align-items:center}
.steps li::before{content:counter(step);width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:600 11px var(--mono);border:1px solid var(--edge);color:var(--e4)}
.steps b{color:var(--e5);font-weight:500}
.alert{display:grid;grid-template-columns:18px 1fr;gap:10px;padding:13px 14px;margin:0 0 20px;border-radius:12px;background:rgba(255,107,91,.1);border:1px solid rgba(255,107,91,.3);font-size:13.5px;text-align:left}
.alert svg{width:18px;height:18px;fill:none;stroke:var(--bad);stroke-width:2;stroke-linecap:round;margin-top:2px}
footer{display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between;align-items:center;color:var(--faint);font-size:12.5px;padding-top:12px}
footer .stack{font-family:var(--mono);font-size:11px;letter-spacing:.04em}
.matrix{padding:72px 0 56px;border-top:1px solid var(--edge)}
.matrix h2{font-size:clamp(30px,4vw,46px);line-height:1.05;letter-spacing:-.03em;margin:18px 0 36px;font-weight:600}
.matrix h2 em{font-style:normal;background:linear-gradient(100deg,var(--e3),var(--e4) 60%,var(--e5));-webkit-background-clip:text;background-clip:text;color:transparent}
.fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.fgroup{border:1px solid var(--edge);border-radius:22px;padding:22px 22px 10px;background:linear-gradient(160deg,rgba(255,170,90,.07),rgba(255,170,90,.01) 60%),rgba(10,6,4,.45);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.fgroup h3{font:500 11.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--e4);margin:0 0 14px}
.fgroup dl{margin:0}
.fgroup div{padding:10px 0;border-top:1px solid rgba(255,190,120,.08)}
.fgroup div:first-child{border-top:0;padding-top:0}
.fgroup dt{font-weight:600;font-size:14.5px;color:#fff3e4}
.fgroup dd{margin:3px 0 0;color:var(--dim);font-size:13.5px;line-height:1.45}
@media (max-width:1100px){.fgrid{grid-template-columns:1fr 1fr}}
@media (max-width:640px){.fgrid{grid-template-columns:1fr}.matrix{padding:48px 0 40px}}
@media (max-width:960px){.page{padding:20px}.hero{grid-template-columns:1fr;gap:36px;padding:24px 0}ul{grid-template-columns:1fr}.card{padding:26px}.lede{margin-bottom:28px;font-size:17px}.stage{order:-1}}
@media (prefers-reduced-motion:reduce){.cta,.eyebrow i,.ear .core,.ear .ring,.glow{transition:none;animation:none}.ear .ring{opacity:.25}}
`;

const alert = (error: string) =>
  `<div class="alert" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg><div>${escapeHtml(error)}</div></div>`;

const featureGroup = (group: FeatureGroup) =>
  `<section class="fgroup"><h3>${group.title}</h3><dl>${group.features
    .map((feature) => `<div data-status="${feature.status}"><dt>${feature.name}</dt><dd>${feature.line}</dd></div>`)
    .join('')}</dl></section>`;

const FEATURE_MATRIX = `<section class="matrix" aria-labelledby="everything"><p class="eyebrow"><i></i>Everything it does</p><h2 id="everything">One agent. <em>All of it yours.</em></h2><div class="fgrid">${FEATURES.map(featureGroup).join('')}</div></section>`;

export type SignInPage = { readonly origin: string; readonly error?: string };

const TITLE = 'hark · a durable voice agent on your own Cloudflare';

const DESCRIPTION = 'A long-running voice agent that lives in your own Durable Object. Bring your own MCP servers. It remembers, keeps working, and makes anything you ask for.';

export const signInPage = ({ origin, error }: SignInPage) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
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
<meta name="theme-color" content="#0a0604">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<div id="welcome-swarm" data-look="listening" aria-hidden="true"></div>
<span id="orb" aria-hidden="true"></span>
<div class="glow" aria-hidden="true"></div>
<div class="page">
<header>
<img src="/brand/hark-wordmark.svg" alt="hark" width="102" height="26">
<nav><a href="https://github.com/acoyfellow/hark" aria-label="Source on GitHub">${GITHUB}</a></nav>
</header>
<main class="hero">
<section>
<p class="eyebrow"><i></i>Try it now, free to start</p>
<h1>A voice agent<br><em>that stays.</em></h1>
<p class="lede">hark is a <b>long-running, durable</b> voice agent. Talk to it, plug in <b>your own MCP servers</b>, and it keeps its memory, files and tools between every call. No chat box. Everything runs on <b>your</b> Cloudflare account.</p>
<ul class="points">${POINTS.map(point).join('')}</ul>
</section>
<div class="stage"><section class="card" aria-label="Sign in">
<img class="mark" src="/brand/hark-mark.svg" alt="hark" width="96" height="96">
<p>Choose the Cloudflare account hark should think with. You stay in control of it the whole time.</p>
${error === undefined ? '' : alert(error)}
<a class="cta" id="sign-in" href="/oauth/login" aria-label="Sign in with Cloudflare"><span>Sign in with Cloudflare</span>${CLOUDFLARE_CLOUD}</a>
<p class="billing">${BILLING_NOTE}</p>
<ol class="steps">${STEPS.map((step) => `<li><span>${step}</span></li>`).join('')}</ol>
</section></div>
</main>
${FEATURE_MATRIX}
<footer>
<div class="disclaimer">${CLOUDFLARE_FULL}<p><b>OSS experiment, not officially endorsed by Cloudflare.</b> Here be dragons.</p></div>
<span class="stack">Built on Workers, Durable Objects and Workers AI</span>
</footer>
</div>
<script type="module" src="${WELCOME_ENTRY}"></script>
</body>
</html>`;
