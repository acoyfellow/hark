import { Schema } from 'effect';

export const SPEECH_SAMPLE_RATE = 24_000;

export const Presence = Schema.Literals(['waking', 'listening', 'hearing', 'thinking', 'speaking']);

export type Presence = typeof Presence.Type;

export const FAST_VOICES = [
  'asteria',
  'luna',
  'athena',
  'hera',
  'stella',
  'orion',
  'arcas',
  'zeus',
  'orpheus',
  'angus',
  'perseus',
  'helios',
] as const;

export const RICH_VOICES = [
  'luna',
  'asteria',
  'athena',
  'aurora',
  'thalia',
  'helena',
  'orion',
  'apollo',
  'arcas',
  'zeus',
  'odysseus',
  'draco',
] as const;

export const VOICES = [...new Set([...FAST_VOICES, ...RICH_VOICES])] as readonly (
  | (typeof FAST_VOICES)[number]
  | (typeof RICH_VOICES)[number]
)[];

export const Voice = Schema.Literals([...FAST_VOICES, ...RICH_VOICES.filter((voice) => !(FAST_VOICES as readonly string[]).includes(voice))] as const);

export type Voice = typeof Voice.Type;

export const SpeechEngine = Schema.Literals(['aura-1', 'aura-2']);

export type SpeechEngine = typeof SpeechEngine.Type;

export const ENGINES = [
  { id: 'aura-1', label: 'Quick', note: 'Aura 1. Starts talking fastest.', voices: FAST_VOICES },
  { id: 'aura-2', label: 'Rich', note: 'Aura 2. More natural, slower to start.', voices: RICH_VOICES },
] as const;

export const voicesFor = (engine: SpeechEngine): readonly string[] =>
  engine === 'aura-1' ? FAST_VOICES : RICH_VOICES;

export const BRAINS = [
  { id: '@cf/daily-co/phonellm-mini-alpha-2', label: 'PhoneLLM Mini', note: 'Workers AI. Pipecat tuned it for voice agents: fast, and calls tools without thinking.' },
  { id: 'gateway/openai/gpt-6-luna', label: 'GPT-6 Luna', note: 'OpenAI through your AI Gateway. Fast and sharp.' },
  { id: 'gateway/openai/gpt-6-sol', label: 'GPT-6 Sol', note: 'OpenAI through your AI Gateway.' },
  { id: 'gateway/anthropic/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Anthropic through your AI Gateway.' },
  { id: 'gateway/anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Anthropic through your AI Gateway.' },
  { id: 'gateway/anthropic/claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Anthropic through your AI Gateway. Deepest, slowest.' },
  { id: 'gateway/anthropic/claude-opus-5', label: 'Claude Opus 5', note: 'Anthropic through your AI Gateway.' },
  { id: '@cf/zai-org/glm-5.3', label: 'GLM 5.3', note: 'Workers AI. Calls tools and talks while it draws.' },
  { id: '@cf/zai-org/glm-5.3-flash', label: 'GLM 5.3 Flash', note: 'Workers AI. Quicker GLM.' },
  { id: '@cf/deepseek-ai/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash', note: 'Workers AI.' },
  { id: '@cf/deepseek-ai/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro', note: 'Workers AI. Slow.' },
  { id: '@cf/moonshotai/kimi-k3', label: 'Kimi K3', note: 'Workers AI. Falls back if your account cannot use it yet.' },
  { id: '@cf/openai/gpt-oss-120b', label: 'GPT-OSS 120B', note: 'Workers AI.' },
  { id: '@cf/openai/gpt-oss-20b', label: 'GPT-OSS 20B', note: 'Workers AI. Quickest.' },
] as const;

export const Brain = Schema.Literals(BRAINS.map((brain) => brain.id));

export type Brain = typeof Brain.Type;

export const DEFAULT_BRAIN: Brain = '@cf/daily-co/phonellm-mini-alpha-2';

const GATEWAY_BRAIN_PREFIX = 'gateway/';

export const isGatewayBrain = (brain: string) => brain.startsWith(GATEWAY_BRAIN_PREFIX);

export const FALLBACK_BRAIN: Brain = '@cf/zai-org/glm-5.3';

export const DEFAULT_ENGINE: SpeechEngine = 'aura-1';

export const DEFAULT_VOICE: Voice = 'asteria';

export const EYES_MODEL = '@cf/google/gemma-4-26b-a4b-it';


export const FORM_KINDS = ['emoji', 'word', 'icon', 'solid', 'draw', 'svg', 'code', 'model', 'painting'] as const;

export const FormKind = Schema.Literals(FORM_KINDS);

