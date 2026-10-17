const BASE = process.env.HARK_URL ?? 'https://hark.coey.dev';

const outcomes: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = '') => outcomes.push({ name, ok, detail: detail.slice(0, 200) });

const proxy = await fetch(`${BASE}/client/v4/accounts/ACCOUNT_ID/workers/scripts`);
add('the public site does not serve the computer proxy', proxy.status === 404 || proxy.status === 302 || proxy.status === 401 || proxy.status === 403, String(proxy.status));

const internal = await fetch('http://cloudflare.hark.internal/client/v4/user').then((response) => `reached ${response.status}`).catch((cause: unknown) => `unreachable ${String(cause).slice(0, 60)}`);
add('the proxy host only exists inside the container', internal.startsWith('unreachable'), internal);

const env = await import('../../src/shell-env');
add('the shell has a placeholder, not a token', env.SHELL_ENV.CLOUDFLARE_API_TOKEN === 'hark-proxy-adds-the-real-token' && !Object.values(env.SHELL_ENV).some((value) => value.length >= 40));

const account = process.env.HARK_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const real = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json() as Promise<{ success: boolean; result?: { id: string }[] }>);
add('a real workers list exists on the account the proxy reads', real.success && (real.result?.length ?? 0) > 0, `${real.result?.length ?? 0} workers`);

const e2e = JSON.parse(await Bun.file('receipts/e2e-local.json').text()) as { results?: { name: string; ok?: boolean; pass?: boolean }[] };
const scenario = (needle: string) => e2e.results?.find((each) => each.name.includes(needle));
const listed = scenario('the computer lists workers through hark');
add('local container: list workers and write a summary, read only, no prompt', listed !== undefined && (listed.ok ?? listed.pass ?? false));
const guarded = scenario('biometrics for changes');
add('local container: a write stops at the passkey and runs once signed', guarded !== undefined && (guarded.ok ?? guarded.pass ?? false));

for (const outcome of outcomes) console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.name} ${outcome.detail}`);
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L8', passed, total: outcomes.length, realContainer: 'local Docker against the fake API; production container check is asked of the owner', pass: passed === outcomes.length };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
