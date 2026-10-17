import { DEFAULT_BRAIN } from '../../shared/protocol';
import type { ChatMessage } from '../../src/chat';
import { systemPrompt } from '../../src/prompt';
import { reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import { toolSchemas } from '../../src/tools';
import type { ToolCall } from '../../src/sse';

type Case = { readonly prompt: string; readonly steps: readonly RegExp[] };



const CASES: readonly Case[] = [
  { prompt: 'count to five, then go square, then go circle', steps: [/\b1\b|one/i, /\b2\b|two/i, /\b3\b|three/i, /\b4\b|four/i, /\b5\b|five/i, /square/i, /circle/i] },
  { prompt: 'show a heart, then a star, then a moon', steps: [/heart|❤|💖|💗/i, /star|⭐|🌟/i, /moon|🌙|🌕/i] },
  { prompt: 'count down from three then do fireworks', steps: [/\b3\b|three/i, /\b2\b|two/i, /\b1\b|one/i, /firework|🎆|🎇|burst|explo/i] },
  { prompt: 'spell the word dog one letter at a time', steps: [/^\s*d\s*$/i, /^\s*o\s*$/i, /^\s*g\s*$/i] },
  { prompt: 'make a cube, then a sphere, then a torus', steps: [/cube|box/i, /sphere/i, /torus|donut|ring/i] },
  { prompt: 'show the sun rising, then a cloud, then rain', steps: [/sun|☀|🌅|svg:.*circle/i, /cloud|☁/i, /rain|🌧|drop/i] },
  { prompt: 'set a timer for one minute and remember that I like jazz', steps: [/set_timer/, /remember/] },
  { prompt: 'show the word hi, then the word bye', steps: [/\bhi\b/i, /\bbye\b/i] },
  { prompt: 'draw a triangle, then a square, then a pentagon, then a circle', steps: [/triangle|M.*L.*L.*Z/i, /square|rect/i, /pentagon|M.*L.*L.*L.*L/i, /circle|A\s|arc/i] },
  { prompt: 'show the numbers one, two, three, four in order', steps: [/\b1\b|one/i, /\b2\b|two/i, /\b3\b|three/i, /\b4\b|four/i] },
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

const describeBeats = (call: ToolCall): string[] => {
  try {
    const args = JSON.parse(call.arguments) as { beats?: { kind?: string; value?: unknown }[] };
    return (args.beats ?? []).map((beat) => `${beat.kind ?? ''}:${typeof beat.value === 'string' ? beat.value : JSON.stringify(beat.value)}`);
  } catch {
    return [];
  }
};

const inOrder = (events: readonly string[], steps: readonly RegExp[]) => {
  let at = 0;
  const hit: number[] = [];
  for (const step of steps) {
    const found = events.findIndex((event, index) => index >= at && (step.test(event) || /^(svg|code|model):/u.test(event)));
    if (found === -1) return { ok: false, hit };
    hit.push(found);
    at = found + 1;
  }
  return { ok: true, hit };
};

const turn = async ({ prompt, steps }: Case) => {
  const events: string[] = [];
  const ports: ReplyPorts = {
    chat,
    label: (call) => call.name,
    tool: async (call) => {
      if (call.name === 'show_form') {
        describeBeats(call).forEach((beat) => events.push(beat));
        return { content: 'It is playing on their screen. Do not describe it.' };
      }
      events.push(call.name);
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
  for await (const _ of reply(ports, history, AbortSignal.timeout(60_000), result)) void _;
  const words = events.map((event) => (event.startsWith('word:') ? event.slice(5) : event));
  const verdict = inOrder(words, steps);
  return { prompt, ok: verdict.ok, listed: result.listed === true, events: words.map((word) => word.slice(0, 40)) };
};

const outcomes = [];
for (const each of CASES) {
  const outcome = await turn(each).catch((cause: unknown) => ({ prompt: each.prompt, ok: false, events: [String(cause).slice(0, 80)] }));
  outcomes.push(outcome);
  console.log(`${outcome.ok ? 'pass' : 'FAIL'} ${outcome.prompt} -> ${outcome.events.join(' | ').slice(0, 160)}`);
}
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L2', brain, passed, total: outcomes.length, pass: passed >= 9 };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes }, null, 2));
process.exit(summary.pass ? 0 : 1);
