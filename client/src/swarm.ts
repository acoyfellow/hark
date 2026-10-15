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
import { Message } from './message';

export const EMBER_RAMP = ['#1a0904', '#5a1e08', '#c2520f', '#f6821f', '#ffb35c', '#ffe7c4'] as const;

type Dot = readonly [x: number, y: number, z: number, tone: number];

type Shape = { readonly dots: readonly Dot[]; readonly scale: number; readonly picture: boolean };

type Look = 'asleep' | 'waking' | 'listening' | 'hearing' | 'thinking' | 'speaking';

const LOOKS: readonly Look[] = ['asleep', 'waking', 'listening', 'hearing', 'thinking', 'speaking'];

const isLook = (value: string): value is Look => LOOKS.some((look) => look === value);

const LOOK_TONE: Record<Look, number> = { asleep: 0.12, waking: 0.55, listening: 0.6, hearing: 0.8, thinking: 0.7, speaking: 0.85 };

const ICON_PATHS: Record<string, string> = {
  sun: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8a6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 18z',
  rain: 'M7 14h10a4 4 0 0 0 .5-8a6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  snow: 'M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 4l3 2l3-2M9 20l3-2l3 2',
  storm: 'M7 13h10a4 4 0 0 0 .5-8a6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 13zM13 13l-3 5h4l-3 5',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z',
  star: 'M12 2.5l2.9 6.1l6.6.8l-4.9 4.5l1.3 6.6L12 17.2l-5.9 3.3l1.3-6.6L2.5 9.4l6.6-.8z',
  check: 'M4 12.5l5 5L20 6.5',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3.5 2',
  bolt: 'M13 2L4 14h7l-1 8l9-12h-7z',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  home: 'M3 11l9-8l9 8M5 9.5V21h5v-6h4v6h5V9.5',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18',
};

const SAMPLE = 240;

const PICTURE_GRID = 132;

const FORM_HOLD_MS = 7000;

const PICTURE_HOLD_MS = 2600;

const sampler = () => {
  const canvas = document.createElement('canvas');

  canvas.width = SAMPLE;
  canvas.height = SAMPLE;

  return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
};

const luminance = (data: Uint8ClampedArray, at: number) => (0.299 * data[at]! + 0.587 * data[at + 1]! + 0.114 * data[at + 2]!) / 255;

const shuffle = <T>(items: T[]): T[] => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    const swap = items[index]!;

    items[index] = items[other]!;
    items[other] = swap;
  }

  return items;
};

const traced = (draw: (context: CanvasRenderingContext2D, size: number) => void, cap = 9000): Dot[] => {
  const { context } = sampler();

  if (context === null) return [];

  draw(context, SAMPLE);

  const data = context.getImageData(0, 0, SAMPLE, SAMPLE).data;
  const dots: Dot[] = [];

  for (let y = 0; y < SAMPLE; y += 1)
    for (let x = 0; x < SAMPLE; x += 1) {
      const at = (y * SAMPLE + x) * 4;
      const alpha = data[at + 3]! / 255;
      const light = luminance(data, at);

      if (alpha > 0.12 && Math.random() < alpha) dots.push([x / SAMPLE - 0.5, 0.5 - y / SAMPLE, alpha * (0.4 + light * 0.6) * 0.35, 0.45 + light * 0.55]);
    }

  return shuffle(dots).slice(0, cap);
};

const emojiDots = (value: string) =>
  traced((context, size) => {
    context.font = `${size * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(value, size / 2, size * 0.54);
  });

const wordDots = (value: string) =>
  traced((context, size) => {
    let font = size * 0.5;

    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${font}px "Google Sans Flex", system-ui, sans-serif`;

    const fit = (size * 0.92) / context.measureText(value).width;

    if (fit < 1) {
      font *= fit;
      context.font = `600 ${font}px "Google Sans Flex", system-ui, sans-serif`;
    }

    context.fillText(value, size / 2, size / 2);
  });

const iconDots = (name: string) =>
  traced((context, size) => {
    const path = ICON_PATHS[name];

    if (path === undefined) return;

    context.save();
    context.translate(size * 0.1, size * 0.1);
    context.scale((size * 0.8) / 24, (size * 0.8) / 24);
    context.strokeStyle = '#fff';
    context.lineWidth = 2.1;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke(new Path2D(path));
    context.restore();
  });

