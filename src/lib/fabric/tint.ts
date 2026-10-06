'use client';

import { FabricImage, filters, type Canvas, type FabricObject } from 'fabric';
import { mix } from '../color';
import {
  TONAL_SHIFTS,
  TONAL_TECHNIQUE,
  type Technique,
  type ThreadFinish,
  type TonalShift,
} from '../hoodie/spec';

/**
 * Color de tinta y acabado de los gráficos colocados en el lienzo.
 *
 * - SVG (grupo de paths): se sustituye el fill —y el stroke, para que el arte
 *   de línea también cambie— de cada path por el HEX elegido (una tinta).
 * - PNG: filtro BlendColor en modo "tint" con alpha 1 → todos los píxeles
 *   pasan al HEX elegido conservando la transparencia y el antialias.
 */

export type Styled = FabricObject & {
  hoodieRole?: string;
  inkColor?: string;
  originalInk?: string;
  tecnica?: Technique;
  /** Ton-sur-ton: matiz respecto al tejido y acabado del hilo. */
  tonoShift?: TonalShift;
  hiloAcabado?: ThreadFinish;
  /** Tinta que tenía antes de pasar a ton-sur-ton (para recuperarla al salir). */
  inkBeforeTonal?: string | null;
};

/** HEX del hilo ton-sur-ton: el del tejido, o un matiz casi imperceptible. */
export function tonalInk(garmentHex: string, shift: TonalShift = 'exact') {
  const amount = TONAL_SHIFTS.find((s) => s.id === shift)?.amount ?? 0;
  if (!amount) return garmentHex.toUpperCase();
  return mix(garmentHex, amount > 0 ? '#FFFFFF' : '#000000', Math.abs(amount));
}

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
  if (obj instanceof FabricImage) {
    obj.filters = [new filters.BlendColor({ color: hex, mode: 'tint', alpha: 1 })];
    obj.applyFilters();
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