export type FormKind = typeof FormKind.Type;

export const FORM_ICONS = ['sun', 'cloud', 'rain', 'snow', 'storm', 'moon', 'heart', 'star', 'check', 'clock', 'bolt', 'music', 'home', 'globe'] as const;

export const FORM_SOLIDS = ['sphere', 'cube', 'torus', 'helix', 'galaxy', 'wave', 'heart', 'star', 'planet', 'tornado', 'flower', 'mobius'] as const;

export const FORM_MOTIONS = ['still', 'spin', 'pulse', 'bounce', 'sway', 'tumble', 'explode'] as const;

export const FormMotion = Schema.Literals(FORM_MOTIONS);

export type FormMotion = typeof FormMotion.Type;

export const Beat = Schema.Struct({ kind: FormKind, value: Schema.String, seconds: Schema.Number, motion: FormMotion, tint: Schema.optional(Schema.String) });

export type Beat = typeof Beat.Type;

export const WIDGET_KINDS = ['report', 'alert', 'table', 'chart', 'terminal', 'browser', 'files', 'sources'] as const;

const WidgetKind = Schema.Literals(WIDGET_KINDS);

export const WIDGET_TONES = ['neutral', 'good', 'warn', 'bad'] as const;

const WidgetTone = Schema.Literals(WIDGET_TONES);

const WidgetStat = Schema.Struct({ label: Schema.String, value: Schema.String, tone: WidgetTone });

const WidgetLink = Schema.Struct({ title: Schema.String, url: Schema.String, note: Schema.String });

export const Widget = Schema.Struct({
  id: Schema.String,
  kind: WidgetKind,
  tone: WidgetTone,
  title: Schema.String,
  body: Schema.String,
  stats: Schema.Array(WidgetStat),
  columns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Array(Schema.String)),
  series: Schema.Array(Schema.Struct({ label: Schema.String, value: Schema.Number })),
  code: Schema.String,
  image: Schema.NullOr(Schema.String),
  links: Schema.Array(WidgetLink),
});

export type Widget = typeof Widget.Type;

export const Visual = Schema.Union([
  Schema.TaggedStruct('Image', { id: Schema.String, prompt: Schema.String, src: Schema.String }),
  Schema.TaggedStruct('Article', {
    id: Schema.String,
    title: Schema.String,
    summary: Schema.String,
    image: Schema.NullOr(Schema.String),
    url: Schema.String,
  }),
  Schema.TaggedStruct('Timer', {
    id: Schema.String,
    label: Schema.String,
    endsAt: Schema.Number,
  }),
  Schema.TaggedStruct('Memory', { id: Schema.String, text: Schema.String, forgotten: Schema.Boolean }),
  Schema.TaggedStruct('Glimpse', { id: Schema.String, src: Schema.String }),
  Schema.TaggedStruct('Form', { id: Schema.String, beats: Schema.Array(Beat), hold: Schema.optional(Schema.Boolean) }),
  Schema.TaggedStruct('Widget', { id: Schema.String, widget: Widget }),
]);

export type Visual = typeof Visual.Type;

export const MAX_INSTRUCTIONS = 2000;

export const LINE_KINDS = ['heard', 'said', 'tool', 'result', 'error'] as const;

export const TranscriptLine = Schema.Struct({ at: Schema.Number, kind: Schema.Literals(LINE_KINDS), text: Schema.String });

export type TranscriptLine = typeof TranscriptLine.Type;

export const PANEL_SIZES = ['small', 'medium', 'large'] as const;

export const PanelSize = Schema.Literals(PANEL_SIZES);

export type PanelSize = typeof PanelSize.Type;

export const Panel = Schema.Struct({ id: Schema.String, title: Schema.String, kind: Schema.String, at: Schema.Number, open: Schema.Boolean, pinned: Schema.Boolean, size: PanelSize, visual: Visual });

export type Panel = typeof Panel.Type;

export const PANEL_ACTIONS = ['open', 'close', 'delete', 'pin', 'unpin'] as const;

export const PanelAction = Schema.Literals(PANEL_ACTIONS);

export const Latency = Schema.Struct({
  total: Schema.Number,
  model: Schema.Number,
  speech: Schema.Number,
  eager: Schema.Boolean,
});

export type Latency = typeof Latency.Type;

export const Settings = Schema.Struct({ voice: Voice, brain: Brain, engine: SpeechEngine });

export type Settings = typeof Settings.Type;

export const McpServer = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  host: Schema.String,
  state: Schema.String,
  tools: Schema.Number,
  error: Schema.NullOr(Schema.String),
  authUrl: Schema.NullOr(Schema.String),
});

