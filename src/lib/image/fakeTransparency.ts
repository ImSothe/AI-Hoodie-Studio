'use client';

/**
 * Convierte un "damero de transparencia" pintado en los píxeles de la imagen
 * (típico de capturas y de imágenes bajadas de buscadores) en alfa real.
 *
 * El damero es un patrón gris/blanco de casillas cuadradas. Se detecta en la
 * esquina superior izquierda (tamaño de casilla, fase y los dos tonos), se
 * comprueba que se repite por los bordes y sólo entonces se borra: en cada
 * casilla donde predomina el fondo, los píxeles que coinciden con el tono que
 * le toca pasan a transparentes. Las casillas con mucho dibujo se dejan tal cual.
 *
 * Límite honesto: un trazo gris o blanco del mismo tono que el damero, sobre
 * una casilla de ese tono, se borra con el fondo. Con un PNG de alfa real no
 * hay nada que convertir y la imagen no se toca.
 */

const NEUTRAL_TOLERANCE = 14;
const LUMA_TOLERANCE = 13;
/** Una casilla se limpia si al menos esta fracción de sus píxeles es fondo. */
const MIN_CELL_BACKGROUND = 0.55;
/** Fracción mínima de la tira superior/izquierda que debe seguir el patrón. */
const MIN_BORDER_MATCH = 0.82;

interface Checker {
  size: number;
  /** Longitud (1..size) de la primera casilla en cada eje: fija la fase. */
  firstX: number;
  firstY: number;
  /** Luminancia de la clase 0 (la de la casilla de la esquina) y de la clase 1. */
  lumaA: number;
  lumaB: number;
}

const luma = (r: number, g: number, b: number) => (r * 299 + g * 587 + b * 114) / 1000;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = src;
  });
}

/** Busca el damero en la esquina superior izquierda. */
function detectChecker(px: Uint8ClampedArray, w: number, h: number): Checker | null {
  const patch = Math.min(96, w, h);
  if (patch < 24) return null;

  // Los dos tonos más frecuentes entre los píxeles neutros de la esquina. El
  // dibujo puede asomar en la esquina: sus píxeles no cuentan, sólo el damero.
  const BIN = 4;
  const bins = new Array<number>(Math.ceil(256 / BIN)).fill(0);
  let neutral = 0;
  for (let y = 0; y < patch; y++) {
    for (let x = 0; x < patch; x++) {
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (px[i + 3] < 250 || Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL_TOLERANCE) continue;
      neutral++;
      bins[Math.min(bins.length - 1, Math.floor(luma(r, g, b) / BIN))]++;
    }
  }
  if (neutral < patch * patch * 0.5) return null;
  const topBin = (skip: number) => {
    let best = -1;
    bins.forEach((n, k) => {
      if (skip >= 0 && Math.abs(k - skip) * BIN < 10) return;
      if (best < 0 || n > bins[best]) best = k;
    });
    return best;
  };
  const binA = topBin(-1);
  const binB = topBin(binA);
  if (binA < 0 || binB < 0 || bins[binA] < neutral * 0.2 || bins[binB] < neutral * 0.2) return null;
  // Centro de cada tono: media de los píxeles cercanos a su casilla.
  const centre = (bin: number) => {
    const target = (bin + 0.5) * BIN;
    let sum = 0;
    let n = 0;
    for (let y = 0; y < patch; y++) {
      for (let x = 0; x < patch; x++) {
        const i = (y * w + x) * 4;
        if (px[i + 3] < 250 || Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > NEUTRAL_TOLERANCE) continue;
        const l = luma(px[i], px[i + 1], px[i + 2]);
        if (Math.abs(l - target) <= LUMA_TOLERANCE) {
          sum += l;
          n++;
        }
      }
    }
    return n ? sum / n : target;
  };
  const tones = [centre(binA), centre(binB)].sort((p, q) => p - q);
  const lo = tones[0];
  const hi = tones[1];
  if (hi - lo < 10 || hi - lo > 110) return null;
  const mid = (lo + hi) / 2;

  const classAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return luma(px[i], px[i + 1], px[i + 2]) < mid ? 1 : 0;
  };

  // Longitudes de las rachas del mismo tono a lo largo de una fila y de una columna.
  const runs = (get: (t: number) => number) => {
    const out: number[] = [];
    let start = 0;
    for (let t = 1; t <= patch; t++) {
      if (t === patch || get(t) !== get(start)) {
        out.push(t - start);
        start = t;
      }
    }
    return out;
  };
  // La fila/columna 1 evita el borde exterior por si lleva un marco.
  const rowRuns = runs((x) => classAt(x, 1));
  const colRuns = runs((y) => classAt(1, y));
  if (rowRuns.length < 3 || colRuns.length < 3) return null;
  const inner = [...rowRuns.slice(1, -1), ...colRuns.slice(1, -1)].sort((a, b) => a - b);
  const size = inner[Math.floor(inner.length / 2)];
  if (size < 3 || size > 48) return null;
  if (inner.some((n) => Math.abs(n - size) > 1)) return null;

  const firstX = Math.min(size, rowRuns[0]);
  const firstY = Math.min(size, colRuns[0]);
  // Clase de la casilla (0,0) en la esquina real del lienzo.
  const corner = classAt(0, 0);
  return {
    size,
    firstX,
    firstY,
    lumaA: corner === 1 ? lo : hi,
    lumaB: corner === 1 ? hi : lo,
  };
}

