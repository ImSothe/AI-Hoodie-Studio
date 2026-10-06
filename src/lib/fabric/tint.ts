'use client';

import { FabricImage, type Canvas, type FabricObject } from 'fabric';
import { mix } from '../color';
import {
  TONAL_SHIFTS,
  TONAL_TECHNIQUE,
  type GradientSpec,
  type Technique,
  type ThreadFinish,
  type TonalShift,
} from '../hoodie/spec';

/**
 * Color de tinta y acabado de los gráficos colocados en el lienzo.
 *
 * - SVG (grupo de paths): se sustituye el fill —y el stroke, para que el arte
 *   de línea también cambie— de cada path por el HEX elegido (una tinta).
 * - PNG: la imagen se recolorea píxel a píxel conservando la transparencia, el
 *   antialias y el relieve tonal (trazo, sombras, detalles interiores): cada
 *   píxel parte del color elegido y se oscurece o aclara según lo que se
 *   apartaba del tono principal de la imagen original.
 */

export type Styled = FabricObject & {
  hoodieRole?: string;
  inkColor?: string;
  originalInk?: string;
  tecnica?: Technique;
  /** Ton-sur-ton: matiz respecto al tejido y acabado del hilo. */
  tonoShift?: TonalShift;
  hiloAcabado?: ThreadFinish;
  /** Degradado aplicado a la pieza (la imagen se ha pintado con él). */
  gradient?: GradientSpec;
  /** Tinta que tenía antes de pasar a ton-sur-ton (para recuperarla al salir). */
  inkBeforeTonal?: string | null;
};

/** HEX del hilo ton-sur-ton: el del tejido, o un matiz casi imperceptible. */
export function tonalInk(garmentHex: string, shift: TonalShift = 'exact') {
  const amount = TONAL_SHIFTS.find((s) => s.id === shift)?.amount ?? 0;
  if (!amount) return garmentHex.toUpperCase();
  return mix(garmentHex, amount > 0 ? '#FFFFFF' : '#000000', Math.abs(amount));
}

type Source = CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };

const DETAIL_STRENGTH = 0.8;
/** Relieve tonal de cada imagen original: -1 (mucho más oscuro que el tono principal) … +1 (mucho más claro). */
const detailCache = new WeakMap<object, { w: number; h: number; shade: Float32Array }>();

function detailOf(base: Source) {
  const hit = detailCache.get(base as object);
  if (hit) return hit;
  const w = base.naturalWidth ?? base.width ?? 1;
  const h = base.naturalHeight ?? base.height ?? 1;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(base, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  let opaque = 0;
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    lum[p] = l;
    if (px[i + 3] > 128) {
      hist[Math.round(l * 255)]++;
      opaque++;
    }
  }
  // Tono principal = mediana de los píxeles con tinta.
  let acc = 0;
  let median = 0.5;
  for (let b = 0; b < 256 && opaque; b++) {
    acc += hist[b];
    if (acc >= opaque / 2) {
      median = b / 255;
      break;
    }
  }
  const shade = new Float32Array(w * h);
  for (let p = 0; p < shade.length; p++) {
    const l = lum[p];
    shade[p] = l < median ? -(median - l) / Math.max(median, 0.001) : (l - median) / Math.max(1 - median, 0.001);
  }
  const result = { w, h, shade };
  detailCache.set(base as object, result);
  return result;
}

/** Devuelve `painted` con el relieve tonal de `base` aplicado encima (la transparencia de `painted` no cambia). */
export function restoreDetail(painted: HTMLCanvasElement, base: Source) {
  const { w, h, shade } = detailOf(base);
  if (painted.width !== w || painted.height !== h) return painted;
  const ctx = painted.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const s = shade[p] * DETAIL_STRENGTH;
    if (!s || !d[i + 3]) continue;
    const target = s < 0 ? 0 : 255;
    const k = Math.abs(s);
    d[i] += (target - d[i]) * k;
    d[i + 1] += (target - d[i + 1]) * k;
    d[i + 2] += (target - d[i + 2]) * k;
  }
  ctx.putImageData(img, 0, 0);
  return painted;
}

