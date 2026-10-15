import { type Beat, FAST_VOICES, FORM_ICONS, FORM_KINDS, FORM_MOTIONS, FORM_SOLIDS, RICH_VOICES, VOICES, type FormKind, type FormMotion, type Visual, type Voice } from '../shared/protocol';

export type ToolOutcome = {
  readonly content: string;
  readonly visual?: Visual;
  readonly image?: string;
  readonly sleep?: boolean;
};

export type ToolHost = {
  readonly timeZone: string;
  readonly remember: (fact: string) => number;
  readonly forget: (fact: string) => number;
  readonly setTimer: (seconds: number, label: string) => number;
  readonly cancelTimer: (label: string) => number;
  readonly look: () => Promise<string | null>;
  readonly see: (image: string, question: string) => Promise<string>;
  readonly imagine: (prompt: string) => Promise<string>;
  readonly setVoice: (voice: Voice) => void;
  readonly fetch: typeof fetch;
  readonly id: () => string;
};

type Definition = {
  readonly name: string;
  readonly label: (args: Record<string, unknown>) => string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly run: (args: Record<string, unknown>, host: ToolHost) => Promise<ToolOutcome>;
};

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

const num = (value: unknown): number =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

const object = (properties: Record<string, unknown>, required: readonly string[]) => ({
  type: 'object',
  properties,
  required,
});

const UA = { 'user-agent': 'hark/0.1 (https://github.com/acoyfellow/hark)' };

const json = async (host: ToolHost, url: string): Promise<Record<string, unknown>> => {
  const response = await host.fetch(url, { headers: UA });

  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);

  const parsed: unknown = await response.json();

  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const rec = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const lookUp: Definition = {
  name: 'look_up',
  label: (args) => `Looking up ${str(args.topic, 'that')}`,
  description:
    'Look up a person, place, thing, or event in Wikipedia. Use it for factual questions you are not sure about.',
  parameters: object({ topic: { type: 'string', description: 'What to look up' } }, ['topic']),
  run: async (args, host) => {
    const topic = str(args.topic);
    const search = await json(
      host,
      `https://en.wikipedia.org/w/rest.php/v1/search/page?limit=1&q=${encodeURIComponent(topic)}`,
    );
    const page = rec(list(search.pages)[0]);
    const key = str(page.key);

    if (key === '') return { content: `Wikipedia has nothing on "${topic}".` };

    const summary = await json(
      host,
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`,
    );
    const title = str(summary.title, key);
    const extract = str(summary.extract);
    const image = str(rec(summary.thumbnail).source) || null;

    return {
      content: JSON.stringify({ title, summary: extract.slice(0, 1600) }),
      visual: {
        _tag: 'Article',
        id: host.id(),
        title,
        summary: extract.slice(0, 280),
        image,
        url: str(rec(rec(summary.content_urls).desktop).page) || `https://en.wikipedia.org/wiki/${key}`,
      },
    };
  },
};

const setTimer: Definition = {
  name: 'set_timer',
  label: (args) => `Setting a timer${str(args.label) === '' ? '' : ` for ${str(args.label)}`}`,
  description:
    'Start a countdown timer or reminder. When it ends you will be told so you can say it out loud.',
  parameters: object(
    {
      seconds: { type: 'number', description: 'Length of the timer in seconds' },
      label: { type: 'string', description: 'Short name, like "pasta" or "call mom"' },
    },
    ['seconds', 'label'],
  ),
  run: async (args, host) => {
    const seconds = Math.round(num(args.seconds));

    if (!(seconds >= 1 && seconds <= 86_400))
      return { content: 'Timers can run from one second to one day.' };

    const label = str(args.label, 'timer') || 'timer';
    const endsAt = host.setTimer(seconds, label);

    return {
      content: `Timer "${label}" set for ${seconds} seconds.`,
      visual: { _tag: 'Timer', id: `timer:${label}`, label, endsAt },
    };
  },
};

const cancelTimer: Definition = {
  name: 'cancel_timer',
  label: () => 'Cancelling a timer',
  description: 'Cancel a running timer by its name.',
  parameters: object({ label: { type: 'string' } }, ['label']),
  run: async (args, host) => {
    const removed = host.cancelTimer(str(args.label));

    return { content: removed > 0 ? 'Cancelled.' : 'No timer by that name was running.' };
  },
};

