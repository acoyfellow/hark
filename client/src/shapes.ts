export type Dot = readonly [x: number, y: number, z: number, tone: number];

const SAMPLE = 240;

const PICTURE_GRID = 132;

const SOLID_DOTS = 9000;

const TAU = Math.PI * 2;

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

const canvas2d = (size: number) => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  return canvas.getContext('2d', { willReadFrequently: true });
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
  const context = canvas2d(SAMPLE);

  if (context === null) return [];

  draw(context, SAMPLE);

  const data = context.getImageData(0, 0, SAMPLE, SAMPLE).data;
  const dots: Dot[] = [];

  for (let y = 0; y < SAMPLE; y += 1)
    for (let x = 0; x < SAMPLE; x += 1) {
      const at = (y * SAMPLE + x) * 4;
      const alpha = data[at + 3]! / 255;
      const light = luminance(data, at);

      if (alpha > 0.12 && Math.random() < alpha) dots.push([x / SAMPLE - 0.5, 0.5 - y / SAMPLE, alpha * (0.4 + light * 0.6) * 0.35, 0.42 + light * 0.4]);
    }

  return shuffle(dots).slice(0, cap);
};

export const emojiDots = (value: string) =>
  traced((context, size) => {
    context.font = `${size * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(value, size / 2, size * 0.54);
  });

export const wordDots = (value: string) =>
  traced((context, size) => {
    let font = size * 0.5;

    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 ${font}px "Google Sans Flex", system-ui, sans-serif`;

    const fit = (size * 0.94) / context.measureText(value).width;

    if (fit < 1) {
      font *= fit;
      context.font = `700 ${font}px "Google Sans Flex", system-ui, sans-serif`;
    }

    context.fillText(value, size / 2, size / 2);
  });

const strokePath = (path: string, box: number, width: number, cap = 9000) =>
  traced((context, size) => {
    context.save();
    context.translate(size * 0.08, size * 0.08);
    context.scale((size * 0.84) / box, (size * 0.84) / box);
    context.strokeStyle = '#fff';
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    try {
      context.stroke(new Path2D(path));
    } catch {
      context.restore();
      return;
    }

    context.restore();
  }, cap);

export const iconDots = (name: string) => strokePath(ICON_PATHS[name] ?? '', 24, 2.1);

export const drawingDots = (path: string) => strokePath(path, 100, 2.6, 5200);

