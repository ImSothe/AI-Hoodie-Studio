'use client';

/**
 * Convierte un "damero de transparencia" pintado en los píxeles de la imagen
 * (típico de capturas y de imágenes bajadas de buscadores) en alfa real.
 *
 * El damero es un patrón de casillas cuadradas de dos tonos casi iguales (a
 * menudo blanco y gris muy claro, y en un JPG con ruido de compresión y casillas
 * de tamaño no entero). Se detecta en la esquina superior izquierda (tonos,
 * tamaño de casilla medido con todos los bordes de la imagen y fase), se
 * comprueba que se repite por los bordes y sólo entonces se borra: en cada
 * casilla donde predomina el fondo, los píxeles que coinciden con el tono que
 * le toca pasan a transparentes; el fondo que toca el dibujo se limpia por
 * contigüidad y el halo claro que queda alrededor de los trazos se difumina a
 * transparente.
 *
 * Límite honesto: un trazo del mismo tono que el damero, pegado al fondo, se
 * borra con él. Con un PNG de alfa real no hay nada que convertir y la imagen
 * no se toca.
 */

const NEUTRAL_TOLERANCE = 16;
/** Diferencia mínima entre los dos tonos del damero (en luminancia 0-255). */
const MIN_TONE_GAP = 6;
/** Una casilla se limpia si al menos esta fracción de sus píxeles es fondo. */
const MIN_CELL_BACKGROUND = 0.55;
/** Fracción mínima de la tira superior/izquierda que debe seguir el patrón. */
const MIN_BORDER_MATCH = 0.8;
/** Los píxeles más oscuros que esto se conservan opacos: ya son tinta, no halo. */
const INK_LUMA = 110;

export interface Checker {
  /** Tamaño de casilla en cada eje (puede no ser entero). */
  sizeX: number;
  sizeY: number;
  /** Posición del borde derecho/inferior de la primera casilla en cada eje: fija la fase. */
  offX: number;
  offY: number;
  /** Luminancia de la clase 0 (la de la casilla de la esquina) y de la clase 1. */
  lumaA: number;
  lumaB: number;
  /** Tolerancia para dar un píxel por «de este tono». */
  tolerance: number;
}

const luma = (r: number, g: number, b: number) => (r * 299 + g * 587 + b * 114) / 1000;

/** Posiciones donde cambia el tono a lo largo de una línea (las rachas minúsculas son ruido y se funden). */
function boundaries(get: (t: number) => number, length: number) {
  const raw: { cls: number; start: number }[] = [];
  for (let t = 0; t < length; t++) {
    const cls = get(t);
    if (!raw.length || raw[raw.length - 1].cls !== cls) raw.push({ cls, start: t });
  }
  const runs = raw.map((r, i) => ({ cls: r.cls, start: r.start, n: (raw[i + 1]?.start ?? length) - r.start }));
  const merged: { cls: number; start: number; n: number }[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.n < 3) last.n += r.n;
    else if (last && last.cls === r.cls) last.n += r.n;
    else merged.push({ ...r });
  }
  return merged.slice(1).map((r) => r.start);
}

/**
 * Ajusta posiciones de borde = off + k·size por mínimos cuadrados, descartando
 * las que no encajan (arte que corta una casilla, ruido).
 */
function fitAxis(positions: number[], size0: number): { size: number; off: number } | null {
  if (positions.length < 3) return null;
  const first = positions[0];
  let size = size0;
  let off = first;
  for (let pass = 0; pass < 3; pass++) {
    const pts: [number, number][] = [];
    for (const p of positions) {
      const k = Math.round((p - off) / size);
      if (Math.abs(p - (off + k * size)) <= Math.max(2.5, size * 0.12)) pts.push([k, p]);
    }
    if (pts.length < 3) return null;
    const n = pts.length;
    const mk = pts.reduce((s, q) => s + q[0], 0) / n;
    const mp = pts.reduce((s, q) => s + q[1], 0) / n;
    let num = 0;
    let den = 0;
    for (const [k, p] of pts) {
      num += (k - mk) * (p - mp);
      den += (k - mk) * (k - mk);
    }
    if (!den) return null;
    size = num / den;
    off = mp - size * mk;
  }
  if (size < 4 || size > 64) return null;
  // La fase: borde derecho de la primera casilla = el primer borde de la rejilla que cae a 2 px o más del origen.
  off = ((off % size) + size) % size;
  if (off < 2) off += size;
  return { size, off };
}

