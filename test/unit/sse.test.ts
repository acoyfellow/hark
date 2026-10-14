import { describe, expect, test } from 'vitest';
import { chatEvents } from '../../src/sse';

const body = (...lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const text = lines.map((line) => `${line}\n\n`).join('');
      const bytes = new TextEncoder().encode(text);

      for (let at = 0; at < bytes.length; at += 7) controller.enqueue(bytes.slice(at, at + 7));
      controller.close();
    },
  });

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const out = [];

  for await (const event of chatEvents(stream)) out.push(event);

  return out;
};

const data = (value: unknown) => `data: ${JSON.stringify(value)}`;

describe('chatEvents', () => {
  test('yields text deltas split across network chunks', async () => {
    const events = await collect(
      body(
        data({ choices: [{ delta: { content: 'Hello ' } }] }),
        data({ choices: [{ delta: { content: 'there.' } }] }),
        'data: [DONE]',
      ),
    );

    expect(events).toEqual([
      { kind: 'text', text: 'Hello ' },
      { kind: 'text', text: 'there.' },
    ]);
  });

  test('assembles streamed tool calls', async () => {
    const events = await collect(
      body(
        data({ choices: [{ delta: { content: 'Let me check.' } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'get_weather', arguments: '{"pla' } }] } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ce":"Lisbon"}' } }] } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'b', function: { name: 'look', arguments: '' } }] } }] }),
        data({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 4 } }),
      ),
    );

    expect(events).toEqual([
      { kind: 'text', text: 'Let me check.' },
      { kind: 'usage', input: 10, output: 4 },
      {
        kind: 'tools',
        calls: [
          { id: 'a', name: 'get_weather', arguments: '{"place":"Lisbon"}' },
          { id: 'b', name: 'look', arguments: '{}' },
        ],
      },
    ]);
  });

  test('skips garbage lines', async () => {
    expect(await collect(body(': keepalive', 'data: {nope', data({ choices: [{ delta: {} }] })))).toEqual([]);
  });
});
