import { DEFAULT_BRAIN } from '../../shared/protocol';
import { TOOL_CATALOG } from '../../shared/tool-catalog';
import type { ChatMessage } from '../../src/chat';
import { systemPrompt } from '../../src/prompt';
import { reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import { shapeToolCall } from '../../src/tool-call-shape';
import { capabilityReport, TOOLS, toolSchemas } from '../../src/tools';

const REPORT = capabilityReport([{ name: 'docs', state: 'ready' }], [{ server: 'docs', name: 'search_docs' }]);

const YES = new RegExp('yes|can|files|computer', 'iu');
const FORTY = new RegExp('40|forty', 'iu');
const LIMIT = new RegExp("can(?:no|')t|not|never|only", 'iu');
const DOCS = new RegExp('docs', 'iu');

const CASES: readonly { prompt: string; ok: (said: string, called: boolean) => boolean }[] = [
  { prompt: 'what can you do?', ok: (said, called) => called && mentions(said) >= 3 },
  { prompt: 'what tools do you have', ok: (said, called) => called && mentions(said) >= 3 },
  { prompt: 'how big a 3d model can you build?', ok: (said) => FORTY.test(said) },
  { prompt: 'can you edit files on my computer?', ok: (said) => YES.test(said) },
  { prompt: 'what are you not able to do?', ok: (said, called) => called && LIMIT.test(said) },
  { prompt: 'which mcp servers do I have connected', ok: (said) => DOCS.test(said) },
];

const WORDS = [...TOOL_CATALOG.flatMap((tool) => [tool.title, tool.name.replaceAll('_', ' ')]), 'shape', 'swarm', 'paint', 'picture', 'timer', 'remember', 'search', 'web', 'terminal', 'files', 'cloudflare', 'camera', '3d', 'panels', 'voice'];

const mentions = (said: string) => new Set(WORDS.filter((word) => said.toLowerCase().includes((word.toLowerCase().split(' ')[0] ?? word)))).size;

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

const turn = async (prompt: string, ok: (said: string, called: boolean) => boolean) => {
  let called = false;
  const ports: ReplyPorts = {
    chat,
    label: (call) => call.name,
    tool: async (call) => {
      const shaped = shapeToolCall(call.name, {}, TOOLS.map((tool) => tool.name));
      if (shaped.name === 'capabilities') {
        called = true;
        return { content: REPORT };
      }
      if (shaped.name === 'mcp') return { content: 'docs (ready): search_docs' };
      return { content: `${call.name} done` };
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
  let said = '';
  for await (const piece of reply(ports, history, AbortSignal.timeout(60_000), result)) said += piece;
  return { prompt, ok: ok(said, called), called, tools: result.tools, said: said.slice(0, 220) };
};

const outcomes = [];
for (const each of CASES) {
  const outcome = await turn(each.prompt, each.ok).catch((cause: unknown) => ({ prompt: each.prompt, ok: false, called: false, tools: [], said: String(cause).slice(0, 80) }));
  outcomes.push(outcome);
  console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.prompt} -> [${outcome.tools.join(',')}] ${outcome.said.replaceAll('\n', ' ').slice(0, 160)}`);
}
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L5', brain, passed, total: outcomes.length, pass: passed >= outcomes.length - 1 };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
