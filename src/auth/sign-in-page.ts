import { WELCOME_ENTRY } from '../ui/app.generated';
import { FEATURES, type FeatureGroup } from '../../shared/features';
import { TOOL_CATALOG, TOOL_GROUPS, type ToolGroup } from '../../shared/tool-catalog';
import { CLOUDFLARE_MARK, livingMark } from '../site/duotone';
import { accent, siteLayout } from '../site/layout';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');


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
    title: 'Answers before you finish',
    body: 'It starts thinking the moment you are probably done, and speaks only once you really are. The corner shows the real number, in milliseconds.',
  },
  {
    icon: 'M18 6 6 18M6 6l12 12',
    title: 'Talk over it',
    body: 'Interrupt at any point. It goes quiet, cancels what it was about to say, and listens.',
  },
];

const point = ({ icon, title, body }: Point) =>
  `<li class="tile grid grid-cols-[40px_1fr] items-start gap-3.5 p-4 transition-colors hover:border-line-2"><span class="grid size-10 place-items-center rounded-xl border border-line bg-layer-2"><svg class="size-[19px] fill-none stroke-current text-text stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg></span><div><strong class="mt-px mb-0.5 block text-[14.5px] font-semibold">${title}</strong><span class="text-[13.5px] text-muted">${body}</span></div></li>`;

const STEPS: readonly string[] = [
  'Pick an account on Cloudflare&rsquo;s consent screen.',
  'hark thinks with <b class="font-medium text-text">Workers AI</b> on that account, with your own token.',
  '<b class="font-medium text-text">Revoke anytime</b> in your Cloudflare profile.',
];

const step = (text: string, index: number) =>
  `<li class="grid grid-cols-[24px_1fr] items-center gap-3 text-[13.5px] text-muted"><span class="grid size-6 place-items-center rounded-full border border-line font-mono text-[11px] font-semibold text-text">${index + 1}</span><span>${text}</span></li>`;

const BILLING_NOTE = 'Uses your account&rsquo;s Workers AI. Most of it fits the free allocation.';

const alert = (error: string) =>
  `<div class="mb-5 grid grid-cols-[18px_1fr] gap-2.5 rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-left text-[13.5px]" role="alert"><svg class="mt-0.5 size-[18px] fill-none stroke-bad stroke-2 [stroke-linecap:round]" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg><div>${escapeHtml(error)}</div></div>`;

const SECTION = 'relative z-[2] border-t border-line py-18';

const sectionHead = (index: string, id: string, title: string, subtitle: string) =>
  `<p class="index">${index}</p><h2 id="${id}" class="mt-4.5 mb-9 text-[clamp(30px,4vw,46px)] leading-[1.05] font-semibold tracking-[-0.03em]">${title} ${accent(subtitle)}</h2>`;

const LIST_TILE = 'tile px-5.5 pt-5.5 pb-2.5';

const LIST_HEAD = 'mt-0 mb-3.5 font-mono text-[11.5px] leading-none font-medium tracking-[0.1em] text-faint uppercase';

const definition = (name: string, line: string, status: string) =>
  `<div class="border-t border-line py-2.5 first:border-t-0 first:pt-0" data-status="${status}"><dt class="text-[14.5px] font-semibold text-text">${name}</dt><dd class="mt-0.5 ml-0 text-[13.5px] leading-snug text-muted">${line}</dd></div>`;

const featureGroup = (group: FeatureGroup) =>
  `<section class="${LIST_TILE}"><h3 class="${LIST_HEAD}">${group.title}</h3><dl class="m-0">${group.features.map((feature) => definition(feature.name, feature.line, feature.status)).join('')}</dl></section>`;

const FEATURE_MATRIX = `<section class="${SECTION}" aria-labelledby="everything">${sectionHead('Everything it does', 'everything', 'One agent.', 'All of it yours.')}<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${FEATURES.map(featureGroup).join('')}</div></section>`;

const toolGroup = (group: ToolGroup) =>
  `<section class="tile p-4.5"><h3 class="${LIST_HEAD}">${group}</h3><ul class="m-0 flex list-none flex-col gap-2.5 p-0">${TOOL_CATALOG.filter((tool) => tool.group === group)
    .map((tool) => `<li><strong class="block text-sm text-text">${tool.title}</strong><span class="text-[13px] text-muted">&ldquo;${tool.say}&rdquo;</span></li>`)
    .join('')}</ul></section>`;

const TOOLS = `<section class="${SECTION}" aria-labelledby="tools">${sectionHead(`${TOOL_CATALOG.length} tools, by voice`, 'tools', 'Say it.', 'It reaches for the right tool.')}<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${TOOL_GROUPS.map(toolGroup).join('')}</div></section>`;

const LEAD = 'm-0 max-w-[36em] text-[17px] text-muted';

