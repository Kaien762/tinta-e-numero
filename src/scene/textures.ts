import { CanvasTexture, SRGBColorSpace } from 'three';
import type { ColorInfo } from '../game/palette';
import { HALO } from '../game/palette';
import type { Value } from '../game/rules';
import { traceSymbol } from './symbols';

const FONT = 'Fredoka, "Trebuchet MS", system-ui, sans-serif';

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Face de cima de uma casa: fundo no tom claro, algarismo grande e o símbolo da coluna. */
export function tileTexture(info: ColorInfo, value: Value): CanvasTexture {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  ctx.beginPath();
  ctx.roundRect(0, 0, S, S, 22);
  ctx.fillStyle = info.tint;
  ctx.fill();

  const glaze = ctx.createRadialGradient(S * 0.28, S * 0.22, 8, S * 0.5, S * 0.5, S * 0.8);
  glaze.addColorStop(0, 'rgba(255,255,255,0.30)');
  glaze.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glaze;
  ctx.fill();

  ctx.fillStyle = info.deep;
  ctx.font = `700 172px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const label = String(value);
  const m = ctx.measureText(label);
  const h = m.actualBoundingBoxAscent - m.actualBoundingBoxDescent;
  ctx.fillText(label, S / 2 + 10, S / 2 + h / 2 + 8);

  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  traceSymbol(ctx, info.symbol, 46, 46, 50);
  ctx.fill();
  ctx.globalAlpha = 1;
  return toTexture(c);
}

/** Símbolo claro em relevo para o cabeçalho colorido da coluna. */
export function headerTexture(info: ColorInfo): CanvasTexture {
  const W = 256, H = 160;
  const { c, ctx } = makeCanvas(W, H);
  ctx.shadowColor = 'rgba(40, 20, 10, 0.22)';
  ctx.shadowOffsetY = 5;
  ctx.shadowBlur = 6;
  ctx.fillStyle = HALO;
  ctx.beginPath();
  traceSymbol(ctx, info.symbol, W / 2, H / 2, 112);
  ctx.fill();
  return toTexture(c);
}

/** Marca da vaga de cada peça na bandeja. */
export function slotTexture(info: ColorInfo): CanvasTexture {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  ctx.strokeStyle = info.hex;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 9;
  ctx.setLineDash([22, 16]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = info.hex;
  ctx.beginPath();
  traceSymbol(ctx, info.symbol, S / 2, S / 2, 92);
  ctx.fill();
  return toTexture(c);
}

/** Sombra de contato macia que vai embaixo das peças. */
export function blobTexture(): CanvasTexture {
  const S = 128;
  const { c, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(45, 28, 12, 0.65)');
  g.addColorStop(0.45, 'rgba(45, 28, 12, 0.32)');
  g.addColorStop(1, 'rgba(45, 28, 12, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c);
}

// ---------------------------------------------------------------- madeira

function periodicNoise(seed: number) {
  const N = 256;
  const table = new Float32Array(N * N);
  let a = seed >>> 0;
  for (let i = 0; i < table.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    table[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return (x: number, y: number, px: number, py: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px;
    const y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
    const A = table[y0 * N + x0], B = table[y0 * N + x1], Cc = table[y1 * N + x0], D = table[y1 * N + x1];
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return A + (B - A) * u + (Cc - A) * v + (A - B - Cc + D) * u * v;
  };
}

/**
 * Tampo de madeira clara, procedural e repetível: 4 tábuas no sentido da profundidade,
 * veios com ruído e uma emenda por tábua.
 */
export function woodTexture(): CanvasTexture {
  const W = 512, H = 1024, PLANK = 128;
  const { c, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const noise = periodicNoise(1337);
  const seeds = [0.13, 0.71, 0.42, 0.93];
  const tones = [1.0, 0.965, 1.02, 0.985];
  const joints = [190, 640, 410, 870];
  const light = [234, 211, 175];
  const dark = [196, 160, 118];

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const plank = x >> 7;
      const lx = x & (PLANK - 1);
      const u = x / W;
      const n1 = noise(u * 8, v * 3, 8, 3) * 0.65 + noise(u * 16, v * 6, 16, 6) * 0.35;
      const g = (lx / PLANK) * 5.5 + n1 * 2.6 + seeds[plank] * 10;
      const ring = Math.pow(Math.abs(Math.sin(g * Math.PI)), 9);
      const fiber = noise(u * 256, v * 8, 256, 8);
      let t = 0.16 + ring * 0.4 + fiber * 0.2 + n1 * 0.12;
      let k = tones[plank];
      if (lx < 2) k *= lx === 0 ? 0.7 : 0.84;
      else if (lx === PLANK - 1) k *= 1.04;
      if (Math.abs(y - joints[plank]) < 1.5) k *= 0.78;
      t = Math.min(1, Math.max(0, t));
      const i = (y * W + x) * 4;
      d[i] = (light[0] + (dark[0] - light[0]) * t) * k;
      d[i + 1] = (light[1] + (dark[1] - light[1]) * t) * k;
      d[i + 2] = (light[2] + (dark[2] - light[2]) * t) * k;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}
