import { Effect, Schema, Stream } from 'effect';
import type { Visual } from '../shared/protocol';
import { chunker } from './sentences';
import { type ToolCall, chatEvents } from './sse';
import type { ToolOutcome } from './tools';

export type Part =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } };

export type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: string | readonly Part[] }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls?: ReadonlyArray<{
        readonly id: string;
        readonly type: 'function';
        readonly function: { readonly name: string; readonly arguments: string };
      }>;
    }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string };

export class TurnFailed extends Schema.TaggedError<TurnFailed>()('TurnFailed', {
  reason: Schema.String,
}) {}

export type TurnPorts = {
  readonly chat: (
    messages: readonly ChatMessage[],
    signal: AbortSignal,
  ) => Promise<ReadableStream<Uint8Array>>;
  readonly speak: (text: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  readonly label: (call: ToolCall) => string;
  readonly tool: (call: ToolCall) => Promise<ToolOutcome>;
  readonly doing: (label: string) => void;
  readonly show: (visual: Visual) => void;
  readonly audio: (pcm: Uint8Array) => void;
};

export type Progress = { spoken: string[]; firstAudioAt: number | null; firstTokenAt: number | null };

export type TurnResult = {
  readonly appended: readonly ChatMessage[];
  readonly spoken: string;
  readonly sleep: boolean;
};

const MAX_ROUNDS = 4;

const reasonOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const failed = (cause: unknown) => new TurnFailed({ reason: reasonOf(cause) });

const evenBytes = async (body: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const parts: Uint8Array[] = [];
  let size = 0;

  for await (const part of body) {
    parts.push(part);
    size += part.byteLength;
  }

  const all = new Uint8Array(size - (size % 2));
  let at = 0;

  for (const part of parts) {
    const room = all.byteLength - at;

    if (room <= 0) break;

    all.set(room >= part.byteLength ? part : part.subarray(0, room), at);
    at += Math.min(room, part.byteLength);
  }

  return all;
};

type Round = { readonly text: string; readonly calls: readonly ToolCall[] };

const sentencesOf = async function* (
  body: ReadableStream<Uint8Array>,
  round: { text: string; calls: readonly ToolCall[] },
  progress: Progress,
): AsyncGenerator<string> {
  const chunks = chunker();

  for await (const event of chatEvents(body)) {
    if (event.kind === 'text') {
      progress.firstTokenAt ??= Date.now();
      round.text += event.text;
      yield* chunks.push(event.text);
    }

    if (event.kind === 'tools') round.calls = event.calls;
  }

  yield* chunks.flush();
};

const speakRound = (
  ports: TurnPorts,
  messages: readonly ChatMessage[],
  released: Effect.Effect<void>,
  progress: Progress,
): Effect.Effect<Round, TurnFailed> =>
  Effect.gen(function* () {
    const controller = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (owned) => Effect.sync(() => owned.abort()),
    );
    const body = yield* Effect.tryPromise({
      try: () => ports.chat(messages, controller.signal),
      catch: failed,
    });
    const round = { text: '', calls: [] as readonly ToolCall[] };

    yield* Stream.fromAsyncIterable(sentencesOf(body, round, progress), failed).pipe(
      Stream.mapEffect(
        (sentence) =>
          Effect.tryPromise({
            try: async (signal) => ({
              sentence,
              pcm: await evenBytes(await ports.speak(sentence, signal)),
            }),
            catch: failed,
          }),
        { concurrency: 3 },
      ),
      Stream.runForEach(({ sentence, pcm }) =>
        Effect.gen(function* () {
          yield* released;
          progress.firstAudioAt ??= Date.now();
          ports.audio(pcm);
          progress.spoken.push(sentence);
        }),
      ),
    );

    return round;
  }).pipe(Effect.scoped);

const toolTurn = (
  ports: TurnPorts,
  calls: readonly ToolCall[],
): Effect.Effect<readonly ToolOutcome[]> =>
  Effect.forEach(
    calls,
    (call) =>
      Effect.sync(() => ports.doing(ports.label(call))).pipe(
        Effect.andThen(
          Effect.tryPromise({ try: () => ports.tool(call), catch: failed }).pipe(
            Effect.catch((error) => Effect.succeed<ToolOutcome>({ content: error.reason })),
          ),
        ),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            if (outcome.visual !== undefined) ports.show(outcome.visual);
          }),
        ),
      ),
    { concurrency: 'unbounded' },
  );

export const runTurn = (
  ports: TurnPorts,
  history: readonly ChatMessage[],
  released: Effect.Effect<void>,
  progress: Progress,
): Effect.Effect<TurnResult, TurnFailed> =>
  Effect.gen(function* () {
    const appended: ChatMessage[] = [];
    let sleep = false;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const lastRound = round === MAX_ROUNDS - 1;
      const { text, calls } = yield* speakRound(ports, [...history, ...appended], released, progress);

      if (calls.length === 0 || lastRound) {
        appended.push({ role: 'assistant', content: text });
        break;
      }

      appended.push({
        role: 'assistant',
        content: text === '' ? null : text,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      });

      const outcomes = yield* toolTurn(ports, calls);

      outcomes.forEach((outcome, index) => {
        appended.push({ role: 'tool', tool_call_id: calls[index]?.id ?? '', content: outcome.content });
        sleep ||= outcome.sleep === true;
      });

      for (const outcome of outcomes)
        if (outcome.image !== undefined)
          appended.push({
            role: 'user',
            content: [
              { type: 'text', text: 'The camera frame you asked for:' },
              { type: 'image_url', image_url: { url: outcome.image } },
            ],
          });
    }

    return { appended, spoken: progress.spoken.join(' '), sleep };
  });
