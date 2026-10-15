import { VoiceClient } from 'agents/voice/client';
import { type ClientFrame, encodeClientFrame, ServerFrame, type ServerFrame as Frame } from '../../shared/protocol';
import { Schema } from 'effect';

export const meter = { mic: 0, speech: 0 };

export class MicrophoneRefused extends Error {}

export type Engine = {
  readonly send: (frame: ClientFrame) => void;
  readonly stop: () => Promise<void>;
};

export type EngineHooks = {
  readonly frame: (frame: Frame) => void;
  readonly closed: (code: number, reason: string) => void;
};

const decodeFrame = Schema.decodeUnknownOption(ServerFrame);

export const primeAudio = () => undefined;

const plain = (frame: ClientFrame): Record<string, unknown> => JSON.parse(encodeClientFrame(frame)) as Record<string, unknown>;

const opened = (client: VoiceClient) =>
  new Promise<void>((resolve, reject) => {
    if (client.connected) {
      resolve();
      return;
    }

    const timer = setTimeout(() => reject(new Error('The voice line timed out.')), 8000);
    const onChange = (connected: boolean) => {
      if (!connected) return;

      clearTimeout(timer);
      client.removeEventListener('connectionchange', onChange);
      resolve();
    };

    client.addEventListener('connectionchange', onChange);
  });

export const startEngine = async (hooks: EngineHooks, camera: boolean): Promise<Engine> => {
  const client = new VoiceClient({ agent: 'Hark', name: 'me', preferredFormat: 'pcm16' });
  let stopped = false;
  let status: string = 'idle';
  let speaking: ReturnType<typeof setInterval> | null = null;

  const send = (frame: ClientFrame) => client.sendJSON(plain(frame));

  client.addEventListener('statuschange', (next) => {
    status = next;

    if (speaking !== null) clearInterval(speaking);

    speaking = null;
    meter.speech = 0;

    if (next === 'speaking') {
      const started = performance.now();

      speaking = setInterval(() => {
        const t = (performance.now() - started) / 1000;

        meter.speech = 0.05 + 0.04 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1));
      }, 50);
    }

    if (next === 'listening' || next === 'thinking' || next === 'speaking') hooks.frame({ _tag: 'Presence', presence: next });
  });
  client.addEventListener('interimtranscript', (text) => {
    if (text !== null && text.trim() !== '' && status === 'listening') hooks.frame({ _tag: 'Presence', presence: 'hearing' });
  });
  client.addEventListener('audiolevelchange', (level) => {
    meter.mic = level;
  });
  client.addEventListener('custommessage', (message) => {
    const decoded = decodeFrame(message);

    if (decoded._tag === 'Some') hooks.frame(decoded.value);
  });
  client.addEventListener('turnmetrics', (metrics) => {
    if (metrics.finalInputToFirstAudioMs === undefined) return;

    hooks.frame({
      _tag: 'Measured',
      latency: {
        total: metrics.finalInputToFirstAudioMs,
        model: metrics.modelToFirstTextMs ?? 0,
        speech: metrics.ttsToFirstAudioMs ?? 0,
        eager: false,
      },
    });
  });
  client.addEventListener('voiceerror', (error) => {
    hooks.frame({ _tag: 'Fault', reason: error.message, fatal: false });
  });
  client.addEventListener('connectionchange', (connected) => {
    if (!connected && !stopped) hooks.closed(1006, 'The voice line dropped.');
  });

  client.connect();

  try {
    await opened(client);
  } catch (cause) {
    client.disconnect();
    throw cause;
  }

  send({ _tag: 'Hello', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: navigator.language, camera });

  try {
    await client.startCall();
  } catch (cause) {
    client.disconnect();
    throw new MicrophoneRefused(
      cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'hark needs your microphone. Allow it in the address bar, then tap again.'
        : `The microphone did not start: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  return {
    send,
    stop: async () => {
      stopped = true;

      if (status === 'speaking' || status === 'thinking')
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 6000);
          const onChange = (next: string) => {
            if (next !== 'listening' && next !== 'idle') return;

            clearTimeout(timer);
            client.removeEventListener('statuschange', onChange);
            setTimeout(resolve, 900);
          };

          client.addEventListener('statuschange', onChange);
        });

      if (speaking !== null) clearInterval(speaking);

      client.endCall();
      client.disconnect();
      meter.mic = 0;
      meter.speech = 0;
    },
  };
};

let cameraStream: MediaStream | null = null;

export const currentCamera = () => cameraStream;

export const startCamera = async (): Promise<MediaStream> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });

  cameraStream = stream;

  return stream;
};

export const stopCamera = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop();

  if (cameraStream === stream) cameraStream = null;
};

export const snapshot = async (): Promise<string | null> => {
  const stream = cameraStream;

  if (stream === null) return null;

  const video = document.createElement('video');

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);

  if (video.videoWidth === 0)
    await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));

  const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.pause();
  video.srcObject = null;

  return canvas.toDataURL('image/jpeg', 0.72);
};
