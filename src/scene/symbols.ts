import { Shape } from 'three';
import type { SymbolId } from '../game/palette';

/**
 * Símbolos das cores, desenhados uma vez só (coordenadas com y para cima)
 * e usados em três lugares: cabeça das peças (3D), casas (canvas) e interface (SVG).
 */
interface Cmd {
  op: 'M' | 'L' | 'C' | 'Z';
  p: number[];
}

const M = (x: number, y: number): Cmd => ({ op: 'M', p: [x, y] });
const L = (x: number, y: number): Cmd => ({ op: 'L', p: [x, y] });
const C = (a: number, b: number, c: number, d: number, x: number, y: number): Cmd => ({ op: 'C', p: [a, b, c, d, x, y] });
const Z: Cmd = { op: 'Z', p: [] };

function star(): Cmd[] {
  const out: Cmd[] = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? 1 : 0.5;
    out.push((k === 0 ? M : L)(Math.cos(a) * r, Math.sin(a) * r));
  }
  out.push(Z);
  return out;
}

const RAW: Record<SymbolId, { cmds: Cmd[]; rotate: number }> = {
  coracao: {
    rotate: 0,
    cmds: [
      M(0, -0.95),
      C(-0.25, -0.7, -1.0, -0.25, -1.0, 0.35),
      C(-1.0, 0.68, -0.76, 0.9, -0.5, 0.9),
      C(-0.26, 0.9, -0.06, 0.74, 0, 0.56),
      C(0.06, 0.74, 0.26, 0.9, 0.5, 0.9),
      C(0.76, 0.9, 1.0, 0.68, 1.0, 0.35),
      C(1.0, -0.25, 0.25, -0.7, 0, -0.95),
      Z,
    ],
  },
  estrela: { rotate: 0, cmds: star() },
  folha: {
    rotate: -0.62,
    cmds: [M(0, -1), C(0.8, -0.52, 0.68, 0.5, 0, 1), C(-0.62, 0.5, -0.76, -0.5, 0, -1), Z],
  },
  gota: {
    rotate: 0,
    cmds: [
      M(0, 1),
      C(0.12, 0.72, 0.72, 0.14, 0.72, -0.3),
      C(0.72, -0.698, 0.398, -1.02, 0, -1.02),
      C(-0.398, -1.02, -0.72, -0.698, -0.72, -0.3),
      C(-0.72, 0.14, -0.12, 0.72, 0, 1),
      Z,
    ],
  },
};

function mapPoints(cmds: Cmd[], f: (x: number, y: number) => [number, number]): Cmd[] {
  return cmds.map((c) => {
    const p: number[] = [];
    for (let i = 0; i < c.p.length; i += 2) p.push(...f(c.p[i], c.p[i + 1]));
    return { op: c.op, p };
  });
}

function bounds(cmds: Cmd[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c.op === 'M' || c.op === 'L') {
      [cx, cy] = c.p;
      add(cx, cy);
    } else if (c.op === 'C') {
      const [x1, y1, x2, y2, x, y] = c.p;
      for (let i = 1; i <= 20; i++) {
        const t = i / 20, u = 1 - t;
        add(
          u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        );
      }
      cx = x; cy = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

const cache = new Map<SymbolId, Cmd[]>();

/** Comandos normalizados: o símbolo cabe em [-1, 1] e fica centralizado. */
function commands(id: SymbolId): Cmd[] {
  const hit = cache.get(id);
  if (hit) return hit;
  const { cmds, rotate } = RAW[id];
  const cos = Math.cos(rotate), sin = Math.sin(rotate);
  const rotated = mapPoints(cmds, (x, y) => [x * cos - y * sin, x * sin + y * cos]);
  const b = bounds(rotated);
  const s = 2 / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const mx = (b.minX + b.maxX) / 2, my = (b.minY + b.maxY) / 2;
  const out = mapPoints(rotated, (x, y) => [(x - mx) * s, (y - my) * s]);
  cache.set(id, out);
  return out;
}

/** Contorno para ExtrudeGeometry, com `size` de lado (unidades do mundo). */
export function symbolShape(id: SymbolId, size: number): Shape {
  const k = size / 2;
  const shape = new Shape();
  for (const c of commands(id)) {
    const p = c.p.map((v) => v * k);
    if (c.op === 'M') shape.moveTo(p[0], p[1]);
    else if (c.op === 'L') shape.lineTo(p[0], p[1]);
    else if (c.op === 'C') shape.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
    else shape.closePath();
  }
  return shape;
}

/** Desenha no canvas (y para baixo), centrado em (cx, cy). */
export function traceSymbol(ctx: CanvasPath, id: SymbolId, cx: number, cy: number, size: number): void {
  const k = size / 2;
  const X = (v: number) => cx + v * k;
  const Y = (v: number) => cy - v * k;
  for (const c of commands(id)) {
    const p = c.p;
    if (c.op === 'M') ctx.moveTo(X(p[0]), Y(p[1]));
    else if (c.op === 'L') ctx.lineTo(X(p[0]), Y(p[1]));
    else if (c.op === 'C') ctx.bezierCurveTo(X(p[0]), Y(p[1]), X(p[2]), Y(p[3]), X(p[4]), Y(p[5]));
    else ctx.closePath();
  }
}

/** Atributo `d` de um <path> SVG com viewBox "-1.15 -1.15 2.3 2.3". */
export function symbolPathD(id: SymbolId): string {
  const f = (v: number) => +v.toFixed(3);
  return commands(id)
    .map((c) => {
      if (c.op === 'Z') return 'Z';
      const pts: string[] = [];
      for (let i = 0; i < c.p.length; i += 2) pts.push(`${f(c.p[i])} ${f(-c.p[i + 1])}`);
      return `${c.op}${pts.join(' ')}`;
    })
    .join('');
}
