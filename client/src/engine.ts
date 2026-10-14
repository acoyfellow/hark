import {
  type ClientFrame,
  decodeServerFrame,
  encodeClientFrame,
  readSpeechPacket,
  SOCKET_PATH,
  type ServerFrame,
} from '../../shared/protocol';

export const meter = { mic: 0, speech: 0 };

export class MicrophoneRefused extends Error {}

export type Engine = {
  readonly send: (frame: ClientFrame) => void;
  readonly stop: () => Promise<void>;
};

export type EngineHooks = {
  readonly frame: (frame: ServerFrame) => void;
  readonly closed: (code: number, reason: string) => void;
};

let shared: AudioContext | null = null;

let modulesFor: AudioContext | null = null;

export const primeAudio = () => {
  shared ??= new AudioContext({ latencyHint: 'interactive' });

  if (shared.state === 'suspended') void shared.resume();
};

const audioContext = async () => {
  primeAudio();

  const context = shared ?? new AudioContext();

  if (context.state === 'suspended') await context.resume();

  if (modulesFor !== context) {
    await context.audioWorklet.addModule('/audio/capture.js');
    await context.audioWorklet.addModule('/audio/playback.js');
    modulesFor = context;
  }

  return context;
};

const microphone = async () => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  } catch (cause) {
    throw new MicrophoneRefused(
      cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'hark needs your microphone. Allow it in the address bar, then tap again.'
        : `The microphone did not start: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
};

const socketUrl = () =>
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${SOCKET_PATH}`;

const opened = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The voice line timed out.')), 8000);

    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'close',
      (event) => {
        clearTimeout(timer);
        reject(new Error(event.reason || 'Could not open the voice line.'));
      },
      { once: true },
    );
  });

export const startEngine = async (hooks: EngineHooks, camera: boolean): Promise<Engine> => {
  const stream = await microphone();
  const context = await audioContext();
  const source = context.createMediaStreamSource(stream);
  const capture = new AudioWorkletNode(context, 'hark-capture');
  const playback = new AudioWorkletNode(context, 'hark-playback', { outputChannelCount: [2] });
  const sink = context.createGain();
  const socket = new WebSocket(socketUrl());
  let cleared = 0;
  let stopped = false;

  sink.gain.value = 0;
  source.connect(capture);
  capture.connect(sink);
  sink.connect(context.destination);
  playback.connect(context.destination);
  socket.binaryType = 'arraybuffer';

  const send = (frame: ClientFrame) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(encodeClientFrame(frame));
  };

  capture.port.onmessage = (event: MessageEvent<{ type: string; buffer?: ArrayBuffer; value?: number }>) => {
    if (event.data.type === 'pcm' && event.data.buffer !== undefined && socket.readyState === WebSocket.OPEN)
      socket.send(event.data.buffer);
    else if (event.data.type === 'level') meter.mic = event.data.value ?? 0;
  };

  playback.port.onmessage = (event: MessageEvent<{ type: string; turn?: number; value?: number }>) => {
    if (event.data.type === 'level') meter.speech = event.data.value ?? 0;
    else if (event.data.type === 'drained') send({ _tag: 'Played', turn: event.data.turn ?? 0 });
  };

  socket.addEventListener('message', (event: MessageEvent<ArrayBuffer | string>) => {
    if (event.data instanceof ArrayBuffer) {
      const { turn, pcm } = readSpeechPacket(event.data);

      if (turn > cleared)
        playback.port.postMessage({ type: 'push', turn, buffer: pcm.buffer }, [pcm.buffer]);

      return;
    }

    const decoded = decodeServerFrame(event.data);

    if (decoded._tag === 'None') return;

    const frame = decoded.value;

    if (frame._tag === 'Interrupt') {
      cleared = Math.max(cleared, frame.turn);
      playback.port.postMessage({ type: 'clear', turn: frame.turn });
    } else if (frame._tag === 'Duck') playback.port.postMessage({ type: 'duck', on: frame.ducked });
    else if (frame._tag === 'SpeechEnd') playback.port.postMessage({ type: 'end', turn: frame.turn });

    hooks.frame(frame);
  });

  socket.addEventListener('close', (event) => {
    if (!stopped) hooks.closed(event.code, event.reason);
  });

  try {
    await opened(socket);
  } catch (cause) {
    for (const track of stream.getTracks()) track.stop();
    source.disconnect();
    throw cause;
  }

  send({
    _tag: 'Hello',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    camera,
  });

  const quiet = () =>
    new Promise<void>((resolve) => {
      const started = Date.now();
      const check = () => {
        if (meter.speech < 0.002 || Date.now() - started > 5000) resolve();
        else setTimeout(check, 120);
      };

      check();
    });

  return {
    send,
    stop: async () => {
      stopped = true;
      capture.port.postMessage({ type: 'mute', on: true });

      for (const track of stream.getTracks()) track.stop();

      if (socket.readyState <= WebSocket.OPEN) socket.close(1000, 'sleep');

      await quiet();
      source.disconnect();
      capture.disconnect();
      playback.disconnect();
      sink.disconnect();
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
