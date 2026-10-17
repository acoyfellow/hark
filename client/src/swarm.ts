import { Effect } from 'effect';
import { Mount } from 'foldkit';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { meter } from './engine';
import { modelDots } from './model3d';
import { type Dot, drawingDots, emojiDots, iconDots, loadImage, pictureDots, solidDots, svgDots, wordDots } from './shapes';
import { type Program, startProgram } from './program';
import { Message } from './message';

const EMBER_RAMP = ['#1a0904', '#5a1e08', '#c2520f', '#f6821f', '#ffb35c', '#ffe7c4'] as const;

type Motion = 'still' | 'spin' | 'pulse' | 'bounce' | 'sway' | 'tumble' | 'explode';

type Shape = {
  readonly dots: readonly Dot[];
  readonly scale: number;
  readonly picture: boolean;
  readonly solid: boolean;
  readonly model?: boolean;
  readonly motion: Motion;
  readonly bornAt: number;
  readonly program: Program | null;
  readonly tint: Color | null;
};

type BeatData = { readonly kind: string; readonly value: string; readonly seconds: number; readonly motion: string; readonly tint?: string };

const HELD_MS = 1e9;

const tintColor = (hex: string | undefined) => (hex !== undefined && /^#[0-9a-f]{6}$/iu.test(hex) ? new Color(hex) : null);

type Look = 'asleep' | 'waking' | 'listening' | 'hearing' | 'thinking' | 'speaking';

const LOOKS: readonly Look[] = ['asleep', 'waking', 'listening', 'hearing', 'thinking', 'speaking'];

const isLook = (value: string): value is Look => LOOKS.some((look) => look === value);

const LOOK_TONE: Record<Look, number> = { asleep: 0.72, waking: 0.55, listening: 0.6, hearing: 0.8, thinking: 0.7, speaking: 0.85 };

const MOTIONS: readonly Motion[] = ['still', 'spin', 'pulse', 'bounce', 'sway', 'tumble', 'explode'];

const motionOf = (value: string): Motion => MOTIONS.find((motion) => motion === value) ?? 'still';

const isBeat = (value: unknown): value is BeatData =>
  typeof value === 'object' && value !== null && typeof (value as BeatData).kind === 'string' && typeof (value as BeatData).value === 'string';

const beatsOf = (raw: string): BeatData[] => {
  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(isBeat) : [];
  } catch {
    return [];
  }
};

const PROGRAM_PLACEHOLDER: Dot[] = [[0, 0, 0, 0.7]];

const dotsFor = async (beat: BeatData): Promise<{ dots: Dot[]; picture: boolean; solid: boolean; code: boolean; model?: boolean }> => {
  if (beat.kind === 'code') return { dots: PROGRAM_PLACEHOLDER, picture: false, solid: true, code: true };

  if (beat.kind === 'svg') return { dots: await svgDots(beat.value), picture: false, solid: false, code: false };

  if (beat.kind === 'painting') {
    const image = await loadImage(beat.value);

    return { dots: image === null ? [] : pictureDots(image), picture: true, solid: false, code: false };
  }

  if (beat.kind === 'solid') return { dots: solidDots(beat.value), picture: false, solid: true, code: false };

  if (beat.kind === 'model') return { dots: modelDots(beat.value), picture: false, solid: true, code: false, model: true };

  const flat = beat.kind === 'emoji' ? emojiDots(beat.value) : beat.kind === 'word' ? wordDots(beat.value) : beat.kind === 'draw' ? drawingDots(beat.value) : iconDots(beat.value);

  return { dots: flat, picture: false, solid: false, code: false };
};

const PICTURE_HOLD_MS = 2600;

const VERTEX = `
attribute float tone; attribute float seed; attribute float heat; attribute float formed;
uniform float uTime; uniform float uLevel; uniform float uDpr; uniform float uBoost; uniform float uStill; uniform float uFine;
varying float vTone; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = mix(0.75 + 0.25 * sin(uTime * 2.0 + seed * 40.0), 0.9, uStill);
  gl_PointSize = mix(1.0, 0.7, uFine * formed) * (1.3 + seed * 1.8 + formed * (0.8 + uBoost) + heat * 2.8 + uLevel * 1.2 * (1.0 - uStill)) * uDpr * (14.0 / -mv.z);
  vTone = clamp(tone + heat * 0.35, 0.0, 1.0);
  vAlpha = twinkle * mix(0.32 + 0.6 * tone, 0.85 + 0.7 * tone, formed);
}`;

