export type Vec = readonly [number, number, number];

export const MODEL_SHAPES = ['sphere', 'box', 'cylinder', 'cone', 'torus', 'capsule', 'wedge', 'pyramid', 'disc'] as const;

type ModelShape = (typeof MODEL_SHAPES)[number];

export type Part = {
  readonly shape: ModelShape;
  readonly at: Vec;
  readonly size: Vec;
  readonly turn: Vec;
  readonly glow: number;
  readonly cut: boolean;
};

type RawPart = { readonly shape: ModelShape; readonly at: Vec; readonly size: Vec; readonly turn?: Vec; readonly glow?: number; readonly cut?: boolean };

const MAX_PARTS = 80;

const DEGREES = Math.PI / 180;

const leg = (x: number, z: number, height: number, width = 0.05): RawPart => ({ shape: 'box', at: [x, height / 2 - 1, z], size: [width, height / 2, width] });

const wheel = (x: number, z: number): RawPart => ({ shape: 'torus', at: [x, -0.48, z], size: [0.14, 0.14, 0.14], turn: [90, 0, 0] });

const tower = (x: number, z: number): RawPart[] => [
  { shape: 'cylinder', at: [x, -0.15, z], size: [0.14, 0.5, 0.14] },
  { shape: 'cone', at: [x, 0.5, z], size: [0.17, 0.18, 0.17], glow: 1 },
];

