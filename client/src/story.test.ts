import { Option } from 'effect';
import { Command, given, message, model, story } from 'foldkit/story';
import { describe, expect, test } from 'vitest';
import type { ServerFrame, Visual } from '../../shared/protocol';
import { Send, Snap } from './command';
import { initialModel } from './main';
import { Message } from './message';
import { update } from './update';

const asleep = initialModel({ local: false, now: 1_000 });

const frame = (value: ServerFrame) => Message.ReceivedFrame({ frame: value });

const ready = frame({
  _tag: 'Ready',
  settings: { voice: 'luna', brain: '@cf/google/gemma-4-26b-a4b-it' },
  account: 'Jordan’s Account',
  gateway: 'default',
  memories: 2,
});

const awake = { ...asleep, awake: true, connected: true, epoch: 1, look: 'listening' as const };

const memory = (id: string): Visual => ({ _tag: 'Memory', id, text: id, forgotten: false });

describe('waking and sleeping', () => {
  test('tapping the ear opens a new line and shows waking', () => {
    story(
      update,
      given(asleep),
      message(Message.ClickedOrb()),
      model((current) => {
        expect(current.awake).toBe(true);
        expect(current.epoch).toBe(1);
        expect(current.look).toBe('waking');
      }),
    );
  });

  test('ready fills in the account and the settings hark remembers', () => {
    story(
      update,
      given(awake),
      message(ready),
      model((current) => {
        expect(current.account).toEqual(Option.some('Jordan’s Account'));
        expect(current.memories).toBe(2);
        expect(Option.map(current.settings, (settings) => settings.voice)).toEqual(Option.some('luna'));
      }),
      Command.expectNone(),
    );
  });

  test('tapping while it listens puts it to sleep, tapping while it speaks only hushes it', () => {
    story(
      update,
      given(awake),
      message(Message.ClickedOrb()),
      model((current) => {
        expect(current.awake).toBe(false);
        expect(current.look).toBe('asleep');
      }),
    );

    story(
      update,
      given({ ...awake, look: 'speaking' as const }),
      message(Message.PressedSpace()),
      model((current) => {
        expect(current.awake).toBe(true);
        expect(current.look).toBe('listening');
      }),
      Command.expectHas(Send),
      Command.resolve(Send, Message.CompletedSend()),
    );
  });

  test('a goodbye from hark sleeps with its reason, a fatal fault sleeps with the error', () => {
    story(
      update,
      given(awake),
      message(frame({ _tag: 'Sleep', reason: 'Said goodbye.' })),
      model((current) => {
        expect(current.awake).toBe(false);
        expect(current.note).toEqual(Option.some('Said goodbye.'));
      }),
    );

    story(
      update,
      given(awake),
      message(frame({ _tag: 'Fault', reason: 'Gateway authentication failed', fatal: true })),
      model((current) => {
        expect(current.awake).toBe(false);
        expect(current.fault).toEqual(Option.some('Gateway authentication failed'));
      }),
    );
  });

  test('opening hark in a second tab explains why the first one went quiet', () => {
    story(
      update,
      given(awake),
      message(Message.LostLine({ code: 4000, reason: 'Opened somewhere else' })),
      model((current) => {
        expect(current.fault).toEqual(Option.some('hark opened in another tab.'));
        expect(current.awake).toBe(false);
      }),
    );
  });
});

describe('what it is doing', () => {
  test('a tool label shows while thinking and clears once it speaks', () => {
    story(
      update,
      given(awake),
      message(frame({ _tag: 'Presence', presence: 'thinking' })),
      message(frame({ _tag: 'Doing', label: 'Checking the sky over Lisbon' })),
      model((current) => {
        expect(current.doing).toEqual(Option.some('Checking the sky over Lisbon'));
      }),
      message(frame({ _tag: 'Presence', presence: 'speaking' })),
      model((current) => {
        expect(current.doing).toEqual(Option.none());
        expect(current.look).toBe('speaking');
      }),
    );
  });

  test('a camera request from hark takes a snapshot', () => {
    story(update, given(awake), message(frame({ _tag: 'Snap', id: 's1' })), Command.expectHas(Snap), Command.resolve(Snap, Message.CompletedSend()));
  });

  test('the latest latency is kept for the readout', () => {
    story(
      update,
      given(awake),
      message(frame({ _tag: 'Measured', latency: { total: 412, model: 230, speech: 160, eager: true } })),
      model((current) => {
        expect(Option.map(current.latency, (latency) => latency.total)).toEqual(Option.some(412));
      }),
    );
  });
});

describe('visuals', () => {
  test('keeps the four newest, replaces one with the same id, and counts memories', () => {
    story(
      update,
      given(awake),
      ...['a', 'b', 'c', 'd', 'e'].map((id) => message(frame({ _tag: 'Show', visual: memory(id) }))),
      model((current) => {
        expect(current.visuals.map((visual) => visual.id)).toEqual(['b', 'c', 'd', 'e']);
        expect(current.memories).toBe(5);
      }),
      message(frame({ _tag: 'Show', visual: { _tag: 'Timer', id: 'timer:tea', label: 'tea', endsAt: 5_000 } })),
      message(frame({ _tag: 'Show', visual: { _tag: 'Timer', id: 'timer:tea', label: 'tea', endsAt: 9_000 } })),
      model((current) => {
        expect(current.visuals.filter((visual) => visual.id === 'timer:tea').length).toBe(1);
      }),
    );
  });

  test('a finished timer leaves the screen a little after it rings', () => {
    story(
      update,
      given({ ...awake, visuals: [{ _tag: 'Timer', id: 'timer:tea', label: 'tea', endsAt: 5_000 }] }),
      message(Message.Ticked({ now: 6_000 })),
      model((current) => expect(current.visuals.length).toBe(1)),
      message(Message.Ticked({ now: 30_000 })),
      model((current) => expect(current.visuals.length).toBe(0)),
    );
  });
});

describe('settings', () => {
  test('a voice picked while asleep is kept and sent once the line opens', () => {
    story(
      update,
      given(asleep),
      message(Message.PickedVoice({ voice: 'orion' })),
      Command.expectNone(),
      message(Message.ClickedOrb()),
      message(Message.StartedEngine()),
      message(ready),
      model((current) => {
        expect(Option.map(current.settings, (settings) => settings.voice)).toEqual(Option.some('orion'));
      }),
      Command.expectHas(Send),
      Command.resolve(Send, Message.CompletedSend()),
    );
  });

  test('a brain picked while awake is sent right away', () => {
    story(update, given(awake), message(Message.PickedBrain({ brain: '@cf/moonshotai/kimi-k2.6' })), Command.expectHas(Send), Command.resolve(Send, Message.CompletedSend()));
  });
});
