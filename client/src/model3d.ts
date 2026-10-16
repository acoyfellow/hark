import { MODEL_SHAPES, type Part, partsOf, type Vec } from '../../shared/model-parts';
import type { Dot } from './shapes';

const TAU = Math.PI * 2;

const MODEL_DOTS = 12000;

const unitSurface = (shape: (typeof MODEL_SHAPES)[number], u: number, v: number): Vec => {
  const a = u * TAU;

  switch (shape) {
    case 'sphere': {
      const z = v * 2 - 1;
      const r = Math.sqrt(1 - z * z);

      return [Math.cos(a) * r, z, Math.sin(a) * r];
    }
    case 'box': {
      const face = Math.floor(u * 6);
      const p = (u * 6 - face) * 2 - 1;
      const q = v * 2 - 1;
      const faces: Vec[] = [
        [1, p, q],
        [-1, p, q],
        [p, 1, q],
        [p, -1, q],
        [p, q, 1],
        [p, q, -1],
      ];

      return faces[face] ?? faces[0]!;
    }
    case 'cylinder':
      return v < 0.8 ? [Math.cos(a), (v / 0.8) * 2 - 1, Math.sin(a)] : [Math.cos(a) * Math.sqrt((v - 0.8) / 0.2), v < 0.9 ? 1 : -1, Math.sin(a) * Math.sqrt((v - 0.8) / 0.2)];
    case 'cone': {
      const r = 1 - v;

      return [Math.cos(a) * r, v * 2 - 1, Math.sin(a) * r];
    }
    case 'torus': {
      const b = v * TAU;
      const tube = 0.35;

      return [(1 + tube * Math.cos(b)) * Math.cos(a), tube * Math.sin(b), (1 + tube * Math.cos(b)) * Math.sin(a)];
    }
    case 'capsule': {
      const y = v * 2 - 1;
      const cap = Math.abs(y) > 0.5 ? Math.sqrt(Math.max(0, 1 - ((Math.abs(y) - 0.5) / 0.5) ** 2)) : 1;

      return [Math.cos(a) * cap * 0.5, y, Math.sin(a) * cap * 0.5];
    }
  }
};

const rotate = ([x, y, z]: Vec, [rx, ry, rz]: Vec): Vec => {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy;
  const z2 = -x * sy + z1 * cy;

  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
};

const areaOf = (part: Part) => {
  const [x, y, z] = part.size.map(Math.abs) as unknown as Vec;

  return Math.max(0.0004, x * y + y * z + x * z);
};

export const modelDots = (value: string): Dot[] => {
  const parts = partsOf(value);

  if (parts.length === 0) return [];

  const areas = parts.map(areaOf);
  const total = areas.reduce((sum, area) => sum + area, 0);
  const extent = Math.max(0.3, ...parts.map((part) => Math.max(...part.at.map(Math.abs)) + Math.max(...part.size.map(Math.abs))));
  const fit = 0.5 / extent;

  return parts.flatMap((part, index) => {
    const share = Math.max(60, Math.round((areas[index]! / total) * MODEL_DOTS));

    return Array.from({ length: share }, () => {
      const local = unitSurface(part.shape, Math.random(), Math.random());
      const scaled: Vec = [local[0] * part.size[0], local[1] * part.size[1], local[2] * part.size[2]];
      const [x, y, z] = rotate(scaled, part.turn);

      return [(x + part.at[0]) * fit, (y + part.at[1]) * fit, (z + part.at[2]) * fit, part.glow] as const;
    });
  });
};
