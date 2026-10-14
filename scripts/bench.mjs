// Voice latency benchmark on a real account, through its AI Gateway, using the method of the
// internal Voice Agents Showcase benchmark (wiki: "Voice showcase benchmark results"):
// speech end -> final transcript -> first text -> first audio, per pipeline, with completion rates.
// Usage: CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=$(npx wrangler auth token) HARK_GATEWAY=default \
//        RUNS=5 node scripts/bench.mjs
// Writes receipts/bench-live.json. Never prints the token.
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const gateway = process.env.HARK_GATEWAY ?? 'default';
const runs = Number(process.env.RUNS ?? 5);
const brains = (process.env.BRAINS ?? '@cf/openai/gpt-oss-20b,@cf/openai/gpt-oss-120b,@cf/google/gemma-4-26b-a4b-it').split(',');
const engines = (process.env.ENGINES ?? 'aura-1,aura-2').split(',');

if (!account || !token) {
  console.error('set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
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
const headers = {
  authorization: `Bearer ${token}`,
  'cf-aig-authorization': `Bearer ${token}`,
  'cf-aig-metadata': JSON.stringify({ app: 'hark', step: 'bench' }),
  'cf-aig-skip-cache': 'true',
};
const QUESTIONS = ['What is the weather usually like in Lisbon in October?', 'Give me one tip for sleeping better.', 'How far away is the moon?'];
const SPEAKERS = { 'aura-1': 'asteria', 'aura-2': 'luna' };
const MODELS = { 'aura-1': '@cf/deepgram/aura-1', 'aura-2': '@cf/deepgram/aura-2-en' };

const thinking = (brain) => (brain.startsWith('@cf/openai/gpt-oss') ? { reasoning_effort: 'low' } : { chat_template_kwargs: { enable_thinking: false } });

const pct = (values, p) => {
  if (values.length === 0) return null;

  const sorted = values.toSorted((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const speak = async (text, engine, sampleRate) => {
  const started = Date.now();
  const response = await fetch(`${base}/${MODELS[engine]}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ text, speaker: SPEAKERS[engine], encoding: 'linear16', container: 'none', sample_rate: sampleRate }),
  });

  if (!response.ok || !response.body) throw new Error(`${engine} ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const reader = response.body.getReader();
  const first = await reader.read();
  const firstByteMs = Date.now() - started;
  const parts = first.value ? [first.value] : [];

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    parts.push(value);
  }

  return { firstByteMs, bytes: Buffer.concat(parts) };
};

const hear = (pcm) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(fluxUrl('encoding=linear16&sample_rate=16000&eot_threshold=0.75&eager_eot_threshold=0.5&eot_timeout_ms=3500'), { headers });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('no EndOfTurn in 20 s'));
    }, 20000);
    let speechEndAt = 0;
    let eagerAt = null;

    ws.on('unexpected-response', (_q, response) => reject(new Error(`flux upgrade ${response.statusCode}`)));
    ws.on('error', reject);
    ws.on('open', async () => {
      const frame = 2560;

      for (let at = 0; at < pcm.length; at += frame) {
        ws.send(pcm.subarray(at, at + frame));
        await new Promise((done) => setTimeout(done, 80));
      }

      speechEndAt = Date.now();

      for (let i = 0; i < 60 && ws.readyState === WebSocket.OPEN; i += 1) {
        ws.send(Buffer.alloc(frame));
        await new Promise((done) => setTimeout(done, 80));
      }
    });
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      const name = event.event ?? event.type;

      if (name === 'EagerEndOfTurn' && eagerAt === null && speechEndAt > 0) eagerAt = Date.now();

      if (name === 'EndOfTurn' && speechEndAt > 0) {
        clearTimeout(timer);
        ws.close();
        resolve({ transcript: event.transcript ?? '', finalMs: Date.now() - speechEndAt, eagerMs: eagerAt === null ? null : eagerAt - speechEndAt });
      }
    });
  });

