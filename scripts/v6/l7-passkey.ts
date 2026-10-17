import { Approvals, callChallenge, toBase64Url, verifyAssertion } from '../../src/passkey';
import { runTool, type ToolHost } from '../../src/tools';

const BASE = process.env.HARK_URL ?? 'https://hark.coey.dev';
const ORIGIN = new URL(BASE).origin;
const RP = new URL(BASE).hostname;

const sha = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const stored = { credential: 'c', publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))), counter: 0 };
let counter = 0;

const sign = async (challenge: string) => {
  counter += 1;
  const clientBytes = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge, origin: ORIGIN }));
  const authenticator = new Uint8Array(37);
  authenticator.set(await sha(new TextEncoder().encode(RP)), 0);
  authenticator[32] = 0x05;
  new DataView(authenticator.buffer).setUint32(33, counter);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new Uint8Array([...authenticator, ...(await sha(clientBytes))])));
  return { clientData: toBase64Url(clientBytes), authenticator: toBase64Url(authenticator), signature: toBase64Url(signature) };
};

const approvals = new Approvals();
const ran: string[] = [];
let mode: 'sign' | 'replay' | 'late' | 'other' = 'sign';
let last: Awaited<ReturnType<typeof sign>> | null = null;

const approve: NonNullable<ToolHost['approve']> = async (call) => {
  const id = crypto.randomUUID();
  const challenge = await callChallenge(call, id);
  approvals.begin(id, { purpose: 'approve', challenge, expires: mode === 'late' ? Date.now() - 1 : Date.now() + 60_000, summary: '' });
  const signed = mode === 'replay' && last !== null ? last : await sign(mode === 'other' ? await callChallenge({ ...call, args: { ...call.args, path: '/other' } }, id) : challenge);
  last = signed;
  const claim = approvals.claim(id, Date.now());
  if (!claim.ok) return claim.problem;
  const verdict = await verifyAssertion({ ...signed, challenge: claim.pending.challenge, origin: ORIGIN, rpId: RP, stored });
  if (verdict.ok) stored.counter = verdict.counter;
  return verdict.ok ? null : verdict.problem;
};

const host = {
  approve,
  cloudflare: async (method: string, path: string) => {
    ran.push(`${method} ${path}`);
    return { status: 200, body: '{"success":true}' };
  },
} as unknown as ToolHost;

const write = { method: 'DELETE', path: '/accounts/x/workers/scripts/pasta-timer' };
const outcomes: { name: string; ok: boolean; detail: string }[] = [];
const check = async (name: string, set: typeof mode, args: Record<string, unknown>, shouldRun: boolean) => {
  mode = set;
  const before = ran.length;
  const result = await runTool('cloudflare', args, host);
  const didRun = ran.length > before;
  outcomes.push({ name, ok: didRun === shouldRun, detail: result.content.slice(0, 120) });
};

await check('read runs without a passkey', 'sign', { method: 'GET', path: '/accounts/x/workers/scripts' }, true);
await check('signed write runs once', 'sign', { ...write, confirmed: true }, true);
await check('replayed signature is refused', 'replay', { ...write, confirmed: true }, false);
await check('late signature is refused', 'late', { ...write, confirmed: true }, false);
await check('signature for another call is refused', 'other', { ...write, confirmed: true }, false);

const page = await fetch(BASE).then((response) => response.text());
outcomes.push({ name: 'sign-in page says the passkey is shipped', ok: page.includes('A passkey for anything that changes things') && !page.includes('>Planned<'), detail: '' });
const docs = await fetch(`${BASE}/docs`).then((response) => response.text());
outcomes.push({ name: 'docs describe Biometrics for changes', ok: docs.includes('Biometrics for changes'), detail: '' });

for (const outcome of outcomes) console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.name} ${outcome.detail}`);
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L7', passed, total: outcomes.length, writes: ran.filter((each) => each.startsWith('DELETE')).length, realDevice: 'asked of the owner, not faked', pass: passed === outcomes.length };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