const remember: Definition = {
  name: 'remember',
  label: () => 'Remembering that',
  description:
    'Save a lasting fact about the person (name, preferences, people, plans). Only when they share something worth keeping or ask you to remember.',
  parameters: object({ fact: { type: 'string', description: 'One short sentence' } }, ['fact']),
  run: async (args, host) => {
    const fact = str(args.fact);

    if (fact === '') return { content: 'Nothing to remember.' };

    host.remember(fact);

    return {
      content: 'Saved.',
      visual: { _tag: 'Memory', id: host.id(), text: fact, forgotten: false },
    };
  },
};

const forget: Definition = {
  name: 'forget',
  label: () => 'Forgetting that',
  description: 'Delete saved facts that match some words, when the person asks you to forget.',
  parameters: object({ fact: { type: 'string', description: 'Words in the fact to forget' } }, [
    'fact',
  ]),
  run: async (args, host) => {
    const fact = str(args.fact);
    const removed = host.forget(fact);

    return {
      content: removed > 0 ? `Forgot ${removed} fact${removed === 1 ? '' : 's'}.` : 'Nothing matched.',
      visual: removed > 0 ? { _tag: 'Memory', id: host.id(), text: fact, forgotten: true } : undefined,
    };
  },
};

const look: Definition = {
  name: 'look',
  label: () => 'Looking through your camera',
  description:
    'See what the person is showing you through their camera. Use whenever they say look, see, show, "what is this", or ask about something in front of them.',
  parameters: object({ question: { type: 'string', description: 'What they want to know about what they are showing' } }, []),
  run: async (args, host) => {
    const frame = await host.look();

    if (frame === null)
      return {
        content: 'The camera is off. Ask them to tap the camera button at the bottom of the screen, then ask again.',
      };

    const seen = await host.see(frame, str(args.question));

    return {
      content: `The camera shows: ${seen}`,
      visual: { _tag: 'Glimpse', id: host.id(), src: frame },
    };
  },
};

const imagine: Definition = {
  name: 'imagine',
  label: () => 'Painting it',
  description:
    'Draw a picture and put it on their screen. Use when they ask to draw, paint, imagine, picture, or show something that does not exist yet.',
  parameters: object(
    {
      prompt: {
        type: 'string',
        description: 'A vivid, specific description of the image, with style and lighting',
      },
    },
    ['prompt'],
  ),
  run: async (args, host) => {
    const prompt = str(args.prompt);
    const src = await host.imagine(prompt);

    return {
      content: 'The picture is on their screen now. Say one short line about it, do not describe it in detail.',
      visual: { _tag: 'Image', id: host.id(), prompt, src },
    };
  },
};

const changeVoice: Definition = {
  name: 'change_voice',
  label: (args) => `Becoming ${str(args.voice, 'someone else')}`,
  description: `Switch your speaking voice. Quick voices: ${FAST_VOICES.join(', ')}. Rich voices: ${RICH_VOICES.join(', ')}. Feminine: asteria, luna, athena, hera, stella, aurora, thalia, helena. Masculine: orion, arcas, zeus, orpheus, angus, perseus, helios, apollo, odysseus, draco.`,
  parameters: object({ voice: { type: 'string', enum: [...VOICES] } }, ['voice']),
  run: async (args, host) => {
    const voice = VOICES.find((each) => each === str(args.voice).toLowerCase());

    if (voice === undefined) return { content: `Unknown voice. Pick one of ${VOICES.join(', ')}.` };

    host.setVoice(voice);

    return { content: `Your voice is now ${voice}. Say a short hello in it.` };
  },
};

const isFormKind = (value: string): value is FormKind => FORM_KINDS.some((kind) => kind === value);

const isMotion = (value: string): value is FormMotion => FORM_MOTIONS.some((motion) => motion === value);

const SHORT_WORD = 16;

const MAX_BEATS = 6;

const MAX_PATH = 4000;

const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/u;

type BeatProblem = { readonly problem: string };

const beatOf = (raw: unknown): Beat | BeatProblem => {
  const item = rec(raw);
  const kind = str(item.kind);
  const value = str(item.value);
  const motion = str(item.motion, 'still');
  const seconds = Math.min(12, Math.max(1, Number.isFinite(num(item.seconds)) ? num(item.seconds) : 4));

  if (!isFormKind(kind) || value === '') return { problem: 'every beat needs a kind and a value' };

  if (kind === 'icon' && !FORM_ICONS.some((icon) => icon === value)) return { problem: `no ${value} icon; icons are ${FORM_ICONS.join(', ')}` };

  if (kind === 'solid' && !FORM_SOLIDS.some((solid) => solid === value)) return { problem: `no ${value} solid; solids are ${FORM_SOLIDS.join(', ')}` };

  if (kind === 'word' && value.length > SHORT_WORD) return { problem: `"${value}" is too long; words are ${SHORT_WORD} letters at most` };

  if (kind === 'draw' && (value.length > MAX_PATH || !SVG_PATH.test(value))) return { problem: 'draw needs plain SVG path data on a 0 to 100 canvas, under 4000 characters' };

  return { kind, value, seconds, motion: isMotion(motion) ? motion : 'still' };
};

