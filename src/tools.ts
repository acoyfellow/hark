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
  readonly judge: (request: Record<string, unknown>) => Promise<unknown>;
  readonly mcp: McpPort;
  readonly runCode: (code: string) => Promise<string>;
  readonly teach: (label: string, description: string, example: string | null) => number;
  readonly unteach: (label: string) => number;
  readonly taught: () => readonly string[];
  readonly setVoice: (voice: Voice) => void;
  readonly fetch: typeof fetch;
  readonly id: () => string;
};

export type McpPort = {
  readonly servers: () => readonly { readonly id: string; readonly name: string; readonly state: string }[];
  readonly tools: () => readonly { readonly server: string; readonly name: string; readonly description: string; readonly schema: unknown }[];
  readonly connect: (name: string, url: string, token: string) => Promise<string>;
  readonly call: (server: string, tool: string, args: Record<string, unknown>) => Promise<string>;
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

const MAX_PROGRAM = 6000;

const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/u;

type BeatProblem = { readonly problem: string };

const beatOf = (raw: unknown): Beat | BeatProblem => {
  const item = rec(raw);
  const kind = str(item.kind);
  const value = str(item.value);
  const motion = str(item.motion, 'still');
  const seconds = Math.min(12, Math.max(1, Number.isFinite(num(item.seconds)) ? num(item.seconds) : 4));

  const still = isMotion(motion) ? motion : 'still';
  const asWord = (text: string): Beat => ({ kind: 'word', value: text.slice(0, SHORT_WORD), seconds, motion: still });
  const asPainting = (prompt: string): Beat => ({ kind: 'painting', value: prompt, seconds, motion: still });

  if (value === '') return { problem: 'every beat needs a value' };

  if (!isFormKind(kind)) return value.length <= SHORT_WORD ? asWord(value) : asPainting(value);

  if (kind === 'icon' && !FORM_ICONS.some((icon) => icon === value)) return asWord(value);

  if (kind === 'solid' && !FORM_SOLIDS.some((solid) => solid === value)) return asWord(value);

  if (kind === 'word' && value.length > SHORT_WORD) return asPainting(value);

  if (kind === 'draw' && !SVG_PATH.test(value)) return value.includes('<svg') ? { kind: 'svg', value: value.slice(0, MAX_PROGRAM), seconds, motion: still } : asPainting(value.slice(0, 300));

  if (kind === 'draw' && value.length > MAX_PATH) return asPainting(value.slice(0, 300));

  if ((kind === 'svg' || kind === 'code') && value.length > MAX_PROGRAM) return { problem: `${kind} must be under ${MAX_PROGRAM} characters` };

  const broken = kind === 'code' ? dryRunProgram(value) : null;

  if (broken !== null) return { problem: `the code beat ${broken}. n is already the particle count; do not redeclare i, n, t or out. Fix it and call show_form again` };

  return { kind, value, seconds, motion: still };
};

const isProblem = (beat: Beat | BeatProblem): beat is BeatProblem => 'problem' in beat;

const DRY_RUN_COUNT = 6000;

const DRY_RUN_PARTICLES = [0, 1, 7, 211, 2999, DRY_RUN_COUNT - 1];

export const dryRunProgram = (body: string): string | null => {
  let move: (i: number, n: number, t: number, out: number[], math: Math) => void;

  try {
    move = new Function('i', 'n', 't', 'out', 'Math', body) as typeof move;
  } catch (cause) {
    return `does not compile: ${cause instanceof Error ? cause.message : String(cause)}`;
  }

  const points = new Set<string>();

  for (const index of DRY_RUN_PARTICLES) {
    const out = [0, 0, 0, 0.7];

    try {
      move(index, DRY_RUN_COUNT, 1.3, out, Math);
    } catch (cause) {
      return `throws for particle ${index}: ${cause instanceof Error ? cause.message : String(cause)}`;
    }

    if (!out.slice(0, 3).every(Number.isFinite)) return `particle ${index} got a non-number position`;

    points.add(out.slice(0, 2).map((value) => value.toFixed(3)).join(','));
  }

  return points.size < 3 ? 'every particle lands on the same spot; spread them out using i / n' : null;
};

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
    '- "svg": a whole <svg viewBox="0 0 100 100"> scene with fills, strokes, text, gradients. Brightness becomes glow. Best for scenes, lettering, logos, diagrams.',
    '- "code": the most powerful kind. A JavaScript function body that moves every particle every frame, for any animation: orbits, waves, a beating heart, a running dog, a rocket launch, a clock, fireworks, a DNA helix. It receives (i, n, t, out): particle index i of n, time t in seconds. Write out[0], out[1], out[2] (x, y, z, about -1 to 1) and out[3] (brightness 0 to 1). Math is available. No DOM, no network. Example: const a=i/n*Math.PI*2+t; out[0]=Math.cos(a)*0.8; out[1]=Math.sin(a*2)*0.4; out[2]=0; out[3]=0.8;',
    '- "painting": a short image prompt; a real picture is painted and the swarm becomes it. Slow (a few seconds), so use it for the big moments.',
    `Each beat has seconds (1 to 12) and motion: ${FORM_MOTIONS.join(', ')}.`,
    'If someone asks you to make, show, draw or animate anything, always try. Prefer code for motion and svg for scenes. Never refuse.',
    'Then keep talking. Never describe the shape, never read out the path or the code.',
  ].join('\n'),
  parameters: object(
    {
      beats: {
        type: 'array',
        maxItems: MAX_BEATS,
        items: object(
          {
            kind: { type: 'string', enum: [...FORM_KINDS] },
            value: { type: 'string', description: 'The emoji, word, icon name, solid name, SVG path data, SVG markup, JavaScript body, or painting prompt.' },
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

    if (good.length === 0) return { content: `Nothing was shown: ${problems.join('; ') || 'the beats were empty, probably cut off; send a shorter one'}. Call show_form again now with the fix.` };

    const beats = await Promise.all(
      good.map(async (beat) => (beat.kind === 'painting' ? { ...beat, value: await host.imagine(`${beat.value}, bold silhouette, strong contrast, dramatic light`) } : beat)),
    );

    return {
      content: problems.length === 0 ? 'It is playing on their screen. Do not describe it.' : `It is playing, but some beats were skipped: ${problems.join('; ')}.`,
      visual: { _tag: 'Form', id: host.id(), beats },
    };
  },
};

const JUDGE_KINDS = ['yes_no', 'choice', 'score'] as const;

export const judgeQuestion = (raw: unknown): Record<string, unknown> | null => {
  const item = rec(raw);
  const kind = str(item.kind, 'yes_no');
  const question = str(item.question);
  const options = list(item.options).map((option) => str(option)).filter((option) => option !== '');

  if (question === '') return null;

  if (kind === 'choice' && options.length >= 2) return { type: 'choice', instructions: question, criteria: Object.fromEntries(options.map((option) => [option, option])) };

  if (kind === 'score' && options.length >= 2) return { type: 'score', instructions: question, criteria: options.slice(0, 10) };

  return { type: 'noul', instructions: question };
};

const judge: Definition = {
  name: 'judge',
  label: (args) => (args.camera === true ? 'Looking closely' : 'Weighing it'),
  description: [
    'Ask a fast judgment model typed questions and get calibrated probabilities back, not prose. Use it to decide things precisely: what is the person holding, which of these is it, how happy do they look, is this text a scam, which option fits best.',
    'Set camera to true to judge the current camera frame. Combine with show_form: judge what they hold, then shape the swarm into it.',
    `Each question has kind ${JUDGE_KINDS.join(', ')}. choice needs 2 or more options. score needs 2 to 10 ordered levels.`,
  ].join('\n'),
  parameters: object(
    {
      context: { type: 'string', description: 'What to judge, as text. Can be empty when judging the camera.' },
      camera: { type: 'boolean', description: 'Judge the current camera frame.' },
      questions: {
        type: 'array',
        maxItems: 8,
        items: object(
          {
            question: { type: 'string' },
            kind: { type: 'string', enum: [...JUDGE_KINDS] },
            options: { type: 'array', items: { type: 'string' } },
          },
          ['question'],
        ),
      },
    },
    ['questions'],
  ),
  run: async (args, host) => {
    const questions = list(args.questions).map(judgeQuestion).filter((question) => question !== null);

    if (questions.length === 0) return { content: 'Ask at least one question.' };

    const image = args.camera === true ? await host.look() : null;

    if (args.camera === true && image === null) return { content: 'The camera is off. Ask them to tap the camera button.' };

    const result = await host.judge({
      state: { context: str(args.context) || 'the image' },
      questions: Object.fromEntries(questions.map((question, index) => [`q${index + 1}`, question])),
      ...(image === null ? {} : { images: [image] }),
    });

    return { content: `Answers with probabilities: ${JSON.stringify(rec(result).answers ?? result).slice(0, 1500)}` };
  },
};

const MCP_ACTIONS = ['list', 'connect', 'call'] as const;

const MCP_RESULT_LIMIT = 3000;

const mcpCatalog = (host: ToolHost) => {
  const servers = host.mcp.servers();

  if (servers.length === 0) return 'No MCP servers are connected yet.';

  return [
    `Connected servers: ${servers.map((server) => `${server.name} (${server.id}, ${server.state})`).join(', ')}.`,
    ...host.mcp.tools().map((tool) => `- ${tool.server} / ${tool.name}: ${tool.description.slice(0, 200)} args ${JSON.stringify(tool.schema).slice(0, 400)}`),
  ].join('\n');
};

const mcp: Definition = {
  name: 'mcp',
  label: (args) => (args.action === 'connect' ? 'Connecting a server' : args.action === 'call' ? `Using ${str(args.tool, 'a tool')}` : 'Checking my tools'),
  description: [
    'Use any MCP server the person has connected, or connect a new one. This is how you reach tools you do not have built in: code runners, judges, search, their own services.',
    'action "list" shows connected servers and every tool with its arguments. Call it first when you are unsure.',
    'action "connect" adds a server by name and https url, with an optional bearer token. It stays connected.',
    'action "call" runs one tool: server (name or id), tool, args.',
  ].join('\n'),
  parameters: object(
    {
      action: { type: 'string', enum: [...MCP_ACTIONS] },
      server: { type: 'string' },
      tool: { type: 'string' },
      args: { type: 'object' },
      name: { type: 'string' },
      url: { type: 'string' },
      token: { type: 'string' },
    },
    ['action'],
  ),
  run: async (args, host) => {
    const action = str(args.action, 'list');

    if (action === 'connect') {
      const url = str(args.url);

      if (!url.startsWith('https:') && !url.startsWith('http:')) return { content: 'connect needs an http or https url.' };

      const state = await host.mcp.connect(str(args.name, new URL(url).hostname), url, str(args.token));

      return { content: `${state}\n${mcpCatalog(host)}` };
    }

    if (action === 'call') {
      const result = await host.mcp.call(str(args.server), str(args.tool), rec(args.args));

      return { content: result.slice(0, MCP_RESULT_LIMIT) };
    }

    return { content: mcpCatalog(host) };
  },
};

const runCode: Definition = {
  name: 'run_code',
  label: () => 'Working it out',
  description: [
    'Run JavaScript on your own durable workbench, a sandbox with no internet. Use it to compute, simulate, generate data, write and keep files, or chain several tools in one go.',
    'The body is an async function. Return a value. console.log works. await hark.<capability>(input) reaches:',
    '- read_file({path}), write_file({path, content}), list_files({}), delete_file({path}): files that persist between calls and sessions.',
    '- judge({context, questions:[{question, kind, options}]}): calibrated probabilities from the judgment model.',
    '- imagine({prompt}): paint an image, returns a data URL.',
    '- mcp_tools({}), mcp_call({server, tool, args}): every connected MCP server.',
    'Good for generating particle code or SVG for show_form, saving a scene as a file to replay later, or batch judging.',
  ].join('\n'),
  parameters: object({ code: { type: 'string', description: 'The async function body.' } }, ['code']),
  run: async (args, host) => ({ content: (await host.runCode(str(args.code))).slice(0, MCP_RESULT_LIMIT) }),
};

const MAX_LABEL = 40;

const teachSight: Definition = {
  name: 'teach_sight',
  label: (args) => `Learning ${str(args.label, 'that')}`,
  description: [
    'Teach your live camera vision a new thing, for this person only. Use it when they say "this is my ...", "remember what this is", "learn this", or correct you ("no, that is a ...").',
    'It saves the label, a short visual description, and the current camera frame as an example. From then on your live vision recognises it.',
    'action "teach" (default) needs label and description. action "forget" removes a label. action "list" shows what you have learned.',
  ].join('\n'),
  parameters: object(
    {
      action: { type: 'string', enum: ['teach', 'forget', 'list'] },
      label: { type: 'string', description: `Short name, up to ${MAX_LABEL} characters, like "my blue mug" or "Biscuit the dog".` },
      description: { type: 'string', description: 'What it looks like, in a few words, so it can be told apart.' },
    },
    [],
  ),
  run: async (args, host) => {
    const action = str(args.action, 'teach');
    const label = str(args.label).slice(0, MAX_LABEL);

    if (action === 'list') {
      const known = host.taught();

      return { content: known.length === 0 ? 'You have not learned anything yet.' : `You have learned: ${known.join(', ')}.` };
    }

    if (label === '') return { content: 'Give it a label.' };

    if (action === 'forget') return { content: host.unteach(label) > 0 ? `Forgot ${label}.` : `You did not know ${label}.` };

    const example = await host.look();
    const count = host.teach(label, str(args.description).slice(0, 200), example);

    return { content: `Learned ${label}${example === null ? ' from the description only, since the camera is off' : ' with this camera frame as an example'}. You now know ${count} things. Say so briefly.` };
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
  judge,
  mcp,
  runCode,
  teachSight,
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
