const BASE = process.env.HARK_LOCAL ?? 'http://localhost:8791';
const FAKE = process.env.FAKE ?? 'http://127.0.0.1:8799';
const PROD = process.env.HARK_URL ?? 'https://hark.coey.dev';

type Push = { readonly path: string; readonly encoding: string; readonly vapid: boolean; readonly bytes: number; readonly at: number };

const post = (path: string, body: unknown) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((response) => response.json() as Promise<Record<string, unknown>>);
const pushes = () => fetch(`${FAKE}/__pushes`).then((response) => response.json() as Promise<Push[]>);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const outcomes: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = '') => outcomes.push({ name, ok, detail: detail.slice(0, 240) });

const key = await fetch(`${PROD}/push/key`, { redirect: 'manual' });
add('production does not hand the push key to strangers', key.status !== 200, String(key.status));

const device = `${FAKE}/push/l10-${Date.now()}`;
await post('/__routines', { subscribe: { endpoint: device, p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } });
const started = Date.now();
const set = (await post('/__routines', { clear: true, add: { task: 'check my workers and summarise', every: 120, times: 2 } })) as { added?: string };
add('the routine is set with no page open', /Every 2 minutes, 2 times/u.test(set.added ?? ''), set.added ?? '');

const deadline = started + 5 * 60_000;
let mine: Push[] = [];
while (Date.now() < deadline) {
  await pause(10_000);
  mine = (await pushes()).filter((push) => push.path.endsWith(device.split('/').at(-1) ?? '')).filter((push) => push.at >= started);
  if (mine.length >= 2) break;
}
const gaps = mine.map((push) => Math.round((push.at - started) / 1000));
add('the real Durable Object alarm fired twice, about 2 minutes apart, with no page open', mine.length === 2 && (gaps[0] ?? 0) >= 110 && (gaps[1] ?? 0) - (gaps[0] ?? 0) >= 110, `pushes at ${gaps.join('s, ')}s after setting`);
add('each push is aes128gcm and VAPID signed', mine.length > 0 && mine.every((push) => push.encoding === 'aes128gcm' && push.vapid && push.bytes > 100));
await pause(130_000);
const later = (await pushes()).filter((push) => push.path.endsWith(device.split('/').at(-1) ?? '')).length;
const left = (await post('/__routines', {})) as { routines?: unknown[]; schedules?: unknown[] };
add('it stops after two runs', later === 2 && (left.routines?.length ?? 1) === 0 && (left.schedules?.length ?? 1) === 0, `pushes ${later}, routines ${left.routines?.length}, alarms ${left.schedules?.length}`);

for (const outcome of outcomes) console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.name} ${outcome.detail}`);
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L10', passed, total: outcomes.length, gaps, where: 'real Durable Object alarms in local workerd; the push goes to a local push endpoint; a real phone push on production is asked of the owner', pass: passed === outcomes.length };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
