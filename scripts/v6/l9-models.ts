import { DEFAULT_BRAIN } from '../../shared/protocol';
import { partsOf } from '../../shared/model-parts';
import type { ChatMessage } from '../../src/chat';
import { systemPrompt } from '../../src/prompt';
import { reply, type ReplyPorts, type ReplyResult } from '../../src/reply';
import { shapeToolCall } from '../../src/tool-call-shape';
import { TOOLS, toolSchemas } from '../../src/tools';

const OBJECTS = ['show me a rocket', 'make a house', 'build me a chair', 'show me a car', 'can you make a robot', 'show a snowman', 'build a castle', 'show me a coffee mug', 'make a little scene with a house, a tree and a car', 'show me a sailboat'];
const PICTURES = ['paint me a picture of a lighthouse at dusk', 'make an image of a dragon'];

const account = process.env.HARK_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const brain = process.env.HARK_BRAIN ?? DEFAULT_BRAIN;

const chat: ReplyPorts['chat'] = async (messages, signal) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: brain, messages, tools: toolSchemas(), stream: true, max_tokens: 3000, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
    signal,
  });
  if (!response.ok || response.body === null) throw new Error(`chat ${response.status}`);
  return response.body;
};

type Seen = { readonly images: number; readonly models: number; readonly parts: number };

const beatsOf = (raw: string): { kind?: string; value?: string }[] => {
  try {
    const beats = (JSON.parse(raw) as { beats?: unknown }).beats;
    return Array.isArray(beats) ? (beats as { kind?: string; value?: string }[]) : [];
  } catch {
    return [];
  }
};

const turn = async (prompt: string) => {
  let seen: Seen = { images: 0, models: 0, parts: 0 };
  const ports: ReplyPorts = {
    chat,
    label: (call) => call.name,
    tool: async (call) => {
      const shaped = shapeToolCall(call.name, JSON.parse(call.arguments || '{}') as Record<string, unknown>, TOOLS.map((tool) => tool.name));
      if (shaped.name === 'imagine') seen = { ...seen, images: seen.images + 1 };
      const beats = shaped.name === 'show_form' ? beatsOf(JSON.stringify(shaped.args)) : [];
      for (const beat of beats) {
        if (beat.kind === 'painting') seen = { ...seen, images: seen.images + 1 };
        if (beat.kind === 'model') seen = { ...seen, models: seen.models + 1, parts: Math.max(seen.parts, partsOf(String(beat.value ?? '')).length) };
      }
      return { content: 'It is playing on their screen. Do not describe it.' };
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
  for await (const piece of reply(ports, history, AbortSignal.timeout(90_000), result)) void piece;
  return { prompt, ...seen, tools: result.tools };
};

const outcomes = [];
for (const prompt of OBJECTS) {
  const seen = await turn(prompt).catch(() => ({ prompt, images: 0, models: 0, parts: 0, tools: [] as string[] }));
  const ok = seen.images === 0 && seen.models > 0 && seen.parts >= 2;
  outcomes.push({ ...seen, kind: 'object', ok });
  console.log(`${ok ? 'pass' : 'FAIL'} ${prompt} -> models ${seen.models}, parts ${seen.parts}, images ${seen.images} [${seen.tools.join(',')}]`);
}
for (const prompt of PICTURES) {
  const seen = await turn(prompt).catch(() => ({ prompt, images: 0, models: 0, parts: 0, tools: [] as string[] }));
  const ok = seen.images > 0;
  outcomes.push({ ...seen, kind: 'picture', ok });
  console.log(`${ok ? 'pass' : 'FAIL'} ${prompt} -> images ${seen.images} [${seen.tools.join(',')}]`);
}
const objects = outcomes.filter((outcome) => outcome.kind === 'object');
const imagesOnObjects = objects.reduce((sum, outcome) => sum + outcome.images, 0);
const passed = outcomes.filter((outcome) => outcome.ok).length;
const summary = { lane: 'L9', brain, passed, total: outcomes.length, objectsAsModels: objects.filter((outcome) => outcome.ok).length, imagesOnObjects, pass: imagesOnObjects === 0 && objects.filter((outcome) => outcome.ok).length >= 9 && outcomes.filter((outcome) => outcome.kind === 'picture' && outcome.ok).length >= 1 };
console.log(JSON.stringify(summary));
if (process.env.OUT !== undefined) await Bun.write(process.env.OUT, JSON.stringify({ ...summary, outcomes, screenshots: 'receipts/shots/model3d-*.png' }, null, 2));
process.exit(summary.pass ? 0 : 1);
