import { describe, expect, it } from 'vitest';
import { FILLERS, KEEP_YOUR_WORD, madeAPromise, RECOVERY, type ReplyPorts, type ReplyResult, reply } from '../../src/reply';
import { UserSpeech } from '../../src/speech';
import type { ToolCall } from '../../src/sse';
import type { Upstream } from '../../src/upstream';
import { UnsupportedModel, userAI } from '../../src/user-ai';

const sse = (deltas: readonly string[], calls: readonly ToolCall[] = []) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      for (const content of deltas) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));

      calls.forEach((call, index) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, id: call.id, function: { name: call.name, arguments: call.arguments } }] } }] })}\n\n`),
        ),
      );
      controller.close();
    },
  });

const fresh = (): ReplyResult => ({ sleep: false, tools: [], firstTextAt: null, error: null });

const collect = async (source: AsyncIterable<string>) => {
  const out: string[] = [];

  for await (const text of source) out.push(text);

  return out.join('');
};

const ports = (rounds: Array<{ deltas: string[]; calls?: ToolCall[] }>, toolMs = 0): ReplyPorts & { seen: unknown[] } => {
  const seen: unknown[] = [];
  let round = 0;

  return {
    seen,
    chat: async (messages) => {
      seen.push(messages);
      const next = rounds[round] ?? { deltas: [] };

      round += 1;

      return sse(next.deltas, next.calls);
    },
    label: (call) => call.name,
    tool: async (call) => {
      await new Promise((resolve) => setTimeout(resolve, toolMs));

      return { content: `result of ${call.name}`, sleep: call.name === 'rest' };
    },
    doing: () => undefined,
    show: () => undefined,
    fail: () => undefined,
  };
};

describe('the user AI adapter the Agents SDK Flux provider runs on', () => {
  it('opens Flux through the signed-in person’s upstream and refuses anything else', async () => {
    const asked: unknown[] = [];
    const socket = { fake: true } as unknown as WebSocket;
    const ai = userAI(() => ({ listen: async (params: unknown) => (asked.push(params), socket) }) as unknown as Upstream);

    expect(await ai.run('@cf/deepgram/flux', { sample_rate: '16000' }, { websocket: true })).toEqual({ webSocket: socket });
    expect(asked).toEqual([{ sample_rate: '16000' }]);
    await expect(ai.run('@cf/meta/llama', {})).rejects.toBeInstanceOf(UnsupportedModel);
  });
});

describe('the speech provider the Agents SDK pipeline calls', () => {
  it('streams even-length PCM chunks from odd network chunks', async () => {
    const speech = new UserSpeech(
      () =>
        ({
          speak: async () =>
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array(101));
                controller.enqueue(new Uint8Array(101));
                controller.close();
              },
            }),
        }) as unknown as Upstream,
      () => ({ voice: 'asteria', engine: 'aura-1' }),
    );
    const sizes: number[] = [];

    for await (const chunk of speech.synthesizeStream('hi')) sizes.push(chunk.byteLength);

    expect(sizes).toEqual([100, 102]);
    expect((await speech.synthesize('hi'))?.byteLength).toBe(202);
  });
});

describe('the reply hark returns from onTurn', () => {
  it('streams text, runs tools between rounds as plain-text results, and stops when the brain is done', async () => {
    const p = ports([{ deltas: ['Let me check. '], calls: [{ id: 'c1', name: 'get_weather', arguments: '{}' }] }, { deltas: ['Twenty degrees.'] }]);
    const result = fresh();

    expect(await collect(reply(p, [{ role: 'user', content: 'weather?' }], new AbortController().signal, result))).toBe('Let me check. Twenty degrees.');
    expect(result.tools).toEqual(['get_weather']);
    expect(JSON.stringify(p.seen[1])).toContain('[Result of get_weather, not said by the person] result of get_weather');
  });

  it('fills a slow tool, stays quiet for a fast one, and never goes silent', async () => {
    const slow = await collect(reply(ports([{ deltas: [], calls: [{ id: 'c', name: 'imagine', arguments: '{}' }] }, { deltas: ['Done.'] }], 700), [], new AbortController().signal, fresh()));

    expect(FILLERS.some((filler) => slow.startsWith(filler))).toBe(true);
    expect(await collect(reply(ports([{ deltas: [], calls: [{ id: 'c', name: 'remember', arguments: '{}' }] }, { deltas: ['Saved.'] }]), [], new AbortController().signal, fresh()))).toBe('Saved.');
    expect(await collect(reply(ports([{ deltas: [] }]), [], new AbortController().signal, fresh()))).toBe(RECOVERY);
  });

  it('says the recovery line and reports the reason when the brain fails', async () => {
    const failures: string[] = [];
    const result = fresh();
    const broken: ReplyPorts = { ...ports([]), chat: async () => { throw new Error('Thinking failed (400)'); }, fail: (reason) => failures.push(reason) };

    expect(await collect(reply(broken, [], new AbortController().signal, result))).toBe(RECOVERY);
    expect(failures).toEqual(['Thinking failed (400)']);
    expect(result.error).toBe('Thinking failed (400)');
  });

  it('never speaks tool-call JSON a brain wrote as text, and runs it as the tool instead', async () => {
    const result = fresh();
    const leaked = ports([{ deltas: ['[{"kind":', '"emoji","value":"❤️"}]'] }, { deltas: ['There you go.'] }]);

    expect(await collect(reply(leaked, [], new AbortController().signal, result))).toBe('There you go.');
    expect(result.tools).toEqual(['show_form']);
    expect(await collect(reply(ports([{ deltas: ['{not json'] }]), [], new AbortController().signal, fresh()))).toBe(RECOVERY);
    expect(await collect(reply(ports([{ deltas: ['  ', 'Lisbon.'] }]), [], new AbortController().signal, fresh()))).toBe('  Lisbon.');
  });

  it('marks goodbye so the call can close after it is spoken', async () => {
    const result = fresh();

    await collect(reply(ports([{ deltas: [], calls: [{ id: 'r', name: 'rest', arguments: '{}' }] }, { deltas: ['Talk soon.'] }]), [], new AbortController().signal, result));

    expect(result.sleep).toBe(true);
  });
});

describe('hark keeps its word', () => {
  it('spots a spoken promise', () => {
    expect(madeAPromise('Let me draw that for you.')).toBe(true);
    expect(madeAPromise("Sure, I'll make a heart.")).toBe(true);
    expect(madeAPromise('It is twenty degrees in Lisbon.')).toBe(false);
  });

  it('asks the brain once more when it promised but called no tool', async () => {
    const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
    const p = ports([{ deltas: ['Let me draw a heart.'] }, { deltas: [], calls: [{ id: 'f', name: 'show_form', arguments: '{}' }] }, { deltas: [' There.'] }]);
    const said = await collect(reply(p, [{ role: 'user', content: 'draw a heart' }], new AbortController().signal, result));

    expect(said).toBe('Let me draw a heart. There.');
    expect(result.tools).toEqual(['show_form']);
    expect(result.nudged).toBe(true);
    expect(JSON.stringify(p.seen[1])).toContain(KEEP_YOUR_WORD);
  });

  it('does not nudge a plain answer or nudge twice', async () => {
    const plain: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
    await collect(reply(ports([{ deltas: ['Twenty degrees.'] }]), [], new AbortController().signal, plain));
    expect(plain.nudged).toBeUndefined();
    const stubborn = ports([{ deltas: ['Let me try.'] }, { deltas: [' Let me try again.'] }, { deltas: ['x'] }]);
    const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
    await collect(reply(stubborn, [], new AbortController().signal, result));
    expect(stubborn.seen.length).toBe(2);
  });
});
