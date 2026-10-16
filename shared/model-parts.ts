export type Vec = readonly [number, number, number];

export const MODEL_SHAPES = ['sphere', 'box', 'cylinder', 'cone', 'torus', 'capsule'] as const;

type ModelShape = (typeof MODEL_SHAPES)[number];

export type Part = {
  readonly shape: ModelShape;
  readonly at: Vec;
  readonly size: Vec;
  readonly turn: Vec;
  readonly glow: number;
};

const MAX_PARTS = 40;

const DEGREES = Math.PI / 180;

const isShape = (value: string): value is ModelShape => MODEL_SHAPES.some((shape) => shape === value);

const vec = (raw: unknown, fallback: number): Vec => {
  const list: unknown[] = Array.isArray(raw) ? raw : [raw, raw, raw];
  const at = (index: number) => {
    const value = Number(list[index]);

    return Number.isFinite(value) ? Math.max(-3, Math.min(3, value)) : fallback;
  };

  return [at(0), at(1), at(2)];
};

const listOf = (parsed: unknown): unknown[] => {
  if (Array.isArray(parsed)) return parsed;

  if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { parts?: unknown }).parts)) return (parsed as { parts: unknown[] }).parts;

  return [];
};

const partOf = (raw: unknown): Part[] => {
  if (typeof raw !== 'object' || raw === null) return [];

  const record = raw as Record<string, unknown>;
  const shape = String(record.shape ?? '').toLowerCase();

  if (!isShape(shape)) return [];

  const turn = vec(record.turn ?? record.rotate, 0);
  const glow = Number(record.glow);

  return [
    {
      shape,
      at: vec(record.at ?? record.position, 0),
      size: vec(record.size ?? record.scale, 0.2),
      turn: [turn[0] * DEGREES, turn[1] * DEGREES, turn[2] * DEGREES],
      glow: Number.isFinite(glow) ? Math.max(0.1, Math.min(1, glow)) : 0.8,
    },
  ];
};

export const partsOf = (value: string): Part[] => {
  try {
    return listOf(JSON.parse(value)).slice(0, MAX_PARTS).flatMap(partOf);
  } catch {
    return [];
  }
};

export const modelProblem = (value: string): string | null => {
  try {
    JSON.parse(value);
  } catch {
    return 'is not valid JSON';
  }

  return partsOf(value).length === 0 ? `has no usable parts; each part needs shape (${MODEL_SHAPES.join(', ')}), at and size` : null;
};
