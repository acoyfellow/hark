import { DEFAULT_BRAIN } from '../../shared/protocol';
import type { ChatMessage } from '../../src/chat';
import { systemPrompt } from '../../src/prompt';
import { reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import type { ToolCall } from '../../src/sse';
import { toolSchemas } from '../../src/tools';
import { shapeToolCall } from '../../src/tool-call-shape';
import { TOOLS } from '../../src/tools';

type Args = { action?: string; which?: string; size?: string };

const LIST = '1. Lisbon forecast (report, open)\n2. Ada Lovelace (article)\n3. Lighthouse in a storm (image, open)\n4. Deploy report (report, open)\n5. Tea timer (timer)';

const CASES: readonly { prompt: string; ok: (calls: readonly Args[]) => boolean }[] = [
  { prompt: 'show me my panels', ok: (calls) => calls.some((args) => args.action === 'list') && !calls.some((args) => args.action === 'open') },
  { prompt: 'open the forecast again', ok: (calls) => calls.some((args) => args.action === 'open' && /forecast|lisbon|1/iu.test(args.which ?? '')) },
  { prompt: 'delete number two', ok: (calls) => calls.some((args) => args.action === 'delete' && /2|two|ada/iu.test(args.which ?? '')) },
  { prompt: 'make the lighthouse bigger', ok: (calls) => calls.some((args) => args.action === 'resize' && args.size === 'large') },
  { prompt: 'make that one smaller', ok: (calls) => calls.some((args) => args.action === 'resize' && args.size === 'small') },
  { prompt: 'close all the panels', ok: (calls) => calls.some((args) => args.action === 'close_all') },
  { prompt: 'pin the deploy report', ok: (calls) => calls.some((args) => args.action === 'pin' && /deploy|4/iu.test(args.which ?? '')) },
  { prompt: 'get rid of every panel', ok: (calls) => calls.some((args) => args.action === 'delete_all' || args.action === 'close_all') },
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

const turn = async (prompt: string, ok: (calls: readonly Args[]) => boolean) => {
  const calls: Args[] = [];
  const ports: ReplyPorts = {
    chat,
    label: (call) => call.name,
    tool: async (call) => {
      const shaped = shapeToolCall(call.name, parse(call), TOOLS.map((tool) => tool.name));
      if (shaped.name !== 'panels') return { content: `${call.name} done` };
      const args = shaped.args as Args;
      calls.push(args);
      return { content: args.action === 'list' ? `${LIST}\nThe drawer is open on their screen. Tell them how many there are in one short sentence. Do not open any unless they ask.` : 'Done.' };
    },
    doing: () => undefined,
    show: () => undefined,
    fail: () => undefined,
  };
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt({ now: new Date(), timeZone: 'America/New_York', locale: 'en-US', memories: [], camera: false, firstTurn: false }) },
    { role: 'assistant', content: 'Here is the Lisbon forecast, a lighthouse painting, and your deploy report.' },
    { role: 'user', content: prompt },
  ];
  const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
  for await (const _ of reply(ports, history, AbortSignal.timeout(60_000), result)) void _;
  return { prompt, ok: ok(calls), calls: calls.map((args) => JSON.stringify(args)), tools: result.tools };
};

const outcomes = [];
for (const each of CASES) {
  const outcome = await turn(each.prompt, each.ok).catch((cause: unknown) => ({ prompt: each.prompt, ok: false, calls: [String(cause).slice(0, 80)], tools: [] }));
  outcomes.push(outcome);
  console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.prompt} -> [${outcome.tools.join(',')}] ${outcome.calls.join(' ; ').slice(0, 160)}`);
}
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L4', brain, passed, total: outcomes.length, pass: passed >= outcomes.length - 1 };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
