import { JOINED_H, JOINED_W, PATTERN_H, PATTERN_W } from './layout';
import type { Affine, PatternAnalysis } from './analysis';

const apply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Dónde cae cada píxel del plano de piezas dentro de los dos tendidos unidos: para cada píxel cubierto,
 * sus coordenadas en el tendido del delantero y en el de la espalda (en px del lienzo unido, -1 si no está).
 * Se calcula una sola vez por análisis y sirve para cortar cada técnica.
 */
const maps = new WeakMap<PatternAnalysis, Float32Array>();

function bakeMap(analysis: PatternAnalysis): Float32Array {
  const cached = maps.get(analysis);
  if (cached) return cached;
  const map = new Float32Array(PATTERN_W * PATTERN_H * 4).fill(-1);
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
      const f = front ? o.map(([x, y]) => apply(front, x, y)) : null;
      const b = back ? o.map(([x, y]) => apply(back, x, y)) : null;
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
          const k = (y * PATTERN_W + x) * 4;
          if (f) {
            map[k] = w0 * f[0][0] + w1 * f[1][0] + w2 * f[2][0];
            map[k + 1] = w0 * f[0][1] + w1 * f[1][1] + w2 * f[2][1];
          }
          if (b) {
            map[k + 2] = w0 * b[0][0] + w1 * b[1][0] + w2 * b[2][0];
            map[k + 3] = w0 * b[0][1] + w1 * b[1][1] + w2 * b[2][1];
          }
        }
      }
    }
  }
  maps.set(analysis, map);
  return map;
}

/**
 * Corta el diseño de UNA técnica del patrón UNIDO en las piezas sueltas de taller: cada pieza (espalda,
 * delantero, mangas, capucha…) recibe su trozo del dibujo, ya encajado con sus vecinas. Es lo que se manda a imprimir.
 * Los dos tendidos (delantero y espalda) se superponen igual que en la prenda.
 *
 * `joined` es el lienzo unido, a cualquier resolución (se escala solo): conviene dibujarlo a 2× para no perder nitidez.
 */
export function bakeToPieces(analysis: PatternAnalysis, joined: HTMLCanvasElement): HTMLCanvasElement {
  const map = bakeMap(analysis);
  const out = document.createElement('canvas');
  out.width = PATTERN_W;
  out.height = PATTERN_H;
  const ctx = out.getContext('2d')!;
  const dst = ctx.createImageData(PATTERN_W, PATTERN_H);
  const sw = joined.width;
  const sh = joined.height;
  const src = joined.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sw, sh).data;
  const kx = sw / JOINED_W;
  const ky = sh / JOINED_H;

  const out4 = [0, 0, 0, 0];
  const sample = (u: number, v: number) => {
    if (u < 0) {
      out4[3] = 0;
      return;
    }
    const xi = Math.min(sw - 1, Math.max(0, Math.round(u * kx)));
    const yi = Math.min(sh - 1, Math.max(0, Math.round(v * ky)));
    const i = (yi * sw + xi) * 4;
    out4[0] = src[i];
    out4[1] = src[i + 1];
    out4[2] = src[i + 2];
    out4[3] = src[i + 3] / 255;
  };

  const total = PATTERN_W * PATTERN_H;
  for (let p = 0; p < total; p++) {
    const k = p * 4;
    if (map[k] < 0 && map[k + 2] < 0) continue;
    sample(map[k], map[k + 1]);
    const [ar, ag, ab, aa] = out4;
    sample(map[k + 2], map[k + 3]);
    const [br, bg, bb, ba] = out4;
    const alpha = aa + ba * (1 - aa);
    if (alpha <= 0) continue;
    dst.data[k] = (ar * aa + br * ba * (1 - aa)) / alpha;
    dst.data[k + 1] = (ag * aa + bg * ba * (1 - aa)) / alpha;
    dst.data[k + 2] = (ab * aa + bb * ba * (1 - aa)) / alpha;
    dst.data[k + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(dst, 0, 0);
  return out;
}
