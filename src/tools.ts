import { shapeToolCall } from './tool-call-shape';
import { modelProblem } from '../shared/model-parts';
import { isEmptyWidget, widgetOf } from '../shared/widget-parse';
import type { PanelChange } from './panels';
import { TOOL_CATALOG, TOOL_GROUPS } from '../shared/tool-catalog';
import { PANEL_SIZES, WIDGET_KINDS, WIDGET_TONES, type Beat, FAST_VOICES, FORM_ICONS, FORM_KINDS, FORM_MOTIONS, FORM_SOLIDS, RICH_VOICES, VOICES, type FormKind, type FormMotion, type Visual, type Voice } from '../shared/protocol';

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
  readonly mcp: McpPort;
  readonly runCode: (code: string) => Promise<string>;
  readonly signal?: AbortSignal;
  readonly terminal: (command: string) => Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>;
  readonly files: (action: 'list' | 'read' | 'write', path: string, content: string) => Promise<string>;
  readonly cloudflare: (method: string, path: string, body: unknown) => Promise<{ readonly status: number; readonly body: string }>;
  readonly webSearch: (query: string) => Promise<readonly { readonly title: string; readonly url: string; readonly note: string }[]>;
  readonly screenshot: (url: string) => Promise<{ readonly image: string; readonly title: string; readonly text: string }>;
  readonly setIdle: (beats: readonly Beat[]) => void;
  readonly openWorkspace: (path: string | null) => void;
  readonly showTools: () => void;
  readonly approve?: (call: { readonly tool: string; readonly args: Record<string, unknown> }, summary: string) => Promise<string | null>;
  readonly instructions: { readonly get: () => string; readonly set: (text: string) => string };
  readonly panels: { readonly list: () => string; readonly change: (change: PanelChange) => string };
  readonly setVoice: (voice: Voice) => void;
  readonly fetch: typeof fetch;
  readonly id: () => string;
};

