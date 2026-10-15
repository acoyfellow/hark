import { Schema } from 'effect';
import { Latency, Presence, Settings, Visual } from '../../shared/protocol';

export const Look = Schema.Union([Schema.Literal('asleep'), Presence]);

export type Look = typeof Look.Type;

export const Model = Schema.Struct({
  local: Schema.Boolean,
  awake: Schema.Boolean,
  epoch: Schema.Number,
  connected: Schema.Boolean,
  look: Look,
  account: Schema.Option(Schema.String),
  memories: Schema.Number,
  settings: Schema.Option(Settings),
  doing: Schema.Option(Schema.String),
  visuals: Schema.Array(Visual),
  latency: Schema.Option(Latency),
  fault: Schema.Option(Schema.String),
  note: Schema.Option(Schema.String),
  camera: Schema.Boolean,
  cameraLive: Schema.Boolean,
  sheet: Schema.Boolean,
  now: Schema.Number,
});

export type Model = typeof Model.Type;

export const MAX_VISUALS = 4;
