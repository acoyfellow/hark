export type ToolCall = { readonly id: string; readonly name: string; readonly arguments: string };

export type ChatEvent =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tools'; readonly calls: readonly ToolCall[] }
  | { readonly kind: 'usage'; readonly input: number; readonly output: number };

type Partial = { id: string; name: string; arguments: string };

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const lines = async function* (body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      pending += value;

      let at = pending.indexOf('\n');

      while (at >= 0) {
        yield pending.slice(0, at).replace(/\r$/u, '');
        pending = pending.slice(at + 1);
        at = pending.indexOf('\n');
      }
    }

    if (pending !== '') yield pending;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
};

export const chatEvents = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatEvent> {
  const calls = new Map<number, Partial>();

  for await (const line of lines(body)) {
    if (!line.startsWith('data:')) continue;

    const data = line.slice(5).trim();

    if (data === '' || data === '[DONE]') continue;

    let parsed: unknown;

    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }

    const chunk = record(parsed);
    const usage = record(chunk.usage);

    if (typeof usage.prompt_tokens === 'number')
      yield {
        kind: 'usage',
        input: usage.prompt_tokens,
        output: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0,
      };

    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    const delta = record(record(choices[0]).delta);
    const content = text(delta.content);

    if (content !== '') yield { kind: 'text', text: content };

    const fragments = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];

    for (const raw of fragments) {
      const fragment = record(raw);
      const index = typeof fragment.index === 'number' ? fragment.index : calls.size;
      const fn = record(fragment.function);
      const call = calls.get(index) ?? { id: '', name: '', arguments: '' };

      call.id = text(fragment.id) || call.id;
      call.name = call.name + text(fn.name);
      call.arguments = call.arguments + text(fn.arguments);
      calls.set(index, call);
    }
  }

  if (calls.size > 0)
    yield {
      kind: 'tools',
      calls: [...calls.entries()]
        .toSorted(([a], [b]) => a - b)
        .map(([index, call]) => ({
          id: call.id || `call_${index}`,
          name: call.name,
          arguments: call.arguments || '{}',
        })),
    };
};