export type McpPort = {
  readonly servers: () => readonly { readonly id: string; readonly name: string; readonly state: string }[];
  readonly remove: (server: string) => Promise<string>;
  readonly tools: () => readonly { readonly server: string; readonly name: string; readonly description: string; readonly schema: unknown }[];
  readonly connect: (name: string, url: string, token: string) => Promise<string>;
  readonly call: (server: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
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

const HEX = /^#[0-9a-f]{6}$/iu;

const NAMED_TINTS: Readonly<Record<string, string>> = { pink: '#ff5fa2', red: '#ff2a2a', blue: '#3d8bff', green: '#2fd27a', purple: '#a35cff', white: '#f4f4f4', gold: '#ffc24a', orange: '#ff7a1a', teal: '#21d4c4', yellow: '#ffe14a' };

const tintOf = (raw: string): string | undefined => (HEX.test(raw) ? raw.toLowerCase() : NAMED_TINTS[raw.toLowerCase()]);

const isMotion = (value: string): value is FormMotion => FORM_MOTIONS.some((motion) => motion === value);

const SHORT_WORD = 16;

const MAX_BEATS = 12;

const MAX_PATH = 4000;

const MAX_PROGRAM = 6000;

const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/u;

type BeatProblem = { readonly problem: string };

const beatOf = (raw: unknown): Beat | BeatProblem => {
  const item = rec(raw);
  const kind = str(item.kind);
  const value = typeof item.value === 'object' && item.value !== null ? JSON.stringify(item.value) : str(item.value);
  const motion = str(item.motion, 'still');
  const seconds = Math.min(12, Math.max(1, Number.isFinite(num(item.seconds)) ? num(item.seconds) : 4));

  const still = isMotion(motion) ? motion : 'still';
  const tint = tintOf(str(item.tint));
  const asWord = (text: string): Beat => ({ kind: 'word', value: text.slice(0, SHORT_WORD), seconds, motion: still });
  const asPainting = (prompt: string): Beat => ({ kind: 'painting', value: prompt, seconds, motion: still });

  if (value === '') return { problem: 'every beat needs a value' };

  if (!isFormKind(kind)) return value.length <= SHORT_WORD ? asWord(value) : asPainting(value);

  if (kind === 'icon' && !FORM_ICONS.some((icon) => icon === value)) return asWord(value);

  if (kind === 'solid' && !FORM_SOLIDS.some((solid) => solid === value)) return asWord(value);

  if (kind === 'word' && value.length > SHORT_WORD) return asPainting(value);

  if (kind === 'draw' && !SVG_PATH.test(value)) return value.includes('<svg') ? { kind: 'svg', value: value.slice(0, MAX_PROGRAM), seconds, motion: still } : asPainting(value.slice(0, 300));

  if (kind === 'draw' && value.length > MAX_PATH) return asPainting(value.slice(0, 300));

  if ((kind === 'svg' || kind === 'code' || kind === 'model') && value.length > MAX_PROGRAM) return { problem: `${kind} must be under ${MAX_PROGRAM} characters` };

  const broken = kind === 'code' ? staticProgramProblem(value) : kind === 'model' ? modelProblem(value) : null;

  if (broken !== null) return { problem: `the ${kind} beat ${broken}. Fix it and call show_form again` };

  return tint === undefined ? { kind, value, seconds, motion: still } : { kind, value, seconds, motion: still, tint };
};

const isProblem = (beat: Beat | BeatProblem): beat is BeatProblem => 'problem' in beat;

const REDECLARED = /\b(?:const|let|var)\s+(i|n|t|out)\b/u;

const FORBIDDEN = /\b(?:fetch|importScripts|XMLHttpRequest|WebSocket|document|window)\b/u;

const staticProgramProblem = (body: string): string | null => {
  const redeclared = REDECLARED.exec(body);

  if (redeclared !== null) return `redeclares ${redeclared[1]}, which is already given (i index, n count, t seconds, out result)`;

  if (FORBIDDEN.test(body)) return 'uses the network or the page, which the sandbox does not have';

  if (!/out\s*\[\s*[01]\s*\]\s*=/u.test(body)) return 'never writes out[0] and out[1], so nothing moves';

  return null;
};

const showForm: Definition = {
  name: 'show_form',
  label: (args) => (list(args.beats).length > 1 ? 'Putting on a show' : args.hold === true ? 'Holding it' : 'Shaping it'),
  description: [
    'The glowing ember swarm on their screen is your body and your face. This is how you show things, joke, and feel. Use it often and boldly, in nearly every answer, while you talk.',
    'Send one beat for a single shape, or up to twelve beats to play a movie: a seed that sprouts into a flower, a rocket that becomes a star, a countdown 3 2 1 then fireworks.',
    'When they ask for several things in a row ("count to ten, then go square, then a circle"), put every step in ONE call as beats, in the order they asked. Counting to ten is ten word beats. Never drop or merge a step.',
    'Kinds of beat:',
    '- "emoji": one emoji, traced in embers.',
    `- "word": a short word or number, up to ${SHORT_WORD} letters.`,
    `- "icon": one of ${FORM_ICONS.join(', ')}.`,
    `- "solid": a real 3D shape you can spin: ${FORM_SOLIDS.join(', ')}.`,
    '- "draw": anything at all. Write SVG path data on a 0 to 100 canvas (M L Q C A Z commands, strokes are drawn as glowing lines). Draw a cat, a bicycle, a map, a face, a punchline. Be inventive.',
    '- "svg": a whole <svg viewBox="0 0 100 100"> scene with fills, strokes, text, gradients. Brightness becomes glow. Best for scenes, lettering, logos, diagrams.',
    '- "code": the most powerful kind. A JavaScript function body that moves every particle every frame, for any animation: orbits, waves, a beating heart, a running dog, a rocket launch, a clock, fireworks, a DNA helix. It receives (i, n, t, out): particle index i of n, time t in seconds. Write out[0], out[1], out[2] (x, y, z, about -1 to 1) and out[3] (brightness 0 to 1). Math is available. No DOM, no network. Example: const a=i/n*Math.PI*2+t; out[0]=Math.cos(a)*0.8; out[1]=Math.sin(a*2)*0.4; out[2]=0; out[3]=0.8;',
    '- "model": a real 3D model you build from parts, like a sculptor. Value is JSON: an array of up to 40 parts, each {"shape": sphere|box|cylinder|cone|torus|capsule, "at": [x,y,z], "size": [x,y,z] half-extents, "turn": [x,y,z] degrees, "glow": 0.1 to 1}. y is up. It is rendered in embers and spins so they see it from every side. Use it for any object: a rocket, a car, a robot, a house, a chair, a snowman, a molecule, a guitar. Build it carefully with enough parts to be recognisable. Example rocket: [{"shape":"cylinder","at":[0,0,0],"size":[0.2,0.6,0.2]},{"shape":"cone","at":[0,0.8,0],"size":[0.2,0.2,0.2]},{"shape":"box","at":[0.25,-0.5,0],"size":[0.08,0.15,0.02]},{"shape":"box","at":[-0.25,-0.5,0],"size":[0.08,0.15,0.02]}]',
    '- "painting": a short image prompt; a real picture is painted and the swarm becomes it. Slow (a few seconds), so use it for the big moments.',
    `Each beat has seconds (1 to 12) and motion: ${FORM_MOTIONS.join(', ')}.`,
    'If someone asks you to make, show, draw or animate anything, always try. Prefer model for objects and 3D, code for motion, svg for scenes. Never refuse.',
    `Each beat may have tint: a color for the embers, a #rrggbb hex or one of ${Object.keys(NAMED_TINTS).join(', ')}. Use it whenever they name a color ("a pink heart").`,
    'Set hold to true to keep the last beat on screen until something else replaces it, even while you talk. Use it for "stay still", "go solid", "hold that", "keep it", long stories, and any time they want it to stay. Combine with motion "still" for a perfectly still shape. Call with hold false and no beats when they say "move again" or "let go".',
    'Set idle to true to make these beats your new resting shape: what the swarm loops whenever nothing else is showing, until changed again. Use it when they say "make that your default", "stay as X", "idle as X". Set idle true with no beats to go back to the plain ring.',
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
            tint: { type: 'string', description: 'Optional ember color: #rrggbb or a color name.' },
          },
          ['kind', 'value'],
        ),
      },
      idle: { type: 'boolean', description: 'Make these beats the resting shape that loops when nothing else is showing.' },
      hold: { type: 'boolean', description: 'Keep the last beat on screen until replaced. False with no beats lets go.' },
    },
    ['beats'],
  ),
  run: async (args, host) => {
    const raw = list(args.beats).length > 0 ? list(args.beats) : args.kind === undefined ? [] : [args];
    const holding = args.hold === true || raw.some((beat) => rec(beat).hold === true);
    const checked = raw.slice(0, MAX_BEATS).map(beatOf);
    const problems = checked.filter(isProblem).map((beat) => beat.problem);
    const good = checked.filter((beat): beat is Beat => !isProblem(beat));

    if (args.hold === false && raw.length === 0) return { content: 'Let go. The swarm moves freely again.', visual: { _tag: 'Form', id: host.id(), beats: [], hold: false } };

    if (args.idle === true && raw.length === 0 && !holding) {
      host.setIdle([]);

      return { content: 'Back to the plain resting ring.' };
    }

    if (holding && raw.length === 0) return { content: 'Holding what is on screen.', visual: { _tag: 'Form', id: host.id(), beats: [], hold: true } };

    if (good.length === 0) return { content: `Nothing was shown: ${problems.join('; ') || 'the beats were empty, probably cut off; send a shorter one'}. Call show_form again now with the fix.` };

    const beats = await Promise.all(
      good.map(async (beat) => (beat.kind === 'painting' ? { ...beat, value: await host.imagine(`${beat.value}, bold silhouette, strong contrast, dramatic light`) } : beat)),
    );

    if (args.idle === true) host.setIdle(beats);

    return {
      content: `${problems.length === 0 ? 'It is playing on their screen.' : `It is playing, but some beats were skipped: ${problems.join('; ')}.`}${args.idle === true ? ' It is now your resting shape, saved for next time.' : ''} Do not describe it.`,
      visual: holding ? { _tag: 'Form', id: host.id(), beats, hold: true } : { _tag: 'Form', id: host.id(), beats },
    };
  },
};

