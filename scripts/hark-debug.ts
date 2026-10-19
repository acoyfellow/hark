import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { speakToPcm, streamPcm } from './hark-debug/audio';
import { HarkSession, printTurn, type TurnReport } from './hark-debug/session';

const STATE_DIR = '.scratch/hark-debug';
const CONTROL = `${STATE_DIR}/control.sock`;
const PORT = Number(process.env.HARK_DEBUG_PORT ?? 8793);
const BASE = `http://localhost:${PORT}`;
const FAKE_ORIGIN = 'http://127.0.0.1:8799';

type Mode = 'fake' | 'live';

type Command = { op: 'say'; text: string; audio: boolean; interruptAfterMs?: number; followUp?: string } | { op: 'history' } | { op: 'reset' } | { op: 'stop' };

const deployedAccounts = () =>
  existsSync('deploy')
    ? readdirSync('deploy')
        .filter((name) => name.endsWith('.conf'))
        .flatMap((name) => [...readFileSync(`deploy/${name}`, 'utf8').matchAll(/[0-9a-f]{32}/gu)].map((match) => match[0]))
    : [];

export const testAccount = (): { account: string; token: string } | null => {
  const account = process.env.HARK_TEST_ACCOUNT_ID ?? '';
  const token = process.env.HARK_TEST_TOKEN ?? '';
  if (account === '' || token === '') return null;
  if (deployedAccounts().includes(account)) throw new Error('HARK_TEST_ACCOUNT_ID matches an account in deploy/*.conf. Use a separate test account.');
  return { account, token };
};

