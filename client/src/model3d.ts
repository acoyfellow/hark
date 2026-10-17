import { MODEL_SHAPES, type Part, partsOf, turned, type Vec } from '../../shared/model-parts';
import type { Dot } from './shapes';

const TAU = Math.PI * 2;

const DOTS_PER_AREA = 110000;

const MIN_DOTS = 4000;

const MAX_DOTS = 14000;

const EDGE_TONE = 0.5;

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
    case 'wedge': {
      const side = Math.floor(u * 4);
      const p = (u * 4 - side) * 2 - 1;
      if (side === 0) return [p, -1, v * 2 - 1];
      if (side === 1) return [p, -1 + v * 2, -1 + v];
      if (side === 2) return [p, -1 + v * 2, 1 - v];
      const w = Math.random() * (1 - v);
      return [side === 3 && Math.random() < 0.5 ? 1 : -1, -1 + v * 2, (w * 2 - (1 - v))];
    }
    case 'pyramid': {
      const r = 1 - v;
      const edge = u * 4;
      const face = Math.floor(edge);
      const p = (edge - face) * 2 - 1;
      const corners: Vec[] = [[p * r, 0, r], [r, 0, -p * r], [-p * r, 0, -r], [-r, 0, p * r]];
      const point = corners[face] ?? corners[0]!;
      return [point[0], v * 2 - 1, point[2]];
    }
    case 'disc': {
      const r = Math.sqrt(v);
      return [Math.cos(a) * r, 0, Math.sin(a) * r];
    }
    case 'capsule': {
      const y = v * 2 - 1;
      const cap = Math.abs(y) > 0.5 ? Math.sqrt(Math.max(0, 1 - ((Math.abs(y) - 0.5) / 0.5) ** 2)) : 1;

      return [Math.cos(a) * cap * 0.5, y, Math.sin(a) * cap * 0.5];
    }
  }
};

const rotate = turned;

const unturned = (point: Vec, [rx, ry, rz]: Vec): Vec => {
  const [x, y, z] = point;
  const [cz, sz] = [Math.cos(-rz), Math.sin(-rz)];
  const x1 = x * cz - y * sz;
  const y1 = x * sz + y * cz;
  const [cy, sy] = [Math.cos(-ry), Math.sin(-ry)];
  const x2 = x1 * cy + z * sy;
  const z2 = -x1 * sy + z * cy;
  const [cx, sx] = [Math.cos(-rx), Math.sin(-rx)];

  return [x2, y1 * cx - z2 * sx, y1 * sx + z2 * cx];
};

const inside = (point: Vec, part: Part) => {
  const [x, y, z] = unturned([point[0] - part.at[0], point[1] - part.at[1], point[2] - part.at[2]], part.turn);
  const [ax, ay, az] = [x / Math.max(0.001, Math.abs(part.size[0])), y / Math.max(0.001, Math.abs(part.size[1])), z / Math.max(0.001, Math.abs(part.size[2]))];

  if (part.shape === 'sphere') return ax * ax + ay * ay + az * az < 0.98;

  if (part.shape === 'cylinder') return ax * ax + az * az < 0.98 && Math.abs(ay) < 0.99;

  return Math.abs(ax) < 0.99 && Math.abs(ay) < 0.99 && Math.abs(az) < 0.99;
};

const areaOf = (part: Part) => {
  const [x, y, z] = part.size.map(Math.abs) as unknown as Vec;

  return Math.max(0.0004, x * y + y * z + x * z);
};

export const modelDots = (value: string): Dot[] => {
  const every = partsOf(value);
  const parts = every.filter((part) => !part.cut);
  const cuts = every.filter((part) => part.cut);

  if (parts.length === 0) return [];

  const areas = parts.map(areaOf);
  const total = areas.reduce((sum, area) => sum + area, 0);
  const extent = Math.max(0.3, ...parts.map((part) => Math.max(...part.at.map(Math.abs)) + Math.max(...part.size.map(Math.abs))));
  const fit = 0.36 / extent;
  const budget = Math.round(Math.min(MAX_DOTS, Math.max(MIN_DOTS, total * fit * fit * DOTS_PER_AREA)));

  return parts.flatMap((part, index) => {
    const share = Math.max(60, Math.round((areas[index]! / total) * budget));

    return Array.from({ length: share }, () => {
      const local = unitSurface(part.shape, Math.random(), Math.random());
      const scaled: Vec = [local[0] * part.size[0], local[1] * part.size[1], local[2] * part.size[2]];
      const [x, y, z] = rotate(scaled, part.turn);
      const point: Vec = [x + part.at[0], y + part.at[1], z + part.at[2]];

      return cuts.some((cut) => inside(point, cut)) ? null : ([point[0] * fit, point[1] * fit, point[2] * fit, part.glow * EDGE_TONE] as const);
    }).filter((dot) => dot !== null);
  });
};
