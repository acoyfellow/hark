const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const STALL_MS = 250;

const SPEAKING_STUCK_MS = 45_000;

const THINKING_STUCK_MS = 30_000;

const tracing = () => LOCAL_HOSTS.has(location.hostname) || location.hostname.endsWith('coey.dev');

const queue: Record<string, unknown>[] = [];

let flushing = false;

const flush = () => {
  if (flushing || queue.length === 0) return;

  flushing = true;

  const batch = queue.splice(0);

  void fetch('/__trace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch), keepalive: true })
    .catch(() => undefined)
    .finally(() => {
      flushing = false;
      flush();
    });
};

export const trace = (event: string, detail: Record<string, unknown> = {}) => {
  if (!tracing()) return;

  queue.push({ trace: `browser.${event}`, at: Math.round(performance.now()), ...detail });
  flush();
};

const watchFrames = () => {
  let last = performance.now();

  const tick = (now: number) => {
    const gap = now - last;

    if (gap > STALL_MS && document.visibilityState === 'visible') trace('stall', { ms: Math.round(gap) });

    last = now;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};

const watchErrors = () => {
  addEventListener('error', (event) => trace('error', { message: event.message, source: `${event.filename}:${event.lineno}` }));
  addEventListener('unhandledrejection', (event) => trace('rejection', { reason: String(event.reason).slice(0, 400) }));

  const original = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    trace('console', { message: args.map(String).join(' ').slice(0, 400) });
    original(...args);
  };
};

let statusSince = performance.now();

let status = 'idle';

const watchStuck = () => {
  setInterval(() => {
    const held = performance.now() - statusSince;
    const limit = status === 'speaking' ? SPEAKING_STUCK_MS : status === 'thinking' ? THINKING_STUCK_MS : Number.POSITIVE_INFINITY;

    if (held > limit) {
      trace('stuck', { status, ms: Math.round(held) });
      statusSince = performance.now();
    }
  }, 2000);
};

export const traceStatus = (next: string) => {
  trace('status', { from: status, to: next, heldMs: Math.round(performance.now() - statusSince) });
  status = next;
  statusSince = performance.now();
};

export const startTracing = () => {
  if (!tracing()) return;

  watchFrames();
  watchErrors();
  watchStuck();
  trace('page', { width: innerWidth, height: innerHeight, ratio: devicePixelRatio });
};
