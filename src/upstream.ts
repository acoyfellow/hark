import { EYES_MODEL, MIC_SAMPLE_RATE, SPEECH_SAMPLE_RATE, type SpeechEngine, type Voice } from '../shared/protocol';

export type Credentials = {
  readonly accountId: string;
  readonly gateway: string;
  readonly token: () => Promise<string>;
};

export type Origins = { readonly api: string; readonly gateway: string };

export const CLOUDFLARE_ORIGINS: Origins = {
  api: 'https://api.cloudflare.com/client/v4',
  gateway: 'https://gateway.ai.cloudflare.com/v1',
};

export const LISTEN_MODEL = '@cf/deepgram/flux';

export const SPEAK_MODELS: Record<SpeechEngine, string> = {
  'aura-1': '@cf/deepgram/aura-1',
  'aura-2': '@cf/deepgram/aura-2-en',
};

export const IMAGINE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

export const IMAGINE_FALLBACK = '@cf/black-forest-labs/flux-1-schnell';

export class UpstreamFailed extends Error {
  constructor(
    readonly step: string,
    readonly status: number,
    detail: string,
  ) {
    super(`${step} failed (${status}): ${detail.slice(0, 300)}`);
  }
}

const enc = encodeURIComponent;

const gatewayBase = (origins: Origins, credentials: Credentials) =>
  `${origins.gateway}/${enc(credentials.accountId)}/${enc(credentials.gateway)}/workers-ai`;

const headersFor = async (credentials: Credentials, step: string, extra: Record<string, string> = {}) => {
  const token = await credentials.token();

  return {
    authorization: `Bearer ${token}`,
    'cf-aig-authorization': `Bearer ${token}`,
    'cf-aig-metadata': JSON.stringify({ app: 'hark', step }),
    ...extra,
  };
};

const failure = async (step: string, response: Response) =>
  new UpstreamFailed(step, response.status, await response.text().catch(() => ''));