const think = async (brain, question) => {
  const started = Date.now();
  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: brain,
      stream: true,
      max_tokens: 200,
      ...thinking(brain),
      messages: [
        { role: 'system', content: 'You are a voice. Answer in one or two short spoken sentences. No markdown.' },
        { role: 'user', content: question },
      ],
    }),
  });

  if (!response.ok || !response.body) throw new Error(`${brain} ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const decoder = new TextDecoder();
  let text = '';
  let firstTextMs = null;
  let firstSentenceMs = null;
  let pending = '';

  for await (const part of response.body) {
    pending += decoder.decode(part, { stream: true });

    let at = pending.indexOf('\n');

    while (at >= 0) {
      const line = pending.slice(0, at).trim();

      pending = pending.slice(at + 1);
      at = pending.indexOf('\n');

      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;

      try {
        const delta = JSON.parse(line.slice(5)).choices?.[0]?.delta?.content ?? '';

        if (delta !== '') {
          firstTextMs ??= Date.now() - started;
          text += delta;

          if (firstSentenceMs === null && /[.!?,]\s/.test(text) && text.length >= 18) firstSentenceMs = Date.now() - started;
        }
      } catch {}
    }
  }

  if (firstTextMs === null) throw new Error(`${brain} returned no text`);

  return { firstTextMs, firstSentenceMs: firstSentenceMs ?? Date.now() - started, text };
};

const audioCache = new Map();
const results = [];

for (const brain of brains)
  for (const engine of engines)
    for (let run = 0; run < runs; run += 1) {
      const question = QUESTIONS[run % QUESTIONS.length];
      const row = { brain, engine, run };

      try {
        if (!audioCache.has(question)) audioCache.set(question, (await speak(question, 'aura-1', 16000)).bytes);

        const heard = await hear(audioCache.get(question));
        const thought = await think(brain, heard.transcript || question);
        const firstSentence = thought.text.match(/^.{18,}?[.!?,](\s|$)/s)?.[0] ?? thought.text;
        const voiced = await speak(firstSentence.trim(), engine, 24000);

        Object.assign(row, {
          ok: true,
          transcriptOk: heard.transcript.toLowerCase().includes(question.split(' ')[1]?.toLowerCase() ?? ''),
          finalTranscriptMs: heard.finalMs,
          eagerMs: heard.eagerMs,
          firstTextMs: thought.firstTextMs,
          firstSentenceMs: thought.firstSentenceMs,
          firstAudioByteMs: voiced.firstByteMs,
          ttfaMs: heard.finalMs + thought.firstSentenceMs + voiced.firstByteMs,
          ttfaEagerMs: heard.eagerMs === null ? null : Math.max(heard.eagerMs + thought.firstSentenceMs + voiced.firstByteMs, heard.finalMs),
        });
      } catch (cause) {
        Object.assign(row, { ok: false, error: String(cause?.message ?? cause).slice(0, 300) });
      }

      results.push(row);
      console.log(JSON.stringify(row));
    }

const summary = [];

for (const brain of brains)
  for (const engine of engines) {
    const rows = results.filter((row) => row.brain === brain && row.engine === engine);
    const ok = rows.filter((row) => row.ok);
    const stat = (key) => ({ p50: pct(ok.map((row) => row[key]).filter((v) => v !== null), 50), p95: pct(ok.map((row) => row[key]).filter((v) => v !== null), 95) });

    summary.push({
      pipeline: `Flux + ${brain.split('/').pop()} + ${engine}`,
      completed: `${ok.length}/${rows.length}`,
      finalTranscript: stat('finalTranscriptMs'),
      firstText: stat('firstTextMs'),
      firstAudioByte: stat('firstAudioByteMs'),
      ttfa: stat('ttfaMs'),
      ttfaWithEagerTurn: stat('ttfaEagerMs'),
    });
  }

console.table(summary.map((row) => ({ pipeline: row.pipeline, completed: row.completed, 'TTFA p50': row.ttfa.p50, 'TTFA p95': row.ttfa.p95, 'eager p50': row.ttfaWithEagerTurn.p50 })));
writeFileSync(
  direct ? 'receipts/bench-live-direct.json' : 'receipts/bench-live.json',
  `${JSON.stringify({ kind: 'hark.bench', at: new Date().toISOString(), route: direct ? 'workers-ai direct' : 'ai-gateway', gateway, runs, method: 'speech end -> Flux EndOfTurn -> first sentence of streamed text -> first Aura audio byte, measured from this machine; compare with the internal showcase baseline Flux + GPT-OSS + Aura-1 at 2,416 ms p50 (browser receipt)', internalBaselineMs: { p50: 2416, p95: 5975 }, summary, results }, null, 2)}\n`,
);
