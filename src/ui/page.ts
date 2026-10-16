import { APP_CSS, APP_ENTRY } from './app.generated';

export const FONTS =
  'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,300..700&family=Google+Sans+Code:wght@400;500&display=swap';

export type AppSkin = { readonly style: string; readonly manifest: string; readonly icon: string; readonly touchIcon: string; readonly themeColor: string };

const DEFAULT_SKIN: AppSkin = { style: '', manifest: '/manifest.webmanifest', icon: '/icons/favicon.svg', touchIcon: '/icons/apple-touch-icon.png', themeColor: '#09090b' };

export const appPage = (origin: string, local: boolean, skin: AppSkin = DEFAULT_SKIN) =>
  new Response(
    `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content">
<title>hark</title>
<meta name="description" content="A long-running durable voice agent on your own Cloudflare account. Bring your own MCP servers.">
<meta name="theme-color" content="${skin.themeColor}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="canonical" href="${origin}/">
<link rel="manifest" href="${skin.manifest}">
<link rel="icon" href="${skin.icon}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${skin.touchIcon}">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${APP_CSS}">
${skin.style}
<script>window.__HARK__=${JSON.stringify({ local })}</script>
</head>
<body>
<div id="root"></div>
<script type="module" src="${APP_ENTRY}"></script>
</body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
