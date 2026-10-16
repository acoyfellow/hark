import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8790';
const FAKE = process.env.FAKE ?? 'http://127.0.0.1:8799';
const TARGET = process.env.TARGET ?? 'local';
const SHOTS = process.env.SHOTS ?? 'receipts/shots';

mkdirSync(SHOTS, { recursive: true });
mkdirSync('receipts', { recursive: true });

const voiceWav = () => {
  const rate = 48000;
  const burst = 1.3;
  const gap = 7.2;
  const total = Math.floor(rate * (burst + gap));
  const data = Buffer.alloc(total * 2);

  for (let i = 0; i < Math.floor(rate * burst); i += 1) {
    const t = i / rate;
    const syllables = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.2 * t);
    const envelope = Math.min(1, t * 30, (burst - t) * 30) * syllables;
    const voice = Math.sin(2 * Math.PI * 160 * t) * 0.6 + Math.sin(2 * Math.PI * 320 * t) * 0.25 + Math.sin(2 * Math.PI * 640 * t) * 0.1;

    data.writeInt16LE(Math.round(voice * envelope * 20000), i * 2);
  }

  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  const path = '/tmp/hark-voice.wav';

  writeFileSync(path, Buffer.concat([header, data]));

  return path;
};

const results = [];

const scenario = async (name, run) => {
  const started = Date.now();

  try {
    const detail = await run();

    results.push({ name, ok: true, ms: Date.now() - started, ...(detail ? { detail } : {}) });
    console.log(`pass  ${name} (${Date.now() - started} ms)`);
  } catch (cause) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(cause?.message ?? cause) });
    console.log(`FAIL  ${name}: ${cause?.message ?? cause}`);
  }
};

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${voiceWav()}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1360, height: 860 },
  deviceScaleFactor: 2,
  permissions: ['microphone', 'camera'],
});
const page = await context.newPage();
const frames = [];
const packets = { count: 0, bytes: 0 };

export const normalize = (raw) => {
  if (raw._tag) return [raw];
  if (raw.type === 'status' && raw.status !== 'idle') return [{ _tag: 'Presence', presence: raw.status }];
  if (raw.type === 'transcript_interim' && raw.text) return [{ _tag: 'Presence', presence: 'hearing' }];
  if (raw.type === 'playback_interrupt') return [{ _tag: 'Interrupt' }];
  if (raw.type === 'metrics') return [{ _tag: 'SpeechEnd' }];
  if (raw.type === 'turn_metrics' && raw.finalInputToFirstAudioMs !== undefined)
    return [{ _tag: 'Measured', latency: { total: raw.finalInputToFirstAudioMs, model: raw.modelToFirstTextMs, speech: raw.ttsToFirstAudioMs, eager: raw.speculativeLeadMs !== undefined, leadMs: raw.speculativeLeadMs } }];
  return [];
};

page.on('websocket', (socket) => {
  socket.on('framesent', ({ payload }) => {
    if (typeof payload === 'string' && payload.includes('"type":"interrupt"')) frames.push({ at: Date.now(), frame: { _tag: 'Interrupt', from: 'client' } });
  });
  socket.on('framereceived', ({ payload }) => {
    if (typeof payload === 'string') for (const frame of normalize(JSON.parse(payload))) frames.push({ at: Date.now(), frame });
    else {
      packets.count += 1;
      packets.bytes += payload.length;
    }
  });
});

const errors = [];

page.on('pageerror', (error) => errors.push(String(error)));

const waitFrame = async (test, timeout = 20000, after = 0) => {
  const started = Date.now();

  for (;;) {
    const found = frames.find(({ at, frame }) => at >= after && test(frame));

    if (found) return found;

    if (Date.now() - started > timeout) throw new Error(`timed out waiting for a frame (${test.toString().slice(0, 80)})`);

    await page.waitForTimeout(100);
  }
};

const presence = () => page.locator('#presence').innerText();

