import { Match, Option } from 'effect';
import type { Command, Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';
import { DEFAULT_BRAIN, DEFAULT_ENGINE, DEFAULT_VOICE, type ServerFrame, type Settings, type Visual, voicesFor } from '../../shared/protocol';
import { AskPush, CreatePasskey, LoadFile, LoadTree, SendHome, Send, SignOut, SignPasskey, Snap, StopPasskey } from './command';
import { Message } from './message';
import { MAX_VISUALS, type Model, type SettingsTab } from './model';
import type { Resources } from './resources';

type Return = Update.Return<Model, Message, Resources>;

type AnyCommand = Command.Command<Message, never, Resources>;

const TIMER_GRACE_MS = 12_000;

const TABS: readonly SettingsTab[] = ['account', 'voice', 'brain', 'tools'];

const stepTab = (tab: SettingsTab, by: number): SettingsTab => TABS[(TABS.indexOf(tab) + by + TABS.length) % TABS.length]!;

const openSheet = (model: Model): Return => ({
  model: modifyFields(model, { sheet: () => true, query: () => '' }),
  commands: model.connected ? [Send({ frame: { _tag: 'ListServers' } })] : [],
});

const emptyDraft = { url: '', token: '', pending: false, note: Option.none<string>(), authUrl: Option.none<string>() };

const withVisual = (visuals: readonly Visual[], visual: Visual): Visual[] =>
  [...visuals.filter((each) => each.id !== visual.id), visual].slice(-MAX_VISUALS);

const settingsOf = (model: Model): Settings =>
  Option.getOrElse(model.settings, () => ({ voice: DEFAULT_VOICE, brain: DEFAULT_BRAIN, engine: DEFAULT_ENGINE }));

const configure = (model: Model, settings: Settings): Return => ({
  model: modifyFields(model, { settings: () => Option.some(settings) }),
  commands: model.connected ? [Send({ frame: { _tag: 'Configure', settings } })] : [],
});

const wake = (model: Model): Return => ({
  model: modifyFields(model, {
    awake: () => true,
    epoch: (epoch) => epoch + 1,
    look: () => 'waking',
    fault: () => Option.none(),
    note: () => Option.none(),
  }),
});

const sleep = (model: Model, note: Option.Option<string>): Model =>
  modifyFields(model, {
    awake: () => false,
    connected: () => false,
    look: () => 'asleep',
    doing: () => Option.none(),
    note: () => note,
  });

const toggle = (model: Model): Return => {
  if (!model.awake) return wake(model);

  if (model.look === 'speaking' || model.look === 'thinking')
    return {
      model: modifyFields(model, { look: () => 'listening', doing: () => Option.none() }),
      commands: [Send({ frame: { _tag: 'Hush' } })],
    };

  return { model: sleep(model, Option.none()) };
};

const onFrame = (model: Model, frame: ServerFrame): Return =>
  Match.value(frame).pipe(
    Match.tagsExhaustive({
      Ready: ({ settings, account, memories }): Return => {
        const chosen = Option.getOrElse(model.settings, () => settings);
        const commands: AnyCommand[] =
          chosen.voice === settings.voice && chosen.brain === settings.brain && chosen.engine === settings.engine
            ? []
            : [Send({ frame: { _tag: 'Configure', settings: chosen } })];

        if (model.camera) commands.push(Send({ frame: { _tag: 'Camera', on: true } }));

        return {
          model: modifyFields(model, {
            settings: () => Option.some(chosen),
            account: () => Option.some(account),
            memories: () => memories,
          }),
          commands,
        };
      },
      Presence: ({ presence }): Return => ({
        model: modifyFields(model, {
          look: () => presence,
          doing: (doing) => (presence === 'thinking' ? doing : Option.none()),
        }),
      }),
      Duck: (): Return => ({ model }),
      Interrupt: (): Return => ({ model: modifyFields(model, { doing: () => Option.none() }) }),
      SpeechEnd: (): Return => ({ model }),
      Doing: ({ label }): Return => ({ model: modifyFields(model, { doing: () => Option.some(label) }) }),
      Show: ({ visual }): Return => ({
        model: modifyFields(model, {
          visuals: (visuals) => withVisual(visuals, visual),
          memories: (count) =>
            visual._tag === 'Memory' ? Math.max(0, count + (visual.forgotten ? -1 : 1)) : count,
        }),
      }),
      Snap: ({ id }): Return => ({ model, commands: [Snap({ id })] }),
      Measured: ({ latency }): Return => ({ model: modifyFields(model, { latency: () => Option.some(latency) }) }),
      Fault: ({ reason, fatal }): Return => ({
        model: fatal
          ? sleep(modifyFields(model, { fault: () => Option.some(reason) }), Option.none())
          : modifyFields(model, { fault: () => Option.some(reason) }),
      }),
      Sleep: ({ reason }): Return => ({ model: sleep(model, Option.some(reason)) }),
      Idle: ({ beats }): Return => ({ model: modifyFields(model, { idle: () => beats }) }),
      Guard: ({ on }): Return => ({ model: modifyFields(model, { guard: () => on }) }),
      PasskeyCreate: ({ id, challenge, rpId, user }): Return => ({ model: modifyFields(model, { passkeyNote: () => 'Making your passkey…' }), commands: [CreatePasskey({ id, challenge, rpId, user })] }),
      PasskeyAsk: ({ id, challenge, rpId, credential, summary }): Return => ({ model: modifyFields(model, { approving: () => Option.some({ id, challenge, rpId, credential, summary }), passkeyNote: () => '' }), commands: [SignPasskey({ id, challenge, rpId, credential })] }),
      PasskeyDone: ({ ok, reason }): Return => ({ model: modifyFields(model, { approving: () => Option.none(), passkeyNote: () => (ok ? '' : reason) }) }),
      Instructions: ({ text }): Return => ({ model: modifyFields(model, { instructions: () => text, instructionsDraft: () => Option.none() }) }),
      ShowTools: (): Return => openSheet(modifyFields(model, { tab: () => 'tools', drawer: () => false })),
      Panels: ({ panels, drawer }): Return => ({ model: modifyFields(model, { panels: () => panels, drawer: (open) => drawer ?? open }) }),
      OpenWorkspace: ({ path }): Return => ({
        model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, open: true, loading: true }), sheet: () => false }),
        commands: [LoadTree(), ...(path === null ? [] : [LoadFile({ path })])],
      }),
      Servers: ({ servers }): Return => ({ model: modifyFields(model, { servers: () => servers }) }),
      ServerNote: ({ note, authUrl }): Return => ({
        model: modifyFields(model, {
          draft: (draft) => ({ ...draft, pending: false, note: Option.some(note), authUrl: Option.fromNullishOr(authUrl) }),
        }),
      }),
    }),
  );

