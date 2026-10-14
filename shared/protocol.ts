import { Schema } from 'effect';

export const SOCKET_PATH = '/api/voice';

export const MIC_SAMPLE_RATE = 16_000;

export const SPEECH_SAMPLE_RATE = 24_000;

export const MIC_FRAME_SAMPLES = 1_280;

export const Presence = Schema.Literals(['waking', 'listening', 'hearing', 'thinking', 'speaking']);

export type Presence = typeof Presence.Type;

export const VOICES = [
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

export const Voice = Schema.Literals(VOICES);

export type Voice = typeof Voice.Type;

export const BRAINS = [
  { id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4', note: 'Quickest. Sees through your camera.' },
  { id: '@cf/zai-org/glm-5.3-flash', label: 'GLM 5.3 Flash', note: 'Sharper. Sees through your camera.' },
  { id: '@cf/moonshotai/kimi-k2.6', label: 'Kimi K2.6', note: 'Deepest. Slower to answer.' },
] as const;

export const Brain = Schema.Literals(BRAINS.map((brain) => brain.id));

export type Brain = typeof Brain.Type;

export const DEFAULT_BRAIN: Brain = '@cf/google/gemma-4-26b-a4b-it';

export const DEFAULT_VOICE: Voice = 'luna';

export const WeatherDay = Schema.Struct({
  day: Schema.String,
  high: Schema.Number,
  low: Schema.Number,
  code: Schema.Number,
});

export type WeatherDay = typeof WeatherDay.Type;

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
]);

export type Visual = typeof Visual.Type;

export const Latency = Schema.Struct({
  total: Schema.Number,
  model: Schema.Number,
  speech: Schema.Number,
  eager: Schema.Boolean,
});

export type Latency = typeof Latency.Type;

export const Settings = Schema.Struct({ voice: Voice, brain: Brain });

export type Settings = typeof Settings.Type;

export const ServerFrame = Schema.Union([
  Schema.TaggedStruct('Ready', {
    settings: Settings,
    account: Schema.String,
    gateway: Schema.String,
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

export const SPEECH_HEADER_BYTES = 4;

export const speechPacket = (turn: number, pcm: Uint8Array): Uint8Array => {
  const packet = new Uint8Array(SPEECH_HEADER_BYTES + pcm.byteLength);

  new DataView(packet.buffer).setUint32(0, turn, true);
  packet.set(pcm, SPEECH_HEADER_BYTES);

  return packet;
};

export const readSpeechPacket = (
  packet: ArrayBuffer,
): { readonly turn: number; readonly pcm: Int16Array } => ({
  turn: new DataView(packet).getUint32(0, true),
  pcm: new Int16Array(packet.slice(SPEECH_HEADER_BYTES)),
});
