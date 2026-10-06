import { JOINED_H, JOINED_W, PATTERN_H, PATTERN_W } from './layout';
import type { Affine, PatternAnalysis } from './analysis';

const apply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Corta el diseño del patrón UNIDO en las piezas sueltas de taller: cada pieza (espalda, delantero,
 * mangas, capucha…) recibe su trozo del dibujo, ya encajado con sus vecinas. Es lo que se manda a imprimir.
 *
 * Para cada triángulo de cada pieza se recorren sus píxeles de destino (plano de piezas) y se buscan en los dos
 * tendidos unidos (delantero y espalda), que se superponen igual que en la prenda.
 *
 * `joined` es el lienzo unido, a cualquier resolución (se escala solo): conviene dibujarlo a 2× para no perder nitidez.
 */
export function bakeToPieces(analysis: PatternAnalysis, joined: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = PATTERN_W;
  out.height = PATTERN_H;
  const ctx = out.getContext('2d')!;
  const dst = ctx.createImageData(PATTERN_W, PATTERN_H);
  const sw = joined.width;
  const sh = joined.height;
  const src = joined.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sw, sh).data;
  const kx = (sw / JOINED_W) * 1;
  const ky = (sh / JOINED_H) * 1;

  const sample = (m: Affine | undefined, x: number, y: number): [number, number, number, number] => {
    if (!m) return [0, 0, 0, 0];
    const [u, v] = apply(m, x, y);
    const xi = Math.min(sw - 1, Math.max(0, Math.round(u * kx)));
    const yi = Math.min(sh - 1, Math.max(0, Math.round(v * ky)));
    const i = (yi * sw + xi) * 4;
    return [src[i], src[i + 1], src[i + 2], src[i + 3] / 255];
  };

  for (const island of analysis.islands) {
    if (!island.outer) continue;
    const place = analysis.pieces.get(island);
    const front = analysis.joinedFront.get(island);
    const back = analysis.joinedBack.get(island);
    if (!place || (!front && !back)) continue;
    const slot = new Map<number, number>();
    island.verts.forEach((v, i) => slot.set(v, i));
    const t = island.tris;
    for (let i = 0; i + 2 < t.length; i += 3) {
      const s = [slot.get(t[i])!, slot.get(t[i + 1])!, slot.get(t[i + 2])!];
      const o = s.map((k) => [island.px[k * 2], island.px[k * 2 + 1]] as [number, number]); // posición original de cada vértice
      const d = o.map(([x, y]) => apply(place, x, y)); // destino en el plano de piezas
      const minX = Math.max(0, Math.floor(Math.min(d[0][0], d[1][0], d[2][0])) - 1);
      const maxX = Math.min(PATTERN_W - 1, Math.ceil(Math.max(d[0][0], d[1][0], d[2][0])) + 1);
      const minY = Math.max(0, Math.floor(Math.min(d[0][1], d[1][1], d[2][1])) - 1);
      const maxY = Math.min(PATTERN_H - 1, Math.ceil(Math.max(d[0][1], d[1][1], d[2][1])) + 1);
      const det = (d[1][1] - d[2][1]) * (d[0][0] - d[2][0]) + (d[2][0] - d[1][0]) * (d[0][1] - d[2][1]);
      if (Math.abs(det) < 1e-6) continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const w0 = ((d[1][1] - d[2][1]) * (x + 0.5 - d[2][0]) + (d[2][0] - d[1][0]) * (y + 0.5 - d[2][1])) / det;
          const w1 = ((d[2][1] - d[0][1]) * (x + 0.5 - d[2][0]) + (d[0][0] - d[2][0]) * (y + 0.5 - d[2][1])) / det;
          const w2 = 1 - w0 - w1;
          const eps = -0.02; // un pelo de sangrado para no dejar costuras entre triángulos
          if (w0 < eps || w1 < eps || w2 < eps) continue;
          const ox = w0 * o[0][0] + w1 * o[1][0] + w2 * o[2][0];
          const oy = w0 * o[0][1] + w1 * o[1][1] + w2 * o[2][1];
          const a = sample(front, ox, oy);
          const b = sample(back, ox, oy);
          const alpha = a[3] + b[3] * (1 - a[3]);
          if (alpha <= 0) continue;
          const k = (y * PATTERN_W + x) * 4;
          if (dst.data[k + 3] / 255 >= alpha) continue;
          dst.data[k] = (a[0] * a[3] + b[0] * b[3] * (1 - a[3])) / alpha;
          dst.data[k + 1] = (a[1] * a[3] + b[1] * b[3] * (1 - a[3])) / alpha;
          dst.data[k + 2] = (a[2] * a[3] + b[2] * b[3] * (1 - a[3])) / alpha;
          dst.data[k + 3] = Math.round(alpha * 255);
        }
      }
    }
  }
  ctx.putImageData(dst, 0, 0);
  return out;
}
