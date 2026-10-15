import { APP_CSS, APP_ENTRY } from './app.generated';

export const FONTS =
  'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,300..700&family=Google+Sans+Code:wght@400;500&display=swap';

export const appPage = (origin: string, local: boolean) =>
  new Response(
    `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>hark</title>
<meta name="description" content="A long-running durable voice agent on your own Cloudflare account. Bring your own MCP servers.">
<meta name="theme-color" content="#09090b">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="canonical" href="${origin}/">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${APP_CSS}">
<script>window.__HARK__=${JSON.stringify({ local })}</script>
</head>
<body>
<div id="root"></div>
<script type="module" src="${APP_ENTRY}"></script>
</body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