const isProblem = (beat: Beat | BeatProblem): beat is BeatProblem => 'problem' in beat;

const showForm: Definition = {
  name: 'show_form',
  label: (args) => (list(args.beats).length > 1 ? 'Putting on a show' : 'Shaping it'),
  description: [
    'The glowing ember swarm on their screen is your body and your face. This is how you show things, joke, and feel. Use it often and boldly, in nearly every answer, while you talk.',
    'Send one beat for a single shape, or up to six beats to play a little movie: a seed that sprouts into a flower, a rocket that becomes a star, a countdown 3 2 1 then fireworks.',
    'Kinds of beat:',
    '- "emoji": one emoji, traced in embers.',
    `- "word": a short word or number, up to ${SHORT_WORD} letters.`,
    `- "icon": one of ${FORM_ICONS.join(', ')}.`,
    `- "solid": a real 3D shape you can spin: ${FORM_SOLIDS.join(', ')}.`,
    '- "draw": anything at all. Write SVG path data on a 0 to 100 canvas (M L Q C A Z commands, strokes are drawn as glowing lines). Draw a cat, a bicycle, a map, a face, a punchline. Be inventive.',
    '- "painting": a short image prompt; a real picture is painted and the swarm becomes it. Slow (a few seconds), so use it for the big moments.',
    `Each beat has seconds (1 to 12) and motion: ${FORM_MOTIONS.join(', ')}.`,
    'Then keep talking. Never describe the shape, never read out the path.',
  ].join('\n'),
  parameters: object(
    {
      beats: {
        type: 'array',
        maxItems: MAX_BEATS,
        items: object(
          {
            kind: { type: 'string', enum: [...FORM_KINDS] },
            value: { type: 'string', description: 'The emoji, word, icon name, solid name, SVG path data, or painting prompt.' },
            seconds: { type: 'number', description: 'How long this beat holds, 1 to 12.' },
            motion: { type: 'string', enum: [...FORM_MOTIONS] },
          },
          ['kind', 'value'],
        ),
      },
    },
    ['beats'],
  ),
  run: async (args, host) => {
    const raw = list(args.beats).length > 0 ? list(args.beats) : args.kind === undefined ? [] : [args];
    const checked = raw.slice(0, MAX_BEATS).map(beatOf);
    const problems = checked.filter(isProblem).map((beat) => beat.problem);
    const good = checked.filter((beat): beat is Beat => !isProblem(beat));

    if (good.length === 0) return { content: `Nothing was shown: ${problems.join('; ') || 'give at least one beat'}.` };

    const beats = await Promise.all(
      good.map(async (beat) => (beat.kind === 'painting' ? { ...beat, value: await host.imagine(`${beat.value}, bold silhouette, strong contrast, dramatic light`) } : beat)),
    );

    return {
      content: problems.length === 0 ? 'It is playing on their screen. Do not describe it.' : `It is playing, but some beats were skipped: ${problems.join('; ')}.`,
      visual: { _tag: 'Form', id: host.id(), beats },
    };
  },
};

const rest: Definition = {
  name: 'rest',
  label: () => 'Going quiet',
  description:
    'Stop listening and go to sleep. Use when the person says goodbye, thanks that is all, stop listening, or go to sleep.',
  parameters: object({}, []),
  run: async () => ({ content: 'Say a very short goodbye. The microphone closes after it.', sleep: true }),
};

export const TOOLS: readonly Definition[] = [
  lookUp,
  setTimer,
  cancelTimer,
  remember,
  forget,
  look,
  imagine,
  changeVoice,
  showForm,
  rest,
];

export const toolSchemas = () =>
  TOOLS.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));

export const parseArguments = (raw: string): Record<string, unknown> => {
  try {
    return rec(JSON.parse(raw === '' ? '{}' : raw));
  } catch {
    return {};
  }
};

export const toolLabel = (name: string, args: Record<string, unknown>): string =>
  TOOLS.find((tool) => tool.name === name)?.label(args) ?? 'Working on it';

export const runTool = async (
  name: string,
  args: Record<string, unknown>,
  host: ToolHost,
): Promise<ToolOutcome> => {
  const tool = TOOLS.find((each) => each.name === name);

  if (tool === undefined) return { content: `There is no tool called ${name}.` };

  try {
    return await tool.run(args, host);
  } catch (cause) {
    return {
      content: `That did not work: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
};