await scenario('the page renders asleep with the ear and no chat box', async () => {
  await page.goto(BASE);
  await page.locator('#orb').waitFor();
  await page.locator('#swarm canvas').waitFor({ timeout: 10000 });

  const text = await presence();

  if (text !== 'Tap to talk') throw new Error(`presence was "${text}"`);

  if ((await page.locator('textarea, input[type=text]').count()) !== 0) throw new Error('found a text box');

  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/asleep-desktop.png` });
});

const woke = Date.now();

await scenario('tapping the ear opens the line to the account and starts listening', async () => {
  await page.locator('#orb').click();

  const ready = await waitFrame((frame) => frame._tag === 'Ready');

  await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'listening');

  return { account: ready.frame.account, settings: ready.frame.settings };
});

await scenario('a spoken question gets a tool call, an article card, and a spoken answer', async () => {
  await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'hearing', 20000, woke);
  await waitFrame((frame) => frame._tag === 'Doing' && /looking up/i.test(frame.label), 20000, woke);
  await page.locator('[data-visual=article]').waitFor({ timeout: 20000 });

  const speaking = await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'speaking', 20000, woke);
  const measured = await waitFrame((frame) => frame._tag === 'Measured', 20000, woke);

  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/speaking-article-desktop.png` });

  if (packets.count === 0) throw new Error('no speech audio reached the browser');

  if (measured.frame.latency.eager !== true) throw new Error('the reply did not start on the eager end of turn');

  return { latency: measured.frame.latency, firstSpeechMs: speaking.at - woke, packets: packets.count };
});

await scenario('the browser plays the whole answer and reports it, then hark listens again', async () => {
  const end = await waitFrame((frame) => frame._tag === 'SpeechEnd', 20000, woke);

  await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'listening', 20000, end.at);
});

await scenario('remember stores a fact and shows it', async () => {
  await page.locator('[data-visual=memory]').waitFor({ timeout: 25000 });
});

await scenario('show_form plays a two-beat particle movie (3D heart, then a drawing), with no card', async () => {
  const form = await waitFrame((frame) => frame._tag === 'Show' && frame.visual._tag === 'Form', 25000, woke);

  const kinds = form.frame.visual.beats.map((beat) => beat.kind).join(',');

  if (kinds !== 'solid,draw') throw new Error(`unexpected beats ${kinds}`);

  await page.waitForFunction(() => document.querySelector('#swarm')?.dataset.shaped === 'form', null, { timeout: 8000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/form-heart-desktop.png` });

  if ((await page.locator('[data-visual=form]').count()) !== 0) throw new Error('a form showed up as a card');

  return { form: form.frame.visual };
});

await scenario('paint forms the picture in the swarm first, then hands it to a card', async () => {
  await page.waitForFunction(() => document.querySelector('#swarm')?.dataset.shaped === 'picture', null, { timeout: 25000 });
  await page.screenshot({ path: `${SHOTS}/painting-forming-desktop.png` });
  await page.locator('[data-visual=image] img').waitFor({ timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/painted-desktop.png` });
});

await scenario('talking over a long answer interrupts it (barge-in)', async () => {
  const story = await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'speaking', 30000, Date.now());
  const cut = await waitFrame((frame) => frame._tag === 'Interrupt', 20000, story.at);

  return { interruptedAfterMs: cut.at - story.at };
});

await scenario('a timer counts down and hark announces it when it ends (Durable Object alarm)', async () => {
  await page.locator('[data-visual=timer]').waitFor({ timeout: 30000 });

  const set = Date.now();

  await page.screenshot({ path: `${SHOTS}/timer-desktop.png` });

  const announced = await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'speaking', 20000, set + 2500);

  return { announcedAfterMs: announced.at - set };
});

