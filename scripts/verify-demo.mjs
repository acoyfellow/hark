import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.VERIFY_PORT ?? 8795);
const AX_PORT = Number(process.env.FAKE_AX_PORT ?? 8798);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const AX = `http://127.0.0.1:${AX_PORT}`;
const STATE = '/tmp/hark-loop/verify-state';

const checks = {};
const notes = {};
const children = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const up = async (url, seconds) => {
  for (let i = 0; i < seconds; i += 1) {
    const ok = await fetch(url).then((response) => response.status < 500, () => false);

    if (ok) return true;

    await sleep(1000);
  }

  return false;
};

const start = (command, args, env = {}, logPath = null) => {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const sink = logPath === null ? null : createWriteStream(logPath);

  child.stdout.on('data', (chunk) => sink?.write(chunk));
  child.stderr.on('data', (chunk) => sink?.write(chunk));
  children.push(child);

  return child;
};

const check = async (name, run) => {
  try {
    const detail = await run();

    checks[name] = true;

    if (detail !== undefined) notes[name] = detail;
  } catch (error) {
    checks[name] = false;
    notes[name] = String(error?.message ?? error).slice(0, 400);
  }
};

const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const axLog = async () => (await fetch(`${AX}/__log`)).json();

rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });

if (!(await up(`http://127.0.0.1:${FAKE_PORT}/`, 1))) start('node', ['scripts/fake-cloudflare.mjs'], { FAKE_PORT: String(FAKE_PORT) });

start('node', ['scripts/fake-ax-mcp.mjs'], { FAKE_AX_PORT: String(AX_PORT) });
start('npx', [
  'wrangler', 'dev', '--config', 'wrangler.local.jsonc', '--port', String(PORT), '--ip', '127.0.0.1', '--inspector-port', '9333',
  '--persist-to', STATE, '--var', 'LOCAL_DEV_WITHOUT_AUTH:1', '--var', `HARK_FAKE_ORIGIN:http://127.0.0.1:${FAKE_PORT}`,
], {}, '/tmp/hark-loop/verify-dev.log');

const ready = (await up(`${AX}/__log`, 20)) && (await up(`${BASE}/manifest.webmanifest`, 600));

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage();
const pageErrors = [];

page.on('pageerror', (error) => pageErrors.push(String(error.message)));