/** Busca el damero en la esquina superior izquierda y mide su rejilla. */
export function detectChecker(px: Uint8ClampedArray, w: number, h: number): Checker | null {
  const patch = Math.min(160, w, h);
  if (patch < 32) return null;

  // Los dos tonos más frecuentes entre los píxeles neutros de la esquina. El
  // dibujo puede asomar: sus píxeles no cuentan, sólo el damero.
  const bins = new Array<number>(256).fill(0);
  let neutral = 0;
  for (let y = 0; y < patch; y++) {
    for (let x = 0; x < patch; x++) {
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (px[i + 3] < 250 || Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL_TOLERANCE) continue;
      neutral++;
      bins[Math.round(luma(r, g, b))]++;
    }
  }
  if (neutral < patch * patch * 0.5) return null;

  // Cima de cada tono: suma de ±2 niveles (el ruido JPG reparte un tono en varios valores).
  const smooth = (k: number) => {
    let sum = 0;
    for (let d = -2; d <= 2; d++) sum += bins[Math.min(255, Math.max(0, k + d))];
    return sum;
  };
  let peakA = 0;
  for (let k = 0; k < 256; k++) if (smooth(k) > smooth(peakA)) peakA = k;
  let peakB = -1;
  for (let k = 0; k < 256; k++) {
    if (Math.abs(k - peakA) < MIN_TONE_GAP) continue;
    if (peakB < 0 || smooth(k) > smooth(peakB)) peakB = k;
  }
  if (peakB < 0) return null;
  if (smooth(peakA) < neutral * 0.2 || smooth(peakB) < neutral * 0.2) return null;
  const lo = Math.min(peakA, peakB);
  const hi = Math.max(peakA, peakB);
  if (hi - lo < MIN_TONE_GAP || hi - lo > 110) return null;
  const mid = (lo + hi) / 2;
  const tolerance = Math.max(4, Math.min(13, (hi - lo) * 0.6));

  const classAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return luma(px[i], px[i + 1], px[i + 2]) < mid ? 1 : 0;
  };

  // Tamaño aproximado con la esquina; después se afina con todos los bordes de la fila y la columna.
  const cornerRow = boundaries((x) => classAt(x, 2), patch);
  const cornerCol = boundaries((y) => classAt(2, y), patch);
  if (cornerRow.length < 3 || cornerCol.length < 3) return null;
  const gaps = [...cornerRow.slice(1).map((v, i) => v - cornerRow[i]), ...cornerCol.slice(1).map((v, i) => v - cornerCol[i])].sort(
    (p, q) => p - q,
  );
  const size0 = gaps[Math.floor(gaps.length / 2)];
  if (size0 < 4 || size0 > 64) return null;

  // Filas/columnas completas: se salta el borde exterior (por si lleva un marco) y se mide en varias líneas.
  const rowFits = [2, Math.min(h - 1, 2 + Math.round(size0)), Math.min(h - 1, 2 + Math.round(size0 * 2))].map((y) =>
    fitAxis(boundaries((x) => classAt(x, y), w), size0),
  );
  const colFits = [2, Math.min(w - 1, 2 + Math.round(size0)), Math.min(w - 1, 2 + Math.round(size0 * 2))].map((x) =>
    fitAxis(boundaries((y) => classAt(x, y), h), size0),
  );
  const fx = rowFits.find((f) => f);
  const fy = colFits.find((f) => f);
  if (!fx || !fy) return null;

  // Clase de la casilla (0,0) en la esquina real del lienzo.
  const corner = classAt(1, 1);
  return {
    sizeX: fx.size,
    sizeY: fy.size,
    offX: fx.off,
    offY: fy.off,
    lumaA: corner === 1 ? lo : hi,
    lumaB: corner === 1 ? hi : lo,
    tolerance,
  };
}