await scenario('with the camera on, asking about it takes one frame and looks', async () => {
  await page.locator('#camera').click();
  await page.locator('[data-visual=glimpse] img').first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/glimpse-desktop.png` });
  await page.locator('#camera').click();
});

await scenario('saying goodbye puts hark to sleep and closes the microphone', async () => {
  await waitFrame((frame) => frame._tag === 'Sleep', 40000);
  await page.waitForFunction(() => document.querySelector('#presence')?.textContent === 'Tap to talk', null, { timeout: 15000 });
});

await scenario('one tap wakes it again after it slept, and it listens', async () => {
  const tapped = Date.now();

  await page.locator('#orb').click();
  await waitFrame((frame) => frame._tag === 'Ready', 15000, tapped);
  await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'listening', 15000, tapped);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#presence')?.textContent === 'Tap to talk', null, { timeout: 10000 });
});

const runTool = async (name, args) => {
  const response = await fetch(`${BASE}/__tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, args }) });

  if (!response.ok) throw new Error(`${name} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);

  return response.json();
};

const awake = async () => {
  const tapped = Date.now();

  await page.locator('#orb').click();
  await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'listening', 15000, tapped);
};

await scenario('report and alert widgets appear beside the swarm', async () => {
  await awake();
  await runTool('show_widget', { kind: 'alert', tone: 'bad', title: '5xx spike on api.example.com', body: 'Error rate jumped from 0.2% to 7.9%.', stats: [{ label: '5xx rate', value: '7.9%', tone: 'bad' }, { label: 'p95', value: '2.4s', tone: 'warn' }] });
  await runTool('show_widget', { kind: 'report', tone: 'good', title: 'Deploy report', stats: [{ label: 'checks', value: '18/18', tone: 'good' }], series: [{ label: 'Mon', value: 3 }, { label: 'Tue', value: 5 }, { label: 'Wed', value: 8 }] });
  await page.locator('[data-widget=alert]').waitFor({ timeout: 10000 });
  await page.locator('[data-widget=report]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/widgets-desktop.png` });
});

await scenario('a 3D model beat sculpts an object in the swarm', async () => {
  await runTool('show_form', { beats: [{ kind: 'model', seconds: 6, motion: 'spin', value: JSON.stringify([{ shape: 'cylinder', at: [0, 0, 0], size: [0.2, 0.6, 0.2] }, { shape: 'cone', at: [0, 0.8, 0], size: [0.2, 0.2, 0.2] }, { shape: 'box', at: [0.25, -0.5, 0], size: [0.08, 0.15, 0.02] }, { shape: 'box', at: [-0.25, -0.5, 0], size: [0.08, 0.15, 0.02] }]) }] });
  await page.waitForFunction(() => document.querySelector('#swarm')?.dataset.shaped === 'form', null, { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/model-rocket-desktop.png` });
});

await scenario('the durable computer runs a command and shows a terminal card', async () => {
  const result = await runTool('terminal', { command: 'cd /workspace && ls -la && node -v' });

  if (!/v\d+\./u.test(result.content)) throw new Error(`no node version in ${result.content.slice(0, 200)}`);

  await page.locator('[data-widget=terminal]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/terminal-desktop.png` });

  return { output: result.content.slice(0, 200) };
});

