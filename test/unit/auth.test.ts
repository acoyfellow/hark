import { describe, expect, it } from 'vitest';
import { cloudflareAuth } from '../../src/auth/cloudflare';
import { authorizeUrl, exchangeCode, pickGateway, SCOPES } from '../../src/auth/oauth';
import { parseSession, readCookie, sign, unsign } from '../../src/auth/session';
import type { Grant } from '../../src/directory';

const SECRET = 'a'.repeat(40);

describe('Sign in with Cloudflare (same shape as coil)', () => {
  it('picks only gateways that check the Cloudflare token', () => {
    const gateways = [
      { id: 'default', authenticated: false },
      { id: 'team', authenticated: true },
      { id: 'mine', authenticated: true },
    ];

    expect(pickGateway(gateways, 'mine')).toBe('mine');
    expect(pickGateway(gateways, undefined)).toBe('team');
    expect(pickGateway([{ id: 'default', authenticated: false }], undefined)).toBeNull();
  });

  it('asks Cloudflare for a PKCE code with the AI scopes', async () => {
    const url = new URL(
      await authorizeUrl({ clientId: 'client', clientSecret: 's', redirectUri: 'https://hark.example/oauth/callback' }, 'state-1', 'verifier-1'),
    );

    expect(url.origin + url.pathname).toBe('https://dash.cloudflare.com/oauth2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...SCOPES]);
    expect(SCOPES).toEqual(['offline_access', 'user-details.read', 'account-settings.read', 'ai.read', 'ai.write', 'aig.read', 'aig.run']);
  });

  it('exchanges the code with the client secret and the verifier', async () => {
    const seen: Request[] = [];
    const tokens = await exchangeCode(
      { clientId: 'client', clientSecret: 'shh', redirectUri: 'https://hark.example/oauth/callback' },
      'the-code',
      'the-verifier',
      async (input, init) => {
        seen.push(new Request(input, init));
        return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 600, scope: 'ai.write' });
      },
      1000,
    );
    const body = new URLSearchParams(await seen[0]?.text());

    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 601_000, scope: 'ai.write' });
    expect(seen[0]?.headers.get('authorization')).toBe(`Basic ${btoa('client:shh')}`);
    expect(body.get('code_verifier')).toBe('the-verifier');
  });

  it('signs sessions so a changed cookie is refused', async () => {
    const signed = await sign(SECRET, JSON.stringify({ owner: 'cf:1', expires: Date.now() + 1000, id: 'x' }));

    expect(parseSession(await unsign(SECRET, signed))?.owner).toBe('cf:1');
    expect(await unsign(SECRET, `${signed.slice(0, -2)}00`)).toBeNull();
    expect(await unsign('b'.repeat(40), signed)).toBeNull();
    expect(readCookie(new Request('https://x', { headers: { cookie: 'a=1; __Host-hark_session=v%3D' } }), '__Host-hark_session')).toBe('v=');
  });
});

const memoryDirectory = () => {
  const grants = new Map<string, Grant>();
  const sessions = new Map<string, string>();
  const stub = {
    saveGrant: async (grant: Grant) => void grants.set(grant.owner, grant),
    grantFor: async (owner: string) => grants.get(owner) ?? null,
    dropGrant: async (owner: string) => void grants.delete(owner),
    openSession: async (id: string, owner: string) => void sessions.set(id, owner),
    sessionOwner: async (id: string) => sessions.get(id) ?? null,
    closeSession: async (id: string) => void sessions.delete(id),
  };

  return { grants, sessions, namespace: { getByName: () => stub } as never };
};

const cloudflare = (gatewayAuthenticated: boolean) => async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new Request(input, init).url;

  if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'user-token', refresh_token: 'refresh', expires_in: 3600, scope: SCOPES.join(' ') });
  if (url.endsWith('/oauth2/userinfo')) return Response.json({ sub: 'u-1', email: 'jordan@example.com' });
  if (url.includes('/accounts?')) return Response.json({ result: [{ id: 'acc-1', name: 'Jordan’s Account' }] });
  if (url.includes('/ai-gateway/gateways')) return Response.json({ result: [{ id: 'default', authentication: gatewayAuthenticated }] });
  if (url.endsWith('/oauth2/revoke')) return new Response(null, { status: 200 });

  return new Response('unexpected', { status: 500 });
};

const env = (directory: ReturnType<typeof memoryDirectory>) => ({
  DIRECTORY: directory.namespace,
  OAUTH_CLIENT_ID: 'client',
  OAUTH_CLIENT_SECRET: 'secret',
  SESSION_SECRET: SECRET,
});

const cookiesOf = (response: Response) =>
  response.headers.getSetCookie().map((line) => line.split(';')[0] ?? '').join('; ');

describe('the full sign-in round trip', () => {
  it('logs in, stores the grant with the authenticated gateway, admits the session, and signs out', async () => {
    const directory = memoryDirectory();
    const auth = cloudflareAuth(env(directory), cloudflare(true));
    const origin = 'https://hark.example';

    const login = (await auth.routes(new Request(`${origin}/oauth/login`))) as Response;
    const authorize = new URL(login.headers.get('location') ?? '');

    expect(login.status).toBe(302);
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${origin}/oauth/callback`);

    const callback = (await auth.routes(
      new Request(`${origin}/oauth/callback?code=c&state=${authorize.searchParams.get('state')}`, { headers: { cookie: cookiesOf(login) } }),
    )) as Response;

    expect(callback.status).toBe(302);
    expect(directory.grants.get('cf:u-1')).toMatchObject({ accountId: 'acc-1', gateway: 'default', accessToken: 'user-token' });

    const session = cookiesOf(callback);
    const admitted = await auth.admit(new Request(`${origin}/api/voice`, { headers: { cookie: session } }));

    expect(admitted).toEqual({ identity: { who: 'cf:u-1' } });

    const refused = await auth.admit(new Request(`${origin}/api/voice`));

    expect('refused' in refused && refused.refused.status).toBe(401);

    await auth.routes(new Request(`${origin}/oauth/logout`, { method: 'POST', headers: { cookie: session } }));

    expect(directory.grants.size).toBe(0);
    expect('refused' in (await auth.admit(new Request(`${origin}/api/voice`, { headers: { cookie: session } })))).toBe(true);
  });

  it('refuses an account whose AI Gateway does not check tokens, and says how to fix it', async () => {
    const directory = memoryDirectory();
    const auth = cloudflareAuth(env(directory), cloudflare(false));
    const origin = 'https://hark.example';
    const login = (await auth.routes(new Request(`${origin}/oauth/login`))) as Response;
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state');
    const callback = (await auth.routes(new Request(`${origin}/oauth/callback?code=c&state=${state}`, { headers: { cookie: cookiesOf(login) } }))) as Response;

    expect(callback.status).toBe(403);
    expect(await callback.text()).toContain('authentication');
    expect(directory.grants.size).toBe(0);
  });

  it('refuses a callback whose state did not start here', async () => {
    const auth = cloudflareAuth(env(memoryDirectory()), cloudflare(true));
    const callback = (await auth.routes(new Request('https://hark.example/oauth/callback?code=c&state=forged'))) as Response;

    expect(callback.status).toBe(400);
  });
});
