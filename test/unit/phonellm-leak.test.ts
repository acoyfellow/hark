import { describe, expect, it } from 'vitest';
import { type ReplyPorts, type ReplyResult, reply } from '../../src/reply';
import type { ToolCall } from '../../src/sse';

const PROD_DELTAS = ['Give me a second. ', '*', 'show_form*', '  \n', '```', 'json', '\n', '{\n', ' ', ' "', 'beats', '":', ' [\n', '   ', ' {\n', '     ', ' "', 'kind', '":', ' "', 'model', '",\n', '     ', ' "', 'value', '":', ' [{"shape":"cone","at":[0,0.8,0],"size":[0.2,0.2,0.2]}]', '\n    }\n  ]\n}\n', '```'];

const stream = (deltas: readonly string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      for (const content of deltas) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));

      controller.close();
    },
  });

const recording = () => {
  const calls: ToolCall[] = [];
  let round = 0;
  const ports: ReplyPorts = {
    chat: async () => {
      round += 1;

      return stream(round === 1 ? PROD_DELTAS : ['There it is.']);
    },
    label: (call) => call.name,
    tool: async (call) => {
      calls.push(call);

      return { content: 'It is playing on their screen. Do not describe it.' };
    },
    doing: () => undefined,
    show: () => undefined,
    fail: () => undefined,
  };

  return { calls, ports };
};

const spoken = async (source: AsyncIterable<string>) => {
  let out = '';

  for await (const text of source) out += text;

  return out;
};

describe('PhoneLLM writing its show_form call as a starred name and a json fence (prod, 2026-10-16)', () => {
  it('runs it as a real tool call and never speaks the name or the JSON', async () => {
    const { calls, ports } = recording();
    const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
    const said = await spoken(reply(ports, [{ role: 'user', content: 'Show me a three d rocket.' }], new AbortController().signal, result));

    expect(calls.map((call) => call.name)).toEqual(['show_form']);
    expect(JSON.parse(calls[0]?.arguments ?? '{}').beats[0].kind).toBe('model');
    expect(said).not.toMatch(/show_form|```|"beats"/u);
    expect(said).toContain('Give me a second.');
  });
});
