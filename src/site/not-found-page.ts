import { siteLayout } from './layout';

export const notFoundPage = () =>
  siteLayout({
    title: 'hark · not found',
    description: 'There is nothing at this address.',
    current: '/',
    head: '<meta name="robots" content="noindex">',
    shell: 'relative z-[2] mx-auto grid min-h-screen max-w-[1180px] grid-rows-[auto_1fr] px-5 py-6 md:px-12 md:py-10',
    body: `<main class="grid place-items-center text-center"><div class="tile w-full max-w-[440px]"><div class="tile-bar"><i></i><i></i><span class="ml-1.5">404</span></div><div class="px-7 pt-10 pb-8">
<img class="mx-auto mb-5.5 block opacity-55" src="/brand/hark-mark.svg" alt="" width="72" height="72">
<h1 class="mt-0 mb-3 text-[44px] leading-none font-bold tracking-[-0.04em]">Nothing <span class="font-serif font-normal italic tracking-normal text-amber">to hear here.</span></h1>
<p class="mt-0 mb-6.5 text-muted">There is no page at this address.</p>
<div class="flex flex-wrap justify-center gap-2.5"><a class="pill" href="/">Go to hark</a><a class="pill-ghost" href="/docs">Read the docs</a></div>
</div></div></main>`,
  });

export const notFoundResponse = () =>
  new Response(notFoundPage(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
