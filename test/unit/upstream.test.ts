import { describe, expect, it } from 'vitest';
import { listenUrl, upstream } from '../../src/upstream';

const credentials = { accountId: 'acc 1', token: async () => 'tok', refresh: async () => 'tok', signedOut: () => {} };

const answering = (statusFor: (token: string) => number, seen: string[]): typeof fetch =>
  (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const token = String((init?.headers as Record<string, string> | undefined)?.authorization).replace('Bearer ', '');

    seen.push(token);

    return new Response('{}', { status: statusFor(token) });
  }) as typeof fetch;

describe('a token Cloudflare rejects signs the person out instead of failing quietly', () => {
  it('refreshes once on a 401 and carries on with the new token', async () => {
    const seen: string[] = [];
    let signedOut = false;
    const live = upstream(
      { accountId: 'a', token: async () => 'old', refresh: async () => 'new', signedOut: () => { signedOut = true; } },
      origins,
      answering((token) => (token === 'old' ? 401 : 200), seen),
    );

    await live.chat({}, new AbortController().signal).catch(() => null);

    expect(seen).toEqual(['old', 'new']);
    expect(signedOut).toBe(false);
  });

  it('signs out when the refreshed token is rejected too', async () => {
    const seen: string[] = [];
    let signedOut = false;
    const live = upstream(
      { accountId: 'a', token: async () => 'old', refresh: async () => 'new', signedOut: () => { signedOut = true; } },
      origins,
      answering(() => 401, seen),
    );

    await expect(live.listen({})).rejects.toThrow(/sign-in expired/u);
    expect(seen).toEqual(['old', 'new', 'old']);
    expect(signedOut).toBe(true);
  });

  it('keeps the person signed in when only one product refuses the token', async () => {
    const seen: string[] = [];
    let signedOut = false;
    const live = upstream(
      { accountId: 'a', token: async () => 'good', refresh: async () => 'good', signedOut: () => { signedOut = true; } },
      origins,
      async (input) => {
        seen.push(String(input));

        return new Response('{}', { status: String(input).includes('browser-rendering') ? 401 : 200 });
      },
    );

    const result = await live.api('POST', '/accounts/{account}/browser-rendering/screenshot', {}, new AbortController().signal);

    expect(result.status).toBe(401);
    expect(signedOut).toBe(false);
  });

  it('signs out when there is no way to refresh', async () => {
    let signedOut = false;
    const live = upstream(
      { accountId: 'a', token: async () => 'old', refresh: async () => { throw new Error('no refresh token'); }, signedOut: () => { signedOut = true; } },
      origins,
      answering(() => 401, []),
    );

    await expect(live.chat({}, new AbortController().signal)).rejects.toThrow(/sign-in expired/u);
    expect(signedOut).toBe(true);
  });
});
const origins = { api: 'https://api' };

describe('every model call goes straight to Workers AI on the person’s own account', () => {
  it('opens Deepgram Flux on the Workers AI run route with whatever the Agents SDK Flux provider asks for', () => {
    const url = new URL(
      listenUrl(origins, credentials, {
        encoding: 'linear16',
        sample_rate: '16000',
        eager_eot_threshold: '0.5',
        keyterm: ['hark', 'Cloudflare'],
      }),
    );

    expect(url.origin + url.pathname).toBe('https://api/accounts/acc%201/ai/run/@cf/deepgram/flux');
    expect(url.searchParams.get('encoding')).toBe('linear16');
    expect(url.searchParams.get('sample_rate')).toBe('16000');
    expect(url.searchParams.get('eager_eot_threshold')).toBe('0.5');
    expect(url.searchParams.getAll('keyterm')).toEqual(['hark', 'Cloudflare']);
  });

  it('streams chat and speech with only the user token and never touches AI Gateway', async () => {
    const seen: Request[] = [];
    const up = upstream(credentials, origins, async (input, init) => {
      seen.push(new Request(input, init));
      return new Response('data: [DONE]\n\n');
    });

    await up.chat({ model: 'm', messages: [] }, new AbortController().signal);
    await up.speak('Hello there.', 'orion', 'aura-1', new AbortController().signal);

    expect(seen.map((request) => request.url)).toEqual([
      'https://api/accounts/acc%201/ai/v1/chat/completions',
      'https://api/accounts/acc%201/ai/run/@cf/deepgram/aura-1',
    ]);

    for (const request of seen) {
      expect(request.headers.get('authorization')).toBe('Bearer tok');
      expect(request.headers.get('cf-aig-authorization')).toBeNull();
      expect(request.headers.get('cf-aig-gateway-id')).toBeNull();
    }

    expect(await seen[1]?.json()).toEqual({ text: 'Hello there.', speaker: 'orion', encoding: 'linear16', container: 'none', sample_rate: 24000 });
  });

  it('retries speech once, and routes the rich voice to Aura 2', async () => {
    const urls: string[] = [];
    let calls = 0;
    const up = upstream(credentials, origins, async (input, init) => {
      urls.push(new Request(input, init).url);
      calls += 1;

      return calls === 1 ? new Response('busy', { status: 503 }) : new Response(new Uint8Array(4));
    });

    await up.speak('Hi.', 'thalia', 'aura-2', new AbortController().signal);

    expect(urls).toEqual(['https://api/accounts/acc%201/ai/run/@cf/deepgram/aura-2-en', 'https://api/accounts/acc%201/ai/run/@cf/deepgram/aura-2-en']);
  });

  it('turns an upstream refusal into a readable error', async () => {
    const up = upstream(credentials, undefined, async () => new Response('{"errors":[{"message":"not allowed to access"}]}', { status: 403 }));

    await expect(up.chat({}, new AbortController().signal)).rejects.toThrow(/Thinking failed \(403\).*not allowed/);
  });
});