const MCP_ACTIONS = ['list', 'describe', 'connect', 'call', 'disconnect'] as const;

const MCP_RESULT_LIMIT = 3000;

const mcpCatalog = (host: ToolHost) => {
  const servers = host.mcp.servers();

  if (servers.length === 0) return 'No MCP servers are connected yet.';

  const tools = host.mcp.tools();

  return servers
    .map((server) => {
      const names = tools.filter((tool) => tool.server === server.name).map((tool) => tool.name);

      return `${server.name} (${server.state}): ${names.length === 0 ? 'no tools yet' : names.join(', ')}`;
    })
    .join('\n');
};

const describeTool = (host: ToolHost, server: string, name: string) => {
  const tool = host.mcp.tools().find((each) => each.name === name && (server === '' || each.server === server));

  return tool === undefined ? `No tool called ${name}. Use action list.` : `${tool.server} / ${tool.name}: ${tool.description.slice(0, 600)}\nargs ${JSON.stringify(tool.schema).slice(0, 2000)}`;
};

const mcp: Definition = {
  name: 'mcp',
  label: (args) => (args.action === 'connect' ? 'Connecting a server' : args.action === 'call' ? `Using ${str(args.tool, 'a tool')}` : 'Checking my tools'),
  description: [
    'Use any MCP server the person has connected, or connect a new one. This is how you reach tools you do not have built in: code runners, search, docs, their own services.',
    'action "list" shows each connected server and its tool names only. Call it first when you are unsure.',
    'action "describe" shows one tool\'s description and arguments: server, tool. Do this before the first call of a tool.',
    'action "connect" adds a server by name and https url, with an optional bearer token. It stays connected.',
    'action "call" runs one tool: server (name or id), tool, args.',
    'action "disconnect" removes a server by name or id when the person asks.',
    'Never say a token out loud. If a server needs a token, ask them to add it in Settings, Your MCP servers.',
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
      const state = await host.mcp.connect(str(args.name), str(args.url), str(args.token));

      return { content: `${state}\n${mcpCatalog(host)}` };
    }

    if (action === 'disconnect') return { content: await host.mcp.remove(str(args.server)) };

    if (action === 'describe') return { content: describeTool(host, str(args.server), str(args.tool)) };

    if (action === 'call') {
      const result = await host.mcp.call(str(args.server), str(args.tool), rec(args.args), host.signal);

      return { content: result.slice(0, MCP_RESULT_LIMIT) };
    }

    return { content: mcpCatalog(host) };
  },
};

