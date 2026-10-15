import { Schema } from 'effect';

export const MIC_SAMPLE_RATE = 16_000;

export const SPEECH_SAMPLE_RATE = 24_000;

export const MIC_FRAME_SAMPLES = 1_280;

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
  { id: '@cf/moonshotai/kimi-k3', label: 'Kimi K3', note: 'Smartest. Falls back to GPT-OSS 20B if your account cannot use it yet.' },
  { id: '@cf/openai/gpt-oss-20b', label: 'GPT-OSS 20B', note: 'Quickest. The internal voice benchmark baseline.' },
  { id: '@cf/openai/gpt-oss-120b', label: 'GPT-OSS 120B', note: 'Sharper, a little slower.' },
  { id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4', note: 'Thinking off. Measure before you trust it.' },
  { id: '@cf/moonshotai/kimi-k2.6', label: 'Kimi K2.6', note: 'Deepest. Slow to answer.' },
] as const;

export const Brain = Schema.Literals(BRAINS.map((brain) => brain.id));

export type Brain = typeof Brain.Type;

export const DEFAULT_BRAIN: Brain = '@cf/moonshotai/kimi-k3';

export const FALLBACK_BRAIN: Brain = '@cf/openai/gpt-oss-20b';

export const DEFAULT_ENGINE: SpeechEngine = 'aura-1';

export const DEFAULT_VOICE: Voice = 'asteria';

export const EYES_MODEL = '@cf/google/gemma-4-26b-a4b-it';

export const WeatherDay = Schema.Struct({
  day: Schema.String,
  high: Schema.Number,
  low: Schema.Number,
  code: Schema.Number,
});

export type WeatherDay = typeof WeatherDay.Type;

export const FORM_KINDS = ['emoji', 'word', 'icon'] as const;

export const FormKind = Schema.Literals(FORM_KINDS);

export type FormKind = typeof FormKind.Type;

export const FORM_ICONS = ['sun', 'cloud', 'rain', 'snow', 'storm', 'moon', 'heart', 'star', 'check', 'clock', 'bolt', 'music', 'home', 'globe'] as const;

export const Visual = Schema.Union([
  Schema.TaggedStruct('Image', { id: Schema.String, prompt: Schema.String, src: Schema.String }),
  Schema.TaggedStruct('Weather', {
    id: Schema.String,
    place: Schema.String,
    now: Schema.Number,
    code: Schema.Number,
    wind: Schema.Number,
    days: Schema.Array(WeatherDay),
  }),
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
  Schema.TaggedStruct('Form', { id: Schema.String, kind: FormKind, value: Schema.String }),
]);

export type Visual = typeof Visual.Type;

export const Latency = Schema.Struct({
  total: Schema.Number,
  model: Schema.Number,
  speech: Schema.Number,
  eager: Schema.Boolean,
});

export type Latency = typeof Latency.Type;

export const Settings = Schema.Struct({ voice: Voice, brain: Brain, engine: SpeechEngine });

export type Settings = typeof Settings.Type;

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
]);

export type ClientFrame = typeof ClientFrame.Type;

export const ServerFrameJson = Schema.fromJsonString(ServerFrame);

export const ClientFrameJson = Schema.fromJsonString(ClientFrame);

export const encodeServerFrame = Schema.encodeSync(ServerFrameJson);

export const decodeServerFrame = Schema.decodeUnknownOption(ServerFrameJson);

export const encodeClientFrame = Schema.encodeSync(ClientFrameJson);

export const decodeClientFrame = Schema.decodeUnknownOption(ClientFrameJson);