function cellClass(c: Checker, x: number, y: number) {
  const cx = Math.floor((x + c.size - c.firstX) / c.size);
  const cy = Math.floor((y + c.size - c.firstY) / c.size);
  return (cx + cy) & 1;
}

function isBackground(c: Checker, px: Uint8ClampedArray, i: number, expectedClass: number) {
  const r = px[i];
  const g = px[i + 1];
  const b = px[i + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL_TOLERANCE) return false;
  const target = expectedClass === 0 ? c.lumaA : c.lumaB;
  return Math.abs(luma(r, g, b) - target) <= LUMA_TOLERANCE;
}

/** ¿Las tiras superior e izquierda siguen el patrón? Evita falsos positivos. */
function borderFollowsPattern(c: Checker, px: Uint8ClampedArray, w: number, h: number) {
  const strip = Math.min(c.size * 2, h, w);
  let total = 0;
  let ok = 0;
  for (let y = 0; y < strip; y++) {
    for (let x = 0; x < w; x++) {
      total++;
      if (isBackground(c, px, (y * w + x) * 4, cellClass(c, x, y))) ok++;
    }
  }
  const top = ok / total;
  total = 0;
  ok = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < strip; x++) {
      total++;
      if (isBackground(c, px, (y * w + x) * 4, cellClass(c, x, y))) ok++;
    }
  }
  return top >= MIN_BORDER_MATCH && ok / total >= MIN_BORDER_MATCH;
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
  const px = data.data;

  const checker = detectChecker(px, w, h);
  if (!checker || !borderFollowsPattern(checker, px, w, h)) return null;

  const { size } = checker;
  let cleared = 0;
  // Cada casilla (con sus límites reales: la primera y la última pueden ser parciales).
  const firstCellW = checker.firstX;
  const firstCellH = checker.firstY;
  for (let y0 = 0, cy = 0; y0 < h; cy++) {
    const ch = Math.min(cy === 0 ? firstCellH : size, h - y0);
    for (let x0 = 0, cx = 0; x0 < w; cx++) {
      const cw = Math.min(cx === 0 ? firstCellW : size, w - x0);
      const expected = (cx + cy) & 1;
      let bg = 0;
      for (let y = y0; y < y0 + ch; y++) {
        for (let x = x0; x < x0 + cw; x++) if (isBackground(checker, px, (y * w + x) * 4, expected)) bg++;
      }
      if (bg / (cw * ch) >= MIN_CELL_BACKGROUND) {
        for (let y = y0; y < y0 + ch; y++) {
          for (let x = x0; x < x0 + cw; x++) {
            const i = (y * w + x) * 4;
            if (isBackground(checker, px, i, expected)) {
              px[i + 3] = 0;
              cleared++;
            }
          }
        }
      }
      x0 += cw;
    }
    y0 += ch;
  }
  if (cleared < w * h * 0.02) return null; // casi nada que limpiar: no merece la pena tocarla

  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}