const runCode: Definition = {
  name: 'run_code',
  label: () => 'Working it out',
  description: [
    'Run JavaScript on hark\'s own scratch workbench: no shell, no require, no internet. Not their computer: for "my computer", commands, node, npm or git use terminal. Use it to compute, simulate, generate data, write and keep files, or chain several tools in one go.',
    'The body is an async function. Return a value. console.log works. await hark.<capability>(input) reaches:',
    '- read_file({path}), write_file({path, content}), list_files({}), delete_file({path}): files that persist between calls and sessions.',
    '- imagine({prompt}): paint an image, returns a data URL.',
    '- mcp_tools({}) lists server and tool names, mcp_describe({server, tool}) gives one schema, mcp_call({server, tool, args}) runs it.',
    'Good for generating particle code or SVG for show_form, saving a scene as a file to replay later, or chaining MCP calls.',
  ].join('\n'),
  parameters: object({ code: { type: 'string', description: 'The async function body.' } }, ['code']),
  run: async (args, host) => ({ content: (await host.runCode(str(args.code))).slice(0, MCP_RESULT_LIMIT) }),
};

const terminalLine = (command: string, result: { exitCode: number; stdout: string; stderr: string }) =>
  [`$ ${command}`, result.stdout.trimEnd(), result.stderr.trimEnd(), result.exitCode === 0 ? '' : `[exit ${result.exitCode}]`].filter((line) => line !== '').join('\n');

