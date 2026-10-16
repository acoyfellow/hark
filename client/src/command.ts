import { Effect, Schema } from 'effect';
import { Command, Navigation } from 'foldkit';
import { ClientFrame } from '../../shared/protocol';
import { snapshot } from './engine';
import { Message } from './message';
import type { WorkspaceEntry } from './model';
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

export const SendHome = Command.define('SendHome', {
  messages: [Message.CompletedSignOut],
  execute: Navigation.load('/').pipe(Effect.as(Message.CompletedSignOut())),
});

const askForPush = async () => {
  if (typeof Notification === 'undefined') return 'unsupported' as const;

  const answer = await Notification.requestPermission();

  return answer === 'granted' || answer === 'denied' ? answer : ('default' as const);
};

export const AskPush = Command.define('AskPush', {
  messages: [Message.ChangedPush],
  execute: Effect.promise(askForPush).pipe(Effect.map((push) => Message.ChangedPush({ push }))),
});

const fetchTree = async () => {
  const response = await fetch('/workspace/tree').catch(() => null);

  return response?.ok === true ? ((await response.json()) as readonly WorkspaceEntry[]) : [];
};

export const LoadTree = Command.define('LoadTree', {
  messages: [Message.GotTree],
  execute: Effect.promise(fetchTree).pipe(Effect.map((tree) => Message.GotTree({ tree: [...tree] }))),
});

const fetchFile = async (path: string) => {
  const response = await fetch(`/workspace/file?path=${encodeURIComponent(path)}`).catch(() => null);

  return response?.ok === true ? await response.text() : `Could not open ${path}.`;
};

export const LoadFile = Command.define('LoadFile', {
  args: { path: Schema.String },
  messages: [Message.GotFile],
  execute: ({ path }) => Effect.promise(() => fetchFile(path)).pipe(Effect.map((text) => Message.GotFile({ path, text }))),
});
