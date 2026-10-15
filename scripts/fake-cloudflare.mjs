import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.FAKE_PORT ?? 8799);

const SCRIPT = (
  process.env.FAKE_SCRIPT ??
  [
    "What's the weather like in Lisbon right now?",
    'Remember that my favorite color is orange.',
    'Paint me a lighthouse in a storm.',
    'Tell me a long story about the sea.',
    'Set a timer for four seconds for tea.',
    'What am I holding up to the camera?',
    "Thanks, that's all for now.",
  ].join('|')
).split('|');

const log = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;

  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;

  return c >>> 0;
});

const crc = (bytes) => {
  let c = 0xffffffff;

  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);

  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);

  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);

  return out;
};

const png = (() => {
  const size = 256;
  const rows = Buffer.alloc((size * 3 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 3 + 1)] = 0;

    for (let x = 0; x < size; x += 1) {
      const at = y * (size * 3 + 1) + 1 + x * 3;
      const d = Math.hypot(x - size / 2, y - size * 0.4) / size;

      rows[at] = Math.max(0, 243 - d * 300);
      rows[at + 1] = Math.max(0, 128 - d * 200);
      rows[at + 2] = Math.max(0, 32 + y * 0.2);
    }
  }

  const header = Buffer.alloc(13);

  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
})();

const tone = (text) => {
  const rate = 24000;
  const seconds = Math.min(6, Math.max(0.5, text.length * 0.05));
  const samples = Math.floor(rate * seconds);
  const pcm = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i += 1) {
    const t = i / rate;
    const envelope = Math.min(1, t * 20, (seconds - t) * 20) * (0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 3.3));
    const value = Math.sin(2 * Math.PI * 180 * t) * 0.5 + Math.sin(2 * Math.PI * 360 * t) * 0.2;

    pcm.writeInt16LE(Math.round(value * envelope * 9000), i * 2);
  }

  return pcm;
};

const readBody = (request) =>
  new Promise((resolve) => {
    const parts = [];

    request.on('data', (part) => parts.push(part));
    request.on('end', () => resolve(Buffer.concat(parts)));
  });

