import { DEFAULT_BRAIN } from '../../shared/protocol';
import type { ChatMessage } from '../../src/chat';
import { systemPrompt } from '../../src/prompt';
import { madeAPromise, reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import { toolSchemas } from '../../src/tools';

const PROMPTS = [
  'draw me a heart', 'show me a cat', 'make a spinning cube', 'count down from five', 'paint a sunset',
  'show me a rocket', 'can you make a star', 'do a little dance', 'show me the word hello', 'make it rain',
  'build me a 3d house', 'show a smiley face', 'set a timer for two minutes', 'remember that I like tea', 'show me a fish swimming',
  'draw a lighthouse', 'make a pink heart and keep it still', 'show me a tree', 'turn into a circle', 'go square',
  'make fireworks', 'show me the number seven', 'draw a mountain', 'show me a moon', 'make a snowflake',
  'show me a spiral', 'show me an arrow pointing up', 'make a flower', 'show a thumbs up', 'spell cat',
];

type Outcome = { prompt: string; said: string; tools: string[]; nudged: boolean; promised: boolean; kept: boolean };

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
  if (!response.ok || response.body === null) throw new Error(`chat ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response.body;
};

const ports: ReplyPorts = {
  chat,
  label: (call) => call.name,
  tool: async (call) => ({ content: `${call.name} done` }),
  doing: () => undefined,
  show: () => undefined,
  fail: () => undefined,
};

const turn = async (prompt: string): Promise<Outcome> => {
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt({ now: new Date(), timeZone: 'America/New_York', locale: 'en-US', memories: [], camera: false, firstTurn: false }) },
    { role: 'user', content: prompt },
  ];
  const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
  let said = '';
  const signal = AbortSignal.timeout(45_000);
  for await (const piece of reply(ports, history, signal, result)) said += piece;
  const promised = madeAPromise(said);
  return { prompt, said: said.slice(0, 160), tools: result.tools, nudged: result.nudged === true, promised, kept: !promised || result.tools.length > 0 };
};

const outcomes: Outcome[] = [];
for (const prompt of PROMPTS) {
  const outcome = await turn(prompt).catch((cause: unknown) => ({ prompt, said: String(cause).slice(0, 160), tools: [], nudged: false, promised: true, kept: false }));
  outcomes.push(outcome);
  console.log(`${outcome.kept ? 'kept' : 'BROKE'} ${outcome.nudged ? 'nudged ' : ''}${prompt} -> [${outcome.tools.join(',')}] ${outcome.said.slice(0, 70)}`);
}

const kept = outcomes.filter((outcome) => outcome.kept).length;
const acted = outcomes.filter((outcome) => outcome.tools.length > 0).length;
const rescued = outcomes.filter((outcome) => outcome.nudged && outcome.tools.length > 0).length;
const before = (kept - rescued) / outcomes.length;
const rate = kept / outcomes.length;
const summary = { lane: 'L1', brain, kept, acted, rescued, total: outcomes.length, before, rate, pass: rate >= 0.95 };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