const pictureDots = (image: HTMLImageElement): Dot[] => {
  const { context } = sampler();

  if (context === null) return [];

  context.drawImage(image, 0, 0, PICTURE_GRID, PICTURE_GRID);

  const data = context.getImageData(0, 0, PICTURE_GRID, PICTURE_GRID).data;
  const lights = Float32Array.from({ length: PICTURE_GRID * PICTURE_GRID }, (_, index) => luminance(data, index * 4));
  const sorted = lights.toSorted();
  const low = sorted[Math.floor(lights.length * 0.02)] ?? 0;
  const high = sorted[Math.floor(lights.length * 0.985)] ?? 1;
  const dots: Dot[] = [];

  for (let y = 0; y < PICTURE_GRID; y += 1)
    for (let x = 0; x < PICTURE_GRID; x += 1) {
      const light = Math.pow(Math.min(1, Math.max(0, (lights[y * PICTURE_GRID + x]! - low) / Math.max(0.05, high - low))), 0.8);
      const jitter = () => (Math.random() - 0.5) / PICTURE_GRID;

      if (light > 0.08 || Math.random() < 0.35) dots.push([x / PICTURE_GRID - 0.5 + jitter(), 0.5 - y / PICTURE_GRID + jitter(), light * 0.12, 0.06 + light * 0.94]);
    }

  return dots;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

const VERTEX = `
attribute float tone; attribute float seed; attribute float heat; attribute float formed;
uniform float uTime; uniform float uLevel; uniform float uDpr; uniform float uBoost;
varying float vTone; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + seed * 40.0);
  gl_PointSize = (0.9 + seed * 1.5 + formed * (0.6 + uBoost) + heat * 2.4 + uLevel * 0.8) * uDpr * (14.0 / -mv.z);
  vTone = clamp(tone + heat * 0.35, 0.0, 1.0);
  vAlpha = twinkle * mix(0.18 + 0.42 * tone, 0.7 + 0.6 * tone, formed);
}`;

const FRAGMENT = `
uniform vec3 uRamp[6];
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
  gl_FragColor = vec4(ramp(vTone) * a, a);
}`;

const dynamic = (array: Float32Array, size: number) => new BufferAttribute(array, size).setUsage(DynamicDrawUsage);

const particleCount = () => (innerWidth < 700 ? 11000 : 24000);

const startSwarm = (host: HTMLElement) => {
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(new Color().setRGB(0.0003, 0.00018, 0.00012, LinearSRGBColorSpace), 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.className = 'size-full';
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);

  camera.position.set(0, 0, 14);

  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.5, 0.35, 0.55);

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
    position[index * 3 + 1] = -4.2 + Math.random() * 0.5;
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
    paintKey: '',
    shocks: [] as number[],
  };

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();

    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width, height);
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
    state.shape = shape;
    state.shapeUntil = performance.now() + millis;
    state.used = Math.min(count, Math.round(shape.dots.length * (shape.picture ? 1 : 1.6)));
    material.uniforms.uBoost!.value = shape.picture ? 0.7 : 0;

    for (let index = 0; index < count; index += 1)
      toneGoal[index] = index < state.used ? shape.dots[index % shape.dots.length]![3] : shape.picture ? 0.02 : 0.08 + seed[index]! * 0.12;

    state.shocks.push(performance.now());
  };

  const release = () => {
    state.shape = null;
    material.uniforms.uBoost!.value = 0;
  };

  const readForm = () => {
    const key = host.dataset.formId ?? '';

    if (key === '' || key === state.formKey) return;

    state.formKey = key;

    const kind = host.dataset.formKind ?? '';
    const value = host.dataset.formValue ?? '';
    const dots = kind === 'emoji' ? emojiDots(value) : kind === 'word' ? wordDots(value) : iconDots(value);

    if (dots.length > 0) hold({ dots, scale: 5, picture: false }, FORM_HOLD_MS);
  };

  const readPaint = () => {
    const key = host.dataset.paintId ?? '';
    const src = host.dataset.paintSrc ?? '';

    if (key === '' || key === state.paintKey || src === '') return;

    state.paintKey = key;
    void loadImage(src).then((image) => {
      if (image === null) return;

      const dots = pictureDots(image);

      if (dots.length > 0) hold({ dots, scale: 6.4, picture: true }, PICTURE_HOLD_MS);
    });
  };

  const voiceLevel = () =>
    state.look === 'speaking' ? Math.min(1, meter.speech * 5) : state.look === 'listening' || state.look === 'hearing' ? Math.min(1, meter.mic * 7) : 0;

  const target = (index: number, time: number, out: Float32Array) => {
    const s = seed[index]!;
    const k = index / count;
    const { x: cx, y: cy } = state.center;
    const shape = state.shape;
    const shaping = shape !== null && state.look !== 'thinking';

    if (shaping && index >= state.used) {
      const angle = s * Math.PI * 2 + time * 0.08 * (s - 0.5);
      const radius = (shape.picture ? 6 : 2.6) + s * 3.2;

      out[0] = cx + Math.cos(angle) * radius;
      out[1] = cy + Math.sin(angle) * radius * 0.75;
      out[2] = (shape.picture ? -6 : -1.5) - s * 2;
      return;
    }

    if (shaping) {
      const dot = shape.dots[index % shape.dots.length]!;
      const scale = shape.scale * (state.look === 'speaking' ? 1 + state.level * 0.05 : 1);
      const wobble = state.look === 'speaking' ? Math.sin(time * 13 + s * 6) * state.level * 0.03 : Math.sin(time * 1.3 + s * 9) * 0.012;

      out[0] = cx + dot[0] * scale + wobble;
      out[1] = cy + dot[1] * scale + wobble;
      out[2] = dot[2] * scale * 0.25 + (s - 0.5) * 0.03;
      return;
    }

    if (state.look === 'asleep') {
      out[0] = (k - 0.5) * 22;
      out[1] = -4.3 + 0.35 * Math.sin(k * 9 + time * 0.3) * Math.sin(k * 3) + s * 0.25;
      out[2] = (s - 0.5) * 5;
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

    if (state.shape !== null && (now > state.shapeUntil || state.look === 'asleep')) release();

    anchor();

    const stiffness = state.look === 'asleep' ? 1.6 : state.look === 'thinking' ? 13 : 7.5;
    const shaping = state.shape !== null && state.look !== 'thinking';
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

      const toneTarget = shaping ? toneGoal[index]! : baseTone * (0.6 + seed[index]! * 0.5);

      tone[index] = tone[index]! + (toneTarget - tone[index]!) * 0.07;
      formed[index] = formed[index]! + ((shaping && index < state.used ? 1 : 0) - formed[index]!) * 0.2;
    }

    state.shocks = state.shocks.filter((shock) => now - shock < 1100);

    for (const name of ['position', 'tone', 'heat', 'formed']) geometry.getAttribute(name).needsUpdate = true;

    material.uniforms.uTime!.value = time;
    material.uniforms.uLevel!.value = state.level;
    host.dataset.shaped = shaping ? (state.shape?.picture ? 'picture' : 'form') : '';
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
