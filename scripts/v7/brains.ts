import { writeFileSync } from 'node:fs';
import type { ChatMessage } from '../../src/chat';
import { systemPrompt } from '../../src/prompt';
import { reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import { TOOLS, toolSchemas } from '../../src/tools';
import { shapeToolCall } from '../../src/tool-call-shape';

type Case = { readonly said: string; readonly want: readonly string[]; readonly never?: readonly string[] };

const NOTHING: readonly string[] = [];

const CASES: readonly Case[] = [
  { said: 'what is the weather in Boston', want: ['web_search'] },
  { said: 'set a timer for five minutes', want: ['set_timer'] },
  { said: 'remember that I like jazz', want: ['remember'], never: ['instructions'] },
  { said: 'my name is spelled Coeyman not Cooyman, fix that memory', want: ['remember'], never: ['instructions'] },
  { said: 'forget that I like jazz', want: ['forget'], never: ['instructions'] },
  { said: 'who was Ada Lovelace', want: ['look_up'] },
  { said: 'how are you doing today', want: NOTHING, never: ['look_up', 'imagine', 'show_form'] },
  { said: 'thanks, that is all', want: NOTHING, never: ['look_up', 'imagine', 'show_form'] },
  { said: 'show me a heart', want: ['show_form'] },
  { said: 'paint a lighthouse in a storm', want: ['imagine'] },
  { said: 'from now on always answer in one sentence', want: ['instructions'] },
  { said: 'what can you do', want: ['capabilities'] },
  { said: 'list my workers', want: ['cloudflare'] },
  { said: 'run ls in the terminal', want: ['terminal'] },
  { said: 'close all the panels', want: ['panels'] },
  { said: 'every morning at eight tell me the weather', want: ['routines'] },
  { said: 'what time is it', want: NOTHING, never: ['look_up'] },
  { said: 'goodbye', want: ['rest'] },
  { said: 'uh the um motocross thing', want: NOTHING, never: ['look_up', 'imagine'] },
  { said: 'what do you remember about me', want: NOTHING, never: ['instructions', 'look_up'] },
];

const BRAINS = (process.env.BRAINS ?? '@cf/daily-co/phonellm-mini-alpha-2,@cf/deepseek-ai/deepseek-v4-flash-0731,@cf/openai/gpt-oss-120b,@cf/zai-org/glm-5.3-flash').split(',');

const account = process.env.HARK_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';

const chatFor = (brain: string): ReplyPorts['chat'] => async (messages, signal) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: brain, messages, tools: toolSchemas(), stream: true, max_tokens: 1200, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
    signal,
  });
  if (!response.ok || response.body === null) throw new Error(`chat ${response.status} ${(await response.text()).slice(0, 160)}`);
  return response.body;
};

const judge = (each: Case, called: readonly string[]) => {
  const forbidden = (each.never ?? []).filter((name) => called.includes(name));
  const missing = each.want.filter((name) => !called.includes(name));
  const extra = each.want.length === 0 && called.some((name) => name !== 'remember' && name !== 'rest');
  const looped = called.length > 3;
  return forbidden.length === 0 && missing.length === 0 && !extra && !looped;
};

const turn = async (brain: string, each: Case) => {
  const called: string[] = [];
  const spoken: string[] = [];
  const ports: ReplyPorts = {
    chat: chatFor(brain),
    label: (call) => call.name,
    tool: async (call) => {
      const name = shapeToolCall(call.name, {}, TOOLS.map((tool) => tool.name)).name;
      called.push(name);
      return name === 'rest' ? { content: 'Going to sleep.', sleep: true } : { content: `${call.name} done.` };
    },
    doing: () => undefined,
    show: () => undefined,
    fail: () => undefined,
  };
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt({ now: new Date(), timeZone: 'America/New_York', locale: 'en-US', memories: ['Their name is Jordan Cooyman.', 'They like jazz.'], camera: false, firstTurn: false }) },
    { role: 'user', content: each.said },
  ];
  const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
  const started = Date.now();
  let firstAt: number | null = null;
  for await (const piece of reply(ports, history, AbortSignal.timeout(45_000), result)) {
    firstAt ??= Date.now();
    spoken.push(piece);
  }
  return { said: each.said, ok: judge(each, called) && result.error === null, called, firstMs: firstAt === null ? null : firstAt - started, totalMs: Date.now() - started, error: result.error, spoke: spoken.join('').slice(0, 140) };
};

const median = (values: readonly number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
};

const report = [];
for (const brain of BRAINS) {
  const turns = [];
  for (const each of CASES) turns.push(await turn(brain, each).catch((cause: unknown) => ({ said: each.said, ok: false, called: [], firstMs: null, totalMs: 0, error: String(cause).slice(0, 160), spoke: '' })));
  const passed = turns.filter((each) => each.ok).length;
  const firstMs = median(turns.flatMap((each) => (each.firstMs === null ? [] : [each.firstMs])));
  const totalMs = median(turns.map((each) => each.totalMs));
  console.log(`${brain}: ${passed}/${CASES.length} first-text median ${firstMs} ms, turn median ${totalMs} ms`);
  for (const each of turns.filter((t) => !t.ok)) console.log(`   ✗ "${each.said}" called [${each.called.join(',')}] ${each.error ?? ''} said: ${each.spoke}`);
  report.push({ brain, passed, of: CASES.length, firstTextMedianMs: firstMs, turnMedianMs: totalMs, turns });
}

writeFileSync('receipts/v7-brains.json', `${JSON.stringify({ at: new Date().toISOString(), measured: 'real Workers AI brains through the real reply loop; tools stubbed; text in, no audio', report }, null, 2)}\n`);
