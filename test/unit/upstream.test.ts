import { describe, expect, it } from 'vitest';
import { listenUrl, upstream } from '../../src/upstream';

const credentials = { accountId: 'acc 1', gateway: 'default', token: async () => 'tok' };

describe('every model call goes to the person’s own account through their AI Gateway', () => {
  it('opens Deepgram Flux on the gateway with eager end-of-turn on', () => {
    const url = new URL(listenUrl({ api: 'https://api', gateway: 'https://gw/v1' }, credentials, { keyterms: ['hark'] }));

    expect(url.origin + url.pathname).toBe('https://gw/v1/acc%201/default/workers-ai');
    expect(url.searchParams.get('model')).toBe('@cf/deepgram/flux');
    expect(url.searchParams.get('encoding')).toBe('linear16');
    expect(url.searchParams.get('sample_rate')).toBe('16000');
    expect(url.searchParams.get('eager_eot_threshold')).toBe('0.5');
    expect(url.searchParams.getAll('keyterm')).toEqual(['hark']);
  });

  it('streams chat and speech with the user token in both auth headers', async () => {
    const seen: Request[] = [];
    const up = upstream(credentials, { api: 'https://api', gateway: 'https://gw/v1' }, async (input, init) => {
      seen.push(new Request(input, init));
      return new Response('data: [DONE]\n\n');
    });

    await up.chat({ model: 'm', messages: [] }, new AbortController().signal);
    await up.speak('Hello there.', 'orion', 'aura-1', new AbortController().signal);

    expect(seen.map((request) => request.url)).toEqual([
      'https://gw/v1/acc%201/default/workers-ai/v1/chat/completions',
      'https://gw/v1/acc%201/default/workers-ai/@cf/deepgram/aura-1',
    ]);

    for (const request of seen) {
      expect(request.headers.get('authorization')).toBe('Bearer tok');
      expect(request.headers.get('cf-aig-authorization')).toBe('Bearer tok');
      expect(JSON.parse(request.headers.get('cf-aig-metadata') ?? '{}').app).toBe('hark');
    }

    expect(await seen[1]?.json()).toEqual({ text: 'Hello there.', speaker: 'orion', encoding: 'linear16', container: 'none', sample_rate: 24000 });
  });

  it('retries speech once, and routes the rich voice to Aura 2', async () => {
    const urls: string[] = [];
    let calls = 0;
    const up = upstream(credentials, { api: 'https://api', gateway: 'https://gw/v1' }, async (input, init) => {
      urls.push(new Request(input, init).url);
      calls += 1;

      return calls === 1 ? new Response('busy', { status: 503 }) : new Response(new Uint8Array(4));
    });

    await up.speak('Hi.', 'thalia', 'aura-2', new AbortController().signal);

    expect(urls).toEqual(['https://gw/v1/acc%201/default/workers-ai/@cf/deepgram/aura-2-en', 'https://gw/v1/acc%201/default/workers-ai/@cf/deepgram/aura-2-en']);
  });

  it('turns an upstream refusal into a readable error', async () => {
    const up = upstream(credentials, undefined, async () => new Response('{"errors":[{"message":"Gateway authentication failed"}]}', { status: 401 }));

    await expect(up.chat({}, new AbortController().signal)).rejects.toThrow(/Thinking failed \(401\).*Gateway authentication/);
  });
});