await scenario('the settings sheet shows the stack, voices, and brains', async () => {
  await page.locator('#settings').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/settings-desktop.png` });

  const text = await page.locator('aside[role=dialog]').innerText();

  for (const needle of ['Deepgram Flux', 'Aura 1', 'Kimi K3', 'GPT-OSS 20B', 'Asteria', 'Quick', 'Rich']) if (!text.toLowerCase().includes(needle.toLowerCase())) throw new Error(`missing ${needle}`);

  await page.keyboard.press('Escape');
});

await scenario('every upstream call went straight to Workers AI with the account token', async () => {
  const log = await (await fetch(`${FAKE}/__log`)).json();
  const unauthorized = log.filter((entry) => !entry.authorized);
  const kinds = new Set(log.map((entry) => (entry.method === 'WS' ? 'listen' : entry.path.split('/').pop())));

  if (unauthorized.length > 0) throw new Error(`${unauthorized.length} calls had no token`);

  for (const kind of ['listen', 'completions', 'aura-1']) if (!kinds.has(kind)) throw new Error(`no ${kind} call`);

  const brains = [...new Set(log.filter((entry) => entry.method === 'BRAIN').map((entry) => entry.model))];

  if (brains.length === 0 || brains.some((brain) => !brain.startsWith('@cf/'))) throw new Error(`brains did not run on Workers AI: ${brains}`);

  return { calls: log.length, kinds: [...kinds], brains };
});

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  permissions: ['microphone', 'camera'],
});
const mobile = await phone.newPage();
const mobileFrames = [];

mobile.on('websocket', (socket) => {
  socket.on('framereceived', ({ payload }) => {
    if (typeof payload === 'string') for (const frame of normalize(JSON.parse(payload))) mobileFrames.push(frame._tag === 'Presence' ? `Presence:${frame.presence}` : frame._tag);
  });
});

const layout = (target) =>
  target.evaluate(() => {
    const box = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
    const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const orb = box('#orb');
    const cards = [...document.querySelectorAll('[data-visual]')].map((node) => node.getBoundingClientRect().toJSON());
    const dock = ['#camera', '#settings'].map(box);

    return {
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      cardsOverOrb: cards.filter((card) => overlap(card, orb)).length,
      dockInside: dock.every((rect) => rect && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth),
      orb,
    };
  });

await scenario('the desktop layout keeps cards off the ear and nothing overflows', async () => {
  const measured = await layout(page);

  if (measured.overflowX || measured.cardsOverOrb > 0 || !measured.dockInside) throw new Error(JSON.stringify(measured));

  return measured;
});

await scenario('the phone layout renders asleep, then talks and shows a card', async () => {
  await mobile.goto(BASE);
  await mobile.locator('#orb').waitFor();
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: `${SHOTS}/asleep-phone.png` });
  await mobile.locator('#orb').tap();
  await mobile.locator('[data-visual]').first().waitFor({ timeout: 45000 }).catch((cause) => {
    throw new Error(`${cause.message.split('\n')[0]} frames: ${mobileFrames.join(' ')}`);
  });
  await mobile.waitForTimeout(1500);
  await mobile.screenshot({ path: `${SHOTS}/talking-phone.png` });

  const measured = await layout(mobile);

  if (measured.overflowX || !measured.dockInside) throw new Error(JSON.stringify(measured));

  return measured;
});

await scenario('the landing page offers Sign in with Cloudflare on desktop and phone', async () => {
  const landing = await context.newPage();

  await landing.goto(`${BASE}/welcome`);
  await landing.locator('#sign-in').waitFor();
  await landing.waitForTimeout(800);
  await landing.screenshot({ path: `${SHOTS}/landing-desktop.png` });
  await mobile.goto(`${BASE}/welcome`);
  await mobile.locator('#sign-in').waitFor();
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: `${SHOTS}/landing-phone.png`, fullPage: true });

  if ((await landing.locator('#sign-in').getAttribute('href')) !== '/oauth/login') throw new Error('sign-in does not start OAuth');
});

await mobile.close();
await browser.close();

if (errors.length > 0) results.push({ name: 'no uncaught page errors', ok: false, error: errors.join(' | ') });
else results.push({ name: 'no uncaught page errors', ok: true, ms: 0 });

const passed = results.filter((result) => result.ok).length;
const receipt = {
  kind: 'hark.e2e',
  target: TARGET,
  base: BASE,
  at: new Date().toISOString(),
  passed,
  total: results.length,
  speech: packets,
  results,
};

writeFileSync(`receipts/e2e-${TARGET}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`\n${passed}/${results.length} scenarios passed`);
process.exit(passed === results.length ? 0 : 1);