const PUSH = `<section class="${SECTION}" aria-labelledby="push">${sectionHead('Coming next', 'push', 'Push notifications.', 'It finds you.')}<p class="${LEAD}">A timer that ends, or a job your computer finishes, reaches your phone even when hark is closed. Your Durable Object sends it, so it still runs on your own account.</p></section>`;

type SecurityGuarantee = { readonly status: 'shipped' | 'planned'; readonly name: string; readonly line: string };

const SECURITY_GUARANTEES: readonly SecurityGuarantee[] = [
  { status: 'shipped', name: 'Your token never leaves your Durable Object', line: 'The browser holds a signed session cookie and nothing else. No route hands out the token.' },
  { status: 'shipped', name: 'Every model call is yours', line: 'Hearing, thinking and speaking run on your Workers AI, through your own AI Gateway.' },
  { status: 'shipped', name: 'Audio and camera are never stored', line: 'History keeps words. A camera frame becomes &ldquo;(showed you a camera frame)&rdquo;.' },
  { status: 'planned', name: 'A passkey for anything that changes things', line: 'Account changes, commands, MCP calls and deletions wait for Face ID, Touch ID or a security key. A spoken yes is not enough.' },
  { status: 'planned', name: 'One signature, one action', line: 'The passkey signs the exact call. It runs once, expires in a minute, and talking over hark cancels it.' },
  { status: 'planned', name: 'No voiceprint, no face match', line: 'A voice can be cloned and a face can be filmed. hark never stores either, and never trusts them.' },
];

const STATUS_LABEL: Record<SecurityGuarantee['status'], string> = { shipped: 'Shipped', planned: 'Planned' };

const securityGroup = (status: SecurityGuarantee['status']) =>
  `<section class="${LIST_TILE}"><h3 class="${LIST_HEAD}">${STATUS_LABEL[status]}</h3><dl class="m-0">${SECURITY_GUARANTEES.filter((guarantee) => guarantee.status === status)
    .map((guarantee) => definition(guarantee.name, guarantee.line, guarantee.status))
    .join('')}</dl></section>`;

const SECURITY = `<section class="${SECTION} scroll-mt-6" id="security" aria-labelledby="security-title">${sectionHead('Security', 'security-title', 'It listens to anyone.', 'It acts only for you.')}<p class="${LEAD} -mt-4 mb-9">Anyone in the room can talk to hark: a roommate, a TV, a web page it reads aloud. So words alone never change your account. Read the full model, threats and open findings in <a href="https://github.com/acoyfellow/hark/blob/main/SECURITY.md">SECURITY.md</a>.</p><div class="grid gap-4 md:grid-cols-2">${securityGroup('shipped')}${securityGroup('planned')}</div></section>`;

const PIXEL = 2;

const pixels = (rows: readonly string[], left = 0, top = 0, className = '') =>
  rows
    .flatMap((row, y) =>
      [...row].map((cell, x) =>
        cell === '#'
          ? `<rect${className === '' ? '' : ` class="${className}"`} x="${(left + x) * PIXEL}" y="${(top + y) * PIXEL}" width="${PIXEL}" height="${PIXEL}"/>`
          : '',
      ),
    )
    .join('');

const DRAGON_BODY: readonly string[] = [
  '..............##..',
  '.............####.',
  '............######',
  '#..........#####..',
  '##........####....',
  '.##..########.....',
  '..###########.....',
  '...#########......',
  '....##...##.......',
  '....#....#........',
];

const WING_UP: readonly string[] = ['##.....', '.###...', '..####.', '...####'];

const WING_DOWN: readonly string[] = ['...####', '..####.', '.###...', '##.....'];

const BELLY: readonly string[] = ['######', '.####.'];

const FIRE: readonly (readonly [string, number, number])[] = [
  ['f1', 18, 2],
  ['f2', 20, 1],
  ['f2', 20, 3],
  ['f3', 22, 0],
  ['f3', 22, 2],
  ['f3', 23, 4],
  ['f4', 25, 1],
  ['f4', 26, 3],
  ['f4', 28, 2],
];

const fire = () =>
  FIRE.map(
    ([phase, x, y], index) =>
      `<rect class="${phase}${index % 3 === 0 ? ' hot' : ''}" x="${x * PIXEL}" y="${y * PIXEL}" width="${PIXEL}" height="${PIXEL}"/>`,
  ).join('');

const DRAGON = `<svg viewBox="0 0 64 20" shape-rendering="crispEdges">${pixels(DRAGON_BODY)}<g class="wing-up">${pixels(WING_UP, 6, 1)}</g><g class="wing-down">${pixels(WING_DOWN, 6, 3)}</g><g class="belly">${pixels(BELLY, 6, 6)}</g><rect class="eye" x="${15 * PIXEL}" y="${1 * PIXEL}" width="${PIXEL}" height="${PIXEL}"/><g class="fire">${fire()}</g></svg>`;