const terminal: Definition = {
  name: 'terminal',
  label: () => 'Working in your computer',
  description: [
    'Their computer. When they say "my computer", "run", "node", "npm", "git" or any shell command, call this right away. Run a shell command on their own durable Linux computer (bash, node 22, npm, git, python3, curl, jq, ripgrep, wrangler). It has the internet. Files in /workspace persist between sessions.',
    'Use it for real coding work: clone a repo, scaffold a project, install packages, run tests, write and run scripts. One command per call; chain with &&. 120 second limit.',
    'The output is shown to them as a terminal card. Then say in one sentence what happened. Never read the output aloud.',
    'It has no Cloudflare token. For anything on their Cloudflare account use the cloudflare tool.',
  ].join('\n'),
  parameters: object({ command: { type: 'string' } }, ['command']),
  run: async (args, host) => {
    const command = str(args.command);
    const result = await host.terminal(command);
    const id = host.id();
    const code = terminalLine(command, result);

    return {
      content: code.slice(0, MCP_RESULT_LIMIT),
      visual: { _tag: 'Widget', id, widget: widgetOf(id, { kind: 'terminal', tone: result.exitCode === 0 ? 'neutral' : 'bad', title: command.slice(0, 80), code }) },
    };
  },
};

const openComputer: Definition = {
  name: 'open_computer',
  label: () => 'Opening your computer',
  description:
    'Open the coding workspace on screen: their file tree, the open file and a live terminal on their durable Linux computer. Call it when they say "open my computer", "show me the code", "show my files", or when they will want to watch you work. path optionally opens one file, relative to /workspace.',
  parameters: object({ path: { type: 'string' } }, []),
  run: async (args, host) => {
    const path = str(args.path);

    host.openWorkspace(path === '' ? null : path);

    return { content: path === '' ? 'The workspace is open on their screen.' : `The workspace is open on ${path}.` };
  },
};

const files: Definition = {
  name: 'files',
  label: () => 'Opening your files',
  description: 'List, read or write files on your durable computer (paths are relative to /workspace). Shows them a files card. action: list | read | write.',
  parameters: object({ action: { type: 'string', enum: ['list', 'read', 'write'] }, path: { type: 'string' }, content: { type: 'string' } }, ['action']),
  run: async (args, host) => {
    const action = args.action === 'read' || args.action === 'write' ? args.action : 'list';
    const path = str(args.path, '.');
    const text = await host.files(action, path, str(args.content));
    const id = host.id();

    return {
      content: text.slice(0, MCP_RESULT_LIMIT),
      visual: { _tag: 'Widget', id, widget: widgetOf(id, { kind: 'files', title: `${action} ${path}`, code: text }) },
    };
  },
};

const DESTRUCTIVE = new Set(['DELETE', 'PUT', 'PATCH']);

const cloudflare: Definition = {
  name: 'cloudflare',
  label: (args) => (DESTRUCTIVE.has(str(args.method).toUpperCase()) ? 'Changing your account' : 'Checking your account'),
  description: [
    'Call the Cloudflare API on their account with their own sign-in. path starts after /client/v4, and {account} is replaced with their account id. Example: GET /accounts/{account}/workers/scripts, GET /zones, GET /accounts/{account}/ai/models/search.',
    'Reads never need permission: when they ask anything about their account (how many workers, zones, models), call GET right away without asking. DELETE, PUT and PATCH change things: first say exactly what will change and ask. Only after they clearly say yes, call again with confirmed true.',
    'Summarise results out loud in one sentence and use show_widget for tables or reports.',
  ].join('\n'),
  parameters: object(
    { method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }, path: { type: 'string' }, body: { type: 'object' }, confirmed: { type: 'boolean' } },
    ['method', 'path'],
  ),
  run: async (args, host) => {
    const method = str(args.method, 'GET').toUpperCase();

    if (DESTRUCTIVE.has(method) && args.confirmed !== true) return { content: `Not done. ${method} ${str(args.path)} changes their account. Say what will change and ask them first; call again with confirmed true only after a clear yes.` };

    const result = await host.cloudflare(method, str(args.path), args.body ?? null);

    return { content: `${result.status}\n${result.body}`.slice(0, MCP_RESULT_LIMIT) };
  },
};