/** Índices de casilla de un píxel. */
const cellX = (c: Checker, x: number) => Math.floor((x + 0.5 - c.offX) / c.sizeX) + 1;
const cellY = (c: Checker, y: number) => Math.floor((y + 0.5 - c.offY) / c.sizeY) + 1;
const cellClass = (c: Checker, x: number, y: number) => (cellX(c, x) + cellY(c, y)) & 1;

function isBackground(c: Checker, px: Uint8ClampedArray, i: number, expectedClass: number) {
  const r = px[i];
  const g = px[i + 1];
  const b = px[i + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL_TOLERANCE) return false;
  const target = expectedClass === 0 ? c.lumaA : c.lumaB;
  return Math.abs(luma(r, g, b) - target) <= c.tolerance;
}

/** ¿Las tiras superior e izquierda siguen el patrón? Evita falsos positivos. */
export function borderFollowsPattern(c: Checker, px: Uint8ClampedArray, w: number, h: number) {
  const stripY = Math.min(Math.round(c.sizeY), h);
  const stripX = Math.min(Math.round(c.sizeX), w);
  let total = 0;
  let ok = 0;
  for (let y = 0; y < stripY; y++) {
    for (let x = 0; x < w; x++) {
      total++;
      if (isBackground(c, px, (y * w + x) * 4, cellClass(c, x, y))) ok++;
    }
  }
  const top = ok / total;
  total = 0;
  ok = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < stripX; x++) {
      total++;
      if (isBackground(c, px, (y * w + x) * 4, cellClass(c, x, y))) ok++;
    }
  }
  return top >= MIN_BORDER_MATCH && ok / total >= MIN_BORDER_MATCH;
}

/**
 * Halo: el borde suavizado de un trazo oscuro sobre fondo claro deja píxeles
 * grises claros que sobre una prenda oscura se verían como un contorno de fondo.
 * Los que tocan fondo ya borrado se hacen transparentes en proporción a lo
 * claros que son (más claros = más fondo y menos tinta).
 */
function feather(checker: Checker, px: Uint8ClampedArray, mask: Uint8Array, w: number, h: number) {
  const base = (checker.lumaA + checker.lumaB) / 2;
  const span = Math.max(1, base - INK_LUMA);
  const edge: number[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    let touches = false;
    for (let dy = -2; dy <= 2 && !touches; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) {
          touches = true;
          break;
        }
      }
    }
    if (touches) edge.push(p);
  }
  for (const p of edge) {
    const i = p * 4;
    const l = luma(px[i], px[i + 1], px[i + 2]);
    if (l >= INK_LUMA) px[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (base - l) / span)));
  }
}

/** ¿Es neutro y de uno de los dos tonos del damero (sin mirar la rejilla)? */
function isCheckerTone(c: Checker, px: Uint8ClampedArray, i: number) {
  const r = px[i];
  const g = px[i + 1];
  const b = px[i + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL_TOLERANCE) return false;
  const l = luma(r, g, b);
  return Math.abs(l - c.lumaA) <= c.tolerance || Math.abs(l - c.lumaB) <= c.tolerance;
}

/** ¿Las tiras superior e izquierda son casi todas de los tonos del damero? */
function bordersAreTones(c: Checker, px: Uint8ClampedArray, w: number, h: number) {
  const stripY = Math.min(Math.round(c.sizeY), h);
  const stripX = Math.min(Math.round(c.sizeX), w);
  let ok = 0;
  let total = 0;
  for (let y = 0; y < stripY; y++) {
    for (let x = 0; x < w; x++) {
      total++;
      if (isCheckerTone(c, px, (y * w + x) * 4)) ok++;
    }
  }
  const top = ok / total;
  ok = 0;
  total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < stripX; x++) {
      total++;
      if (isCheckerTone(c, px, (y * w + x) * 4)) ok++;
    }
  }
  return top >= MIN_BORDER_MATCH && ok / total >= MIN_BORDER_MATCH;
}

/**
 * Damero irregular: se agrupan los píxeles de los dos tonos del damero en zonas
 * conectadas y se borran las grandes. Las zonas pequeñas (huecos entre trazos,
 * reflejos del dibujo) se quedan.
 */
