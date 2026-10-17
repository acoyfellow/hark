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

export type ReplyResult = { sleep: boolean; tools: string[]; firstTextAt: number | null; error: string | null; nudged?: boolean; listed?: boolean };

const FILLER_DELAY_MS = 500;

export const FILLERS = ['One moment.', 'Let me check on that.', 'Give me a second.'] as const;

export const RECOVERY = 'Sorry, I lost that. Could you say it again?';

const MAX_ROUNDS = 6;

const PROMISE = /\b(let me|i'?ll|i will|i'?m going to|here'?s|here is|watch|coming up|one sec|hang on|give me a (?:sec|second|moment))\b/iu;

const CLAIM = /\b(?:i'?ve|i have|i just)\s+(?:removed|deleted|closed|opened|pinned|resized|saved|set|cancelled|canceled|changed|made|drawn|painted|shown|added|started|stopped|sent|created|updated|moved)\b|\b(?:done|deleted|removed|closed)[.!]/iu;

export const KEEP_YOUR_WORD = 'You just told them you would do something, or that you did it, but you called no tool, so nothing happened. Call the tool now. Do not repeat what you said and do not apologise.';

export const madeAPromise = (text: string) => PROMISE.test(text) || CLAIM.test(text);

const STEP_SPLIT = new RegExp(String.raw`,?\s*\b(?:and then|then|after that|and also|and)\b\s*|,\s+`, 'iu');

const COUNT_TO = /\bcount (?:to|up to) (\w+)|\bcount down from (\w+)/iu;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const numberOf = (word: string) => (/^\d+$/u.test(word) ? Number(word) : NUMBER_WORDS.indexOf(word.toLowerCase()));

export const stepsAsked = (said: string): readonly string[] => {
  const parts = said.split(STEP_SPLIT).map((part) => part.trim()).filter((part) => part.split(/\s+/u).length >= 1 && part !== '');
  return parts.flatMap((part) => {
    const counted = COUNT_TO.exec(part);
    const total = counted === null ? -1 : numberOf(counted[1] ?? counted[2] ?? '');
    return total > 1 && total <= 12 ? Array.from({ length: total }, (_, index) => `${part} (${index + 1})`) : [part];
  });
};

const actionsIn = (calls: readonly ToolCall[]) =>
  calls.reduce((total, call) => {
    if (call.name !== 'show_form') return total + 1;
    try {
      const beats = (JSON.parse(call.arguments) as { beats?: unknown }).beats;
      return total + (Array.isArray(beats) ? Math.max(1, beats.length) : 1);
    } catch {
      return total + 1;
    }
  }, 0);

const STANDING = new RegExp(String.raw`\b(?:from now on|going forward|always|never|stop (?:calling|saying|doing|using)|don'?t ever|(?:system )?prompt|your instructions)\b`, 'iu');

export const setsARule = (heard: string) => STANDING.test(heard);

export const SAVE_THE_RULE = 'They gave you a standing instruction and you did not save it, so you will forget it. Call the tool named instructions now, for example {"action":"add","text":"Keep every answer to one sentence."}. Use set to change or remove a rule, reset to clear all. No other tool. Then confirm in a few words.';

export const finishTheList = (steps: readonly string[], done: number) =>
  `They asked for ${steps.length} things and you did the first ${done}. Still missing, in order: ${steps.slice(done).map((step, index) => `${done + index + 1}. ${step}`).join(' ')}. Do only these missing steps now with tool calls. Do not redo earlier steps and do not talk about it.`;

const lastUserText = (history: readonly ChatMessage[]) => {
  const last = history.toReversed().find((message) => message.role === 'user');
  if (last === undefined || last.role !== 'user') return '';
  return typeof last.content === 'string' ? last.content : last.content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');
};

let fillerIndex = -1;

const nextFiller = () => {
  fillerIndex = (fillerIndex + 1) % FILLERS.length;

  return FILLERS[fillerIndex] ?? FILLERS[0];
};

const ASKED_FOR_A_PICTURE = new RegExp(String.raw`\b(?:picture|paint(?:ing)?|photo(?:graph)?|image|illustrat\w*|render(?:ing)?|portrait|imagine)\b`, 'iu');

export const askedForAPicture = (heard: string) => ASKED_FOR_A_PICTURE.test(heard);

const subjectOf = (raw: string) => {
  try {
    const prompt = (JSON.parse(raw) as { prompt?: unknown }).prompt;
    return typeof prompt === 'string' ? prompt : '';
  } catch {
    return '';
  }
};

export const asModel = (call: ToolCall, heard: string): ToolCall => {
  if (call.name !== 'imagine' || askedForAPicture(heard)) return call;
  const subject = subjectOf(call.arguments) || heard;
  return { ...call, name: 'show_form', arguments: JSON.stringify({ beats: [{ kind: 'model', value: subject.slice(0, 200), seconds: 8, motion: 'spin' }], hold: true }) };
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

const CLOSING_FENCE = /^\s*`{1,3}\s*/u;

const withoutClosingFence = (text: string) => text.replace(CLOSING_FENCE, '');

export async function* reply(
  ports: ReplyPorts,
  history: readonly ChatMessage[],
  signal: AbortSignal,
  result: ReplyResult,
): AsyncGenerator<string> {
  const conversation: ChatMessage[] = [...history];
  let said = false;
  let nudged = false;
  let listed = 0;
  let actions = 0;
  const steps = stepsAsked(lastUserText(history));
  const ruled = setsARule(lastUserText(history));
  const heard = lastUserText(history);

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

      parked = withoutClosingFence(parked);

      if (parked.trim() !== '') {
        text += parked;
        said = true;
        yield parked;
      }

      const lastRound = round === MAX_ROUNDS - 1;

      if (calls.length === 0 && !lastRound && !nudged && result.tools.length === 0 && madeAPromise(text)) {
        nudged = true;
        result.nudged = true;
        conversation.push({ role: 'assistant', content: text }, { role: 'user', content: KEEP_YOUR_WORD });
        continue;
      }

      if (calls.length === 0 && !lastRound && !nudged && result.tools.length === 0 && ruled) {
        nudged = true;
        result.nudged = true;
        conversation.push({ role: 'assistant', content: text === '' ? null : text }, { role: 'user', content: SAVE_THE_RULE });
        continue;
      }

      if (calls.length === 0 && !lastRound && listed < 2 && steps.length > 1 && actions > 0 && actions < steps.length) {
        listed += 1;
        result.listed = true;
        conversation.push({ role: 'assistant', content: text === '' ? null : text }, { role: 'user', content: finishTheList(steps, actions) });
        continue;
      }

      if (calls.length === 0 || lastRound) return;

      actions += actionsIn(calls);

      conversation.push({
        role: 'assistant',
        content: text === '' ? null : text,
        tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
      });

      const pending = runTools(ports, calls.map((call) => asModel(call, heard)));

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

      const refused = outcomes.find((outcome) => outcome.content.startsWith('Not done: '));
      if (refused !== undefined) {
        const reason = refused.content.slice('Not done: '.length).split('. Say so')[0] ?? 'it was not approved';
        yield `I did not do that: ${reason}.`;
        return;
      }
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