const prune = (visuals: readonly Visual[], now: number): Visual[] =>
  visuals.filter((visual) => visual._tag !== 'Timer' || visual.endsAt + TIMER_GRACE_MS > now);

export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    ClickedOrb: () => toggle(model),
    PressedSpace: () => toggle(model),
    PressedEscape: () =>
      model.workspace.open ? { model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, open: false }) }) } : model.sheet ? { model: modifyFields(model, { sheet: () => false }) } : model.awake ? { model: sleep(model, Option.none()) } : { model },
    ClickedCamera: () => ({
      model: modifyFields(model, { camera: (on) => !on }),
      commands: model.connected ? [Send({ frame: { _tag: 'Camera', on: !model.camera } })] : [],
    }),
    ClickedSheet: () => (model.sheet ? { model: modifyFields(model, { sheet: () => false }) } : openSheet(model)),
    PressedCommandK: () => (model.sheet ? { model: modifyFields(model, { sheet: () => false }) } : openSheet(model)),
    PickedTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab, query: () => '' }) }),
    SteppedTab: ({ by }) => ({ model: modifyFields(model, { tab: (tab) => stepTab(tab, by) }) }),
    TypedQuery: ({ query }) => ({ model: modifyFields(model, { query: () => query }) }),
    TypedServerUrl: ({ url }) => ({ model: modifyFields(model, { draft: (draft) => ({ ...draft, url, note: Option.none() }) }) }),
    TypedServerToken: ({ token }) => ({ model: modifyFields(model, { draft: (draft) => ({ ...draft, token }) }) }),
    SubmittedServer: () =>
      model.draft.url.trim() === '' || !model.connected
        ? { model: modifyFields(model, { draft: (draft) => ({ ...draft, note: Option.some(model.connected ? 'Paste the server URL first.' : 'Wake hark first, then add a server.') }) }) }
        : {
            model: modifyFields(model, { draft: () => ({ ...emptyDraft, pending: true, url: model.draft.url }) }),
            commands: [Send({ frame: { _tag: 'AddServer', name: '', url: model.draft.url.trim(), token: model.draft.token.trim() } })],
          },
    ClickedEnablePush: () => ({ model, commands: [AskPush()] }),
    ClickedWorkspace: () =>
      model.workspace.open
        ? { model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, open: false }) }) }
        : { model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, open: true, loading: true }), sheet: () => false }), commands: [LoadTree()] },
    ClosedWorkspace: () => ({ model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, open: false }) }) }),
    ClickedRefreshTree: () => ({ model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, loading: true }) }), commands: [LoadTree()] }),
    GotTree: ({ tree }) => ({ model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, tree, loading: false }) }) }),
    ClickedFile: ({ path }) => ({ model, commands: [LoadFile({ path })] }),
    GotFile: ({ path, text }) => ({ model: modifyFields(model, { workspace: (workspace) => ({ ...workspace, file: Option.some({ path, text }) }) }) }),
    ChangedPush: ({ push }) => ({ model: modifyFields(model, { push: () => push }) }),
    ClickedRemoveServer: ({ id }) => ({
      model: modifyFields(model, { servers: (servers) => servers.filter((server) => server.id !== id) }),
      commands: model.connected ? [Send({ frame: { _tag: 'RemoveServer', id } })] : [],
    }),
    ClosedSheet: () => ({ model: modifyFields(model, { sheet: () => false }) }),
    PickedVoice: ({ voice }) => configure(model, { ...settingsOf(model), voice }),
    PickedBrain: ({ brain }) => configure(model, { ...settingsOf(model), brain }),
    PickedEngine: ({ engine }) => {
      const current = settingsOf(model);
      const voices = voicesFor(engine);
      const voice = voices.includes(current.voice) ? current.voice : (voices[0] as Settings['voice']);

      return configure(model, { ...current, engine, voice });
    },
    ClickedSignOut: () => ({ model: sleep(model, Option.none()), commands: [SignOut()] }),
    TypedInstructions: ({ text }) => ({ model: modifyFields(model, { instructionsDraft: () => Option.some(text) }) }),
    SavedInstructions: () => {
      const text = Option.getOrElse(model.instructionsDraft, () => model.instructions);
      return { model: modifyFields(model, { instructions: () => text, instructionsDraft: () => Option.none() }), commands: model.connected ? [Send({ frame: { _tag: 'SetInstructions', text } })] : [] };
    },
    ResetInstructions: () => ({ model: modifyFields(model, { instructions: () => '', instructionsDraft: () => Option.none() }), commands: model.connected ? [Send({ frame: { _tag: 'SetInstructions', text: '' } })] : [] }),
    ToggledGuard: () => ({ model: modifyFields(model, { passkeyNote: () => '' }), commands: model.connected ? [Send({ frame: { _tag: 'SetGuard', on: !model.guard } })] : [] }),
    ClickedApprove: () => Option.match(model.approving, { onNone: () => ({ model }), onSome: (ask) => ({ model, commands: [SignPasskey({ id: ask.id, challenge: ask.challenge, rpId: ask.rpId, credential: ask.credential })] }) }),
    ClickedDecline: () => Option.match(model.approving, { onNone: () => ({ model }), onSome: (ask) => ({ model: modifyFields(model, { approving: () => Option.none() }), commands: [StopPasskey(), Send({ frame: { _tag: 'PasskeyDeclined', id: ask.id, reason: 'NotAllowedError: they tapped No' } })] }) }),
    ClickedTools: () => (model.sheet && model.tab === 'tools' ? { model: modifyFields(model, { sheet: () => false }) } : openSheet(modifyFields(model, { tab: () => 'tools', drawer: () => false }))),
    ClickedDrawer: () => ({ model: modifyFields(model, { drawer: (open) => !open }) }),
    ClickedPanel: ({ id, action }) => ({
      model: modifyFields(model, { panels: (panels) => (action === 'delete' ? panels.filter((panel) => panel.id !== id) : panels.map((panel) => (panel.id === id ? { ...panel, open: action === 'open' || action === 'pin' ? true : action === 'close' ? false : panel.open, pinned: action === 'pin' ? true : action === 'unpin' ? false : panel.pinned } : panel))) }),
      commands: model.connected ? [Send({ frame: { _tag: 'Panel', id, action } })] : [],
    }),
    DismissedVisual: ({ id }) => ({
      commands: model.connected && model.panels.some((panel) => panel.id === id) ? [Send({ frame: { _tag: 'Panel', id, action: 'close' } })] : [],
      model: modifyFields(model, { visuals: (visuals) => visuals.filter((visual) => visual.id !== id), panels: (panels) => panels.map((panel) => (panel.id === id ? { ...panel, open: false } : panel)) }),
    }),
    DismissedFault: () => ({ model: modifyFields(model, { fault: () => Option.none() }) }),
    StartedEngine: () => ({ model: modifyFields(model, { connected: () => true }) }),
    FailedEngine: ({ reason }) => ({
      model: sleep(modifyFields(model, { fault: () => Option.some(reason) }), Option.none()),
    }),
    StoppedEngine: () => ({ model: modifyFields(model, { connected: () => false }) }),
    ReceivedFrame: ({ frame }) => onFrame(model, frame),
    LostLine: ({ code, reason }) =>
      code === 4401
        ? { model: sleep(model, Option.none()), commands: [SendHome()] }
        : model.awake
        ? {
            model: sleep(
              modifyFields(model, {
                fault: (fault) =>
                  Option.isSome(fault) || code === 1000
                    ? fault
                    : Option.some(code === 4000 ? 'hark opened in another tab.' : reason || 'The voice line dropped.'),
              }),
              Option.none(),
            ),
          }
        : { model },
    StartedCamera: () => ({ model: modifyFields(model, { cameraLive: () => true }) }),
    FailedCamera: ({ reason }) => ({
      model: modifyFields(model, { camera: () => false, cameraLive: () => false, fault: () => Option.some(reason) }),
    }),
    StoppedCamera: () => ({ model: modifyFields(model, { cameraLive: () => false }) }),
    Ticked: ({ now }) => ({
      model: modifyFields(model, { now: () => now, visuals: (visuals) => prune(visuals, now) }),
    }),
    CompletedSend: () => ({ model }),
    CompletedSignOut: () => ({ model }),
    CompletedMount: () => ({ model }),
  });
