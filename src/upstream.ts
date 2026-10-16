import { EYES_MODEL, SPEECH_SAMPLE_RATE, type SpeechEngine, type Voice } from '../shared/protocol';

export type Credentials = {
  readonly accountId: string;
  readonly token: () => Promise<string>;
  readonly refresh: () => Promise<string>;
  readonly signedOut: () => void;
};

export const SIGNED_OUT_DETAIL = 'Your Cloudflare sign-in expired. Sign in with Cloudflare again.';

export type Origins = { readonly api: string; readonly gateway?: string };

export const CLOUDFLARE_ORIGINS: Origins = {
  api: 'https://api.cloudflare.com/client/v4',
  gateway: 'https://gateway.ai.cloudflare.com/v1',
};

const GATEWAY_PREFIX = 'gateway/';

const PREFERRED_GATEWAYS = ['hark', 'my-ax', 'ax', 'default'];

const NO_GATEWAY = 'none';

export const LISTEN_MODEL = '@cf/deepgram/flux';

export const SPEAK_MODELS: Record<SpeechEngine, string> = {
  'aura-1': '@cf/deepgram/aura-1',
  'aura-2': '@cf/deepgram/aura-2-en',
};

export const IMAGINE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

export const IMAGINE_FALLBACK = '@cf/black-forest-labs/flux-1-schnell';

export const JUDGE_MODEL = '@cf/cloudflare/clef';

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

const aiBase = (origins: Origins, credentials: Credentials) => `${origins.api}/accounts/${enc(credentials.accountId)}/ai`;

const UNAUTHORIZED = 401;

