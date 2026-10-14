import { FONTS } from '../ui/page';
import type { AccountGateway } from './oauth';

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const STYLE = `
:root{color-scheme:dark;--bg:#09090b;--text:#fafafa;--dim:#a1a1aa;--line:rgba(255,255,255,.14);--ember:#f6913e;--flare:#f38020}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(60% 50% at 50% 30%,color-mix(in srgb,var(--flare) 10%,transparent),transparent 70%),var(--bg);color:var(--text);font:15px/1.55 "Google Sans Flex",system-ui,sans-serif;-webkit-font-smoothing:antialiased;display:grid;place-items:center;min-height:100vh;padding:24px}
main{width:100%;max-width:460px}
img{height:24px;margin:0 0 28px}
h1{font-size:23px;letter-spacing:-.02em;font-weight:600;margin:0 0 6px}
p{color:var(--dim);margin:0 0 22px}
.row{display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid var(--line);border-radius:14px;margin:0 0 8px;cursor:pointer;background:rgba(255,255,255,.02)}
.row:has(input:checked){border-color:var(--ember);background:color-mix(in srgb,var(--flare) 12%,transparent)}
.row.off{opacity:.5;cursor:not-allowed}
.row small{margin-left:auto;color:var(--dim);font:12px ui-monospace,monospace}
input{accent-color:var(--ember)}
code{font:13.5px ui-monospace,monospace}
.actions{display:flex;gap:10px;margin-top:20px}
button,a.cancel{font:inherit;padding:10px 18px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--text);text-decoration:none;cursor:pointer}
button{background:var(--text);border-color:var(--text);color:var(--bg);font-weight:500}
.alert{color:#ff8a7a;margin:0 0 14px}
`;

export type GatewayPage = {
  readonly accountName: string;
  readonly current: string | null;
  readonly gateways: readonly AccountGateway[];
  readonly error?: string;
};

const row = (gateway: AccountGateway, current: string | null) =>
  gateway.authenticated
    ? `<label class="row"><input type="radio" name="gateway" value="${escapeHtml(gateway.id)}"${gateway.id === current ? ' checked' : ''} required><code>${escapeHtml(gateway.id)}</code>${gateway.id === current ? '<small>in use</small>' : ''}</label>`
    : `<div class="row off" title="Turn on authentication for this gateway to use it"><input type="radio" disabled><code>${escapeHtml(gateway.id)}</code><small>auth off</small></div>`;

export const gatewayPage = ({ accountName, current, gateways, error }: GatewayPage) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pick an AI Gateway · hark</title>
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<main>
<img src="/brand/hark-wordmark.svg" alt="hark">
<h1>Pick an AI Gateway</h1>
<p>hark hears, thinks, and speaks through this gateway on <strong>${escapeHtml(accountName)}</strong>. Its logs and limits apply.</p>
${error === undefined ? '' : `<div class="alert" role="alert">${escapeHtml(error)}</div>`}
<form method="post" action="/oauth/gateway">
${gateways.length === 0 ? '<p>This account has no AI Gateways.</p>' : gateways.map((gateway) => row(gateway, current)).join('\n')}
<div class="actions"><button type="submit">Use this gateway</button><a class="cancel" href="/">Cancel</a></div>
</form>
</main>
</body>
</html>`;
