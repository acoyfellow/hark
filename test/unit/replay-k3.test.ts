import { it, expect } from 'vitest';
import { reply } from '../../src/reply';

const sse = (pieces: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`));
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

it('k3 opens with a written call and then talks', async () => {
  const rounds = [sse(['show', '_form', ': {"be', 'ats":[{"kind":"word","value":"YES"}]}', '\n\nLoud and clear.']), sse(['Done.'])];
  const tools: string[] = [];
  const out: string[] = [];
  const result = { sleep: false, tools: [] as string[], firstTextAt: null, error: null };
  for await (const piece of reply(
    { chat: async () => rounds.shift()!, label: () => '', tool: async (c) => { tools.push(c.name); return { content: 'ok' }; }, doing: () => undefined, show: () => undefined, fail: () => undefined },
    [{ role: 'user', content: 'hi' }],
    new AbortController().signal,
    result,
  ))
    out.push(piece);
  expect({ tools, out: out.join('') }).toEqual({ tools: ['show_form'], out: expect.stringContaining('Loud and clear.') });
});
