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

page.on('websocket', (socket) => {
  socket.on('framereceived', ({ payload }) => {
    if (typeof payload === 'string') frames.push({ at: Date.now(), frame: JSON.parse(payload) });
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

await scenario('a spoken question gets a tool call, a weather card, and a spoken answer', async () => {
  await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'hearing', 20000, woke);
  await waitFrame((frame) => frame._tag === 'Doing' && /sky/i.test(frame.label), 20000, woke);
  await page.locator('[data-visual=weather]').waitFor({ timeout: 20000 });

  const speaking = await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'speaking', 20000, woke);
  const measured = await waitFrame((frame) => frame._tag === 'Measured', 20000, woke);

  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/speaking-weather-desktop.png` });

  if (packets.count === 0) throw new Error('no speech audio reached the browser');

  return { latency: measured.frame.latency, firstSpeechMs: speaking.at - woke, packets: packets.count };
});

await scenario('the browser plays the whole answer and reports it, then hark listens again', async () => {
  const end = await waitFrame((frame) => frame._tag === 'SpeechEnd', 20000, woke);

  await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'listening', 20000, end.at);
});

await scenario('remember stores a fact and shows it', async () => {
  await page.locator('[data-visual=memory]').waitFor({ timeout: 25000 });
});

await scenario('paint puts a FLUX picture on the screen', async () => {
  await page.locator('[data-visual=image] img').waitFor({ timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/painted-desktop.png` });
});

await scenario('talking over a long answer interrupts it (barge-in)', async () => {
  const story = await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'speaking', 30000, Date.now());
  const duck = await waitFrame((frame) => frame._tag === 'Duck' && frame.ducked, 20000, story.at);
  const cut = await waitFrame((frame) => frame._tag === 'Interrupt', 20000, duck.at);

  return { duckedAfterMs: duck.at - story.at, interruptedAfterMs: cut.at - story.at };
});

await scenario('a timer counts down and hark announces it when it ends (Durable Object alarm)', async () => {
  await page.locator('[data-visual=timer]').waitFor({ timeout: 30000 });

  const set = Date.now();

  await page.screenshot({ path: `${SHOTS}/timer-desktop.png` });

  const announced = await waitFrame((frame) => frame._tag === 'Presence' && frame.presence === 'speaking', 20000, set + 2500);

  return { announcedAfterMs: announced.at - set };
});

await scenario('saying goodbye puts hark to sleep and closes the microphone', async () => {
  await waitFrame((frame) => frame._tag === 'Sleep', 40000);
  await page.waitForFunction(() => document.querySelector('#presence')?.textContent === 'Tap to talk', null, { timeout: 15000 });
});

await scenario('the settings sheet shows the stack, voices, and brains', async () => {
  await page.locator('#settings').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/settings-desktop.png` });

  const text = await page.locator('aside[role=dialog]').innerText();

  for (const needle of ['Deepgram Flux', 'Aura 2', 'Gemma 4', 'Luna']) if (!text.toLowerCase().includes(needle.toLowerCase())) throw new Error(`missing ${needle}`);

  await page.keyboard.press('Escape');
});

await scenario('every upstream call carried the account token through AI Gateway', async () => {
  const log = await (await fetch(`${FAKE}/__log`)).json();
  const unauthorized = log.filter((entry) => !entry.authorized);
  const kinds = new Set(log.map((entry) => (entry.method === 'WS' ? 'listen' : entry.path.split('/').pop())));

  if (unauthorized.length > 0) throw new Error(`${unauthorized.length} calls had no token`);

  for (const kind of ['listen', 'completions', 'aura-2-en']) if (!kinds.has(kind)) throw new Error(`no ${kind} call`);

  return { calls: log.length, kinds: [...kinds] };
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
    if (typeof payload === 'string') mobileFrames.push(JSON.parse(payload)._tag === 'Presence' ? `Presence:${JSON.parse(payload).presence}` : JSON.parse(payload)._tag);
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

await scenario('the phone layout renders asleep, then talks with a card on screen', async () => {
  await mobile.goto(BASE);
  await mobile.locator('#orb').waitFor();
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: `${SHOTS}/asleep-phone.png` });
  await mobile.locator('#orb').tap();
  await mobile.locator('[data-visual=weather]').waitFor({ timeout: 45000 }).catch((cause) => {
    throw new Error(`${cause.message.split('\n')[0]} frames: ${mobileFrames.join(' ')}`);
  });
  await mobile.waitForTimeout(1500);
  await mobile.screenshot({ path: `${SHOTS}/weather-phone.png` });

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
