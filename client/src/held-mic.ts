type Capture = {
  readonly context: AudioContext;
  readonly node: AudioWorkletNode;
};

export type HeldMic = {
  start(): Promise<void>;
  stop(): void;
  release(): void;
  onAudioLevel: ((rms: number) => void) | null;
  onAudioData: ((pcm: ArrayBuffer) => void) | null;
  readonly requests: () => number;
};

export type MicSource = () => Promise<MediaStream>;

const TARGET_RATE = 16000;

const CAPTURE_PROCESSOR = `
class HeldCapture extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / ${TARGET_RATE}; this.buffer = []; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i += this.ratio) {
      const at = Math.floor(i);
      const frac = i - at;
      this.buffer.push(at + 1 < channel.length ? channel[at] * (1 - frac) + channel[at + 1] * frac : channel[at]);
    }
    if (this.buffer.length >= 1600) { this.port.postMessage(new Float32Array(this.buffer)); this.buffer = []; }
    return true;
  }
}
registerProcessor('held-capture', HeldCapture);
`;

export const browserMic: MicSource = () =>
  navigator.mediaDevices.getUserMedia({ audio: { sampleRate: { ideal: 48000 }, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length));

const pcm16 = (samples: Float32Array) => {
  const out = new Int16Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) out[index] = Math.max(-1, Math.min(1, samples[index]!)) * 0x7fff;

  return out.buffer;
};

const live = (stream: MediaStream | null): stream is MediaStream => stream !== null && stream.getAudioTracks().some((track) => track.readyState === 'live');

export const heldMic = (source: MicSource = browserMic): HeldMic => {
  let stream: MediaStream | null = null;
  let pending: Promise<MediaStream> | null = null;
  let capture: Capture | null = null;
  let running = false;
  let requests = 0;

  const acquire = async () => {
    if (live(stream)) return stream;

    pending ??= (async () => {
      requests += 1;

      return source();
    })().finally(() => {
      pending = null;
    });

    stream = await pending;

    return stream;
  };

  const startCapture = async (held: MediaStream, mic: HeldMic) => {
    const context = new AudioContext();
    const url = URL.createObjectURL(new Blob([CAPTURE_PROCESSOR], { type: 'application/javascript' }));

    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const node = new AudioWorkletNode(context, 'held-capture');

    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!running) return;

      mic.onAudioLevel?.(rms(event.data));
      mic.onAudioData?.(pcm16(event.data));
    };
    context.createMediaStreamSource(held).connect(node);
    node.connect(context.destination);

    return { context, node };
  };

  const mic: HeldMic = {
    onAudioLevel: null,
    onAudioData: null,
    requests: () => requests,
    start: async () => {
      const held = await acquire();

      capture ??= await startCapture(held, mic);
      await capture.context.resume();
      running = true;
    },
    stop: () => {
      running = false;
    },
    release: () => {
      running = false;
      capture?.node.disconnect();
      void capture?.context.close();
      capture = null;

      for (const track of stream?.getTracks() ?? []) track.stop();

      stream = null;
    },
  };

  return mic;
};
