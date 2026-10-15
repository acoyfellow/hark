export type ProgramFrame = { readonly positions: Float32Array; readonly tones: Float32Array };

export type Program = {
  readonly latest: () => ProgramFrame | null;
  readonly stop: () => void;
};

const FRAME_MS = 33;

const WORKER_SOURCE = `
const blocked = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'EventSource', 'indexedDB', 'caches', 'BroadcastChannel'];
for (const name of blocked) { try { Object.defineProperty(self, name, { value: undefined, configurable: false }); } catch {} }
let move = null;
let count = 0;
let started = 0;
const out = new Float32Array(4);
const tick = () => {
  if (move === null) return;
  const t = (performance.now() - started) / 1000;
  const positions = new Float32Array(count * 3);
  const tones = new Float32Array(count);
  const deadline = performance.now() + 24;
  for (let i = 0; i < count; i += 1) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0.7;
    try { move(i, count, t, out, Math); } catch { }
    positions[i * 3] = Number.isFinite(out[0]) ? Math.max(-2, Math.min(2, out[0])) : 0;
    positions[i * 3 + 1] = Number.isFinite(out[1]) ? Math.max(-2, Math.min(2, out[1])) : 0;
    positions[i * 3 + 2] = Number.isFinite(out[2]) ? Math.max(-2, Math.min(2, out[2])) : 0;
    tones[i] = Number.isFinite(out[3]) ? Math.max(0, Math.min(1, out[3])) : 0.7;
    if ((i & 1023) === 0 && performance.now() > deadline) { count = Math.max(500, i); break; }
  }
  self.postMessage({ positions, tones }, [positions.buffer, tones.buffer]);
};
self.onmessage = (event) => {
  try {
    move = new Function('i', 'n', 't', 'out', 'Math', event.data.body);
    count = event.data.count;
    started = performance.now();
    setInterval(tick, ${FRAME_MS});
    tick();
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
`;

export const startProgram = (body: string, count: number): Program => {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(url);
  let frame: ProgramFrame | null = null;

  URL.revokeObjectURL(url);
  worker.onmessage = (event: MessageEvent<{ positions?: Float32Array; tones?: Float32Array; error?: string }>) => {
    if (event.data.positions !== undefined && event.data.tones !== undefined) frame = { positions: event.data.positions, tones: event.data.tones };
  };
  worker.postMessage({ body, count });

  return {
    latest: () => frame,
    stop: () => worker.terminate(),
  };
};