/** Recolorea una imagen con un color liso conservando transparencia y relieve tonal. */
export function colorizeImage(base: Source, hex: string) {
  const w = base.naturalWidth ?? base.width ?? 1;
  const h = base.naturalHeight ?? base.height ?? 1;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(base, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  return restoreDetail(c, base);
}

/** Imagen original de las piezas con degradado, para volver a los colores de origen. */
export const gradientBase = new WeakMap<FabricObject, CanvasImageSource>();

type Paint = FabricObject['fill'];

/** Colores originales de cada path, para poder volver atrás. */
const originals = new WeakMap<FabricObject, { fill: Paint; stroke: Paint }>();

const hasPaint = (paint: Paint) => !!paint && paint !== 'none' && paint !== 'transparent';

function leaves(obj: FabricObject): FabricObject[] {
  const children = (obj as FabricObject & { getObjects?: () => FabricObject[] }).getObjects?.();
  return children ? children.flatMap(leaves) : [obj];
}

function markDirty(obj: FabricObject) {
  obj.set('dirty', true);
  let parent = obj.group;
  while (parent) {
    parent.set('dirty', true);
    parent = parent.group;
  }
}

export function tintObject(obj: Styled, hex: string) {
  (obj as Styled).gradient = undefined;
  if (obj instanceof FabricImage) {
    if (!gradientBase.has(obj)) gradientBase.set(obj, (obj as unknown as { _originalElement?: CanvasImageSource })._originalElement ?? (obj.getElement() as CanvasImageSource));
    obj.filters = [];
    obj.setElement(colorizeImage(gradientBase.get(obj) as Source, hex) as unknown as HTMLImageElement);
  } else {
    for (const leaf of leaves(obj)) {
      if (!originals.has(leaf)) originals.set(leaf, { fill: leaf.fill, stroke: leaf.stroke });
      const orig = originals.get(leaf)!;
      if (hasPaint(orig.fill)) leaf.set('fill', hex);
      if (hasPaint(orig.stroke)) leaf.set('stroke', hex);
      markDirty(leaf);
    }
  }
  obj.inkColor = hex;
  markDirty(obj);
}

/** Quita el tinte: filtros fuera (PNG) o fills/strokes originales (SVG). */
export function restoreObject(obj: Styled, fallbackInk?: string) {
  if (obj instanceof FabricImage) {
    const base = gradientBase.get(obj);
    if (base) {
      obj.setElement(base as HTMLImageElement);
      gradientBase.delete(obj);
      (obj as Styled).gradient = undefined;
    }
    obj.filters = [];
    obj.applyFilters();
  } else {
    for (const leaf of leaves(obj)) {
      const orig = originals.get(leaf);
      if (!orig) continue;
      leaf.set({ fill: orig.fill, stroke: orig.stroke });
      markDirty(leaf);
    }
  }
  obj.inkColor = fallbackInk;
  markDirty(obj);
}

/**
 * Guarda la técnica como custom data del objeto de Fabric (sobrevive a
 * clone/toObject). Ton-sur-ton bloquea el color del hilo al del tejido; al
 * salir de ella se recupera la tinta anterior.
 */
export function setTechnique(obj: Styled, tecnica: Technique, garmentHex: string) {
  const wasTonal = obj.tecnica === TONAL_TECHNIQUE;
  const toTonal = tecnica === TONAL_TECHNIQUE;
  obj.set({ tecnica } as Partial<Styled>);
  if (toTonal && !wasTonal) {
    obj.inkBeforeTonal = obj.inkColor ?? null;
    obj.tonoShift ??= 'exact';
    obj.hiloAcabado ??= 'satin';
    tintObject(obj, tonalInk(garmentHex, obj.tonoShift));
  } else if (!toTonal && wasTonal) {
    const prev = obj.inkBeforeTonal;
    if (prev && prev !== obj.originalInk) tintObject(obj, prev);
    else restoreObject(obj, obj.originalInk);
    obj.inkBeforeTonal = undefined;
  }
}

export function setTonal(obj: Styled, patch: { tonoShift?: TonalShift; hiloAcabado?: ThreadFinish }, garmentHex: string) {
  if (obj.tecnica !== TONAL_TECHNIQUE) return;
  Object.assign(obj, patch);
  tintObject(obj, tonalInk(garmentHex, obj.tonoShift));
}

export const isTonal = (obj: FabricObject) => (obj as Styled).tecnica === TONAL_TECHNIQUE;

export const activeDesignObjects = (canvas: Canvas) =>
  canvas.getActiveObjects().filter((o) => (o as Styled).hoodieRole === 'design') as Styled[];