export const pictureDots = (image: HTMLImageElement): Dot[] => {
  const context = canvas2d(PICTURE_GRID);

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

type Surface = (u: number, v: number, w: number) => readonly [number, number, number];

const SURFACES: Record<string, Surface> = {
  sphere: (u, v) => {
    const theta = u * TAU;
    const phi = Math.acos(2 * v - 1);

    return [Math.sin(phi) * Math.cos(theta) * 0.42, Math.cos(phi) * 0.42, Math.sin(phi) * Math.sin(theta) * 0.42];
  },
  cube: (u, v, w) => {
    const face = Math.floor(w * 6);
    const a = u - 0.5;
    const b = v - 0.5;
    const faces: readonly (readonly [number, number, number])[] = [
      [0.5, a, b],
      [-0.5, a, b],
      [a, 0.5, b],
      [a, -0.5, b],
      [a, b, 0.5],
      [a, b, -0.5],
    ];
    const [x, y, z] = faces[face] ?? faces[0]!;

    return [x * 0.62, y * 0.62, z * 0.62];
  },
  torus: (u, v) => {
    const a = u * TAU;
    const b = v * TAU;
    const ring = 0.3 + 0.12 * Math.cos(b);

    return [ring * Math.cos(a), 0.12 * Math.sin(b), ring * Math.sin(a)];
  },
  helix: (u, v) => {
    const strand = v < 0.5 ? 0 : Math.PI;
    const a = u * TAU * 3 + strand;

    return [Math.cos(a) * 0.22, u - 0.5, Math.sin(a) * 0.22];
  },
  galaxy: (u, v, w) => {
    const arm = Math.floor(w * 3) * (TAU / 3);
    const r = Math.pow(u, 0.7) * 0.5;
    const a = arm + r * 9 + (v - 0.5) * 0.6;

    return [Math.cos(a) * r, (v - 0.5) * 0.04 * (1 - r), Math.sin(a) * r];
  },
  wave: (u, v) => {
    const x = u - 0.5;
    const z = v - 0.5;

    return [x * 1.1, Math.sin(x * 10) * Math.cos(z * 8) * 0.12, z * 1.1];
  },
  heart: (u, v) => {
    const t = u * TAU;
    const depth = (v - 0.5) * 0.24 * Math.sin(u * Math.PI);
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const fill = Math.sqrt(v);

    return [(x / 36) * fill, (y / 36) * fill + 0.05, depth];
  },
  star: (u, v) => {
    const points = 5;
    const a = u * TAU;
    const spike = Math.pow(Math.abs(Math.cos((a * points) / 2)), 3);
    const r = (0.2 + spike * 0.32) * Math.sqrt(v);

    return [Math.sin(a) * r, Math.cos(a) * r, (1 - Math.sqrt(v)) * 0.12 * (v > 0.5 ? 1 : -1)];
  },
  planet: (u, v, w) => {
    if (w < 0.62) return SURFACES.sphere!(u, v, w).map((value) => value * 0.72) as unknown as readonly [number, number, number];

    const a = u * TAU;
    const r = 0.42 + v * 0.16;

    return [Math.cos(a) * r, Math.sin(a) * r * 0.22, Math.sin(a) * r * 0.5];
  },
  tornado: (u, v) => {
    const r = 0.04 + Math.pow(v, 1.6) * 0.4;
    const a = u * TAU + v * 14;

    return [Math.cos(a) * r, v - 0.5, Math.sin(a) * r];
  },
  flower: (u, v) => {
    const a = u * TAU;
    const petals = Math.abs(Math.cos(a * 3));
    const r = (0.08 + petals * 0.4) * Math.sqrt(v);

    return [Math.cos(a) * r, Math.sin(a) * r, Math.sin(r * 12) * 0.05];
  },
  mobius: (u, v) => {
    const a = u * TAU;
    const s = (v - 0.5) * 0.3;

    return [(0.32 + s * Math.cos(a / 2)) * Math.cos(a), s * Math.sin(a / 2), (0.32 + s * Math.cos(a / 2)) * Math.sin(a)];
  },
};

export const solidDots = (name: string): Dot[] => {
  const surface = SURFACES[name];

  if (surface === undefined) return [];

  return Array.from({ length: SOLID_DOTS }, () => {
    const [x, y, z] = surface(Math.random(), Math.random(), Math.random());

    return [x, y, z, 0.55 + (z + 0.5) * 0.45] as const;
  });
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const safeSvg = (markup: string): string | null => {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;

  if (root.nodeName !== 'svg' || parsed.querySelector('parsererror') !== null) return null;

  for (const node of root.querySelectorAll('script, foreignObject, iframe, image, use')) node.remove();

  for (const element of [root, ...root.querySelectorAll('*')])
    for (const attribute of Array.from(element.attributes)) if (/^on/iu.test(attribute.name) || /href/iu.test(attribute.name)) element.removeAttribute(attribute.name);

  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', '0 0 100 100');
  root.setAttribute('xmlns', SVG_NAMESPACE);
  root.setAttribute('width', String(SAMPLE));
  root.setAttribute('height', String(SAMPLE));

  return new XMLSerializer().serializeToString(root);
};

export const svgDots = async (markup: string): Promise<Dot[]> => {
  const clean = safeSvg(markup);

  if (clean === null) return [];

  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`);

  if (image === null) return [];

  return traced((context, size) => context.drawImage(image, 0, 0, size, size), 9000);
};

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
