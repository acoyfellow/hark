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
    if (typeof payload === 'string' && payload.includes('"_tag":"SetGuard"')) frames.push({ at: Date.now(), frame: { _tag: 'SentSetGuard', payload } });
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

  if ((await page.locator('textarea, input[type=text]').filter({ visible: true }).count()) !== 0) throw new Error('found a text box');

  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/asleep-desktop.png` });
});

const woke = Date.now();

await scenario('tapping the ear opens the line to the account and starts listening', async () => {
  await page.locator('#orb').click();

  const ready = await waitFrame((frame) => frame._tag === 'Ready');

  await fetch(`${BASE}/__tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'panels', args: { action: 'delete_all' } }) });
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

await scenario('ten objects and one scene are built as 3D models, each held still for a screenshot', async () => {
  const kits = ['rocket', 'house', 'chair', 'car', 'tree', 'robot', 'snowman', 'castle', 'mug', 'plane'];
  if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
  const states = [];
  const box = await page.locator('#swarm').boundingBox();
  const clip = { x: box.x + box.width / 2 - 330, y: box.y + box.height / 2 - 330, width: 660, height: 660 };
  const ours = (value) => page.locator('#swarm').evaluate((node, wanted) => node.dataset.held === '1' && node.dataset.shaped === 'form' && (node.dataset.formBeats ?? '').includes(wanted), value);
  const capture = async (value, name, marker = value) => {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
      await runTool('show_form', { beats: [{ kind: 'model', seconds: 12, motion: 'still', value }], hold: true });
      await page.waitForTimeout(2600);
      const calm = attempt >= 10 || (await page.locator('#swarm').evaluate((node) => node.dataset.look !== 'speaking'));
      if (calm && (await ours(marker))) {
        await page.screenshot({ path: `${SHOTS}/model3d-${name}.png`, clip });
        if (await ours(marker)) return attempt;
      }
    }
    const seen = await page.locator('#swarm').evaluate((node) => `${node.dataset.look}|${node.dataset.shaped}|${node.dataset.held}|${(node.dataset.formBeats ?? '').slice(0, 80)}`);
    throw new Error(`${name} kept being replaced on screen: ${seen}`);
  };
  for (const kit of kits) states.push(await capture(kit, kit));
  states.push(await capture(JSON.stringify({ scene: [{ use: 'house', at: [-0.9, 0, -0.2] }, { use: 'tree', at: [1, 0, 0], scale: 0.8 }, { use: 'car', at: [0.1, -0.75, 0.7], scale: 0.45 }] }), 'scene', 'scene'));
  await runTool('show_form', { hold: false });
  return { kits: kits.length + 1, states };
});

