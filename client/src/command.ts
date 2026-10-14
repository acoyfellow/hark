import { Effect, Schema } from 'effect';
import { Command, Navigation } from 'foldkit';
import { ClientFrame } from '../../shared/protocol';
import { snapshot } from './engine';
import { Message } from './message';
import { VoiceLine } from './resources';

const sendFrame = (frame: ClientFrame) =>
  VoiceLine.get.pipe(
    Effect.map(({ engine }) => engine.send(frame)),
    Effect.catchTag('ResourceNotAvailable', () => Effect.void),
  );

export const Send = Command.define('Send', {
  args: { frame: ClientFrame },
  messages: [Message.CompletedSend],
  execute: ({ frame }) => sendFrame(frame).pipe(Effect.as(Message.CompletedSend())),
});

export const Snap = Command.define('Snap', {
  args: { id: Schema.String },
  messages: [Message.CompletedSend],
  execute: ({ id }) =>
    Effect.promise(() => snapshot().catch(() => null)).pipe(
      Effect.flatMap((src) => sendFrame({ _tag: 'Snapped', id, src })),
      Effect.as(Message.CompletedSend()),
    ),
});

export const SignOut = Command.define('SignOut', {
  messages: [Message.CompletedSignOut],
  execute: Effect.promise(() =>
    fetch('/oauth/logout', { method: 'POST', redirect: 'manual' }).catch(() => undefined),
  ).pipe(
    Effect.andThen(Navigation.load('/')),
    Effect.as(Message.CompletedSignOut()),
  ),
});