const webSearch: Definition = {
  name: 'web_search',
  label: () => 'Searching the web',
  description: 'Search the live web for current facts, news, docs and prices. Shows them a sources card. Answer from the results in a sentence or two and name where it came from.',
  parameters: object({ query: { type: 'string' } }, ['query']),
  run: async (args, host) => {
    const query = str(args.query);
    const results = await host.webSearch(query);
    const id = host.id();

    if (results.length === 0) return { content: 'No results came back.' };

    return {
      content: results.map((result, index) => `[${index + 1}] ${result.title} (${result.url})\n${result.note}`).join('\n\n').slice(0, MCP_RESULT_LIMIT),
      visual: { _tag: 'Widget', id, widget: widgetOf(id, { kind: 'sources', title: query, links: results.slice(0, 6) }) },
    };
  },
};

const browse: Definition = {
  name: 'browse',
  label: () => 'Opening a browser',
  description: 'Open a real web page in a headless browser, read it and show them a screenshot card. Use it to check a site, a deploy, docs or a dashboard page that is public.',
  parameters: object({ url: { type: 'string' } }, ['url']),
  run: async (args, host) => {
    const url = str(args.url);
    const page = await host.screenshot(url);
    const id = host.id();

    return {
      content: `${page.title}\n${page.text}`.slice(0, MCP_RESULT_LIMIT),
      visual: { _tag: 'Widget', id, widget: widgetOf(id, { kind: 'browser', title: page.title || url, image: page.image === '' ? null : page.image, body: page.image === '' ? page.text.slice(0, 600) : '', links: [{ title: url, url, note: '' }] }) },
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

const showWidget: Definition = {
  name: 'show_widget',
  label: () => 'Putting it on screen',
  description: [
    'Put a small live card beside the swarm for things words cannot carry: a report, an alert, a table, a chart, terminal output, a browser screenshot, a file list, or sources.',
    'When they ask for a card ("show me an alert card", "a report on"), call this right away with what you know; do not search first and do not refuse because a lookup found nothing.',
    'Use it for status reports, incident alerts, comparisons, numbers, logs and results of work you did. Keep it short and scannable. Speak the headline, never read the card aloud.',
    'kind: report | alert | table | chart | terminal | browser | files | sources. tone: neutral | good | warn | bad (alerts usually warn or bad).',
    'Fill only what helps: title, body (a few lines), stats [{label,value,tone}], columns + rows for a table, series [{label,value}] for a bar chart, code for terminal or file text, image (a URL or data URL), links [{title,url,note}] for sources.',
  ].join('\n'),
  parameters: object(
    {
      kind: { type: 'string', enum: [...WIDGET_KINDS] },
      tone: { type: 'string', enum: [...WIDGET_TONES] },
      title: { type: 'string' },
      body: { type: 'string' },
      stats: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, tone: { type: 'string', enum: [...WIDGET_TONES] } } } },
      columns: { type: 'array', items: { type: 'string' } },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      series: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } } } },
      code: { type: 'string' },
      image: { type: 'string' },
      links: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } } } },
    },
    ['kind', 'title'],
  ),
  run: async (args, host) => {
    const id = host.id();
    const widget = widgetOf(id, args);

    if (isEmptyWidget(widget)) return { content: 'Nothing was shown: the card was empty. Give it a title and some content, then call show_widget again.' };

    return { content: 'It is on their screen. Say the headline in one sentence; do not read the card.', visual: { _tag: 'Widget', id, widget } };
  },
};

const LIMITS = [
  `Shapes: up to ${MAX_BEATS} beats per show, each 1 to 12 seconds; hold keeps one on screen as long as they like.`,
  '3D models: up to 40 parts (spheres, boxes, cylinders, cones, tori, capsules).',
  'Panels: 4 open at once, 40 kept in the drawer; small, medium or large.',
  'Terminal: one command at a time, 120 seconds each, on their own durable Linux computer.',
  'Cloudflare: reads at once; changes only after they say yes.',
  'Memory: facts they ask to keep; the last 24 messages as text; never audio or camera frames.',
  'It cannot see the screen unless the camera is on, and it cannot browse logged-in sites.',
];