export const MODEL_KIT: Record<string, readonly RawPart[]> = {
  rocket: [
    { shape: 'cylinder', at: [0, 0, 0], size: [0.22, 0.6, 0.22] },
    { shape: 'cone', at: [0, 0.85, 0], size: [0.22, 0.25, 0.22], glow: 1 },
    { shape: 'disc', at: [0, 0.2, 0.22], size: [0.08, 0.08, 0.02], turn: [90, 0, 0], glow: 1 },
    { shape: 'wedge', at: [0.3, -0.5, 0], size: [0.1, 0.18, 0.02] },
    { shape: 'wedge', at: [-0.3, -0.5, 0], size: [0.1, 0.18, 0.02], turn: [0, 180, 0] },
    { shape: 'wedge', at: [0, -0.5, 0.3], size: [0.1, 0.18, 0.02], turn: [0, -90, 0] },
    { shape: 'cone', at: [0, -0.75, 0], size: [0.14, 0.15, 0.14], turn: [180, 0, 0], glow: 0.5 },
  ],
  house: [
    { shape: 'box', at: [0, -0.3, 0], size: [0.6, 0.4, 0.45] },
    { shape: 'wedge', at: [0, 0.3, 0], size: [0.68, 0.25, 0.5], glow: 1 },
    { shape: 'box', at: [0, -0.48, 0.45], size: [0.1, 0.22, 0.04], cut: true },
    { shape: 'box', at: [0.32, -0.2, 0.45], size: [0.1, 0.1, 0.04], cut: true },
    { shape: 'box', at: [-0.32, -0.2, 0.45], size: [0.1, 0.1, 0.04], cut: true },
    { shape: 'box', at: [0.35, 0.45, -0.15], size: [0.06, 0.15, 0.06] },
  ],
  chair: [
    { shape: 'box', at: [0, -0.1, 0], size: [0.35, 0.04, 0.35] },
    { shape: 'box', at: [0, 0.38, -0.33], size: [0.35, 0.45, 0.03] },
    leg(0.3, 0.3, 0.9),
    leg(-0.3, 0.3, 0.9),
    leg(0.3, -0.3, 0.9),
    leg(-0.3, -0.3, 0.9),
  ],
  table: [{ shape: 'box', at: [0, 0, 0], size: [0.7, 0.04, 0.42] }, leg(0.62, 0.34, 1), leg(-0.62, 0.34, 1), leg(0.62, -0.34, 1), leg(-0.62, -0.34, 1)],
  car: [
    { shape: 'box', at: [0, -0.3, 0], size: [0.8, 0.16, 0.36] },
    { shape: 'box', at: [-0.05, -0.02, 0], size: [0.42, 0.14, 0.32] },
    { shape: 'box', at: [-0.05, -0.02, 0], size: [0.38, 0.1, 0.34], cut: true },
    wheel(0.5, 0.37),
    wheel(-0.5, 0.37),
    wheel(0.5, -0.37),
    wheel(-0.5, -0.37),
    { shape: 'disc', at: [0.8, -0.28, 0.22], size: [0.05, 0.05, 0.02], turn: [0, 90, 0], glow: 1 },
    { shape: 'disc', at: [0.8, -0.28, -0.22], size: [0.05, 0.05, 0.02], turn: [0, 90, 0], glow: 1 },
  ],
  tree: [
    { shape: 'cylinder', at: [0, -0.6, 0], size: [0.08, 0.35, 0.08], glow: 0.5 },
    { shape: 'cone', at: [0, -0.05, 0], size: [0.45, 0.3, 0.45] },
    { shape: 'cone', at: [0, 0.3, 0], size: [0.36, 0.26, 0.36] },
    { shape: 'cone', at: [0, 0.6, 0], size: [0.26, 0.22, 0.26], glow: 1 },
  ],
  robot: [
    { shape: 'box', at: [0, 0, 0], size: [0.3, 0.35, 0.2] },
    { shape: 'box', at: [0, 0.55, 0], size: [0.2, 0.17, 0.17] },
    { shape: 'sphere', at: [0.08, 0.58, 0.17], size: [0.04, 0.04, 0.02], glow: 1 },
    { shape: 'sphere', at: [-0.08, 0.58, 0.17], size: [0.04, 0.04, 0.02], glow: 1 },
    { shape: 'cylinder', at: [0, 0.82, 0], size: [0.015, 0.1, 0.015] },
    { shape: 'sphere', at: [0, 0.94, 0], size: [0.04, 0.04, 0.04], glow: 1 },
    { shape: 'capsule', at: [0.42, 0, 0], size: [0.08, 0.3, 0.08] },
    { shape: 'capsule', at: [-0.42, 0, 0], size: [0.08, 0.3, 0.08] },
    { shape: 'capsule', at: [0.14, -0.65, 0], size: [0.09, 0.3, 0.09] },
    { shape: 'capsule', at: [-0.14, -0.65, 0], size: [0.09, 0.3, 0.09] },
  ],
  snowman: [
    { shape: 'sphere', at: [0, -0.55, 0], size: [0.4, 0.4, 0.4] },
    { shape: 'sphere', at: [0, 0.05, 0], size: [0.3, 0.3, 0.3] },
    { shape: 'sphere', at: [0, 0.52, 0], size: [0.21, 0.21, 0.21] },
    { shape: 'cone', at: [0, 0.52, 0.3], size: [0.04, 0.12, 0.04], turn: [90, 0, 0], glow: 1 },
    { shape: 'cylinder', at: [0, 0.82, 0], size: [0.15, 0.12, 0.15] },
    { shape: 'disc', at: [0, 0.71, 0], size: [0.25, 0.25, 0.02], turn: [90, 0, 0] },
  ],
  boat: [
    { shape: 'wedge', at: [0, -0.4, 0], size: [0.8, 0.18, 0.3], turn: [180, 0, 0] },
    { shape: 'cylinder', at: [0, 0.15, 0], size: [0.025, 0.55, 0.025] },
    { shape: 'pyramid', at: [0.2, 0.25, 0], size: [0.3, 0.42, 0.01], glow: 1 },
  ],
  plane: [
    { shape: 'capsule', at: [0, 0, 0], size: [0.12, 0.85, 0.12], turn: [0, 0, 90] },
    { shape: 'box', at: [0, 0, 0], size: [0.18, 0.02, 0.8] },
    { shape: 'box', at: [-0.72, 0.05, 0], size: [0.08, 0.015, 0.28] },
    { shape: 'wedge', at: [-0.75, 0.22, 0], size: [0.12, 0.18, 0.015], glow: 1 },
  ],
  mug: [
    { shape: 'cylinder', at: [0, 0, 0], size: [0.35, 0.42, 0.35] },
    { shape: 'cylinder', at: [0, 0.06, 0], size: [0.3, 0.42, 0.3], cut: true },
    { shape: 'torus', at: [0.4, 0, 0], size: [0.16, 0.18, 0.16], turn: [90, 0, 0] },
  ],
  castle: [
    { shape: 'box', at: [0, -0.35, 0], size: [0.6, 0.3, 0.4] },
    { shape: 'box', at: [0, -0.5, 0.4], size: [0.12, 0.16, 0.04], cut: true },
    ...tower(0.6, 0.4),
    ...tower(-0.6, 0.4),
    ...tower(0.6, -0.4),
    ...tower(-0.6, -0.4),
  ],
  pyramid: [{ shape: 'pyramid', at: [0, 0, 0], size: [0.7, 0.6, 0.7] }],
};

