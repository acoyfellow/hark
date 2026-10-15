import { describe, expect, it } from 'vitest';
import { listenUrl, upstream } from '../../src/upstream';

const credentials = { accountId: 'acc 1', token: async () => 'tok' };
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
