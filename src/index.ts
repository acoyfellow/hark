import { getAgentByName } from 'agents';
import { gate } from './auth/gate';
import { type Env, LOCAL_HEADER, LOCAL_OWNER, OWNER_HEADER, TRACE_HEADER } from './env';
import { signInPage } from './auth/sign-in-page';
import { appPage } from './ui/page';
import { MCP_CALLBACK_PATHS } from './mcp-oauth';
import { TERMINAL_PATH, terminalSize } from './terminal';
import { brandPage } from './site/brand-page';
import { docsPage } from './site/docs-page';
import { notFoundResponse } from './site/not-found-page';
import { htmlResponse } from './site/tokens';
import { DUOTONE_APP_SKIN } from './site/duotone';

export { Directory } from './directory';
export { Hark } from './hark';
export { HarkBridge } from './workbench';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const PUBLIC = /^\/(brand|icons|audio|app)\/|^\/(manifest\.webmanifest|robots\.txt|favicon\.ico)$/u;

const SITE_PAGES: Record<string, () => string> = { '/docs': docsPage, '/brand': brandPage };

const sitePage = (request: Request) => {
  const page = request.method === 'GET' ? SITE_PAGES[new URL(request.url).pathname.replace(/\/$/u, '')] : undefined;

  return page === undefined ? null : htmlResponse(page());
};

const KNOWN_ROUTES = /^\/(|oauth\/(login|callback|logout|me)|mcp\/callback|callback|workspace\/(terminal|tree|file)|__[a-z]+)$/u;

const isKnownRoute = (pathname: string) => KNOWN_ROUTES.test(pathname) || AGENT_PATH.test(pathname);

const orNotFound = (response: Response) => (response.status === 404 ? notFoundResponse() : response);

const isLoopback = (request: Request) => LOCAL_HOSTS.has(new URL(request.url).hostname);

const isLocalDev = (request: Request, env: Env) => env.LOCAL_DEV_WITHOUT_AUTH === '1' && isLoopback(request);

const isCrossOrigin = (request: Request) => {
  const origin = request.headers.get('Origin');

  return origin !== null && origin !== new URL(request.url).origin;
};

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'microphone=(self), camera=(self)',
};

const secured = (response: Response) => {
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const AGENT_PATH = /^\/agents\/hark(\/|$)/u;

const voiceSocket = async (request: Request, env: Env, owner: string, local: boolean) => {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return new Response('Expected a WebSocket upgrade', { status: 426 });

  if (isCrossOrigin(request)) return new Response('Cross-origin sockets are refused', { status: 403 });

  const headers = new Headers(request.headers);

  headers.set(OWNER_HEADER, owner);
  headers.set(LOCAL_HEADER, local ? '1' : '0');
  headers.set(TRACE_HEADER, isLoopback(request) ? '1' : '0');

  const agent = await getAgentByName(env.HARK, owner);

  return agent.fetch(new Request(request.url, { headers }));
};

const terminalSocket = async (request: Request, env: Env, owner: string) => {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 });

  if (isCrossOrigin(request)) return new Response('Cross-origin sockets are refused', { status: 403 });

  const size = terminalSize(new URL(request.url));
  const inner = new URL(TERMINAL_PATH, request.url);

  inner.searchParams.set('cols', String(size.cols));
  inner.searchParams.set('rows', String(size.rows));

  return (await getAgentByName(env.HARK, owner)).fetch(new Request(inner, { headers: request.headers }));
};

const MAX_TRACE_BYTES = 64_000;

const browserTrace = async (request: Request) => {
  const text = (await request.text()).slice(0, MAX_TRACE_BYTES);
  const parsed: unknown = JSON.parse(text === '' ? '[]' : text);

  for (const entry of Array.isArray(parsed) ? parsed : []) console.info(JSON.stringify(entry));

  return new Response(null, { status: 204 });
};

const route = async (request: Request, env: Env, owner: string, local: boolean): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (AGENT_PATH.test(pathname)) return voiceSocket(request, env, owner, local);

  if (pathname === '/workspace/terminal') return terminalSocket(request, env, owner);

  if (pathname === '/workspace/tree' && request.method === 'GET') return Response.json(await (await getAgentByName(env.HARK, owner)).workspaceTree());

  if (pathname === '/workspace/file' && request.method === 'GET') return new Response(await (await getAgentByName(env.HARK, owner)).workspaceFile(new URL(request.url).searchParams.get('path') ?? ''), { headers: { 'content-type': 'text/plain; charset=utf-8' } });

  if (isLoopback(request) && pathname === '/__trace' && request.method === 'POST') return browserTrace(request);

  if (isLoopback(request) && pathname === '/__think' && request.method === 'POST') {
    const agent = await getAgentByName(env.HARK, owner);

    return Response.json(await agent.thinkProbe(owner, await request.json()));
  }

  if (isLoopback(request) && pathname === '/__api' && request.method === 'POST') {
    const agent = await getAgentByName(env.HARK, owner);
    const { method, path, body } = await request.json<{ method: string; path: string; body?: unknown }>();

    return Response.json(await agent.apiProbe(method, path, body));
  }

  if (isLoopback(request) && pathname === '/__tool' && request.method === 'POST') {
    const agent = await getAgentByName(env.HARK, owner);
    const { name, args } = await request.json<{ name: string; args: Record<string, unknown> }>();

    return Response.json(await agent.toolProbe(name, args));
  }

  if (local && pathname === '/__bench' && request.method === 'POST') {
    const agent = await getAgentByName(env.HARK, owner);

    return Response.json(await agent.benchProbe(await request.text()));
  }

  if ((MCP_CALLBACK_PATHS as readonly string[]).includes(pathname) && request.method === 'GET') {
    const agent = await getAgentByName(env.HARK, owner);

    return agent.finishServerSignIn(request);
  }

  if (local && pathname === '/' && new URL(request.url).searchParams.has('signed-out')) return htmlResponse(signInPage({ origin: new URL(request.url).origin }));

  if (pathname === '/' && request.method === 'GET') return appPage(new URL(request.url).origin, local, DUOTONE_APP_SKIN);

  return orNotFound(await env.ASSETS.fetch(request));
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (PUBLIC.test(pathname)) return secured(orNotFound(await env.ASSETS.fetch(request)));

    const site = sitePage(request);

    if (site !== null) return secured(site);

    if (!isKnownRoute(pathname)) return secured(notFoundResponse());

    if (isLocalDev(request, env)) return secured(await route(request, env, LOCAL_OWNER, true));

    const result = await gate(request, env);

    if (result.kind === 'response') return secured(result.response);

    return secured(await route(request, env, result.identity.who, false));
  },
} satisfies ExportedHandler<Env>;