const waitForHttp = async (url: string, seconds: number) => {
  for (let tick = 0; tick < seconds; tick += 1) {
    const ok = await fetch(url).then((response) => response.ok).catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} did not come up in ${seconds} s`);
};

const startHark = async (mode: Mode) => {
  mkdirSync(STATE_DIR, { recursive: true });
  const persist = `${STATE_DIR}/state-${mode}`;
  stopHark();
  await fetch(`${BASE}/`).then(() => new Promise((resolve) => setTimeout(resolve, 2000))).catch(() => undefined);
  const vars = ['--var', 'LOCAL_DEV_WITHOUT_AUTH:1'];
  if (mode === 'fake') {
    vars.push('--var', `HARK_FAKE_ORIGIN:${FAKE_ORIGIN}`);
    if (!(await fetch(`${FAKE_ORIGIN}/__log`).then((response) => response.ok).catch(() => false))) {
      spawn('node', ['scripts/fake-cloudflare.mjs'], { detached: true, stdio: ['ignore', openSync(`${STATE_DIR}/fake.log`, 'w'), openSync(`${STATE_DIR}/fake.log`, 'a')] }).unref();
    }
  } else {
    const credentials = testAccount();
    if (credentials === null) throw new Error('live mode needs HARK_TEST_ACCOUNT_ID and HARK_TEST_TOKEN');
    vars.push('--var', `LOCAL_CF_ACCOUNT:${credentials.account}`, '--var', `LOCAL_CF_TOKEN:${credentials.token}`);
  }
  const log = openSync(`${STATE_DIR}/wrangler.log`, 'w');
  const child = spawn('npx', ['wrangler', 'dev', '--config', 'wrangler.local.jsonc', '--port', String(PORT), '--ip', '127.0.0.1', '--enable-containers=false', '--persist-to', persist, ...vars], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
  writeFileSync(`${STATE_DIR}/wrangler.pid`, String(child.pid));
  await waitForHttp(`${BASE}/`, 120);
};

export const ensureHark = async (mode: Mode) => {
  const up = await fetch(`${BASE}/`).then((response) => response.ok).catch(() => false);
  if (!up) await startHark(mode);
};

const stopHark = () => {
  const pidFile = `${STATE_DIR}/wrangler.pid`;
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8'));
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
  }
  rmSync(pidFile, { force: true });
};

export const runTurn = async (session: HarkSession, command: Extract<Command, { op: 'say' }>, live: { account: string; token: string } | null): Promise<TurnReport> => {
  const deliver = async () => {
    if (!command.audio) {
      session.send({ type: 'text_message', text: command.text });
      return;
    }
    if (live === null) throw new Error('--audio needs HARK_TEST_ACCOUNT_ID and HARK_TEST_TOKEN');
    const pcm = await speakToPcm(command.text, live);
    await session.speak(() => streamPcm(session, pcm));
  };
  if (command.interruptAfterMs === undefined || command.followUp === undefined) return session.turn(command.text, deliver);
  const interruption = command.followUp;
  const first = session.turn(command.text, deliver, 20_000);
  await new Promise((resolve) => setTimeout(resolve, command.interruptAfterMs));
  session.send({ type: 'interrupt' });
  const cut = await first;
  const second = await session.turn(interruption, async () => {
    if (!command.audio || live === null) session.send({ type: 'text_message', text: interruption });
    else {
      const pcm = await speakToPcm(interruption, live);
      await session.speak(() => streamPcm(session, pcm));
    }
  });
  return { ...second, said: `${command.text} ⟶ (after ${command.interruptAfterMs} ms) ${interruption}`, errors: [...second.errors], tools: [...cut.tools, ...second.tools], reply: `[cut: ${cut.reply.slice(0, 120)}] ${second.reply}` };
};

const serve = async (mode: Mode) => {
  const live = mode === 'live' ? testAccount() : null;
  const session = new HarkSession(BASE);
  await session.open();
  const history: TurnReport[] = [];
  rmSync(CONTROL, { force: true });
  const server = createServer((client) => {
    let buffer = '';
    client.on('data', async (chunk) => {
      buffer += String(chunk);
      if (!buffer.endsWith('\n')) return;
      const command = JSON.parse(buffer) as Command;
      buffer = '';
      if (command.op === 'stop') {
        client.end('stopped\n');
        session.close();
        server.close();
        stopHark();
        process.exit(0);
      }
      if (command.op === 'history') {
        client.end(`${history.map(printTurn).join('\n\n')}\n`);
        return;
      }
      if (command.op === 'reset') {
        client.end('reset\n');
        return;
      }
      const turn = await runTurn(session, command, live).catch((cause: unknown) => {
        console.error(cause);
        return null;
      });
      if (turn !== null) history.push(turn);
      client.end(`${turn === null ? 'failed' : `${printTurn(turn)}\n${JSON.stringify(turn)}`}\n`);
    });
  });
  server.listen(CONTROL);
};

const ask = (command: Command) =>
  new Promise<string>((resolve, reject) => {
    const client = connect(CONTROL);
    let out = '';
    client.on('data', (chunk) => {
      out += String(chunk);
    });
    client.on('end', () => resolve(out));
    client.on('error', reject);
    client.write(`${JSON.stringify(command)}\n`);
  });

const main = async () => {
  const [op, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
  const words = rest.filter((arg) => !arg.startsWith('--')).join(' ');
  const mode: Mode = flags.has('--live') || flags.has('--audio') ? 'live' : 'fake';
  if (op === 'serve') return serve(mode);
  if (op === 'start') {
    if (existsSync(CONTROL)) await ask({ op: 'stop' }).catch(() => undefined);
    await startHark(mode);
    const daemon = spawn(process.execPath, [process.argv[1] ?? 'scripts/hark-debug.ts', 'serve', ...(mode === 'live' ? ['--live'] : [])], { detached: true, stdio: ['ignore', openSync(`${STATE_DIR}/daemon.log`, 'w'), openSync(`${STATE_DIR}/daemon.log`, 'a')], env: process.env });
    daemon.unref();
    for (let tick = 0; tick < 40 && !existsSync(CONTROL); tick += 1) await new Promise((resolve) => setTimeout(resolve, 500));
    if (!existsSync(CONTROL)) throw new Error(`the session did not start; see ${STATE_DIR}/daemon.log`);
    console.log(`hark-debug ready (${mode}) on ${BASE}`);
    return;
  }
  if (op === 'say') {
    const out = await ask({ op: 'say', text: words, audio: flags.has('--audio') });
    console.log(flags.has('--json') ? out.split('\n').at(-2) : out.split('\n').slice(0, -2).join('\n'));
    return;
  }
  if (op === 'history' || op === 'stop') {
    console.log((await ask({ op })).trimEnd());
    return;
  }
  console.log('usage: bun scripts/hark-debug.ts start [--live] | say "<text>" [--audio] [--json] | history | stop');
};

if (import.meta.main) await main();