await scenario('stay still holds a pink heart perfectly still, and a pink heart default survives a reload', async () => {
  const look = await page.locator('#swarm').getAttribute('data-look');
  if (look === 'asleep') await awake();
  const holdHeart = async () => {
    const held = await runTool('show_form', { hold: true, beats: [{ kind: 'solid', value: 'heart', seconds: 2, motion: 'still', tint: 'pink' }] });
    if (held.error !== undefined) throw new Error(held.error);
    await page.waitForFunction(() => document.querySelector('#swarm')?.dataset.held === '1', null, { timeout: 10000 });
    await page.waitForTimeout(4000);
  };
  const frame = async () => {
    const shot = (await page.screenshot({ type: 'png', clip: { x: 520, y: 160, width: 320, height: 300 } })).toString('base64');
    return page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const probe = document.createElement('canvas');
      probe.width = 96;
      probe.height = 60;
      const g = probe.getContext('2d');
      g.drawImage(image, 0, 0, 96, 60);
      return Array.from(g.getImageData(0, 0, 96, 60).data);
    }, shot);
  };
  const formId = () => page.evaluate(() => { const swarm = document.querySelector('#swarm'); return `${swarm?.dataset.formId}|${swarm?.dataset.paintId}|${swarm?.dataset.held}`; });
  let drift = Number.POSITIVE_INFINITY;
  let second = [];
  let tries = 0;
  for (; tries < 5 && drift === Number.POSITIVE_INFINITY; tries += 1) {
    await holdHeart();
    const before = await formId();
    const first = await frame();
    await page.waitForTimeout(5000);
    const after = await frame();
    if ((await formId()) !== before || !before.endsWith('|1')) continue;
    second = after;
    drift = first.reduce((total, value, index) => total + Math.abs(value - after[index]), 0) / first.length;
  }
  if (drift === Number.POSITIVE_INFINITY) throw new Error('never got a clean 5 s window: a scripted turn replaced the shape every try');
  await page.screenshot({ path: `${SHOTS}/held-pink-heart-desktop.png` });
  const state = await page.evaluate(() => { const swarm = document.querySelector('#swarm'); return `${swarm?.dataset.look} held=${swarm?.dataset.held} shaped=${swarm?.dataset.shaped}`; });
  if (drift > 6) throw new Error(`the held shape moved: mean pixel drift ${drift.toFixed(2)} (${state}, tries ${tries})`);
  const pinkish = Array.from({ length: second.length / 4 }, (_, at) => [second[at * 4], second[at * 4 + 1], second[at * 4 + 2]]).filter(([red, green, blue]) => red > 140 && blue > green + 20 && red > green + 40).length;
  if (pinkish < 20) throw new Error(`the heart is not pink (${pinkish} pink pixels)`);
  await page.screenshot({ path: `${SHOTS}/held-pink-heart-desktop.png` });
  if (!(await page.evaluate(() => document.querySelector('#swarm')?.dataset.held === '1'))) throw new Error('hold let go by itself');
  await runTool('show_form', { hold: false, beats: [] });
  await page.waitForFunction(() => document.querySelector('#swarm')?.dataset.held === '', null, { timeout: 10000 });
  await runTool('show_form', { idle: true, beats: [{ kind: 'solid', value: 'heart', seconds: 6, motion: 'still', tint: 'pink' }] });
  await page.waitForFunction(() => (document.querySelector('#swarm')?.dataset.idleBeats ?? '').includes('#ff5fa2'), null, { timeout: 10000 });
  await page.reload();
  await page.waitForTimeout(1500);
  await awake();
  await page.waitForFunction(() => (document.querySelector('#swarm')?.dataset.idleBeats ?? '') !== '[]', null, { timeout: 10000 }).catch(() => undefined);
  const idle = await page.evaluate(() => document.querySelector('#swarm')?.dataset.idleBeats ?? '');
  await runTool('show_form', { idle: true, beats: [] });
  if (!idle.includes('pink') && !idle.includes('#ff5fa2')) throw new Error(`the default did not survive a reload: ${idle.slice(0, 120)}`);
  return { drift: Number(drift.toFixed(2)), pinkish, tries };
});

