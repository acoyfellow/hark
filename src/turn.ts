import { type Cause, Duration, Effect, Fiber, Queue, Schema, Semaphore, Stream } from 'effect';
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

const SPEAKING_AT_ONCE = 3;

const aligner = () => {
  let carry: number | null = null;

  return (part: Uint8Array): Uint8Array => {
    const joined = carry === null ? part : new Uint8Array([carry, ...part]);
    const even = joined.byteLength - (joined.byteLength % 2);

    carry = even < joined.byteLength ? (joined[even] ?? null) : null;

    return joined.subarray(0, even);
  };
};

type Spool = { readonly sentence: string; readonly chunks: Queue.Queue<Uint8Array, TurnFailed | Cause.Done> };

const fill = (ports: TurnPorts, sentence: string, chunks: Spool['chunks']) =>
  Effect.tryPromise({
    try: async (signal) => {
      const align = aligner();

      for await (const part of await ports.speak(sentence, signal)) {
        const even = align(part);

        if (even.byteLength > 0) Queue.offerUnsafe(chunks, even);
      }
    },
    catch: failed,
  }).pipe(
    Effect.matchEffect({
      onFailure: (error) => Queue.fail(chunks, error),
      onSuccess: () => Queue.end(chunks),
    }),
  );

const spool = (ports: TurnPorts, permits: Semaphore.Semaphore, sentence: string) =>
  Effect.gen(function* () {
    const chunks = yield* Queue.unbounded<Uint8Array, TurnFailed | Cause.Done>();

    yield* Effect.forkScoped(Semaphore.withPermit(permits, fill(ports, sentence, chunks)));

    return { sentence, chunks } satisfies Spool;
  });

const speakAll = (
  ports: TurnPorts,
  sentences: Stream.Stream<string, TurnFailed>,
  released: Effect.Effect<void>,
  progress: Progress,
) =>
  Effect.gen(function* () {
    const permits = yield* Semaphore.make(SPEAKING_AT_ONCE);

    yield* sentences.pipe(
      Stream.mapEffect((sentence) => spool(ports, permits, sentence)),
      Stream.buffer({ capacity: 16 }),
      Stream.flatMap(({ sentence, chunks }) =>
        Stream.fromQueue(chunks).pipe(
          Stream.map((pcm): Uint8Array | null => pcm),
          Stream.concat(Stream.succeed(null)),
          Stream.map((pcm) => ({ sentence, pcm })),
        ),
      ),
      Stream.runForEach(({ sentence, pcm }) =>
        Effect.gen(function* () {
          if (pcm === null) {
            progress.spoken.push(sentence);
            return;
          }

          yield* released;
          progress.firstAudioAt ??= Date.now();
          ports.audio(pcm);
        }),
      ),
    );
  }).pipe(Effect.scoped);

export const FILLER_DELAY = Duration.millis(500);

const FILLERS = ['One moment.', 'Let me check on that.', 'Give me a second.'] as const;

export const RECOVERY = "Sorry, I lost that. Could you say it again?";

let fillerIndex = -1;

const nextFiller = () => {
  fillerIndex = (fillerIndex + 1) % FILLERS.length;

  return FILLERS[fillerIndex] ?? FILLERS[0];
};

const say = (ports: TurnPorts, text: string, released: Effect.Effect<void>, progress: Progress) =>
  speakAll(ports, Stream.make(text), released, progress);

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

    yield* speakAll(ports, Stream.fromAsyncIterable(sentencesOf(body, round, progress), failed), released, progress);

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

      const silent = progress.spoken.length === 0 && text.trim() === '';
      const filling = { started: false };
      const filler = silent
        ? yield* Effect.forkChild(
            Effect.sleep(FILLER_DELAY).pipe(
              Effect.andThen(Effect.sync(() => (filling.started = true))),
              Effect.andThen(say(ports, nextFiller(), released, progress)),
              Effect.ignore,
            ),
          )
        : null;
      const outcomes = yield* toolTurn(ports, calls);

      if (filler !== null) {
        if (filling.started) yield* Fiber.join(filler);
        else yield* Fiber.interrupt(filler);
      }

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

    if (progress.spoken.length === 0) yield* say(ports, RECOVERY, released, progress).pipe(Effect.ignore);

    return { appended, spoken: progress.spoken.join(' '), sleep };
  }).pipe(
    Effect.tapError(() =>
      progress.firstAudioAt === null ? say(ports, RECOVERY, released, progress).pipe(Effect.ignore) : Effect.void,
    ),
  );