export type McpServer = typeof McpServer.Type;

export const ServerFrame = Schema.Union([
  Schema.TaggedStruct('Ready', {
    settings: Settings,
    account: Schema.String,
    memories: Schema.Number,
  }),
  Schema.TaggedStruct('Presence', { presence: Presence }),
  Schema.TaggedStruct('Duck', { ducked: Schema.Boolean }),
  Schema.TaggedStruct('Interrupt', { turn: Schema.Number }),
  Schema.TaggedStruct('SpeechEnd', { turn: Schema.Number }),
  Schema.TaggedStruct('Doing', { label: Schema.String }),
  Schema.TaggedStruct('Show', { visual: Visual }),
  Schema.TaggedStruct('Snap', { id: Schema.String }),
  Schema.TaggedStruct('Measured', { latency: Latency }),
  Schema.TaggedStruct('Fault', { reason: Schema.String, fatal: Schema.Boolean }),
  Schema.TaggedStruct('Sleep', { reason: Schema.String }),
  Schema.TaggedStruct('Servers', { servers: Schema.Array(McpServer) }),
  Schema.TaggedStruct('ServerNote', { note: Schema.String, authUrl: Schema.NullOr(Schema.String) }),
  Schema.TaggedStruct('Idle', { beats: Schema.Array(Beat) }),
  Schema.TaggedStruct('OpenWorkspace', { path: Schema.NullOr(Schema.String) }),
  Schema.TaggedStruct('ShowTools', {}),
  Schema.TaggedStruct('Line', { line: TranscriptLine }),
  Schema.TaggedStruct('Lines', { lines: Schema.Array(TranscriptLine) }),
  Schema.TaggedStruct('Instructions', { text: Schema.String }),
  Schema.TaggedStruct('Guard', { on: Schema.Boolean }),
  Schema.TaggedStruct('PasskeyCreate', { id: Schema.String, challenge: Schema.String, rpId: Schema.String, user: Schema.String }),
  Schema.TaggedStruct('PasskeyAsk', { id: Schema.String, challenge: Schema.String, rpId: Schema.String, credential: Schema.String, summary: Schema.String, seconds: Schema.Number }),
  Schema.TaggedStruct('PasskeyDone', { id: Schema.String, ok: Schema.Boolean, reason: Schema.String }),
  Schema.TaggedStruct('Panels', { panels: Schema.Array(Panel), drawer: Schema.optional(Schema.Boolean) }),
]);

export type ServerFrame = typeof ServerFrame.Type;

export const ClientFrame = Schema.Union([
  Schema.TaggedStruct('Hello', {
    timeZone: Schema.String,
    locale: Schema.String,
    camera: Schema.Boolean,
  }),
  Schema.TaggedStruct('Played', { turn: Schema.Number }),
  Schema.TaggedStruct('Snapped', { id: Schema.String, src: Schema.NullOr(Schema.String) }),
  Schema.TaggedStruct('Configure', { settings: Settings }),
  Schema.TaggedStruct('Camera', { on: Schema.Boolean }),
  Schema.TaggedStruct('Hush', {}),
  Schema.TaggedStruct('AddServer', { name: Schema.String, url: Schema.String, token: Schema.String, resource: Schema.optional(Schema.String) }),
  Schema.TaggedStruct('RemoveServer', { id: Schema.String }),
  Schema.TaggedStruct('ListServers', {}),
  Schema.TaggedStruct('Panel', { id: Schema.String, action: PanelAction }),
  Schema.TaggedStruct('SetInstructions', { text: Schema.String }),
  Schema.TaggedStruct('SetGuard', { on: Schema.Boolean }),
  Schema.TaggedStruct('Subscribe', { endpoint: Schema.String, p256dh: Schema.String, auth: Schema.String }),
  Schema.TaggedStruct('PasskeyCreated', { id: Schema.String, credential: Schema.String, publicKey: Schema.String, clientData: Schema.String }),
  Schema.TaggedStruct('PasskeySigned', { id: Schema.String, clientData: Schema.String, authenticator: Schema.String, signature: Schema.String }),
  Schema.TaggedStruct('PasskeyDeclined', { id: Schema.String, reason: Schema.optional(Schema.String) }),
]);

export type ClientFrame = typeof ClientFrame.Type;

const ServerFrameJson = Schema.fromJsonString(ServerFrame);

const ClientFrameJson = Schema.fromJsonString(ClientFrame);

export const encodeServerFrame = Schema.encodeSync(ServerFrameJson);

export const encodeClientFrame = Schema.encodeSync(ClientFrameJson);

export const decodeClientFrame = Schema.decodeUnknownOption(ClientFrameJson);