export type Upstream = {
  readonly listen: (options: ListenOptions) => Promise<WebSocket>;
  readonly chat: (body: Record<string, unknown>, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  readonly speak: (
    text: string,
    voice: Voice,
    engine: SpeechEngine,
    signal: AbortSignal,
  ) => Promise<ReadableStream<Uint8Array>>;
  readonly see: (image: string, question: string, signal: AbortSignal) => Promise<string>;
  readonly imagine: (prompt: string, signal: AbortSignal) => Promise<string>;
  readonly routes: () => Readonly<Record<string, string>>;
};

export type ListenOptions = { readonly keyterms: readonly string[] };

export const listenUrl = (origins: Origins, credentials: Credentials, options: ListenOptions) => {
  const url = new URL(gatewayBase(origins, credentials));

  url.searchParams.set('model', LISTEN_MODEL);
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('sample_rate', String(MIC_SAMPLE_RATE));
  url.searchParams.set('eot_threshold', '0.75');
  url.searchParams.set('eager_eot_threshold', '0.5');
  url.searchParams.set('eot_timeout_ms', '3500');

  for (const term of options.keyterms) url.searchParams.append('keyterm', term);

  return url.toString();
};

export const upstream = (
  credentials: Credentials,
  origins: Origins = CLOUDFLARE_ORIGINS,
  send: typeof fetch = (input, init) => fetch(input, init),
): Upstream => {
  type Route = 'gateway' | 'rest';

  let preferred: Route = 'gateway';
  const used: Record<string, string> = {};

  const runModel = async (
    step: string,
    model: string,
    body: () => BodyInit,
    contentType: string | null,
    signal: AbortSignal,
  ): Promise<Response> => {
    const order: Route[] = preferred === 'gateway' ? ['gateway', 'rest'] : ['rest', 'gateway'];
    let refused: Response | null = null;

    for (const route of order) {
      const url =
        route === 'gateway'
          ? `${gatewayBase(origins, credentials)}/${model}`
          : `${origins.api}/accounts/${enc(credentials.accountId)}/ai/run/${model}`;
      const extra: Record<string, string> = route === 'rest' ? { 'cf-aig-gateway-id': credentials.gateway } : {};

      if (contentType !== null) extra['content-type'] = contentType;

      const response = await send(url, { method: 'POST', headers: await headersFor(credentials, step, extra), body: body(), signal });

      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        refused = response;
        continue;
      }

      if (response.ok) {
        preferred = route;
        used[step] = route;
      }

      return response;
    }

    return refused ?? new Response('no route', { status: 502 });
  };

  return {
  routes: () => ({ ...used }),

  listen: async (options) => {
    const response = await send(listenUrl(origins, credentials, options), {
      headers: await headersFor(credentials, 'listen', { upgrade: 'websocket' }),
    });
    const socket = response.webSocket;

    if (socket === null) throw await failure('Listening (Deepgram Flux)', response);

    socket.accept();
    socket.binaryType = 'arraybuffer';

    return socket;
  },

  chat: async (body, signal) => {
    const response = await send(`${gatewayBase(origins, credentials)}/v1/chat/completions`, {
      method: 'POST',
      headers: await headersFor(credentials, 'think', { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok || response.body === null) throw await failure('Thinking', response);

    return response.body;
  },

  speak: async (text, voice, engine, signal) => {
    const body = () =>
      JSON.stringify({ text, speaker: voice, encoding: 'linear16', container: 'none', sample_rate: SPEECH_SAMPLE_RATE });
    const attempt = () => runModel('speak', SPEAK_MODELS[engine], body, 'application/json', signal);
    const first = await attempt().catch((cause: unknown) => {
      if (signal.aborted) throw cause;

      return null;
    });
    const response = first !== null && first.ok && first.body !== null ? first : await attempt();

    if (!response.ok || response.body === null) throw await failure(`Speaking (${engine === 'aura-1' ? 'Aura 1' : 'Aura 2'})`, response);

    return response.body;
  },

  see: async (image, question, signal) => {
    const response = await send(`${gatewayBase(origins, credentials)}/v1/chat/completions`, {
      method: 'POST',
      headers: await headersFor(credentials, 'see', { 'content-type': 'application/json' }),
      body: JSON.stringify({
        model: EYES_MODEL,
        max_tokens: 300,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Describe what is in this camera frame in two or three plain sentences, focusing on: ${question || 'what the person is showing'}.` },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      }),
      signal,
    });

    if (!response.ok) throw await failure('Looking', response);

    const parsed: unknown = await response.json().catch(() => null);
    const body = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const choice = Array.isArray(body.choices) ? (body.choices[0] as Record<string, unknown> | undefined) : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;

    return typeof message?.content === 'string' ? message.content : 'I could not make out the picture.';
  },

  imagine: async (prompt, signal) => {
    const form = () => {
      const data = new FormData();

      data.set('prompt', prompt);
      data.set('width', '1024');
      data.set('height', '1024');

      return data;
    };
    const klein = await runModel('paint', IMAGINE_MODEL, form, null, signal);
    const image = klein.ok ? await imageOf(klein) : null;

    if (image !== null) return image;

    const schnell = await runModel('paint', IMAGINE_FALLBACK, () => JSON.stringify({ prompt, steps: 6 }), 'application/json', signal);

    if (!schnell.ok) throw await failure('Imagining (FLUX)', schnell);

    const fallback = await imageOf(schnell);

    if (fallback === null) throw new UpstreamFailed('Imagining (FLUX)', 502, 'no image in reply');

    return fallback;
  },
  };
};

const imageOf = async (response: Response): Promise<string | null> => {
  const type = response.headers.get('content-type') ?? '';

  if (type.startsWith('image/')) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';

    for (let at = 0; at < bytes.length; at += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));

    return `data:${type};base64,${btoa(binary)}`;
  }

  const parsed: unknown = await response.json().catch(() => null);
  const body = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const result =
    typeof body.result === 'object' && body.result !== null
      ? (body.result as Record<string, unknown>)
      : body;
  const image = result.image;

  return typeof image === 'string' && image !== '' ? `data:image/jpeg;base64,${image}` : null;
};
