import { Match, Option } from 'effect';
import type { Command, Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';
import { DEFAULT_BRAIN, DEFAULT_ENGINE, DEFAULT_VOICE, type ServerFrame, type Settings, type Visual, voicesFor } from '../../shared/protocol';
import { SendHome, Send, SignOut, Snap } from './command';
import { Message } from './message';
import { MAX_VISUALS, type Model } from './model';
import type { Resources } from './resources';

type Return = Update.Return<Model, Message, Resources>;

type AnyCommand = Command.Command<Message, never, Resources>;

const TIMER_GRACE_MS = 12_000;

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
      Ready: ({ settings, account, gateway, memories }): Return => {
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
            gateway: () => Option.some(gateway),
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
    }),
  );

const prune = (visuals: readonly Visual[], now: number): Visual[] =>
  visuals.filter((visual) => visual._tag !== 'Timer' || visual.endsAt + TIMER_GRACE_MS > now);

export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    ClickedOrb: () => toggle(model),
    PressedSpace: () => toggle(model),
    PressedEscape: () =>
      model.sheet ? { model: modifyFields(model, { sheet: () => false }) } : model.awake ? { model: sleep(model, Option.none()) } : { model },
    ClickedCamera: () => ({
      model: modifyFields(model, { camera: (on) => !on }),
      commands: model.connected ? [Send({ frame: { _tag: 'Camera', on: !model.camera } })] : [],
    }),
    ClickedSheet: () => ({ model: modifyFields(model, { sheet: (open) => !open }) }),
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
    DismissedVisual: ({ id }) => ({
      model: modifyFields(model, { visuals: (visuals) => visuals.filter((visual) => visual.id !== id) }),
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
