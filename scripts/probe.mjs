// Live probe against a real Cloudflare account, through its AI Gateway, with no browser:
// Aura 2 speaks a sentence, Flux hears it back, the brain calls a tool, FLUX paints.
// Usage: CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… HARK_GATEWAY=default node scripts/probe.mjs
// A token from `npx wrangler auth token` works. Writes receipts/live-probe.json. Never prints the token.
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const gateway = process.env.HARK_GATEWAY ?? 'default';
const brain = process.env.HARK_BRAIN ?? '@cf/openai/gpt-oss-20b';

if (!account || !token) {
  console.error('set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (npx wrangler auth token)');
  process.exit(2);
}

const direct = process.env.HARK_ROUTE === 'direct';
const base = direct
  ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run`
  : `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/workers-ai`;
const chatUrl = direct
  ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`
  : chatUrl;
const fluxUrl = (query) =>
  direct
    ? `wss://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/deepgram/flux?${query}`
    : `${base.replace('https://', 'wss://')}?model=@cf/deepgram/flux&${query}`;
const headers = { authorization: `Bearer ${token}`, 'cf-aig-authorization': `Bearer ${token}` };
const steps = [];
const SENTENCE = 'What is the weather like in Lisbon right now?';

const step = async (name, run) => {
  const started = Date.now();

  try {
    const detail = await run();

    steps.push({ name, ok: true, ms: Date.now() - started, detail });
    console.log(`pass  ${name} (${Date.now() - started} ms)`, JSON.stringify(detail).slice(0, 200));

    return detail;
  } catch (cause) {
    steps.push({ name, ok: false, ms: Date.now() - started, error: String(cause?.message ?? cause) });
    console.log(`FAIL  ${name}: ${cause?.message ?? cause}`);

    return null;
  }
};

const speak = async (text, sampleRate) => {
  const response = await fetch(`${base}/@cf/deepgram/aura-2-en`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ text, speaker: 'luna', encoding: 'linear16', container: 'none', sample_rate: sampleRate }),
  });

  if (!response.ok) throw new Error(`aura ${response.status}: ${(await response.text()).slice(0, 300)}`);

  return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') };
};

let pcm16k = null;

await step('Aura 2 speaks (24 kHz linear16, the format hark plays)', async () => {
  const { bytes, type } = await speak(SENTENCE, 24000);

  if (bytes.length < 24000) throw new Error(`only ${bytes.length} bytes`);

  return { bytes: bytes.length, seconds: +(bytes.length / 2 / 24000).toFixed(2), contentType: type };
});

await step('Aura 2 speaks at 16 kHz for the round trip', async () => {
  const { bytes } = await speak(SENTENCE, 16000);

  pcm16k = bytes;

  return { bytes: bytes.length };
});

await step('Flux hears it back through the gateway WebSocket, with turn events', async () => {
  if (!pcm16k) throw new Error('no audio to send');

  const url = fluxUrl('encoding=linear16&sample_rate=16000&eot_threshold=0.75&eager_eot_threshold=0.5');
  const events = [];
  const opened = Date.now();

  const transcript = await new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => reject(new Error(`no EndOfTurn; saw ${events.map((e) => e.event).join(',')}`)), 20000);

    ws.on('unexpected-response', (_request, response) => {
      let body = '';

      response.on('data', (part) => (body += part));
      response.on('end', () => reject(new Error(`upgrade refused ${response.statusCode}: ${body.slice(0, 300)}`)));
    });
    ws.on('error', reject);
    ws.on('open', async () => {
      const frame = 2560;
      const silence = Buffer.alloc(frame);

      for (let at = 0; at < pcm16k.length; at += frame) {
        ws.send(pcm16k.subarray(at, at + frame));
        await new Promise((done) => setTimeout(done, 80));
      }

      for (let i = 0; i < 40; i += 1) {
        ws.send(silence);
        await new Promise((done) => setTimeout(done, 80));
      }
    });
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());

      events.push({ event: event.event ?? event.type, at: Date.now() - opened, transcript: event.transcript });

      if ((event.event ?? event.type) === 'EndOfTurn') {
        clearTimeout(timer);
        ws.close();
        resolve(event.transcript ?? '');
      }
    });
  });

  if (!/lisbon/i.test(transcript)) throw new Error(`heard "${transcript}"`);

  return { transcript, events: events.filter((e) => e.event !== 'Update') };
});

await step(`${brain} streams and calls a tool through the gateway`, async () => {
  const started = Date.now();
  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: brain,
      stream: true,
      max_tokens: 300,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: 'You are a voice. Use tools when they help.' },
        { role: 'user', content: SENTENCE },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'get_weather', description: 'Weather for a place', parameters: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] } },
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`chat ${response.status}: ${(await response.text()).slice(0, 300)}`);

  const text = await response.text();
  const firstByte = Date.now() - started;
  const called = /get_weather/.test(text);

  if (!called) throw new Error(`no tool call in stream: ${text.slice(0, 300)}`);

  return { firstByteMs: firstByte, toolCalled: called, lisbon: /lisbon/i.test(text) };
});

const roundTwo = async (messages) => {
  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ model: brain, stream: true, max_tokens: 200, ...(brain.startsWith('@cf/openai/gpt-oss') ? { reasoning_effort: 'low' } : { chat_template_kwargs: { enable_thinking: false } }), messages }),
  });
  const text = await response.text();

  if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 300)}`);

  const said = [...text.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join('');

  if (said.trim() === '') throw new Error(`no text: ${text.slice(0, 200)}`);

  return { said: said.slice(0, 160) };
};

const asked = [
  { role: 'system', content: 'You are a voice. Answer in one short spoken sentence.' },
  { role: 'user', content: SENTENCE },
];

await step(`${brain} answers from a tool result sent as role:tool messages (OpenAI shape)`, () =>
  roundTwo([
    ...asked,
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"place":"Lisbon"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: '{"now_celsius":21,"conditions":"clear"}' },
  ]),
);

await step(`${brain} answers from a tool result sent as plain text (what hark sends)`, () =>
  roundTwo([
    ...asked,
    { role: 'assistant', content: '[I called get_weather({"place":"Lisbon"})]' },
    { role: 'user', content: '[Result of get_weather, not said by the person] {"now_celsius":21,"conditions":"clear"}' },
  ]),
);

await step('FLUX.2 klein paints through the gateway', async () => {
  const form = new FormData();

  form.set('prompt', 'a lighthouse in a storm, warm beam, oil painting');
  form.set('width', '512');
  form.set('height', '512');

  const response = await fetch(`${base}/@cf/black-forest-labs/flux-2-klein-4b`, { method: 'POST', headers, body: form });
  const type = response.headers.get('content-type') ?? '';

  if (!response.ok) throw new Error(`flux ${response.status}: ${(await response.text()).slice(0, 300)}`);

  const size = type.startsWith('image/') ? (await response.arrayBuffer()).byteLength : JSON.stringify(await response.json()).length;

  return { contentType: type, size };
});

const passed = steps.filter((each) => each.ok).length;

writeFileSync(
  direct ? 'receipts/live-probe-direct.json' : 'receipts/live-probe.json',
  `${JSON.stringify({ kind: 'hark.live-probe', at: new Date().toISOString(), route: direct ? 'workers-ai direct' : 'ai-gateway', gateway, brain, passed, total: steps.length, steps }, null, 2)}\n`,
);
console.log(`\n${passed}/${steps.length} live steps passed`);
process.exit(passed === steps.length ? 0 : 1);
