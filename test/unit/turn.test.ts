import { Deferred, Effect, Exit, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../../src/sse';
import { type ChatMessage, type Progress, RECOVERY, runTurn, type TurnPorts } from '../../src/turn';

const sse = (deltas: readonly string[], calls: readonly ToolCall[] = []) =>
  new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      for (const content of deltas) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      calls.forEach((call, index) =>
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, id: call.id, function: { name: call.name, arguments: call.arguments } }] } }] })}\n\n`,
          ),
        ),
      );
      controller.close();
    },
  });

const pcmFor = (text: string) => new ReadableStream<Uint8Array>({ start: (c) => (c.enqueue(new Uint8Array(text.length * 2 + 1)), c.close()) });

const progress = (): Progress => ({ spoken: [], firstAudioAt: null, firstTokenAt: null });

const harness = (rounds: ReadonlyArray<{ deltas: string[]; calls?: ToolCall[] }>, speakDelay = 0) => {
  const audio: number[] = [];
  const shown: string[] = [];
  const doing: string[] = [];
  const asked: (readonly ChatMessage[])[] = [];
  const aborted: boolean[] = [];
  let round = 0;
  const ports: TurnPorts = {
    chat: async (messages, signal) => {
      asked.push(messages);
      signal.addEventListener('abort', () => aborted.push(true));
      const next = rounds[round] ?? { deltas: ['…'] };

      round += 1;

      return sse(next.deltas, next.calls);
    },
    speak: async (text) => {
      if (speakDelay > 0) await new Promise((resolve) => setTimeout(resolve, speakDelay * (text.length % 3)));

      return pcmFor(text);
    },
    label: (call) => `doing ${call.name}`,
    tool: async (call) => ({ content: `result of ${call.name}`, visual: { _tag: 'Memory', id: call.id, text: 'x', forgotten: false } }),
    doing: (label) => doing.push(label),
    show: (visual) => shown.push(visual.id),
    audio: (pcm) => audio.push(pcm.byteLength),
  };

  return { ports, audio, shown, doing, asked, aborted };
};

describe('one spoken turn', () => {
  it('speaks sentences in order even when later ones synthesize faster', async () => {
    const h = harness([{ deltas: ['Alpha beta gamma delta epsilon zeta. ', 'Second sentence is longer than forty eight characters for sure. ', 'Third.'] }], 15);
    const p = progress();
    const result = await Effect.runPromise(runTurn(h.ports, [], Effect.void, p));

    expect(p.spoken).toEqual(['Alpha beta gamma delta epsilon zeta.', 'Second sentence is longer than forty eight characters for sure.', 'Third.']);
    expect(h.audio).toEqual(p.spoken.map((text) => text.length * 2));
    expect(result.appended).toEqual([{ role: 'assistant', content: 'Alpha beta gamma delta epsilon zeta. Second sentence is longer than forty eight characters for sure. Third.' }]);
  });

  it('runs tools between rounds and feeds their results back', async () => {
    const h = harness([
      { deltas: ['Let me check that for you. '], calls: [{ id: 'c1', name: 'get_weather', arguments: '{"place":"Lisbon"}' }] },
      { deltas: ['Twenty degrees and clear.'] },
    ]);
    const result = await Effect.runPromise(runTurn(h.ports, [{ role: 'user', content: 'weather?' }], Effect.void, progress()));

    expect(h.doing).toEqual(['doing get_weather']);
    expect(h.shown).toEqual(['c1']);
    expect(h.asked[1]?.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'result of get_weather' });
    expect(result.appended.map((message) => message.role)).toEqual(['assistant', 'tool', 'assistant']);
    expect(result.spoken).toBe('Let me check that for you. Twenty degrees and clear.');
  });

  it('holds every sound behind the release gate (eager end of turn)', async () => {
    const h = harness([{ deltas: ['Ready when you are, any time at all. '] }]);
    const gate = Effect.runSync(Deferred.make<void>());
    const fiber = Effect.runFork(runTurn(h.ports, [], Deferred.await(gate), progress()));

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(h.audio).toEqual([]);

    await Effect.runPromise(Deferred.succeed(gate, undefined));
    await Effect.runPromise(Fiber.join(fiber));
    expect(h.audio.length).toBe(1);
  });

  it('stops speaking and aborts the model the moment it is interrupted (barge-in)', async () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} keeps going for a good long while yes. `);
    const h = harness([{ deltas: long }], 4);
    const fiber = Effect.runFork(runTurn(h.ports, [], Effect.void, progress()));

    await new Promise((resolve) => setTimeout(resolve, 30));
    const heard = h.audio.length;
    const exit = await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.andThen(Fiber.await(fiber))));

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(h.audio.length).toBe(heard);
    expect(h.audio.length).toBeLessThan(30);
    expect(h.aborted.length).toBeGreaterThan(0);
  });

  it('streams each sentence to the speaker as its audio arrives, with at most three voices in flight', async () => {
    const h = harness([{ deltas: Array.from({ length: 8 }, (_, i) => `This is sentence ${i}, long enough to stand on its own as a chunk here. `) }]);
    let inFlight = 0;
    let most = 0;
    const timeline: string[] = [];

    const ports: TurnPorts = {
      ...h.ports,
      speak: async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);

        return new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let part = 0; part < 3; part += 1) {
              await new Promise((resolve) => setTimeout(resolve, 8));
              controller.enqueue(new Uint8Array(101));
              timeline.push('chunk');
            }

            inFlight -= 1;
            controller.close();
          },
        });
      },
      audio: (pcm) => {
        h.audio.push(pcm.byteLength);
        timeline.push('heard');
      },
    };
    const p = progress();

    await Effect.runPromise(runTurn(ports, [], Effect.void, p));

    expect(most).toBeLessThanOrEqual(3);
    expect(most).toBeGreaterThan(1);
    expect(timeline[0]).toBe('chunk');
    expect(timeline.indexOf('heard')).toBeLessThan(timeline.lastIndexOf('chunk'));
    expect(h.audio.every((bytes) => bytes % 2 === 0)).toBe(true);
    expect(h.audio.reduce((sum, bytes) => sum + bytes, 0)).toBe(p.spoken.length * 302);
  });

  it('fills a slow tool call with a short phrase, and stays quiet for a fast one', async () => {
    const slow = harness([{ deltas: [], calls: [{ id: 'c1', name: 'imagine', arguments: '{}' }] }, { deltas: ['There it is, on your screen now.'] }]);
    const p = progress();

    await Effect.runPromise(
      runTurn({ ...slow.ports, tool: async (call) => (await new Promise((r) => setTimeout(r, 700)), { content: `did ${call.name}` }) }, [], Effect.void, p),
    );

    expect(['One moment.', 'Let me check on that.', 'Give me a second.']).toContain(p.spoken[0]);
    expect(p.spoken.at(-1)).toBe('There it is, on your screen now.');

    const fast = harness([{ deltas: [], calls: [{ id: 'c1', name: 'remember', arguments: '{}' }] }, { deltas: ['Saved, I will remember that for you.'] }]);
    const q = progress();

    await Effect.runPromise(runTurn(fast.ports, [], Effect.void, q));

    expect(q.spoken).toEqual(['Saved, I will remember that for you.']);
  });

  it('says something instead of going silent when the brain returns nothing or fails', async () => {
    const empty = harness([{ deltas: [] }]);
    const p = progress();

    await Effect.runPromise(runTurn(empty.ports, [], Effect.void, p));
    expect(p.spoken).toEqual([RECOVERY]);

    const broken = harness([]);
    const q = progress();
    const exit = await Effect.runPromiseExit(
      runTurn({ ...broken.ports, chat: async () => { throw new Error('Thinking failed (502)'); } }, [], Effect.void, q),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(q.spoken).toEqual([RECOVERY]);
  });
});