const DRAGON_FIRE = `<span class="dragon" aria-hidden="true">${DRAGON}</span>`;

const ASTRONAUT = '<div class="peek" aria-hidden="true"><img class="astronaut" src="/brand/astronaut-peek.webp" alt="" width="400" height="362"></div>';

const PEEK_SCRIPT = `<script>(()=>{const p=document.querySelector('.peek');if(!p)return;const f=()=>{const r=p.getBoundingClientRect(),v=innerHeight,t=Math.min(1,Math.max(0,(v-r.bottom+40)/(r.height+40))),end=innerHeight+scrollY>=document.documentElement.scrollHeight-4;p.style.setProperty('--peek',String(end?1:t));p.classList.toggle('settled',end)};addEventListener('scroll',f,{passive:true});addEventListener('resize',f);f()})()</script>`;

const BACKDROP = `<div id="welcome-swarm" class="welcome-swarm" data-look="listening" aria-hidden="true"></div>
<span id="orb" class="pointer-events-none fixed top-[46%] right-[22%] size-0.5 max-lg:top-[18%] max-lg:right-1/2" aria-hidden="true"></span>`;

export type SignInPage = { readonly origin: string; readonly error?: string };

const TITLE = 'hark · a durable voice agent on your own Cloudflare';

const DESCRIPTION = 'A long-running voice agent that lives in your own Durable Object. Bring your own MCP servers. It remembers, keeps working, and makes anything you ask for.';

const socialMeta = (origin: string) => `<link rel="canonical" href="${escapeHtml(origin)}/">
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
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">`;

const signInCard = (error: string | undefined) => `<div class="relative"><section class="tile relative p-6.5 backdrop-blur-2xl md:p-9" aria-label="Sign in">
<div class="mt-1 mb-5.5 flex justify-center text-text">${livingMark(96, 'hark')}</div>
<p class="mx-auto mb-7 max-w-[22em] text-center text-sm text-muted">Pick the Cloudflare account hark thinks with. Your token stays in your own Durable Object.</p>
${error === undefined ? '' : alert(error)}
<a class="pill h-14 w-full justify-center text-[15.5px]" id="sign-in" href="/oauth/login">Sign in with Cloudflare</a>
<p class="mt-3 mb-0 text-center text-[12.5px] text-faint">${BILLING_NOTE}</p>
<ol class="m-0 mt-6 grid list-none gap-3 border-t border-line p-0 pt-5.5">${STEPS.map(step).join('')}</ol>
</section></div>`;

export const signInPage = ({ origin, error }: SignInPage) =>
  siteLayout({
    title: TITLE,
    description: DESCRIPTION,
    current: '/',
    head: socialMeta(origin),
    bodyClass: 'overflow-x-hidden',
    backdrop: BACKDROP,
    shell: 'relative z-[2] mx-auto grid min-h-screen max-w-[1200px] grid-rows-[auto_1fr_auto] px-5 py-5 lg:px-10 lg:py-7',
    body: `<main class="grid items-center gap-9 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] lg:gap-20 lg:py-14">
<section>
<h1 class="mt-0 mb-6.5 text-[clamp(46px,6vw,80px)] leading-[0.96] font-bold tracking-[-0.05em]">A voice agent<br>${accent('that stays.')}</h1>
<p class="mt-0 mb-7 max-w-[31em] text-[17px] leading-relaxed text-muted lg:mb-11 lg:text-[18.5px]">Tap the ear and talk. hark listens, thinks and answers out loud, and it remembers you the next time. There is no chat box. Every word is heard, thought and spoken on <b class="font-medium text-text">your own</b> Cloudflare account.</p>
<ul class="m-0 grid max-w-[42em] list-none gap-3.5 p-0 sm:grid-cols-2">${POINTS.map(point).join('')}</ul>
</section>
<div class="max-lg:order-first">${signInCard(error)}</div>
</main>
${TOOLS}
${SECURITY}
${PUSH}
${FEATURE_MATRIX}`,
    footer: `<footer class="relative z-[3] flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-3 text-[12.5px] text-faint">
${ASTRONAUT}
<div class="flex max-w-[440px] items-center gap-3.5">${CLOUDFLARE_MARK}<p class="m-0 leading-snug"><b class="font-semibold text-muted">OSS experiment, not officially endorsed by Cloudflare.</b> Here be dragons. ${DRAGON_FIRE}</p></div>
<span class="font-mono text-[11px] tracking-[0.04em]">Built on Workers, Durable Objects and Workers AI</span>
</footer>`,
    scripts: `${PEEK_SCRIPT}
<script type="module" src="${WELCOME_ENTRY}"></script>`,
  });