const authorizedSend =
  (credentials: Credentials, send: typeof fetch) =>
  async (url: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> => {
    const header = url.includes('gateway.ai.cloudflare.com') || url.includes('/__gateway/') ? 'cf-aig-authorization' : 'authorization';
    const attempt = (token: string) => send(url, { ...init, headers: { [header]: `Bearer ${token}`, ...init.headers } });
    const first = await attempt(await credentials.token());

    if (first.status !== UNAUTHORIZED) return first;

    const retried = await credentials
      .refresh()
      .then(attempt)
      .catch(() => null);

    if (retried !== null && retried.status !== UNAUTHORIZED) return retried;

    credentials.signedOut();

    throw new UpstreamFailed('Signing in', UNAUTHORIZED, SIGNED_OUT_DETAIL);
  };

const failure = async (step: string, response: Response) =>
  new UpstreamFailed(step, response.status, await response.text().catch(() => ''));

export type Upstream = {
  readonly listen: (params: Readonly<Record<string, unknown>>) => Promise<WebSocket>;
  readonly chat: (body: Record<string, unknown>, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  readonly speak: (
    text: string,
    voice: Voice,
    engine: SpeechEngine,
    signal: AbortSignal,
  ) => Promise<ReadableStream<Uint8Array>>;
  readonly see: (image: string, question: string, signal: AbortSignal) => Promise<string>;
  readonly imagine: (prompt: string, signal: AbortSignal) => Promise<string>;
  readonly judge: (request: Record<string, unknown>, signal: AbortSignal, model?: string) => Promise<unknown>;
  readonly routes: () => Readonly<Record<string, string>>;
};


export const listenUrl = (origins: Origins, credentials: Credentials, params: Readonly<Record<string, unknown>>) => {
  const url = new URL(`${aiBase(origins, credentials)}/run/${LISTEN_MODEL}`);

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const each of value) url.searchParams.append(key, String(each));
    else if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  return url.toString();
};

export const upstream = (
  credentials: Credentials,
  origins: Origins = CLOUDFLARE_ORIGINS,
  rawSend: typeof fetch = (input, init) => fetch(input, init),
): Upstream => {
  const send = authorizedSend(credentials, rawSend);
  let gatewayId: Promise<string> | null = null;

  const pickGateway = async (): Promise<string> => {
    const response = await send(`${origins.api}/accounts/${enc(credentials.accountId)}/ai-gateway/gateways?per_page=100`, { method: 'GET' });
    const parsed: unknown = await response.json().catch(() => null);
    const listed = typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { result?: unknown }).result) ? ((parsed as { result: { id?: unknown; authentication?: unknown }[] }).result) : [];
    const ids = listed.map((gateway) => (typeof gateway.id === 'string' ? gateway.id : '')).filter((id) => id !== '');
    const authenticated = listed.filter((gateway) => gateway.authentication === true).map((gateway) => String(gateway.id));

    return PREFERRED_GATEWAYS.find((id) => authenticated.includes(id)) ?? authenticated[0] ?? PREFERRED_GATEWAYS.find((id) => ids.includes(id)) ?? ids[0] ?? NO_GATEWAY;
  };

  const gatewayChat = async (body: Record<string, unknown>, signal: AbortSignal) => {
    gatewayId ??= pickGateway();

    const gateway = await gatewayId;

    if (gateway === NO_GATEWAY) throw new UpstreamFailed('Thinking (AI Gateway)', 404, 'this account has no AI Gateway; create one named hark in the dashboard');

    const model = String(body.model).slice(GATEWAY_PREFIX.length);
    const tuned = model.startsWith('openai/')
      ? { ...body, model, reasoning_effort: 'none', max_completion_tokens: body.max_tokens, max_tokens: undefined, temperature: undefined }
      : { ...body, model, temperature: undefined };
    const response = await send(`${origins.gateway ?? CLOUDFLARE_ORIGINS.gateway}/${enc(credentials.accountId)}/${enc(gateway)}/compat/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tuned),
      signal,
    });

    if (!response.ok || response.body === null) throw await failure(`Thinking (${model} via AI Gateway ${gateway})`, response);

    return response.body;
  };
  const runModel = async (
    model: string,
    body: () => BodyInit,
    contentType: string | null,
    signal: AbortSignal,
  ): Promise<Response> =>
    send(`${aiBase(origins, credentials)}/run/${model}`, {
      method: 'POST',
      headers: contentType === null ? {} : { 'content-type': contentType },
      body: body(),
      signal,
    });

  return {
  routes: () => ({ think: 'workers-ai', speak: 'workers-ai', listen: 'workers-ai', paint: 'workers-ai' }),

  listen: async (params) => {
    const response = await send(listenUrl(origins, credentials, params), {
      headers: { upgrade: 'websocket' },
    });
    const socket = response.webSocket;

    if (socket === null) throw await failure('Listening (Deepgram Flux)', response);

    return socket;
  },

  chat: async (body, signal) => {
    if (String(body.model).startsWith(GATEWAY_PREFIX)) return gatewayChat(body, signal);

    const response = await send(`${aiBase(origins, credentials)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok || response.body === null) throw await failure('Thinking', response);

    return response.body;
  },

  speak: async (text, voice, engine, signal) => {
    const body = () =>
      JSON.stringify({ text, speaker: voice, encoding: 'linear16', container: 'none', sample_rate: SPEECH_SAMPLE_RATE });
    const attempt = () => runModel(SPEAK_MODELS[engine], body, 'application/json', signal);
    const first = await attempt().catch((cause: unknown) => {
      if (signal.aborted) throw cause;

      return null;
    });
    const response = first !== null && first.ok && first.body !== null ? first : await attempt();

    if (!response.ok || response.body === null) throw await failure(`Speaking (${engine === 'aura-1' ? 'Aura 1' : 'Aura 2'})`, response);

    return response.body;
  },

  see: async (image, question, signal) => {
    const response = await send(`${aiBase(origins, credentials)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

  judge: async (request, signal, model = JUDGE_MODEL) => {
    const response = await runModel(model, () => JSON.stringify(request), 'application/json', signal);

    if (!response.ok) throw await failure('Judging (Clef)', response);

    const parsed: unknown = await response.json();

    return typeof parsed === 'object' && parsed !== null && 'result' in parsed ? (parsed as { result: unknown }).result : parsed;
  },

  imagine: async (prompt, signal) => {
    const form = () => {
      const data = new FormData();

      data.set('prompt', prompt);
      data.set('width', '1024');
      data.set('height', '1024');

      return data;
    };
    const klein = await runModel(IMAGINE_MODEL, form, null, signal);
    const image = klein.ok ? await imageOf(klein) : null;

    if (image !== null) return image;

    const schnell = await runModel(IMAGINE_FALLBACK, () => JSON.stringify({ prompt, steps: 6 }), 'application/json', signal);

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