const sse = async (response, deltas, calls) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' });

  for (const text of deltas) {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    await sleep(25);
  }

  calls.forEach((call, index) => {
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, id: `call_${index}`, function: { name: call.name, arguments: JSON.stringify(call.args) } }] } }] })}\n\n`,
    );
  });
  response.write('data: [DONE]\n\n');
  response.end();
};

const words = (text) => text.match(/\S+\s*/g) ?? [];

const LONG =
  'Once, a lighthouse keeper named Ada counted ships instead of sheep. Every night the sea sent her a new one, lit like a lantern. One winter a ship came with no lights at all, and she rowed out alone to meet it. ';

const reply = (messages) => {
  const last = messages.at(-1) ?? { role: 'user', content: '' };
  const text = typeof last.content === 'string' ? last.content.toLowerCase() : '';

  const flattened = last.role === 'user' && typeof last.content === 'string' ? /^\[Result of ([a-z_]+)/.exec(last.content) : null;

  if (last.role === 'tool' || flattened) {
    const asked = flattened?.[1] ?? messages.findLast((message) => message.role === 'assistant' && message.tool_calls)?.tool_calls?.[0]?.function?.name;
    const answers = {
      get_weather: "It's about twenty-one degrees and clear in Lisbon. A perfect evening for a walk.",
      remember: "Got it. Orange it is, and I'll keep that in mind.",
      imagine: 'There you go, a lighthouse holding its own against the storm.',
      set_timer: 'Timer set. Four seconds for tea.',
      look: 'That looks like a colorful test pattern.',
      rest: 'Talk soon.',
    };

    return { deltas: words(answers[asked] ?? 'Done.'), calls: [] };
  }

  if (text.includes('timer') && text.includes('finished')) return { deltas: words('Your tea is ready.'), calls: [] };

  if (text.includes('weather')) return { deltas: words('Let me check. '), calls: [{ name: 'get_weather', args: { place: 'Lisbon' } }] };

  if (text.includes('remember')) return { deltas: [], calls: [{ name: 'remember', args: { fact: 'Their favorite color is orange.' } }] };

  if (text.includes('paint')) return { deltas: words('Painting it now. '), calls: [{ name: 'imagine', args: { prompt: 'A lighthouse in a violent storm, oil painting, warm beam' } }] };

  if (text.includes('story')) return { deltas: words(LONG.repeat(3)), calls: [] };

  if (text.includes('camera')) return { deltas: [], calls: [{ name: 'look', args: { question: 'what they are holding' } }] };

  if (text.includes('timer')) return { deltas: [], calls: [{ name: 'set_timer', args: { seconds: 4, label: 'tea' } }] };

  if (text.includes('thanks') || text.includes('bye')) return { deltas: [], calls: [{ name: 'rest', args: {} }] };

  return { deltas: words(`You said ${text}.`), calls: [] };
};

const authorized = (request) =>
  request.headers.authorization?.startsWith('Bearer ') && request.headers['cf-aig-authorization'] === undefined && !(request.url ?? '').includes('workers-ai');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
  const body = await readBody(request);

  if (url.pathname === '/__log') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(log));
    return;
  }

  log.push({ method: request.method, path: url.pathname, authorized: Boolean(authorized(request)), at: Date.now() });

  if (!authorized(request)) {
    response.writeHead(401);
    response.end('missing token');
    return;
  }

  if (url.pathname.endsWith('/ai/v1/chat/completions')) {
    const { messages, stream, model } = JSON.parse(body.toString('utf8'));

    log.push({ method: 'BRAIN', path: url.pathname, model, authorized: true, at: Date.now() });

    if (model === '@cf/moonshotai/kimi-k3') {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ errors: [{ code: 5018, message: 'AiError: Ai: This account is not allowed to access @cf/moonshotai/kimi-k3.' }] }));
      return;
    }

    if (stream !== true) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'A bright test pattern with colored bars.' } }] }));
      return;
    }

    const { deltas, calls } = reply(messages);

    await sleep(120);
    await sse(response, deltas, calls);
    return;
  }

  if (url.pathname.endsWith('/@cf/deepgram/aura-2-en') || url.pathname.endsWith('/@cf/deepgram/aura-1')) {
    const { text } = JSON.parse(body.toString('utf8'));
    const pcm = tone(text);

    await sleep(60);
    response.writeHead(200, { 'content-type': 'audio/l16' });

    for (let at = 0; at < pcm.length; at += 4801) {
      response.write(pcm.subarray(at, at + 4801));
      await sleep(5);
    }

    response.end();
    return;
  }

  if (url.pathname.includes('/@cf/black-forest-labs/')) {
    await sleep(300);
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(png);
    return;
  }

  response.writeHead(404);
  response.end('unknown fake route');
});

const flux = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);

  log.push({ method: 'WS', path: url.pathname, model: url.searchParams.get('model'), authorized: Boolean(authorized(request)), at: Date.now() });

  if (!authorized(request) || !url.pathname.endsWith('/ai/run/@cf/deepgram/flux')) {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return;
  }

  flux.handleUpgrade(request, socket, head, (ws) => listen(ws));
});

const listen = (ws) => {
  let line = 0;
  let speaking = false;
  let quietMs = 0;
  let spokenMs = 0;
  let turn = 0;
  let eager = false;
  let updates = 0;
  const send = (event, transcript = '') => ws.send(JSON.stringify({ event, turn_index: turn, transcript, end_of_turn_confidence: 0.5 }));

  ws.on('message', (data, binary) => {
    if (process.env.FAKE_DEBUG) console.log('message', binary, data.length);

    if (!binary) return;

    const pcm = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
    let energy = 0;

    for (const sample of pcm) energy += sample * sample;

    const rms = Math.sqrt(energy / Math.max(1, pcm.length));
    const loud = rms > 600;

    if (process.env.FAKE_DEBUG) console.log('pcm', pcm.length, Math.round(rms));
    const ms = (pcm.length / 16000) * 1000;
    const transcript = SCRIPT[line % SCRIPT.length];

    if (loud) {
      quietMs = 0;
      spokenMs += ms;

      if (!speaking) {
        speaking = true;
        eager = false;
        updates = 0;
        send('StartOfTurn');
      } else if (eager) {
        eager = false;
        send('TurnResumed', words(transcript).slice(0, Math.ceil(updates / 3)).join('').trim());
      }

      updates += 1;

      if (updates % 3 === 0) send('Update', words(transcript).slice(0, Math.ceil(updates / 3)).join('').trim());

      return;
    }

    if (!speaking) return;

    quietMs += ms;

    if (quietMs >= 240 && !eager) {
      eager = true;
      send('EagerEndOfTurn', transcript);
    }

    if (quietMs >= 560) {
      speaking = false;
      send('EndOfTurn', transcript);
      line += 1;
      turn += 1;
      spokenMs = 0;
    }
  });
};

server.listen(PORT, '127.0.0.1', () => console.log(`fake cloudflare on http://127.0.0.1:${PORT}`));
