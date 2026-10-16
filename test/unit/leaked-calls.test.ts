import { describe, expect, it } from 'vitest';
import { markupCalls, markupRemainder, markupStart } from '../../src/leaked-calls';
import { type ReplyPorts, reply } from '../../src/reply';
import type { ToolCall } from '../../src/sse';

const PHONELLM_DELTAS = ['Give me a second. ', '*', 'show_form*', '  \n', '```', 'json', '\n', '{\n', ' ', ' "', 'beats', '":', ' [\n', '   ', ' {\n', '     ', ' "', 'kind', '":', ' "', 'model', '",\n', '     ', ' "', 'value', '":', ' [{"shape":"cone","at":[0,0.8,0],"size":[0.2,0.2,0.2]}]', '\n    }\n  ]\n}\n', '```'];

const K3_DELTAS = ['show', '_form', ': {"be', 'ats":[{"kind":"word","value":"YES"}]}', '\n\nLoud and clear.'];

const stream = (deltas: readonly string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      for (const content of deltas) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));

      controller.close();
    },
  });

const replay = async (firstRound: readonly string[]) => {
  const calls: ToolCall[] = [];
  const rounds = [firstRound, ['There it is.']];
  const ports: ReplyPorts = {
    chat: async () => stream(rounds.shift() ?? []),
    label: (call) => call.name,
    tool: async (call) => {
      calls.push(call);

      return { content: 'It is playing on their screen. Do not describe it.' };
    },
    doing: () => undefined,
    show: () => undefined,
    fail: () => undefined,
  };
  let said = '';

  for await (const text of reply(ports, [{ role: 'user', content: 'hi' }], new AbortController().signal, { sleep: false, tools: [], firstTextAt: null, error: null }))
    said += text;

  return { calls, said };
};

describe('replayed prod brains that wrote their call as text', () => {
  it('PhoneLLM: a starred name and a json fence run as a real call and are never spoken', async () => {
    const { calls, said } = await replay(PHONELLM_DELTAS);

    expect(calls.map((call) => call.name)).toEqual(['show_form']);
    expect(JSON.parse(calls[0]?.arguments ?? '{}').beats[0].kind).toBe('model');
    expect(said).not.toMatch(/show_form|```|"beats"/u);
    expect(said).toContain('Give me a second.');
  });

  it('Kimi K3: a name-colon call split across chunks runs, and the words after it are spoken', async () => {
    const { calls, said } = await replay(K3_DELTAS);

    expect(calls.map((call) => call.name)).toEqual(['show_form']);
    expect(said).toContain('Loud and clear.');
    expect(said).not.toMatch(/show_form|"beats"/u);
  });
});

describe('tool calls a brain writes as text', () => {
  it('reads a self-closing tag with bare keys', () => {
    const text = '<show_form beats=[{kind:"emoji",value:"👋",seconds:2,motion:"pulse"}] />';

    expect(markupStart(`Hey there! ${text}`)).toBe(11);
    expect(markupCalls(text)).toEqual([
      { id: 'leaked_markup', name: 'show_form', arguments: JSON.stringify({ beats: [{ kind: 'emoji', value: '👋', seconds: 2, motion: 'pulse' }] }) },
    ]);
  });

  it('reads a name-colon-json call', () => {
    const text = 'show_form: {"beats":[{"kind":"word","value":"YES","motion":"pulse"}]}';

    expect(markupStart(text)).toBe(0);
    expect(markupCalls(text)[0]?.name).toBe('show_form');
  });

  it('reads the capitalised call GPT-OSS writes after a sentence, with bare keys in a bare array', () => {
    const text = 'I hear you loud and clear.  \nShow_form: [{kind:"solid", value:"sphere", seconds:6, motion:"spin"}]';

    expect(markupStart(text)).toBeGreaterThan(0);
    expect(markupCalls(text)).toEqual([
      { id: 'leaked_colon', name: 'show_form', arguments: JSON.stringify({ beats: [{ kind: 'solid', value: 'sphere', seconds: 6, motion: 'spin' }] }) },
    ]);
  });
});

describe('a written call followed by more words', () => {
  it('takes only the balanced JSON', () => {
    const text = 'show_form: {"beats":[{"kind":"word","value":"A } B","motion":"pulse"}]} and here is your story.';

    expect(JSON.parse(markupCalls(text)[0]?.arguments ?? '{}')).toEqual({ beats: [{ kind: 'word', value: 'A } B', motion: 'pulse' }] });
  });
});

describe('what is left after a written call', () => {
  it('is spoken, not swallowed', () => {
    expect(markupRemainder('show_form: {"beats":[]} Once upon a time')).toBe(' Once upon a time');
    expect(markupRemainder('<show_form beats=[] /> There.')).toBe(' There.');
    expect(markupRemainder('show_form: {"beats":[')).toBeNull();
  });
});
