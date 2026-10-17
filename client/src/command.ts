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

const postSignOut = () => {
  const form = document.createElement('form');

  form.method = 'POST';
  form.action = '/oauth/logout';
  document.body.append(form);
  form.submit();
};

export const SignOut = Command.define('SignOut', {
  messages: [Message.CompletedSignOut],
  execute: Effect.sync(postSignOut).pipe(Effect.as(Message.CompletedSignOut())),
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

const bytes = (text: string) => {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0);
};

const text64 = (buffer: ArrayBuffer) => btoa(String.fromCodePoint(...new Uint8Array(buffer))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

let ceremony: AbortController | null = null;
let pending: Promise<unknown> = Promise.resolve();

const settled = async () => {
  ceremony?.abort();
  await pending.catch(() => undefined);
};

const freshCeremony = () => {
  ceremony = new AbortController();
  return ceremony.signal;
};

const tracked = <T>(work: Promise<T>) => {
  pending = work;
  return work;
};

const createPasskey = async (id: string, challenge: string, rpId: string, user: string): Promise<ClientFrame> => {
  try {
    await settled();
    const made = (await tracked(navigator.credentials.create({
      signal: freshCeremony(),
      publicKey: {
        challenge: bytes(challenge),
        rp: { id: rpId, name: 'hark' },
        user: { id: new TextEncoder().encode(user.slice(0, 64) || 'hark'), name: 'hark', displayName: 'hark' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
        timeout: 60_000,
      },
    }))) as PublicKeyCredential | null;
    const response = made?.response as AuthenticatorAttestationResponse | undefined;
    const publicKey = response?.getPublicKey();
    if (made === null || response === undefined || publicKey === null || publicKey === undefined) return { _tag: 'PasskeyDeclined', id };
    return { _tag: 'PasskeyCreated', id, credential: made.id, publicKey: text64(publicKey), clientData: text64(response.clientDataJSON) };
  } catch {
    return { _tag: 'PasskeyDeclined', id };
  }
};

const signPasskey = async (id: string, challenge: string, rpId: string, credential: string): Promise<ClientFrame> => {
  try {
    await settled();
    const got = (await tracked(navigator.credentials.get({
      signal: freshCeremony(),
      publicKey: { challenge: bytes(challenge), rpId, allowCredentials: [{ type: 'public-key', id: bytes(credential) }], userVerification: 'required', timeout: 60_000 },
    }))) as PublicKeyCredential | null;
    const response = got?.response as AuthenticatorAssertionResponse | undefined;
    if (got === null || response === undefined) return { _tag: 'PasskeyDeclined', id, reason: 'NotAllowedError: no passkey' };
    return { _tag: 'PasskeySigned', id, clientData: text64(response.clientDataJSON), authenticator: text64(response.authenticatorData), signature: text64(response.signature) };
  } catch (cause) {
    return { _tag: 'PasskeyDeclined', id, reason: cause instanceof Error ? `${cause.name}: ${cause.message}`.slice(0, 160) : String(cause) };
  }
};

export const CreatePasskey = Command.define('CreatePasskey', {
  args: { id: Schema.String, challenge: Schema.String, rpId: Schema.String, user: Schema.String },
  messages: [Message.CompletedSend],
  execute: ({ id, challenge, rpId, user }) => Effect.promise(() => createPasskey(id, challenge, rpId, user)).pipe(Effect.flatMap(sendFrame), Effect.as(Message.CompletedSend())),
});

export const SignPasskey = Command.define('SignPasskey', {
  args: { id: Schema.String, challenge: Schema.String, rpId: Schema.String, credential: Schema.String },
  messages: [Message.CompletedSend],
  execute: ({ id, challenge, rpId, credential }) => Effect.promise(() => signPasskey(id, challenge, rpId, credential)).pipe(Effect.flatMap(sendFrame), Effect.as(Message.CompletedSend())),
});

export const StopPasskey = Command.define('StopPasskey', {
  messages: [Message.CompletedSend],
  execute: Effect.promise(settled).pipe(Effect.as(Message.CompletedSend())),
});