const FRAGMENT = `
uniform vec3 uRamp[6]; uniform vec3 uTint; uniform float uTintMix;
varying float vTone; varying float vAlpha;
vec3 ramp(float t) {
  float x = t * 5.0; int i = int(floor(x)); float f = fract(x);
  vec3 a = uRamp[0]; vec3 b = uRamp[1];
  for (int k = 0; k < 5; k++) { if (k == i) { a = uRamp[k]; b = uRamp[k + 1]; } }
  if (i >= 5) { a = uRamp[5]; b = uRamp[5]; }
  return mix(a, b, smoothstep(0.0, 1.0, f));
}
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  vec3 tinted = mix(uTint * 0.25, mix(uTint, vec3(1.0), 0.35), vTone);
  gl_FragColor = vec4(mix(ramp(vTone), tinted, uTintMix) * a, a);
}`;

const dynamic = (array: Float32Array, size: number) => new BufferAttribute(array, size).setUsage(DynamicDrawUsage);

const particleCount = () => (innerWidth < 700 ? 9000 : 16000);

export const startSwarm = (host: HTMLElement) => {
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(new Color().setRGB(0.012, 0.0055, 0.0028, LinearSRGBColorSpace), 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.className = 'size-full';
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);

  camera.position.set(0, 0, 14);

  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 1.15, 0.7, 0.18);

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const count = particleCount();
  const position = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const tone = new Float32Array(count);
  const toneGoal = new Float32Array(count);
  const seed = new Float32Array(count);
  const heat = new Float32Array(count);
  const formed = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    seed[index] = Math.random();
    position[index * 3] = (Math.random() - 0.5) * 22;
    position[index * 3 + 1] = (Math.random() - 0.5) * 8;
    position[index * 3 + 2] = (Math.random() - 0.5) * 4;
    tone[index] = 0.15;
  }

  const geometry = new BufferGeometry();

  geometry.setAttribute('position', dynamic(position, 3));
  geometry.setAttribute('tone', dynamic(tone, 1));
  geometry.setAttribute('seed', new BufferAttribute(seed, 1));
  geometry.setAttribute('heat', dynamic(heat, 1));
  geometry.setAttribute('formed', dynamic(formed, 1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uBoost: { value: 0 },
      uFine: { value: 0 },
      uStill: { value: 0 },
      uTint: { value: new Color('#ffffff') },
      uTintMix: { value: 0 },
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uDpr: { value: renderer.getPixelRatio() },
      uRamp: { value: EMBER_RAMP.map((hex) => new Color(hex)) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });

  scene.add(new Points(geometry, material));

  const state = {
    look: 'asleep' as Look,
    level: 0,
    center: new Vector3(0, 0.4, 0),
    shape: null as Shape | null,
    used: 0,
    shapeUntil: 0,
    formKey: '',
    playing: false,
    idling: false,
    held: false,
    paintKey: '',
    show: 0,
    shocks: [] as number[],
  };

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();

    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width / 2, height / 2);
  };

  const anchor = () => {
    const orb = document.getElementById('orb');
    const box = host.getBoundingClientRect();

    if (orb === null || box.width === 0) return;

    const target = orb.getBoundingClientRect();
    const ndc = new Vector3(((target.left + target.width / 2 - box.left) / box.width) * 2 - 1, -((target.top + target.height / 2 - box.top) / box.height) * 2 + 1, 0.5);

    ndc.unproject(camera);

    const ray = ndc.sub(camera.position).normalize();
    const distance = -camera.position.z / ray.z;

    state.center.copy(camera.position).addScaledVector(ray, distance);
  };

  const hold = (shape: Shape, millis: number) => {
    state.shape?.program?.stop();
    state.shape = shape;
    state.shapeUntil = performance.now() + millis;
    state.used = shape.program !== null ? PROGRAM_PARTICLES : Math.min(count, Math.round(shape.dots.length * (shape.picture ? 1 : shape.solid ? 1.4 : 0.9)));
    material.uniforms.uBoost!.value = shape.picture ? 0.7 : 0.35;
    material.uniforms.uStill!.value = shape.motion === 'still' ? 1 : 0;
    material.uniforms.uFine!.value = shape.model ? 1 : 0;
    material.uniforms.uTintMix!.value = shape.tint === null ? 0 : 1;
    if (shape.tint !== null) (material.uniforms.uTint!.value as Color).copy(shape.tint);

    for (let index = 0; index < count; index += 1)
      toneGoal[index] = index < state.used ? shape.dots[index % shape.dots.length]![3] : shape.picture ? 0.02 : 0.12 + seed[index]! * 0.15;

    state.shocks.push(performance.now());
  };

  const release = () => {
    state.shape?.program?.stop();
    state.shape = null;
    material.uniforms.uBoost!.value = 0;
    material.uniforms.uStill!.value = 0;
    material.uniforms.uFine!.value = 0;
    material.uniforms.uTintMix!.value = 0;
  };

  const SCALES = { flat: 4.6, solid: 7.5, picture: 6.4, program: 3.4 };

  const PROGRAM_PARTICLES = Math.min(count, 6000);

  const play = async (beats: readonly BeatData[], idling = false, held = false) => {
    state.show += 1;

    const show = state.show;

    state.playing = true;
    state.idling = idling;
    const prepared = await Promise.all(beats.map(async (beat) => ({ beat, ...(await dotsFor(beat)) })));

    for (const [index, { beat, dots, picture, solid, code, model }] of prepared.entries()) {
      if (show !== state.show) return;

      if (dots.length === 0) continue;

      const last = index === prepared.length - 1;
      const millis = held && last ? HELD_MS : Math.min(12, Math.max(1, Number(beat.seconds) || 4)) * 1000;

      const program = code ? startProgram(beat.value, PROGRAM_PARTICLES) : null;

      hold({ dots, picture, solid, model: model === true, program, tint: tintColor(beat.tint), motion: code ? 'still' : motionOf(beat.motion), bornAt: performance.now(), scale: code ? SCALES.program : picture ? SCALES.picture : solid ? SCALES.solid : SCALES.flat }, millis);
      if (held && last) {
        state.held = true;
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, millis));
    }

    if (show === state.show) state.playing = false;
  };

  const readIdle = () => {
    if (state.playing || state.shape !== null) return;

    const beats = beatsOf(host.dataset.idleBeats ?? '[]');

    if (beats.length > 0) void play(beats, true);
  };

  const readForm = () => {
    const key = host.dataset.formId ?? '';

    if (key === '' || key === state.formKey) return;

    state.formKey = key;
    const beats = beatsOf(host.dataset.formBeats ?? '[]');

    if (beats.length === 0 && host.dataset.formHold === '1') {
      state.held = state.shape !== null;
      if (state.held) state.show += 1;
      state.playing = state.held;
      return;
    }

    state.held = false;

    if (beats.length === 0 && host.dataset.formHold === '0') {
      state.show += 1;
      state.playing = false;
      release();
      return;
    }

    void play(beats, false, host.dataset.formHold === '1');
  };

  const readPaint = () => {
    const key = host.dataset.paintId ?? '';
    const src = host.dataset.paintSrc ?? '';

    if (key === '' || key === state.paintKey || src === '') return;

    state.paintKey = key;
    state.held = false;
    void play([{ kind: 'painting', value: src, seconds: PICTURE_HOLD_MS / 1000, motion: 'still' }]);
  };

  const voiceLevel = () =>
    state.look === 'speaking' ? Math.min(1, meter.speech * 5) : state.look === 'listening' || state.look === 'hearing' ? Math.min(1, meter.mic * 7) : 0;

  const target = (index: number, time: number, out: Float32Array) => {
    const s = seed[index]!;
    const k = index / count;
    const { x: cx, y: cy } = state.center;
    const shape = state.shape;
    const shaping = shape !== null && (state.look !== 'thinking' || state.held);

    if (shaping && index >= state.used) {
      const drift = shape.motion === 'still' ? 0 : time;
      const angle = s * Math.PI * 2 + drift * 0.08 * (s - 0.5);
      const radius = (shape.picture ? 6 : 2.6) + s * 3.2;

      out[0] = cx + Math.cos(angle) * radius;
      out[1] = cy + Math.sin(angle) * radius * 0.75;
      out[2] = (shape.picture ? -6 : -1.5) - s * 2;
      return;
    }

    if (shaping && shape.program !== null) {
      const frame = shape.program.latest();
      const at = index * 3;

      out[0] = cx + (frame?.positions[at] ?? 0) * shape.scale;
      out[1] = cy + (frame?.positions[at + 1] ?? 0) * shape.scale;
      out[2] = (frame?.positions[at + 2] ?? 0) * shape.scale;
      toneGoal[index] = frame?.tones[index] ?? 0.7;
      return;
    }

    if (shaping) {
      const dot = shape.dots[index % shape.dots.length]!;
      const age = (performance.now() - shape.bornAt) / 1000;
      const motion = shape.motion;
      const voice = state.look === 'speaking' && motion !== 'still' ? 1 + state.level * 0.06 : 1;
      const pulse = motion === 'pulse' ? 1 + Math.sin(age * 6) * 0.08 : 1;
      const burst = motion === 'explode' ? 1 + Math.max(0, age - 1.2) * 2.2 : 1;
      const scale = shape.scale * voice * pulse * burst;
      const yaw = shape.solid && motion === 'still' ? 0.5 : shape.solid ? age * (motion === 'spin' || motion === 'tumble' ? 1.4 : 0.35) : motion === 'spin' ? Math.sin(age * 1.6) * 0.9 : motion === 'sway' ? Math.sin(age * 2) * 0.35 : 0;
      const pitch = shape.solid && motion === 'still' ? 0.35 : shape.solid ? 0.35 + (motion === 'tumble' ? Math.sin(age * 0.4) * 0.45 : Math.sin(age * 0.5) * 0.25) : 0;
      const lift = motion === 'bounce' ? Math.abs(Math.sin(age * 4)) * 0.7 : 0;
      const dolly = shape.solid && motion === 'tumble' ? 1 + Math.sin(age * 0.6) * 0.18 : 1;
      const depth = shape.solid ? 1 : 0.25;
      const x0 = dot[0] * scale * dolly;
      const y0 = dot[1] * scale * dolly;
      const z0 = dot[2] * scale * depth * dolly;
      const x1 = x0 * Math.cos(yaw) + z0 * Math.sin(yaw);
      const z1 = -x0 * Math.sin(yaw) + z0 * Math.cos(yaw);
      const y1 = y0 * Math.cos(pitch) - z1 * Math.sin(pitch);
      const z2 = y0 * Math.sin(pitch) + z1 * Math.cos(pitch);
      const calm = motion === 'still' ? 0 : 1;
      const wobble = calm * (state.look === 'speaking' ? Math.sin(time * 13 + s * 6) * state.level * 0.03 : Math.sin(time * 1.3 + s * 9) * 0.012);

      out[0] = cx + x1 + wobble;
      out[1] = cy + y1 + lift + wobble;
      out[2] = z2 + (s - 0.5) * 0.03 * calm;
      return;
    }

    if (state.look === 'asleep') {
      const breath = 1 + Math.sin(time * 1.4) * 0.06;

      if (index % 3 === 0) {
        const angle = k * Math.PI * 2 + time * 0.12;
        const radius = (1.85 + Math.sin(angle * 5 + time * 1.1) * 0.05 + (s - 0.5) * 0.08) * breath;

        out[0] = cx + Math.cos(angle) * radius;
        out[1] = cy + Math.sin(angle) * radius;
        out[2] = (s - 0.5) * 0.2;
        return;
      }

      const angle = k * Math.PI * 2 * 7 + time * 0.25 * (0.5 + s);
      const radius = Math.pow(s, 2.2) * 1.25 * breath;

      out[0] = cx + Math.cos(angle) * radius;
      out[1] = cy + Math.sin(angle) * radius;
      out[2] = (Math.sin(k * 40) - 0.5) * 0.8;
      return;
    }

    if (state.look === 'thinking' || state.look === 'waking') {
      const angle = k * Math.PI * 6 + time * (4 + s * 3);
      const radius = 0.2 + 1.5 * s;

      out[0] = cx + Math.cos(angle) * radius;
      out[1] = cy + Math.sin(angle) * radius * 0.9;
      out[2] = Math.sin(angle * 0.5 + time) * radius * 0.6;
      return;
    }

    const level = state.level;
    const tight = state.look === 'hearing' ? 1.9 - level * 0.55 : state.look === 'speaking' ? 2.2 + level * 0.3 : 2.2;
    const wave = state.look === 'hearing' ? 0.1 + level * 0.6 : state.look === 'speaking' ? 0.12 + level * 0.3 : 0.12;
    const angle = k * Math.PI * 2 + time * 0.15;
    const radius = tight + Math.sin(angle * 5 + time * 2) * wave + Math.sin(angle * 9 - time * 3) * wave * 0.4 + (s - 0.5) * 0.12;

    out[0] = cx + Math.cos(angle) * radius;
    out[1] = cy + Math.sin(angle) * radius;
    out[2] = Math.sin(angle * 2 + time * 0.7) * 0.5 + (s - 0.5) * 0.3;
  };

  const goal = new Float32Array(3);
  let last = performance.now();
  let handle = 0;

  const step = (now: number) => {
    const time = now / 1000;
    const delta = Math.min(0.04, (now - last) / 1000);
    const look = host.dataset.look ?? 'asleep';

    last = now;
    state.look = isLook(look) ? look : 'asleep';

    const heard = voiceLevel();

    state.level += (heard - state.level) * (heard > state.level ? 0.35 : 0.08);
    readForm();
    readPaint();

    if (state.shape !== null && !state.held && (now > state.shapeUntil || (state.look === 'asleep' && !state.idling))) release();

    readIdle();

    if (!state.held) anchor();

    const stiffness = state.look === 'asleep' ? 2.2 : state.look === 'thinking' ? 13 : 7.5;
    const shaping = state.shape !== null && (state.look !== 'thinking' || state.held);
    const baseTone = LOOK_TONE[state.look];
    const { x: cx, y: cy } = state.center;

    for (let index = 0; index < count; index += 1) {
      target(index, time, goal);

      const at = index * 3;
      const locked = formed[index]! > 0.5;
      const spring = locked ? 26 : stiffness;
      const damping = locked ? 9.5 : 4.3;
      let ax = (goal[0]! - position[at]!) * spring - velocity[at]! * damping;
      let ay = (goal[1]! - position[at + 1]!) * spring - velocity[at + 1]! * damping;
      const az = (goal[2]! - position[at + 2]!) * spring - velocity[at + 2]! * damping;

      for (const shock of state.shocks) {
        const age = (now - shock) / 1000;

        if (age > 1) continue;

        const dx = position[at]! - cx;
        const dy = position[at + 1]! - cy;
        const distance = Math.hypot(dx, dy) + 0.001;

        if (Math.abs(distance - age * 9) < 0.5) {
          ax += (dx / distance) * 90;
          ay += (dy / distance) * 90;
          heat[index] = 1;
        }
      }

      velocity[at] = velocity[at]! + ax * delta;
      velocity[at + 1] = velocity[at + 1]! + ay * delta;
      velocity[at + 2] = velocity[at + 2]! + az * delta;
      position[at] = position[at]! + velocity[at]! * delta;
      position[at + 1] = position[at + 1]! + velocity[at + 1]! * delta;
      position[at + 2] = position[at + 2]! + velocity[at + 2]! * delta;
      heat[index] = heat[index]! * 0.94;

      const idleRing = state.look === 'asleep' && index % 3 === 0;
      const idleCore = state.look === 'asleep' && !idleRing ? 1 - Math.min(1, Math.hypot(position[at]! - cx, position[at + 1]! - cy) / 1.3) : 0;
      const toneTarget = shaping ? toneGoal[index]! : idleRing ? 0.86 + seed[index]! * 0.14 : state.look === 'asleep' ? 0.4 + idleCore * 0.55 : baseTone * (0.6 + seed[index]! * 0.5);

      tone[index] = tone[index]! + (toneTarget - tone[index]!) * 0.07;
      formed[index] = formed[index]! + (((shaping && index < state.used) || idleRing ? 1 : 0) - formed[index]!) * 0.2;
    }

    state.shocks = state.shocks.filter((shock) => now - shock < 1100);

    for (const name of ['position', 'tone', 'heat', 'formed']) geometry.getAttribute(name).needsUpdate = true;

    material.uniforms.uTime!.value = time;
    material.uniforms.uLevel!.value = state.level;
    host.dataset.shaped = shaping ? (state.shape?.picture ? 'picture' : 'form') : '';
    host.dataset.held = state.held ? '1' : '';
    composer.render();
    handle = requestAnimationFrame(step);
  };

  const observer = new ResizeObserver(resize);

  observer.observe(host);
  resize();
  handle = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(handle);
    observer.disconnect();
    geometry.dispose();
    material.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
};

export const Swarm = Mount.define('Swarm', {
  messages: [Message.CompletedMount],
  execute: ({ element }) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        try {
          return startSwarm(element as HTMLElement);
        } catch {
          (element as HTMLElement).dataset.swarm = 'unavailable';

          return () => undefined;
        }
      }),
      (stop) => Effect.sync(stop),
    ).pipe(Effect.as(Message.CompletedMount())),
});
