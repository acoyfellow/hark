import { Effect } from 'effect';
import type { Visual } from '../shared/protocol';
import { flattenForBrain } from './flatten';
import { leakedCalls, markupCalls, markupRemainder, markupStart, mightBeLeakedCall, mightStartWrittenCall } from './leaked-calls';
import { chatEvents, type ToolCall } from './sse';
import type { ToolOutcome } from './tools';
import type { ChatMessage } from './chat';

export type ReplyPorts = {
  readonly chat: (messages: ReturnType<typeof flattenForBrain>, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  readonly label: (call: ToolCall) => string;
  readonly tool: (call: ToolCall) => Promise<ToolOutcome>;
  readonly doing: (label: string) => void;
  readonly show: (visual: Visual) => void;
  readonly fail: (reason: string) => void;
};

export type ReplyResult = { sleep: boolean; tools: string[]; firstTextAt: number | null; error: string | null };

export const FILLER_DELAY_MS = 500;

export const FILLERS = ['One moment.', 'Let me check on that.', 'Give me a second.'] as const;

export const RECOVERY = 'Sorry, I lost that. Could you say it again?';

const MAX_ROUNDS = 4;

let fillerIndex = -1;

const nextFiller = () => {
  fillerIndex = (fillerIndex + 1) % FILLERS.length;

  return FILLERS[fillerIndex] ?? FILLERS[0];
};

const reasonOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const runTools = (ports: ReplyPorts, calls: readonly ToolCall[]) =>
  Effect.runPromise(
    Effect.forEach(
      calls,
      (call) =>
        Effect.sync(() => ports.doing(ports.label(call))).pipe(
          Effect.andThen(
            Effect.tryPromise({ try: () => ports.tool(call), catch: reasonOf }).pipe(
              Effect.catch((reason) => Effect.succeed<ToolOutcome>({ content: `That did not work: ${reason}` })),
            ),
          ),
          Effect.tap((outcome) =>
            Effect.sync(() => {
              if (outcome.visual !== undefined) ports.show(outcome.visual);
            }),
          ),
        ),
      { concurrency: 'unbounded' },
    ),
  );

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<'late'>((resolve) => {
    const timer = setTimeout(() => resolve('late'), ms);

    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });

export async function* reply(
  ports: ReplyPorts,
  history: readonly ChatMessage[],
  signal: AbortSignal,
  result: ReplyResult,
): AsyncGenerator<string> {
  const conversation: ChatMessage[] = [...history];
  let said = false;

  try {
    for (let round = 0; round < MAX_ROUNDS && !signal.aborted; round += 1) {
      const body = await ports.chat(flattenForBrain(conversation), signal);
      let text = '';
      let held = '';
      let markup = '';
      let tail = '';
      let parked = '';
      let calls: readonly ToolCall[] = [];

      for await (const event of chatEvents(body)) {
        if (signal.aborted) return;

        if (event.kind === 'text') {
          result.firstTextAt ??= Date.now();

          if (markup !== '') {
            markup += event.text;

            const after = markupRemainder(markup);

            if (after === null) continue;

            markup = markup.slice(0, markup.length - after.length);
            parked += after;
            continue;
          }

          const joined = held + tail + event.text;
          const cut = markupStart(joined);
          const openTag = cut === -1 ? mightStartWrittenCall(joined) : null;
          const end = cut !== -1 ? cut : openTag !== null ? openTag.index : joined.length;
          const pending = joined.slice(0, end);

          tail = openTag === null ? '' : joined.slice(end);

          if (cut !== -1) markup = joined.slice(cut);

          if (cut === -1 && text === '' && (pending.trim() === '' || mightBeLeakedCall(pending))) {
            held = pending;
            continue;
          }

          held = '';
          text += pending;
          said = said || pending.trim() !== '';
          yield pending;
        }

        if (event.kind === 'tools') calls = event.calls;
      }

      const recovered =
        calls.length > 0 ? null : markup !== '' ? markupCalls(markup) : held.trim() !== '' ? leakedCalls(held) : null;

      if (recovered !== null) calls = recovered;

      if (parked.trim() !== '') {
        text += parked;
        said = true;
        yield parked;
      }

      if (calls.length === 0 || round === MAX_ROUNDS - 1) return;

      conversation.push({
        role: 'assistant',
        content: text === '' ? null : text,
        tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
      });

      const pending = runTools(ports, calls);

      if (!said && (await Promise.race([pending.then(() => 'done' as const), delay(FILLER_DELAY_MS, signal)])) === 'late') {
        said = true;
        yield `${nextFiller()} `;
      }

      const outcomes = await pending;

      outcomes.forEach((outcome, index) => {
        const call = calls[index];

        result.tools.push(call?.name ?? 'tool');
        result.sleep ||= outcome.sleep === true;
        conversation.push({ role: 'tool', tool_call_id: call?.id ?? '', content: outcome.content });

        if (outcome.image !== undefined)
          conversation.push({
            role: 'user',
            content: [
              { type: 'text', text: 'The camera frame you asked for:' },
              { type: 'image_url', image_url: { url: outcome.image } },
            ],
          });
      });
    }
  } catch (cause) {
    if (signal.aborted) return;

    result.error = reasonOf(cause).slice(0, 500);
    ports.fail(result.error);

    if (!said) {
      said = true;
      yield RECOVERY;
    }

    return;
  } finally {
    if (!said && !signal.aborted) yield RECOVERY;
  }
}
