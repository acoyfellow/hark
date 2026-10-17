import { DEFAULT_BRAIN } from '../../shared/protocol';
import type { ChatMessage } from '../../src/chat';
import { systemPrompt } from '../../src/prompt';
import { reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import type { ToolCall } from '../../src/sse';
import { toolSchemas } from '../../src/tools';

type Args = { hold?: boolean; idle?: boolean; beats?: { kind?: string; value?: string; motion?: string; tint?: string }[] };

type Case = { readonly prompt: string; readonly check: (calls: readonly Args[]) => boolean };

const PINK = /pink|#ff5fa2|#ff[0-9a-f]{2}[a-f0-9]{2}/iu;

const CASES: readonly Case[] = [
  { prompt: 'make a heart and stay perfectly still', check: (calls) => calls.some((args) => args.hold === true && (args.beats ?? []).some((beat) => beat.motion === 'still')) },
  { prompt: 'go solid, hold that shape', check: (calls) => calls.some((args) => args.hold === true) },
  { prompt: 'show a star and keep it there, do not move', check: (calls) => calls.some((args) => args.hold === true) },
  { prompt: 'make a perfectly still pink heart your default state', check: (calls) => calls.some((args) => args.idle === true && (args.beats ?? []).some((beat) => PINK.test(beat.tint ?? '') && beat.motion === 'still')) },
  { prompt: 'show me a blue circle', check: (calls) => calls.some((args) => (args.beats ?? []).some((beat) => /blue|#[0-9a-f]{6}/iu.test(beat.tint ?? ''))) },
  { prompt: 'ok you can move again', check: (calls) => calls.some((args) => args.hold === false) },
];

const account = process.env.HARK_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const brain = process.env.HARK_BRAIN ?? DEFAULT_BRAIN;

const chat: ReplyPorts['chat'] = async (messages, signal) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: brain, messages, tools: toolSchemas(), stream: true, max_tokens: 2000, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
    signal,
  });
  if (!response.ok || response.body === null) throw new Error(`chat ${response.status}`);
  return response.body;
};

const parse = (call: ToolCall): Args => {
  try {
    return JSON.parse(call.arguments) as Args;
  } catch {
    return {};
  }
};

const turn = async ({ prompt, check }: Case) => {
  const calls: Args[] = [];
  const ports: ReplyPorts = {
    chat,
    label: (call) => call.name,
    tool: async (call) => {
      if (call.name === 'show_form') calls.push(parse(call));
      return { content: 'Done. Do not describe it.' };
    },
    doing: () => undefined,
    show: () => undefined,
    fail: () => undefined,
  };
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt({ now: new Date(), timeZone: 'America/New_York', locale: 'en-US', memories: [], camera: false, firstTurn: false }) },
    { role: 'user', content: prompt },
  ];
  const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
  for await (const _ of reply(ports, history, AbortSignal.timeout(60_000), result)) void _;
  return { prompt, ok: check(calls), calls: calls.map((args) => JSON.stringify(args).slice(0, 160)) };
};

const outcomes = [];
for (const each of CASES) {
  const outcome = await turn(each).catch((cause: unknown) => ({ prompt: each.prompt, ok: false, calls: [String(cause).slice(0, 80)] }));
  outcomes.push(outcome);
  console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.prompt} -> ${outcome.calls.join(' ; ').slice(0, 200)}`);
}
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L3', brain, passed, total: outcomes.length, pass: passed >= outcomes.length - 1 };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
