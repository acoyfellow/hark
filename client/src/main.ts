import { Effect, Option, Schema } from 'effect';
import type { Runtime } from 'foldkit';
import type { Message } from './message';
import type { Model } from './model';
import type { Resources } from './resources';

export const Flags = Schema.Struct({ local: Schema.Boolean, now: Schema.Number });

export type Flags = typeof Flags.Type;

declare global {
  interface Window {
    __HARK__?: { readonly local?: boolean };
  }
}

export const flags: Effect.Effect<Flags> = Effect.clockWith((clock) => clock.currentTimeMillis).pipe(
  Effect.map((now) => ({ local: globalThis.window?.__HARK__?.local === true, now })),
);

export const initialModel = ({ local, now }: Flags): Model => ({
  local,
  awake: false,
  epoch: 0,
  connected: false,
  look: 'asleep',
  account: Option.none(),
  memories: 0,
  settings: Option.none(),
  doing: Option.none(),
  visuals: [],
  latency: Option.none(),
  fault: Option.none(),
  note: Option.none(),
  camera: false,
  cameraLive: false,
  idle: [],
  sheet: false,
  tab: 'account',
  query: '',
  servers: [],
  draft: { url: '', token: '', pending: false, note: Option.none(), authUrl: Option.none() },
  push: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  now,
});

export const init: Runtime.ApplicationInit<Model, Message, Flags, Resources> = (startup) => ({
  model: initialModel(startup),
  commands: [],
});
