import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { HarkSession, printTurn, type TurnReport } from './hark-debug/session';
import { ensureHark, runTurn, testAccount } from './hark-debug';

type Expect = {
  tools?: string[];
  never?: string[];
  args?: Record<string, string>;
  max_tools?: number;
  no_passkey?: boolean;
  no_false_done?: boolean;
  sleeps?: boolean;
  reply_matches?: string;
  reply_not?: string;
  max_first_words_ms?: number;
};

type Turn = { user: string; interrupt_after_ms?: number; then?: string; expect?: Expect };

type Scenario = { name: string; turns: Turn[]; audio?: boolean };

type ScenarioFile = { name: string; scenarios: Scenario[] };

const FALSE_DONE = new RegExp(String.raw`\b(?:done|forgotten|removed|deleted|cleared|let go of|saved|closed)\b`, 'iu');

const MS_PER_SPOKEN_CHAR = 70;

const PAUSE_AFTER_HARK_MS = 1500;

const listenAfter = (turn: TurnReport) => Math.min(20_000, turn.reply.length * MS_PER_SPOKEN_CHAR + PAUSE_AFTER_HARK_MS);

const regex = (source: string) => (source.startsWith('(?i)') ? new RegExp(source.slice(4), 'iu') : new RegExp(source, 'u'));

export const failures = (turn: TurnReport, expect: Expect): string[] => {
  const called = turn.tools.map((step) => step.name);
  const problems: string[] = [];
  if (expect.tools !== undefined) {
    if (expect.tools.length === 0 && called.some((name) => name !== 'remember')) problems.push(`expected no tools, called [${called.join(', ')}]`);
    for (const name of expect.tools) if (!called.includes(name)) problems.push(`did not call ${name} (called [${called.join(', ')}])`);
  }
  for (const name of expect.never ?? []) if (called.includes(name)) problems.push(`called ${name}, which it must not`);
  for (const [name, needle] of Object.entries(expect.args ?? {})) {
    const step = turn.tools.find((each) => each.name === name);
    if (step !== undefined && !step.args.includes(needle)) problems.push(`${name} arguments lack "${needle}": ${step.args.slice(0, 160)}`);
  }
  if (expect.max_tools !== undefined && called.length > expect.max_tools) problems.push(`called ${called.length} tools, more than ${expect.max_tools}: [${called.join(', ')}]`);
  if (expect.no_passkey === true && turn.passkeyAsked) problems.push('asked for a passkey');
  if (expect.no_false_done === true && called.length === 0 && FALSE_DONE.test(turn.reply)) problems.push(`claimed it was done with no tool: "${turn.reply.slice(0, 120)}"`);
  if (expect.sleeps === true && !turn.slept) problems.push('did not go to sleep');
  if (expect.reply_matches !== undefined && !regex(expect.reply_matches).test(turn.reply)) problems.push(`reply does not match /${expect.reply_matches}/: "${turn.reply.slice(0, 160)}"`);
  if (expect.reply_not !== undefined && regex(expect.reply_not).test(turn.reply)) problems.push(`reply matches /${expect.reply_not}/: "${turn.reply.slice(0, 160)}"`);
  if (expect.max_first_words_ms !== undefined && (turn.firstReplyMs ?? Infinity) > expect.max_first_words_ms) problems.push(`first words took ${turn.firstReplyMs} ms`);
  const fatal = turn.errors.filter((error) => !error.startsWith('Not done'));
  if (fatal.length > 0) problems.push(`errors: ${fatal.join(' | ').slice(0, 200)}`);
  return problems;
};

const loadScenarios = (paths: string[]): { file: string; scenario: Scenario }[] =>
  paths.flatMap((path) => {
    const files = path.endsWith('.yaml') ? [path] : readdirSync(path).filter((name) => name.endsWith('.yaml')).map((name) => `${path}/${name}`);
    return files.flatMap((file) => {
      const parsed = parse(readFileSync(file, 'utf8')) as ScenarioFile;
      return parsed.scenarios.map((scenario) => ({ file: parsed.name, scenario }));
    });
  });

const resetHark = async (base: string) => {
  await fetch(`${base}/__tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'panels', args: { action: 'delete_all' } }) }).catch(() => undefined);
  await fetch(`${base}/__reset`, { method: 'POST' }).catch(() => undefined);
};

const main = async () => {
  const args = process.argv.slice(2);
  const audio = args.includes('--audio');
  const base = process.env.HARK_DEBUG_BASE ?? `http://localhost:${process.env.HARK_DEBUG_PORT ?? 8793}`;
  const out = args.find((arg) => arg.startsWith('--out='))?.slice(6) ?? `receipts/hark-eval-${audio ? 'audio' : 'text'}.json`;
  const only = args.find((arg) => arg.startsWith('--only='))?.slice(7);
  const paths = args.filter((arg) => !arg.startsWith('--'));
  const live = testAccount();
  if (audio && live === null) throw new Error('--audio needs HARK_TEST_ACCOUNT_ID and HARK_TEST_TOKEN');
  const results = [];
  for (const { file, scenario } of loadScenarios(paths.length > 0 ? paths : ['scenarios'])) {
    const id = `${file}/${scenario.name}`;
    if (only !== undefined && !id.includes(only)) continue;
    await ensureHark(live === null ? 'fake' : 'live');
    await resetHark(base);
    const session = new HarkSession(base);
    const turns = [];
    let ok = true;
    try {
      await session.open();
      for (const turn of scenario.turns) {
        const report = await runTurn(session, { op: 'say', text: turn.user, audio: audio || scenario.audio === true, interruptAfterMs: turn.interrupt_after_ms, followUp: turn.then }, live);
        const problems = turn.expect === undefined ? [] : failures(report, turn.expect);
        ok &&= problems.length === 0;
        turns.push({ report, problems });
        await session.waitIdle(audio || scenario.audio === true ? listenAfter(report) : 800);
      }
    } catch (cause) {
      ok = false;
      turns.push({ report: null, problems: [String(cause)] });
    } finally {
      session.close();
    }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}`);
    if (!ok)
      for (const [index, each] of turns.entries()) {
        if (each.problems.length === 0) continue;
        console.log(`   turn ${index + 1}: ${each.problems.join('; ')}`);
        if (each.report !== null) console.log(printTurn(each.report).replaceAll(/^/gmu, '      '));
      }
    results.push({ id, ok, turns });
  }
  const passed = results.filter((result) => result.ok).length;
  console.log(`${passed}/${results.length} scenarios passed (${audio ? 'audio: Aura speech into the real socket, Flux transcribes' : 'text: typed into the real socket, no speech'})`);
  mkdirSync('receipts', { recursive: true });
  writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), mode: audio ? 'audio' : 'text', backend: live === null ? 'fake Cloudflare (scripted model)' : 'real Workers AI on the test account', passed, of: results.length, results }, null, 2)}\n`);
  process.exit(passed === results.length ? 0 : 1);
};

await main();