const tool = async (name, args) => {
  const response = await fetch(`${BASE}/__tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, args }) });

  return response.json();
};

const openPage = async () => {
  await page.goto(BASE);
  await page.locator('#orb').click();
  await page.waitForFunction(() => { const label = document.querySelector('#presence')?.textContent ?? ''; return label !== '' && !/tap to talk|waking/iu.test(label); }, null, { timeout: 60_000 });
  await sleep(1000);
};

await check('dev server came up', async () => must(ready, 'dev server or fake ax did not start'));

await check('voice history table exists on a fresh Durable Object', async () => {
  await openPage();

  const before = await page.evaluate(() => document.body.innerText);

  must(!/cf_voice_messages/u.test(before), 'saw cf_voice_messages on a fresh object');
});

await check('voice history table exists on a reused Durable Object', async () => {
  await page.reload();
  await openPage();
  await sleep(1500);

  const text = await page.evaluate(() => document.body.innerText);

  must(!/cf_voice_messages|SQLITE_ERROR/u.test(text), 'saw the missing table on reload');
});

await check('authless MCP server connects and lists names only', async () => {
  const connected = await tool('mcp', { action: 'connect', name: 'axfake', url: `${AX}/mcp` });

  notes.connectNote = connected.content?.slice(0, 200);

  const list = await tool('mcp', { action: 'list' });

  must(typeof list.content === 'string', 'no list content');
  must(!/inputSchema|"properties"/u.test(list.content), 'list carries schemas');

  return list.content.slice(0, 200);
});

let authUrl = null;

await check('OAuth MCP server goes to authenticating with a sign-in link in Settings', async () => {
  await page.keyboard.press('Meta+k');
  await page.locator('[data-tab="tools"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('a')].some((a) => a.textContent === 'Sign in' && a.href.includes('/authorize')), null, { timeout: 20_000 });
  authUrl = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.textContent === 'Sign in' && a.href.includes('/authorize'))?.href ?? null);
  must(authUrl !== null, 'no sign-in link');

  const url = new URL(authUrl);

  must(url.searchParams.get('code_challenge_method') === 'S256', 'no PKCE S256');
  must(/^http:\/\/127\.0\.0\.1:[0-9]{4,5}\/(oauth\/)?callback$/u.test(url.searchParams.get('redirect_uri') ?? ''), `redirect ${url.searchParams.get('redirect_uri')} is not the loopback callback`);
  must(url.searchParams.get('resource') === AX, `resource was ${url.searchParams.get('resource')}`);

  return { redirect: url.searchParams.get('redirect_uri'), resource: url.searchParams.get('resource') };
});

await check('finishing sign-in makes the server ready with its tools', async () => {
  must(authUrl !== null, 'no sign-in link to follow');

  const signIn = await browser.newPage();

  await signIn.goto(authUrl);
  await sleep(1500);
  await signIn.close();
  await page.keyboard.press('Escape');

  const list = await tool('mcp', { action: 'list' });

  must(/jira_get_issue/u.test(list.content) && /request_person/u.test(list.content), `tools not listed: ${list.content}`);

  const described = await tool('mcp', { action: 'describe', server: 'axfake', tool: 'jira_get_issue' });

  must(/"key"/u.test(described.content), 'describe did not return the schema');
});

await check('a tool call carries the bearer token and the origin resource', async () => {
  const before = (await axLog()).filter((entry) => entry.kind === 'tools/call').length;
  const called = await tool('mcp', { action: 'call', server: 'axfake', tool: 'jira_get_issue', args: { key: 'DEMO-1' } });
  const after = (await axLog()).filter((entry) => entry.kind === 'tools/call');

  must(/jira_get_issue ok/u.test(called.content ?? ''), `call failed: ${called.content}`);
  must(after.length === before + 1 && after.at(-1).authorized === true, 'fake did not see one authorized call');
});

await check('a redirect not on the allowlist fails clearly', async () => {
  const response = await fetch(`${AX}/authorize?client_id=nobody&redirect_uri=${encodeURIComponent('https://evil.example/cb')}&code_challenge_method=S256`, { redirect: 'manual' });
  const text = await response.text();

  must(response.status === 400 && /allowlist/u.test(text), `got ${response.status}`);
});

await check('an expired token sends the server back to authenticating', async () => {
  await fetch(`${AX}/__expire`);

  const called = await tool('mcp', { action: 'call', server: 'axfake', tool: 'request_person', args: { name: 'Ada' } });

  must(/sign in again|Settings/u.test(called.content ?? ''), `no re-auth note: ${called.content}`);

  return called.content;
});

await check('the coding workspace opens with a file tree and a live terminal', async () => {
  await tool('terminal', { command: 'mkdir -p demo && echo "console.log(42)" > demo/hello.js && echo ok' });
  await page.evaluate(() => document.querySelector('#open-workspace')?.click());
  await page.locator('#workspace').waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('[data-path="demo/hello.js"]') !== null, null, { timeout: 60_000 });
  await page.locator('[data-path="demo/hello.js"]').click();
  await page.waitForFunction(() => document.querySelector('#workspace-code')?.textContent?.includes('console.log(42)'), null, { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector('#workspace-terminal')?.dataset.terminal === 'live', null, { timeout: 60_000 });
  await page.locator('#workspace-terminal').click();
  await sleep(1500);
  await page.keyboard.type('echo hark-terminal-$((40+2))\n');
  await page.waitForFunction(() => document.querySelector('#workspace-terminal')?.textContent?.includes('hark-terminal-42'), null, { timeout: 20_000 });
  await page.screenshot({ path: 'receipts/shots/workspace-desktop.png' });
});

await check('open_computer by voice opens the workspace on a file', async () => {
  await page.keyboard.press('Escape');
  await page.locator('#workspace').waitFor({ state: 'detached', timeout: 5000 });
  await tool('open_computer', { path: 'demo/hello.js' });
  await page.waitForFunction(() => document.querySelector('#workspace-code')?.textContent?.includes('console.log(42)'), null, { timeout: 20_000 });
});

await check('no uncaught page errors', async () => must(pageErrors.length === 0, pageErrors.join(' | ')));

await browser.close();

for (const child of children) child.kill('SIGTERM');

const passed = Object.values(checks).every(Boolean);

mkdirSync('receipts', { recursive: true });
writeFileSync('receipts/demo-verify.json', `${JSON.stringify({ at: new Date().toISOString(), against: 'local fakes (fake-cloudflare, fake-ax-mcp)', passed, checks, notes }, null, 2)}\n`);

for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : `: ${notes[name]}`}`);
console.log(passed ? 'demo verified' : 'demo NOT verified');
process.exit(passed ? 0 : 1);
