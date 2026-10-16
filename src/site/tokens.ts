import { SITE_CSS } from '../ui/app.generated';
import { wordmark } from './duotone';

const SITE_FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@1&display=swap';

export type Swatch = { readonly token: string; readonly name: string; readonly dark: string; readonly light: string; readonly use: string };

const GITHUB_MARK =
  '<svg class="size-5 block" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';

const ICON = 'size-3.5 fill-none stroke-current stroke-[1.8] [stroke-linecap:round]';

const THEME_ICONS = `<svg class="theme-sun ${ICON}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="theme-moon ${ICON}" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>`;

const THEME_TOGGLE = `<button class="nav-link ml-1 flex cursor-pointer items-center gap-2 border border-line bg-transparent" type="button" data-theme-toggle aria-label="Switch between light and dark">${THEME_ICONS}<span class="max-sm:hidden" data-theme-label>Dark</span></button>`;

const THEME_BOOT = `<script>(()=>{const k='hark-theme',r=document.documentElement,m=matchMedia('(prefers-color-scheme: light)');const apply=t=>{r.dataset.theme=t;for(const l of document.querySelectorAll('[data-theme-label]'))l.textContent=t==='light'?'Light':'Dark'};apply(localStorage.getItem(k)||(m.matches?'light':'dark'));m.addEventListener('change',e=>{if(!localStorage.getItem(k))apply(e.matches?'light':'dark')});addEventListener('DOMContentLoaded',()=>{apply(r.dataset.theme);for(const b of document.querySelectorAll('[data-theme-toggle]'))b.addEventListener('click',()=>{const t=r.dataset.theme==='light'?'dark':'light';localStorage.setItem(k,t);apply(t)})})})()</script>`;

const WORDMARK = `<span class="block text-text">${wordmark(24)}</span>`;

export type SitePath = '/' | '/docs' | '/brand';

type NavLink = { readonly href: SitePath; readonly label: string };

const NAV: readonly NavLink[] = [{ href: '/docs', label: 'Docs' }];

const navLink = (link: NavLink, current: SitePath) =>
  `<a class="nav-link max-sm:px-2" href="${link.href}"${link.href === current ? ' aria-current="page"' : ''}>${link.label}</a>`;

export const topbar = (current: SitePath) =>
  `<header class="relative z-10 flex items-center justify-between gap-4"><a href="/" aria-label="hark home">${WORDMARK}</a><nav class="flex items-center gap-1">${NAV.map((link) => navLink(link, current)).join('')}${THEME_TOGGLE}<a class="flex p-2 text-muted hover:text-text" href="https://github.com/acoyfellow/hark" aria-label="Source on GitHub">${GITHUB_MARK}</a></nav></header>`;

export const siteHead = (title: string, description: string) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#0a0604" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f7f4ef" media="(prefers-color-scheme: light)">
${THEME_BOOT}
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${SITE_FONTS}">
<link rel="stylesheet" href="${SITE_CSS}">`;

export const SITE_BODY = 'site-grid site-grain';

export const htmlResponse = (body: string) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