function cleanByTones(checker: Checker, px: Uint8ClampedArray, w: number, h: number): number {
  const minArea = Math.max(120, Math.round(checker.sizeX * checker.sizeY * 0.3));
  const candidate = new Uint8Array(w * h);
  for (let p = 0; p < candidate.length; p++) if (isCheckerTone(checker, px, p * 4)) candidate[p] = 1;

  const mask = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let cleared = 0;
  for (let start = 0; start < candidate.length; start++) {
    if (!candidate[start] || seen[start]) continue;
    const region: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      region.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && candidate[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), stack.push(p - 1);
      if (x < w - 1 && candidate[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), stack.push(p + 1);
      if (y > 0 && candidate[p - w] && !seen[p - w]) (seen[p - w] = 1), stack.push(p - w);
      if (y < h - 1 && candidate[p + w] && !seen[p + w]) (seen[p + w] = 1), stack.push(p + w);
    }
    if (region.length < minArea) continue;
    for (const p of region) {
      mask[p] = 1;
      px[p * 4 + 3] = 0;
    }
    cleared += region.length;
  }
  if (cleared < w * h * 0.02) return 0;
  feather(checker, px, mask, w, h);
  return cleared;
}

/**
 * Núcleo sin DOM: borra el damero de un RGBA en su sitio. Devuelve cuántos
 * píxeles se han vuelto transparentes, o 0 si no hay damero que limpiar.
 */
export function cleanCheckerboard(px: Uint8ClampedArray, w: number, h: number): number {
  const checker = detectChecker(px, w, h);
  if (!checker) return 0;
  // Damero regular: se borra casilla a casilla (conserva un trazo del tono del fondo fuera de su casilla).
  if (borderFollowsPattern(checker, px, w, h)) return cleanByGrid(checker, px, w, h);
  // Damero irregular (casillas desplazadas, JPG): se borran las zonas grandes de esos dos tonos.
  if (bordersAreTones(checker, px, w, h)) return cleanByTones(checker, px, w, h);
  return 0;
}

function cleanByGrid(checker: Checker, px: Uint8ClampedArray, w: number, h: number): number {

  const cellsX = Math.ceil(w / checker.sizeX) + 3;
  const cellsY = Math.ceil(h / checker.sizeY) + 3;
  const matches = new Uint32Array(cellsX * cellsY);
  const totals = new Uint32Array(cellsX * cellsY);
  const index = (x: number, y: number) => (cellY(checker, y) + 1) * cellsX + (cellX(checker, x) + 1);

  // 1) Casillas donde predomina el fondo.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = index(x, y);
      totals[k]++;
      if (isBackground(checker, px, (y * w + x) * 4, cellClass(checker, x, y))) matches[k]++;
    }
  }
  const mask = new Uint8Array(w * h); // 1 = fondo (pasa a transparente)
  const queue: number[] = [];
  let cleared = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = index(x, y);
      if (matches[k] / totals[k] < MIN_CELL_BACKGROUND) continue;
      if (!isBackground(checker, px, (y * w + x) * 4, cellClass(checker, x, y))) continue;
      mask[y * w + x] = 1;
      queue.push(y * w + x);
      cleared++;
    }
  }
  if (cleared < w * h * 0.02) return 0; // casi nada que limpiar: no merece la pena tocarla

  // 2) El fondo que toca el dibujo (casillas cortadas por un trazo) se limpia por contigüidad.
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q];
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (mask[n] || !isBackground(checker, px, n * 4, cellClass(checker, nx, ny))) continue;
        mask[n] = 1;
        queue.push(n);
        cleared++;
      }
    }
  }
  for (let p = 0; p < mask.length; p++) if (mask[p]) px[p * 4 + 3] = 0;

  feather(checker, px, mask, w, h);
  return cleared;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = src;
  });
}

/**
 * Devuelve un PNG con el damero convertido en transparencia, o `null` si la
 * imagen no trae un damero pintado (o ya tiene alfa real).
 */
export async function removeFakeCheckerboard(src: string): Promise<string | null> {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 48 || h < 48 || w * h > 40_000_000) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  if (!cleanCheckerboard(data.data, w, h)) return null;
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}