export const KIT_NAMES = Object.keys(MODEL_KIT);

const isShape = (value: string): value is ModelShape => MODEL_SHAPES.some((shape) => shape === value);

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

const vec = (raw: unknown, fallback: number): Vec => {
  const list: unknown[] = Array.isArray(raw) ? raw : [raw, raw, raw];
  const at = (index: number) => {
    const value = Number(list[index]);

    return Number.isFinite(value) ? clamp(value, 6) : fallback;
  };

  return [at(0), at(1), at(2)];
};

const recordsOf = (parsed: unknown): unknown[] => {
  if (typeof parsed === 'string') return [{ use: parsed }];

  if (Array.isArray(parsed)) return parsed;

  if (typeof parsed !== 'object' || parsed === null) return [];

  const record = parsed as { parts?: unknown; scene?: unknown; use?: unknown };

  if (Array.isArray(record.parts)) return record.parts;

  if (Array.isArray(record.scene)) return record.scene;

  return typeof record.use === 'string' ? [record] : [];
};

export const turned = ([x, y, z]: Vec, [rx, ry, rz]: Vec): Vec => {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy;
  const z2 = -x * sy + z1 * cy;

  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
};

const kitName = (raw: string) => {
  const name = raw.toLowerCase().trim().replace(/^(?:a|an|the)\s+/u, '').replace(/s$/u, '');

  return KIT_NAMES.find((each) => each === name || name.includes(each)) ?? null;
};

const placedKit = (record: Record<string, unknown>): Part[] => {
  const name = kitName(String(record.use ?? record.kit ?? ''));

  if (name === null) return [];

  const offset = vec(record.at ?? record.position, 0);
  const scale = Number(record.scale ?? 1);
  const by = Number.isFinite(scale) ? Math.max(0.1, Math.min(3, scale)) : 1;
  const spin = (Array.isArray(record.turn) ? Number(record.turn[1] ?? 0) : Number(record.turn ?? 0)) * DEGREES;
  const glow = Number(record.glow);

  return (MODEL_KIT[name] ?? []).map((part) => {
    const at = turned([part.at[0] * by, part.at[1] * by, part.at[2] * by], [0, Number.isFinite(spin) ? spin : 0, 0]);

    return {
      shape: part.shape,
      at: [at[0] + offset[0], at[1] + offset[1], at[2] + offset[2]],
      size: [part.size[0] * by, part.size[1] * by, part.size[2] * by],
      turn: [(part.turn?.[0] ?? 0) * DEGREES, (part.turn?.[1] ?? 0) * DEGREES + (Number.isFinite(spin) ? spin : 0), (part.turn?.[2] ?? 0) * DEGREES],
      glow: Number.isFinite(glow) ? Math.max(0.1, Math.min(1, glow)) : (part.glow ?? 0.8),
      cut: part.cut ?? false,
    };
  });
};

const partOf = (raw: unknown): Part[] => {
  if (typeof raw === 'string') return placedKit({ use: raw });

  if (typeof raw !== 'object' || raw === null) return [];

  const record = raw as Record<string, unknown>;

  if (record.use !== undefined || record.kit !== undefined) return placedKit(record);

  const shape = String(record.shape ?? '').toLowerCase();

  if (!isShape(shape)) return kitName(shape) === null ? [] : placedKit({ ...record, use: shape });

  const turn = vec(record.turn ?? record.rotate, 0);
  const glow = Number(record.glow);

  return [
    {
      shape,
      at: vec(record.at ?? record.position, 0),
      size: vec(record.size ?? record.scale, 0.2),
      turn: [turn[0] * DEGREES, turn[1] * DEGREES, turn[2] * DEGREES],
      glow: Number.isFinite(glow) ? Math.max(0.1, Math.min(1, glow)) : 0.8,
      cut: record.cut === true || record.subtract === true,
    },
  ];
};

const parsedValue = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return kitName(value) === null ? undefined : value;
  }
};

export const partsOf = (value: string): Part[] => recordsOf(parsedValue(value)).flatMap(partOf).slice(0, MAX_PARTS);

export const modelProblem = (value: string): string | null => {
  if (parsedValue(value) === undefined) return `is not valid JSON; send parts, or a kit name like ${KIT_NAMES.slice(0, 4).join(', ')}`;

  return partsOf(value).length === 0 ? `has no usable parts; each part needs shape (${MODEL_SHAPES.join(', ')}), at and size, or {"use": one of ${KIT_NAMES.join(', ')}}` : null;
};
