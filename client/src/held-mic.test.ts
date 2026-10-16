import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { heldMic } from './held-mic';

const fakeTrack = () => ({ readyState: 'live', stop: vi.fn(function (this: { readyState: string }) { this.readyState = 'ended'; }) });

const fakeStream = () => {
  const track = fakeTrack();

  return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
};

class FakeContext {
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  destination = {};
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createMediaStreamSource = () => ({ connect: vi.fn() });
}

class FakeNode {
  port: { onmessage: ((event: MessageEvent) => void) | null } = { onmessage: null };
  connect = vi.fn();
  disconnect = vi.fn();
}

describe('the microphone is asked for once per call, not once per redial', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('AudioWorkletNode', FakeNode);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reuses the same stream across twenty stop and start cycles', async () => {
    const source = vi.fn(async () => fakeStream());
    const mic = heldMic(source);

    for (let redial = 0; redial < 20; redial += 1) {
      await mic.start();
      mic.stop();
    }

    expect(source).toHaveBeenCalledTimes(1);
    expect(mic.requests()).toBe(1);
  });

  it('shares one request when two starts race', async () => {
    const source = vi.fn(async () => fakeStream());
    const mic = heldMic(source);

    await Promise.all([mic.start(), mic.start(), mic.start()]);

    expect(source).toHaveBeenCalledTimes(1);
  });

  it('asks again only after the call releases the microphone', async () => {
    const source = vi.fn(async () => fakeStream());
    const mic = heldMic(source);

    await mic.start();
    mic.release();
    await mic.start();

    expect(source).toHaveBeenCalledTimes(2);
  });
});
