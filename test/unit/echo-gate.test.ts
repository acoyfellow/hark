import { describe, expect, it } from 'vitest';
import { gateSession, SpokenRecord } from '../../src/echo-gate';

const clock = () => {
  let now = 1_000_000;

  return { now: () => now, advance: (ms: number) => (now += ms) };
};

const recorder = () => {
  const calls: string[] = [];
  const options = {
    onSpeechStart: (text?: string) => calls.push(`start:${text ?? ''}`),
    onInterim: (text: string) => calls.push(`interim:${text}`),
    onUtterance: (text: string) => calls.push(`utterance:${text}`),
    onEagerUtterance: (text: string) => calls.push(`eager:${text}`),
    onTurnResumed: () => calls.push('resumed'),
  };

  return { calls, options };
};

describe('the echo gate', () => {
  it('lets speech straight through when hark is quiet', () => {
    const time = clock();
    const record = new SpokenRecord(time.now);
    const { calls, options } = recorder();
    const gated = gateSession(options, record, () => undefined);

    gated.onSpeechStart?.('');
    gated.onUtterance?.('turn into a heart');

    expect(calls).toEqual(['start:', 'utterance:turn into a heart']);
  });

  it('drops hark hearing its own sentence through the speakers', () => {
    const time = clock();
    const record = new SpokenRecord(time.now);
    const { calls, options } = recorder();
    const events: string[] = [];
    const gated = gateSession(options, record, (event) => events.push(event));

    record.turnStarted();
    record.spoke('Loud and clear. What can I do for you?');
    gated.onSpeechStart?.('');
    gated.onInterim?.('loud and');
    gated.onInterim?.('loud and clear');
    gated.onUtterance?.('Loud and clear.');

    expect(calls).toEqual([]);
    expect(events).toEqual(['barge-held', 'echo-dropped']);
  });

  it('holds a short noise while hark speaks instead of cutting it off', () => {
    const time = clock();
    const record = new SpokenRecord(time.now);
    const { calls, options } = recorder();
    const gated = gateSession(options, record, () => undefined);

    record.turnStarted();
    record.spoke('Here is a long story about a lighthouse keeper.');
    gated.onSpeechStart?.('');
    gated.onInterim?.('uh');
    gated.onUtterance?.('uh');

    expect(calls).toEqual([]);
  });

  it('passes a real interruption through once it has enough new words', () => {
    const time = clock();
    const record = new SpokenRecord(time.now);
    const { calls, options } = recorder();
    const gated = gateSession(options, record, () => undefined);

    record.turnStarted();
    record.spoke('Here is a long story about a lighthouse keeper.');
    gated.onSpeechStart?.('');
    gated.onInterim?.('wait');
    gated.onInterim?.('wait stop please');
    gated.onUtterance?.('Wait, stop please.');

    expect(calls).toEqual(['start:wait stop please', 'interim:wait stop please', 'utterance:Wait, stop please.']);
  });

  it('stops guarding a moment after the last sentence has played', () => {
    const time = clock();
    const record = new SpokenRecord(time.now);

    record.turnStarted();
    record.spoke('Yes.');
    record.turnEnded();
    expect(record.agentAudible()).toBe(true);
    time.advance(5_000);
    expect(record.agentAudible()).toBe(false);
  });
});