export const capabilityReport = (servers: readonly { readonly name: string; readonly state: string }[], tools: readonly { readonly server: string; readonly name: string }[]) =>
  [
    ...TOOL_GROUPS.map((group) => `${group}: ${TOOL_CATALOG.filter((tool) => tool.group === group).map((tool) => `${tool.title} (${tool.name}, say "${tool.say}")`).join('; ')}`),
    servers.length === 0 ? 'MCP servers: none connected. They can add one by URL in Settings, Tools.' : `MCP servers: ${servers.map((server) => `${server.name} (${server.state}): ${tools.filter((tool) => tool.server === server.name).map((tool) => tool.name).join(', ') || 'no tools yet'}`).join('; ')}`,
    'Limits:',
    ...LIMITS,
  ].join('\n');

const instructionsTool: Definition = {
  name: 'instructions',
  label: (args) => (str(args.action) === 'get' ? 'Reading my instructions' : 'Updating my instructions'),
  description: [
    'Their own standing instructions for you, kept on their account and added to your system prompt every turn. Use it when they say "edit your system prompt", "from now on ...", "always ...", "never ...", "stop doing ...", "what are your instructions", or "reset your prompt".',
    'action get: read them back. add: append one instruction (best for "from now on" and "always"). set: replace them all with text. reset: clear them back to your defaults.',
    'Your built-in safety and voice rules cannot be changed, only added to. Confirm the change in one short sentence.',
  ].join('\n'),
  parameters: object({ action: { type: 'string', enum: ['get', 'add', 'set', 'reset'] }, text: { type: 'string' } }, ['action']),
  run: async (args, host) => {
    const action = str(args.action, 'get');
    const current = host.instructions.get();
    if (action === 'get') return { content: current === '' ? 'No instructions of their own yet; only your defaults.' : `Their instructions:\n${current}` };
    if (action === 'reset') {
      host.instructions.set('');
      return { content: 'Cleared. You are back to your defaults.' };
    }
    const text = str(args.text).trim();
    if (text === '') return { content: 'Nothing to save: say what the instruction should be.' };
    const saved = host.instructions.set(action === 'add' && current !== '' ? `${current}\n- ${text}` : action === 'add' ? `- ${text}` : text);
    return { content: `Saved. It applies from your next reply. Now:\n${saved}` };
  },
};

const capabilities: Definition = {
  name: 'capabilities',
  label: () => 'Checking what I can do',
  description: 'Use this whenever they ask what you can do, what your tools are, what you cannot do, or how big or long something can be. It returns the real list and limits and opens the tool list on their screen. Answer from it in two or three spoken sentences, naming a few tools by what they do, then offer the tool list on screen.',
  parameters: object({}, []),
  run: async (_args, host) => {
    host.showTools();
    return { content: capabilityReport(host.mcp.servers(), host.mcp.tools()) };
  },
};

const PANEL_VERBS = ['list', 'open', 'close', 'delete', 'pin', 'unpin', 'resize', 'close_all', 'delete_all'] as const;

