import { DEFAULT_BRAIN } from '../../shared/protocol';
import type { ChatMessage } from '../../src/chat';
import { instructionsReminder, systemPrompt } from '../../src/prompt';
import { reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import { shapeToolCall } from '../../src/tool-call-shape';
import { TOOLS, toolSchemas } from '../../src/tools';

const CAPTAIN = new RegExp('captain', 'iu');
const PIRATE = new RegExp('arr|matey|ahoy|ye ', 'iu');

const CASES: readonly { prompt: string; instructions?: string; ok: (said: string, called: boolean) => boolean }[] = [
  { prompt: 'edit your system prompt: call me Captain from now on', ok: (_said, called) => called },
  { prompt: 'from now on always keep your answers to one sentence', ok: (_said, called) => called },
  { prompt: 'what are your instructions', ok: (_said, called) => called },
  { prompt: 'reset your prompt back to default', ok: (_said, called) => called },
  { prompt: 'stop calling me Captain', ok: (_said, called) => called },
  { prompt: 'hi, how are you?', instructions: '- Call me Captain.', ok: (said) => CAPTAIN.test(said) },
  { prompt: 'what is two plus two?', instructions: '- Talk like a pirate.', ok: (said) => PIRATE.test(said) },
  { prompt: 'tell me about the moon', instructions: '- Keep every answer to one sentence.', ok: (said) => said.split(new RegExp('[.!?](?:\\s|$)', 'u')).filter((part) => part.trim().length > 3).length <= 2 },
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

const turn = async (prompt: string, ok: (said: string, called: boolean) => boolean, instructions = '') => {
  let called = false;
  const ports: ReplyPorts = {
    chat,
    label: (call) => call.name,
    tool: async (call) => {
      const shaped = shapeToolCall(call.name, {}, TOOLS.map((tool) => tool.name));
      if (shaped.name === 'instructions') {
        called = true;
        return { content: 'Saved. It applies from your next reply.' };
      }
      return { content: `${call.name} done` };
    },
    doing: () => undefined,
    show: () => undefined,
    fail: () => undefined,
  };
  const history: ChatMessage[] = [
    { role: 'system', content: systemPrompt({ now: new Date(), timeZone: 'America/New_York', locale: 'en-US', memories: [], camera: false, firstTurn: false, instructions }) },
    ...(instructionsReminder(instructions) === null ? [] : [{ role: 'system' as const, content: instructionsReminder(instructions) ?? '' }]),
    { role: 'user', content: prompt },
  ];
  const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
  let said = '';
  for await (const piece of reply(ports, history, AbortSignal.timeout(60_000), result)) said += piece;
  return { prompt, ok: ok(said, called), called, tools: result.tools, said: said.slice(0, 220) };
};

const outcomes = [];
for (const each of CASES) {
  const outcome = await turn(each.prompt, each.ok, each.instructions).catch((cause: unknown) => ({ prompt: each.prompt, ok: false, called: false, tools: [], said: String(cause).slice(0, 80) }));
  outcomes.push(outcome);
  console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.prompt} -> [${outcome.tools.join(',')}] ${outcome.said.replaceAll('\n', ' ').slice(0, 160)}`);
}
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L6', brain, passed, total: outcomes.length, pass: passed >= outcomes.length - 1 };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