await scenario('panels: six cards stack, the drawer lists them, and voice reopens, deletes and resizes', async () => {
  if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
  await runTool('panels', { action: 'delete_all' });
  for (let index = 1; index <= 6; index += 1) await runTool('remember', { fact: `panel fact ${index}` });
  await runTool('panels', { action: 'list' });
  await page.locator('#drawer').waitFor({ timeout: 10000 });
  const rows = () => page.locator('#drawer [data-panel]').evaluateAll((items) => items.map((item) => ({ id: item.getAttribute('data-panel'), open: item.getAttribute('data-panel-open') === '1', text: item.textContent ?? '' })));
  const before = await rows();
  if (before.length < 6) throw new Error(`drawer lists ${before.length} panels, wanted 6`);
  if (before.filter((row) => row.open).length > 4) throw new Error('more than four panels open at once');
  const second = await runTool('panels', { action: 'open', which: '2' });
  await page.waitForTimeout(400);
  const afterOpen = await rows();
  const reopened = afterOpen.find((row) => row.text.includes('panel fact 2'));
  if (reopened?.open !== true) throw new Error(`panel 2 did not reopen: ${second.content}`);
  await runTool('panels', { action: 'delete', which: '4' });
  await page.waitForTimeout(400);
  const afterDelete = await rows();
  if (afterDelete.some((row) => row.text.includes('panel fact 4'))) throw new Error('panel 4 is still listed');
  await runTool('panels', { action: 'resize', which: 'panel fact 2', size: 'large' });
  await page.waitForFunction(() => document.querySelector('[data-size=large]') !== null, null, { timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/panels-drawer-desktop.png` });
  const beforeClick = await rows();
  await page.locator('#drawer [aria-label^="Delete"]').first().click();
  await page.waitForTimeout(600);
  const afterClick = await rows();
  if (afterClick.length !== beforeClick.length - 1) throw new Error(`the trash button did not delete (${beforeClick.length} -> ${afterClick.length})`);
  await page.locator('#panels').click();
  await runTool('panels', { action: 'delete_all' });
  return { listed: before.length, open: before.filter((row) => row.open).length, after: afterClick.length };
});

await scenario('one tap on the tools button lists every tool, and asking what it can do opens the same list', async () => {
  await page.locator('#tools').click();
  await page.locator('#tool-count').waitFor({ timeout: 5000 });
  const count = await page.locator('#tool-count').textContent();
  const titles = await page.locator('[role=dialog], body').first().evaluate(() => document.body.innerText);
  for (const title of ['Shape the swarm', 'Your panels', 'Terminal', 'Cloudflare API', 'What I can do']) if (!titles.includes(title)) throw new Error(`tool list is missing ${title}`);
  await page.screenshot({ path: `${SHOTS}/tools-desktop.png` });
  const sheetOpen = () => page.locator('[data-sheet-open]').getAttribute('data-sheet-open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if ((await sheetOpen()) !== 'false') throw new Error('Escape did not close the tool list');
  if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
  const report = await runTool('capabilities', {});
  await page.waitForFunction(() => document.querySelector('[data-sheet-open]')?.getAttribute('data-sheet-open') === 'true' && document.querySelector('#tool-count') !== null, null, { timeout: 5000 });
  if (!/Limits:/u.test(report.content) || !/panels/u.test(report.content)) throw new Error(`capabilities did not report: ${report.content.slice(0, 200)}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[data-sheet-open]')?.getAttribute('data-sheet-open') === 'false', null, { timeout: 5000 });
  return { count };
});

await scenario('the durable computer runs a command and shows a terminal card', async () => {
  const result = await runTool('terminal', { command: 'cd /workspace && ls -la && node -v' });

  if (!/v\d+\./u.test(result.content)) throw new Error(`no node version in ${result.content.slice(0, 200)}`);

  await page.locator('[data-widget=terminal]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/terminal-desktop.png` });

  return { output: result.content.slice(0, 200) };
});

await scenario('the computer lists workers through hark and writes a summary; it holds no token, and a write is refused without biometrics', async () => {
  const before = await fetch(`${FAKE}/__log`).then((response) => response.json());
  const summary = await runTool('terminal', { command: 'cd /workspace && curl -s "$CF_API/accounts/$CF_ACCOUNT/workers/scripts" | jq -r ".result[].id" > workers.txt && wc -l < workers.txt && cat workers.txt' });
  if (!/pasta-timer/u.test(summary.content) || !/hark/u.test(summary.content)) throw new Error(`no workers listed: ${summary.content.slice(0, 300)}`);
  const after = await fetch(`${FAKE}/__log`).then((response) => response.json());
  const proxied = after.slice(before.length).filter((entry) => entry.path.endsWith('/workers/scripts'));
  if (proxied.length !== 1 || !proxied[0].authorized || proxied[0].path.includes('ACCOUNT_ID')) throw new Error(`the read did not go through hark with the real token: ${JSON.stringify(proxied)}`);
  const leak = await runTool('terminal', { command: 'env | grep -iE "token|secret|key|auth" ; true' });
  if (!/hark-proxy-adds-the-real-token/u.test(leak.content) || /local[^-]|Bearer/u.test(leak.content.replace('hark-proxy-adds-the-real-token', ''))) throw new Error(`the container env shows something: ${leak.content.slice(0, 300)}`);
  const write = await runTool('terminal', { command: 'curl -s -X DELETE "$CF_API/accounts/$CF_ACCOUNT/workers/scripts/pasta-timer"' });
  if (!/may only read/u.test(write.content)) throw new Error(`a write went through without biometrics: ${write.content.slice(0, 300)}`);
  const last = await fetch(`${FAKE}/__log`).then((response) => response.json());
  if (last.slice(after.length).some((entry) => entry.method === 'DELETE')) throw new Error('the DELETE reached Cloudflare');
  return { listed: summary.content.slice(0, 120) };
});

await scenario('a routine every 2 minutes is scheduled on the Durable Object, runs twice, keeps each result as a panel, pushes it encrypted, and stops', async () => {
  if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
  const routines = (body) => fetch(`${BASE}/__routines`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((response) => response.json());
  const key = await fetch(`${BASE}/push/key`).then((response) => response.text());
  if (key.length < 80) throw new Error(`no VAPID key: ${key}`);
  await routines({ subscribe: { endpoint: `${FAKE}/push/e2e-device`, p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } });
  await runTool('routines', { action: 'remove', which: 'all' });
  const added = await runTool('routines', { action: 'add', task: 'check my workers and summarise', every: '2 minutes', times: 2 });
  if (!/Set\. Every 2 minutes, 2 times/u.test(added.content)) throw new Error(`routine not set: ${added.content}`);
  const before = await routines({});
  if (before.schedules.length !== 1 || before.schedules[0].type !== 'interval') throw new Error(`no interval alarm: ${JSON.stringify(before.schedules)}`);
  const pushesBefore = await fetch(`${FAKE}/__pushes`).then((response) => response.json());
  await routines({ run: '1' });
  const middle = await routines({});
  await routines({ run: '1' });
  const after = await routines({});
  const pushes = (await fetch(`${FAKE}/__pushes`).then((response) => response.json())).slice(pushesBefore.length);
  if (middle.routines[0]?.runs !== 1) throw new Error(`first run not counted: ${JSON.stringify(middle.routines)}`);
  if (after.routines.length !== 0 || after.schedules.length !== 0) throw new Error(`the routine did not stop after two runs: ${JSON.stringify(after)}`);
  if (pushes.length !== 2 || !pushes.every((push) => push.encoding === 'aes128gcm' && push.vapid && push.bytes > 100)) throw new Error(`expected two encrypted pushes: ${JSON.stringify(pushes)}`);
  const panels = await runTool('panels', { action: 'list' });
  if ((panels.content.match(/check my workers/gu) ?? []).length < 2) throw new Error(`the two runs are not panels: ${panels.content.slice(0, 300)}`);
  return { pushes: pushes.length, alarm: before.schedules[0].type };
});

await scenario('their instructions: typed in the brain tab, kept across a reload, changed by voice, reset', async () => {
  if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
  await runTool('instructions', { action: 'reset' });
  await page.keyboard.press('Meta+k');
  await page.locator('[role=tab]', { hasText: 'Brain' }).click();
  await page.locator('#instructions').fill('Call me Captain.');
  await page.locator('#save-instructions').click();
  await page.waitForTimeout(500);
  const read = await runTool('instructions', { action: 'get' });
  if (!read.content.includes('Call me Captain.')) throw new Error(`typed instructions were not saved: ${read.content}`);
  await page.screenshot({ path: `${SHOTS}/instructions-desktop.png` });
  await page.keyboard.press('Escape');
  const added = await runTool('instructions', { action: 'add', text: 'Keep answers to one sentence.' });
  if (!added.content.includes('Call me Captain.') || !added.content.includes('one sentence')) throw new Error(`voice add lost text: ${added.content}`);
  await page.reload();
  await page.locator('#orb').click();
  await waitFrame((frame) => frame._tag === 'Instructions' && frame.text.includes('one sentence'), 15000, Date.now() - 1000);
  await runTool('instructions', { action: 'reset' });
  const cleared = await runTool('instructions', { action: 'get' });
  if (!/No instructions/u.test(cleared.content)) throw new Error(`reset did not clear: ${cleared.content}`);
  return { added: added.content.split('\n').length };
});

await scenario('biometrics for changes: turn on with a passkey, a write waits for one signature and runs once, a failed check stops it, turning off needs the passkey', async () => {
  if (new URL(BASE).hostname !== 'localhost') return { skipped: 'WebAuthn needs BASE on localhost' };
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  let lastRefused = '';
  let checked = '';
  const turnOff = async () => {
    await page.keyboard.press('Escape');
    if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
    await waitFrame((frame) => frame._tag === 'Guard' && frame.on === true, 15000, 0);
    const offAt = Date.now();
    await page.keyboard.press('Meta+k');
    await page.locator('[role=tab]', { hasText: 'Account' }).click();
    await page.waitForFunction(() => document.querySelector('[data-sheet-open]')?.getAttribute('data-sheet-open') === 'true', null, { timeout: 5000 });
    checked = String(await page.locator('#guard').getAttribute('aria-checked'));
    await page.locator('#guard').click();
    await waitFrame((frame) => frame._tag === 'Guard' && frame.on === false, 15000, offAt).catch((cause) => {
      const seen = frames.filter((each) => each.at >= offAt && String(each.frame._tag).startsWith('Passkey') || each.at >= offAt && (each.frame._tag === 'Guard' || each.frame._tag === 'SentSetGuard')).map((each) => JSON.stringify(each.frame).slice(0, 160));
      throw new Error(`${cause.message} after ${seen.join(' | ')} checked=${checked} refused=${lastRefused}`);
    });
    if (!frames.some((each) => each.at >= offAt && each.frame._tag === 'PasskeyAsk')) throw new Error('turning off did not ask for the passkey');
    await page.keyboard.press('Escape');
    await runTool('instructions', { action: 'reset' });
  };
  try {
    if ((await page.locator('#swarm').getAttribute('data-look')) === 'asleep') await awake();
    await runTool('instructions', { action: 'reset' });
    const started = Date.now();
    await page.keyboard.press('Meta+k');
    await page.locator('[role=tab]', { hasText: 'Account' }).click();
    await page.locator('#guard').click();
    await waitFrame((frame) => frame._tag === 'Guard' && frame.on === true, 15000, started);
    await page.screenshot({ path: `${SHOTS}/guard-on-desktop.png` });
    await page.keyboard.press('Escape');
    const asked = Date.now();
    const added = await runTool('instructions', { action: 'add', text: 'Signed rule.' });
    if (!added.content.includes('Signed rule.')) throw new Error(`signed write did not run: ${added.content}`);
    await waitFrame((frame) => frame._tag === 'PasskeyDone' && frame.ok, 5000, asked);
    const asks = frames.filter((each) => each.at >= asked && each.frame._tag === 'PasskeyAsk').length;
    const done = frames.filter((each) => each.at >= asked && each.frame._tag === 'PasskeyDone' && each.frame.ok).length;
    if (asks !== 1 || done !== 1) throw new Error(`expected one ask and one approval, saw ${asks} and ${done}`);
    const read = await runTool('instructions', { action: 'get' });
    if ((read.content.match(/Signed rule\./gu) ?? []).length !== 1) throw new Error('the signed write ran more than once');
    const deleteAt = Date.now();
    const computerWrite = await runTool('terminal', { command: 'curl -s -X DELETE "$CF_API/accounts/$CF_ACCOUNT/workers/scripts/pasta-timer"' });
    if (!/"success":\s*true/u.test(computerWrite.content)) throw new Error(`a signed computer write did not run: ${computerWrite.content.slice(0, 200)}`);
    if (!frames.some((each) => each.at >= deleteAt && each.frame._tag === 'PasskeyAsk' && /computer: DELETE/u.test(each.frame.summary))) throw new Error('the computer write did not stop at the passkey');
    const reads = await runTool('panels', { action: 'list' });
    if (/Not done/u.test(reads.content)) throw new Error('a read asked for the passkey');
    await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: false });
    const refusing = runTool('instructions', { action: 'reset' });
    await page.locator('#approval').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/approval-desktop.png` });
    await page.locator('#decline').click();
    const refused = await refusing;
    await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true });
    lastRefused = refused.content.slice(0, 120);
    if (!/Not done/u.test(refused.content)) throw new Error(`a declined approval still ran: ${refused.content}`);
    await turnOff();
    return { asks, done, refused: refused.content.slice(0, 80) };
  } catch (cause) {
    await turnOff().catch(() => undefined);
    throw cause;
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  }
});

await scenario('the settings sheet shows the stack, voices, and brains', async () => {
  await page.locator('#settings').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/settings-desktop.png` });

  let text = '';

  for (const tab of ['account', 'voice', 'brain', 'tools']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.locator(`[data-panel="${tab}"]`).waitFor();
    text += await page.locator('[role=dialog][aria-label=Settings]').innerText();
  }

  for (const needle of ['Sign out', 'Push notifications', 'Connect', 'Terminal']) if (!text.includes(needle) && !(needle === 'Sign out' && text.includes('Account'))) throw new Error(`missing ${needle}`);

  for (const needle of ['Deepgram Flux', 'Aura 1', 'Kimi K3', 'GPT-OSS 20B', 'Asteria', 'Quick', 'Rich']) if (!text.toLowerCase().includes(needle.toLowerCase())) throw new Error(`missing ${needle}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  if ((await page.locator('[data-sheet-open=true]').count()) !== 0) throw new Error('Esc did not close settings');
});

await scenario('every upstream call went straight to Workers AI with the account token', async () => {
  const log = await (await fetch(`${FAKE}/__log`)).json();
  const unauthorized = log.filter((entry) => !entry.authorized && entry.path !== '/');
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

await scenario('the phone never zooms or scrolls: double tap, pinch and swipe leave scale 1 and scroll 0', async () => {
  const orb = await mobile.locator('#orb').boundingBox();
  const x = orb.x + orb.width / 2;
  const y = orb.y + orb.height / 2;
  const session = await mobile.context().newCDPSession(mobile);
  const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });

  await mobile.touchscreen.tap(x, y);
  await mobile.touchscreen.tap(x, y);
  await touch('touchStart', [{ x: x - 20, y }, { x: x + 20, y }]);
  for (let step = 1; step <= 8; step += 1) await touch('touchMove', [{ x: x - 20 - step * 15, y }, { x: x + 20 + step * 15, y }]);
  await touch('touchEnd', []);
  await touch('touchStart', [{ x, y: y + 150 }]);
  for (let step = 1; step <= 8; step += 1) await touch('touchMove', [{ x, y: y + 150 - step * 40 }]);
  await touch('touchEnd', []);
  await mobile.mouse.wheel(0, 900);
  await mobile.waitForTimeout(600);

  const still = await mobile.evaluate(() => ({
    scale: window.visualViewport?.scale ?? 1,
    scrollTop: document.scrollingElement?.scrollTop ?? 0,
    scrollY: window.scrollY,
    viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '',
  }));

  if (still.scale !== 1 || still.scrollTop !== 0 || still.scrollY !== 0 || !still.viewport.includes('user-scalable=no')) throw new Error(JSON.stringify(still));

  await mobile.locator('#orb').tap();

  return still;
});

await scenario('the landing page offers Sign in with Cloudflare on desktop and phone', async () => {
  const landing = await context.newPage();

  await landing.goto(`${BASE}/?signed-out`);
  await landing.locator('#sign-in').waitFor();
  await landing.waitForTimeout(800);
  await landing.screenshot({ path: `${SHOTS}/landing-desktop.png` });
  await mobile.goto(`${BASE}/?signed-out`);
  await mobile.locator('#sign-in').waitFor();
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: `${SHOTS}/landing-phone.png`, fullPage: true });

  if ((await landing.locator('#sign-in').getAttribute('href')) !== '/oauth/login') throw new Error('sign-in does not start OAuth');
});

await scenario('Sign out in Settings leaves the app for the sign-in page', async () => {
  const leaving = await context.newPage();

  await leaving.goto(BASE);
  await leaving.locator('#settings').click();
  await leaving.locator('[data-tab="account"]').click();
  await leaving.locator('#sign-out').click();
  await leaving.waitForURL((url) => url.search === '?signed-out', { timeout: 10000 });
  await leaving.locator('#sign-in').waitFor({ timeout: 10000 });
  await leaving.close();
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
