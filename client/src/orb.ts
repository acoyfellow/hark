import { Effect } from 'effect';
import { Mount } from 'foldkit';
import { currentCamera, meter } from './engine';
import { Message } from './message';

type Palette = { readonly core: string; readonly mid: string; readonly ring: string };

const ASLEEP: Palette = { core: '#3f3f46', mid: '#27272a', ring: '#52525b' };

const PALETTES: Record<string, Palette> = {
  asleep: ASLEEP,
  waking: { core: '#fbad41', mid: '#f38020', ring: '#fbad41' },
  listening: { core: '#fbad41', mid: '#f38020', ring: '#f6913e' },
  hearing: { core: '#fff3e0', mid: '#fbad41', ring: '#ffb35c' },
  thinking: { core: '#ffd8a8', mid: '#f38020', ring: '#fbad41' },
  speaking: { core: '#ffffff', mid: '#ff9a3c', ring: '#ffc27a' },
};

const RINGS = 6;

const TAU = Math.PI * 2;

type State = {
  look: string;
  level: number;
  energy: number;
  spin: number;
  breathe: number;
  flow: number;
  mix: number;
};

const drawRing = (
  context: CanvasRenderingContext2D,
  radius: number,
  wobble: number,
  phase: number,
  harmonics: number,
) => {
  context.beginPath();

  for (let step = 0; step <= 96; step += 1) {
    const angle = (step / 96) * TAU;
    const offset =
      Math.sin(angle * harmonics + phase) * wobble +
      Math.sin(angle * (harmonics + 2) - phase * 1.3) * wobble * 0.45;
    const r = radius + offset;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }

  context.closePath();
};

const frame = (context: CanvasRenderingContext2D, size: number, state: State, reduced: boolean) => {
  const palette: Palette = PALETTES[state.look] ?? ASLEEP;
  const half = size / 2;
  const base = size * 0.17;
  const level = state.level;

  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(half, half);

  const glow = context.createRadialGradient(0, 0, base * 0.2, 0, 0, half);

  glow.addColorStop(0, `${palette.mid}${state.look === 'asleep' ? '22' : '55'}`);
  glow.addColorStop(0.45, `${palette.mid}14`);
  glow.addColorStop(1, `${palette.mid}00`);
  context.fillStyle = glow;
  context.fillRect(-half, -half, size, size);

  const outward = state.look === 'speaking' ? 1 : -1;

  for (let index = 0; index < RINGS; index += 1) {
    const t = (index / RINGS + (reduced ? 0 : state.flow * outward)) % 1;
    const travel = t < 0 ? t + 1 : t;
    const radius = base * (1.15 + travel * 1.75);
    const fade = Math.sin(travel * Math.PI);
    const wobble = (1.5 + level * base * 0.55) * (0.6 + travel);

    drawRing(context, radius, wobble, state.breathe * 2 + index * 1.7, 3 + (index % 3));
    context.strokeStyle = palette.ring;
    context.globalAlpha = (state.look === 'asleep' ? 0.18 : 0.22 + state.energy * 0.5) * fade;
    context.lineWidth = Math.max(1, size * 0.003) * (1 + level * 1.5);
    context.stroke();
  }

  context.globalAlpha = 1;

  if (state.look === 'thinking' || state.look === 'waking') {
    for (let arm = 0; arm < 3; arm += 1) {
      const start = state.spin + (arm * TAU) / 3;

      context.beginPath();
      context.arc(0, 0, base * 1.45, start, start + 0.9);
      context.strokeStyle = palette.ring;
      context.globalAlpha = 0.75;
      context.lineWidth = size * 0.007;
      context.lineCap = 'round';
      context.stroke();
    }

    context.globalAlpha = 1;
  }

  const swell = 1 + Math.sin(state.breathe) * 0.035 + level * 0.55;
  const core = context.createRadialGradient(
    -base * 0.25,
    -base * 0.3,
    base * 0.05,
    0,
    0,
    base * swell,
  );

  core.addColorStop(0, palette.core);
  core.addColorStop(0.55, palette.mid);
  core.addColorStop(1, `${palette.mid}00`);
  context.fillStyle = core;
  context.beginPath();
  drawRing(context, base * swell, level * base * 0.08, state.breathe * 3, 5);
  context.fill();
  context.restore();
};

export const Orb = Mount.define('Orb', {
  messages: [Message.CompletedMount],
  execute: ({ element }) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const canvas = element instanceof HTMLCanvasElement ? element : null;
        const context = canvas?.getContext('2d') ?? null;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const state: State = {
          look: 'asleep',
          level: 0,
          energy: 0,
          spin: 0,
          breathe: 0,
          flow: 0,
          mix: 0,
        };
        let size = 0;
        let handle = 0;
        let last = performance.now();

        const resize = () => {
          if (canvas === null) return;

          const box = canvas.getBoundingClientRect();
          const ratio = Math.min(2, devicePixelRatio || 1);

          size = Math.round(Math.min(box.width, box.height) * ratio);
          canvas.width = size;
          canvas.height = size;
        };

        const observer = new ResizeObserver(resize);

        const tick = (now: number) => {
          const delta = Math.min(0.05, (now - last) / 1000);

          last = now;
          state.look = canvas?.dataset.look ?? 'asleep';

          const target =
            state.look === 'speaking'
              ? Math.min(1, meter.speech * 5)
              : state.look === 'listening' || state.look === 'hearing'
                ? Math.min(1, meter.mic * 7)
                : 0;

          state.level += (target - state.level) * (target > state.level ? 0.35 : 0.08);
          state.energy += ((state.look === 'asleep' ? 0 : 0.3 + state.level) - state.energy) * 0.05;
          state.spin += delta * (state.look === 'waking' ? 5 : 2.4);
          state.breathe += delta * (state.look === 'asleep' ? 0.9 : 1.8);
          state.flow = (state.flow + delta * (0.05 + state.level * 0.45)) % 1;

          if (context !== null && size > 0) frame(context, size, state, reduced);

          handle = requestAnimationFrame(tick);
        };

        if (canvas !== null) {
          observer.observe(canvas);
          resize();
          handle = requestAnimationFrame(tick);
        }

        return { observer, stop: () => cancelAnimationFrame(handle) };
      }),
      ({ observer, stop }) =>
        Effect.sync(() => {
          stop();
          observer.disconnect();
        }),
    ).pipe(Effect.as(Message.CompletedMount())),
});

export const Preview = Mount.define('Preview', {
  messages: [Message.CompletedMount],
  execute: ({ element }) =>
    Effect.sync(() => {
      if (element instanceof HTMLVideoElement) {
        element.srcObject = currentCamera();
        void element.play().catch(() => undefined);
      }

      return Message.CompletedMount();
    }),
});