const panelsTool: Definition = {
  name: 'panels',
  label: (args) => (str(args.action) === 'list' ? 'Showing your panels' : 'Arranging panels'),
  description: [
    'Every card you show (articles, pictures, timers, memories, widgets) is kept as a panel. Panels stack on the right; older ones go to a drawer they can open. Use this to manage them by voice.',
    'action list: show the drawer and get the numbered list. open: bring one back. close: hide it (stays in the drawer). delete: remove it for good. pin: keep it open. unpin. resize: size small, medium or large ("make it bigger" is large, "smaller" is small). close_all, delete_all.',
    'which: copy the number or the words THEY said. "number two" is which "2". "the deploy report" is which "deploy report". "that one" or "it" is which "last". Never guess a different number.',
    'Examples: "show my panels" {action:list}. "open the forecast again" {action:open, which:"forecast"}. "delete number two" {action:delete, which:"2"}. "make the lighthouse bigger" {action:resize, which:"lighthouse", size:"large"}. "make that smaller" {action:resize, which:"last", size:"small"}. "pin the deploy report" {action:pin, which:"deploy report"}. "close all" {action:close_all}.',
    'Do not call list first unless they asked to see the list. When they ask to delete, close, open, pin or resize a panel, call this tool right away; never just say you did it.',
  ].join('\n'),
  parameters: object(
    {
      action: { type: 'string', enum: [...PANEL_VERBS] },
      which: { type: 'string', description: 'Number, title words, or "last".' },
      size: { type: 'string', enum: [...PANEL_SIZES] },
    },
    ['action'],
  ),
  run: async (args, host) => {
    const asked = str(args.action, 'list');
    const which = str(args.which, 'last');
    const action = asked !== 'resize' && PANEL_SIZES.some((each) => each === str(args.size)) ? 'resize' : asked;
    if (action === 'list') return { content: `${host.panels.list()}\nThe drawer is open on their screen. Tell them how many there are in one short sentence. Do not open any unless they ask.` };
    if (action === 'close_all' || action === 'delete_all') return { content: host.panels.change({ action }) };
    if (action === 'resize') {
      const size = PANEL_SIZES.find((each) => each === str(args.size)) ?? 'large';
      return { content: host.panels.change({ action, which, size }) };
    }
    if (action === 'open' || action === 'close' || action === 'delete' || action === 'pin' || action === 'unpin') return { content: host.panels.change({ action, which }) };
    return { content: `Unknown action ${action}. Use one of ${PANEL_VERBS.join(', ')}.` };
  },
};

export const TOOLS: readonly Definition[] = [
  capabilities,
  instructionsTool,
  panelsTool,
  lookUp,
  setTimer,
  cancelTimer,
  remember,
  forget,
  look,
  imagine,
  changeVoice,
  showForm,
  showWidget,
  terminal,
  files,
  openComputer,
  cloudflare,
  webSearch,
  browse,
  mcp,
  runCode,
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

const TOOL_NAMES = (): readonly string[] => TOOLS.map((tool) => tool.name);

export const toolLabel = (calledName: string, calledArgs: Record<string, unknown>): string => {
  const { name, args } = shapeToolCall(calledName, calledArgs, TOOL_NAMES());

  return TOOLS.find((tool) => tool.name === name)?.label(args) ?? 'Working on it';
};

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MCP_READS = new Set(['list', 'describe']);
const RUN_CODE_DELETES = new RegExp(String.raw`\b(?:rm|unlink|rmdir|delete)\b|\.unlink|\.rm\(|\.delete\(`, 'iu');

export const needsPasskey = (name: string, args: Record<string, unknown>): string | null => {
  if (name === 'cloudflare' && WRITES.has(str(args.method, 'GET').toUpperCase())) return `${str(args.method).toUpperCase()} ${str(args.path)}`;
  if (name === 'terminal') return `run ${str(args.command).slice(0, 80)}`;
  if (name === 'files' && str(args.action) === 'write') return `write ${str(args.path)}`;
  if (name === 'run_code' && RUN_CODE_DELETES.test(str(args.code))) return 'run code that deletes files';
  if (name === 'mcp' && !MCP_READS.has(str(args.action, 'list'))) return `${str(args.action)} ${str(args.server)} ${str(args.tool)}`.trim();
  if (name === 'instructions' && str(args.action, 'get') !== 'get') return `${str(args.action)} your instructions`;
  if (name === 'panels' && (str(args.action) === 'delete' || str(args.action) === 'delete_all')) return `${str(args.action).replace('_', ' ')} panels`;
  return null;
};

export const runTool = async (
  calledName: string,
  calledArgs: Record<string, unknown>,
  host: ToolHost,
): Promise<ToolOutcome> => {
  const { name, args } = shapeToolCall(calledName, calledArgs, TOOL_NAMES());
  const tool = TOOLS.find((each) => each.name === name);

  if (tool === undefined) return { content: `There is no tool called ${name}.` };

  const guarded = needsPasskey(name, args);

  if (guarded !== null && host.approve !== undefined) {
    const refused = await host.approve({ tool: name, args }, guarded);
    if (refused !== null) return { content: `Not done: ${refused}. Tell them in a few words; do not retry unless they ask.` };
  }

  try {
    return await tool.run(args, host);
  } catch (cause) {
    return {
      content: `That did not work: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
};
