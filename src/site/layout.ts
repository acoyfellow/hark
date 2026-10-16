import { SITE_BODY, type SitePath, siteHead, topbar } from './tokens';

export type SiteLayout = {
  readonly title: string;
  readonly description: string;
  readonly current: SitePath;
  readonly body: string;
  readonly head?: string;
  readonly bodyClass?: string;
  readonly backdrop?: string;
  readonly shell?: string;
  readonly footer?: string;
  readonly scripts?: string;
};

const DEFAULT_SHELL = 'relative z-[2] mx-auto max-w-[1180px] px-4.5 pt-8 pb-20 md:px-10';

export const siteFooter = (next: { readonly href: string; readonly label: string }) =>
  `<footer class="mt-20 flex justify-between gap-4 border-t border-line pt-6 text-[12.5px] text-faint"><span>hark · OSS experiment, not officially endorsed by Cloudflare.</span><a href="${next.href}">${next.label} →</a></footer>`;

export const siteLayout = (page: SiteLayout) => `<!doctype html>
<html lang="en">
<head>
${siteHead(page.title, page.description)}
${page.head ?? ''}
</head>
<body class="${SITE_BODY}${page.bodyClass === undefined ? '' : ` ${page.bodyClass}`}">
${page.backdrop ?? ''}
<div class="${page.shell ?? DEFAULT_SHELL}">
${topbar(page.current)}
${page.body}
${page.footer ?? ''}
</div>
${page.scripts ?? ''}
</body>
</html>`;
