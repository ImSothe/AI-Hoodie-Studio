'use client';

import { FabricImage, IText, type Canvas, type FabricObject } from 'fabric';
import { TONAL_TECHNIQUE, type HoodieView } from '../hoodie/spec';
import { useStudio } from '../store';
import { CUSTOM_PROPS, getDesignObjects, isDesign, kindOfObject, setChangeListener, syncCanvasState } from './editor';
import { gradientBase, restoreObject, tintObject, tonalInk, type Styled } from './tint';

/**
 * Deshacer / rehacer del diseño, por cara.
 *
 * Cada paso es una «fotografía» de las piezas: sus propiedades (posición,
 * tamaño, giro, técnica, color, texto…) y, en las imágenes, qué bitmap llevan
 * (el degradado y los recortes lo cambian) y sus filtros de tinte. Las piezas
 * son las mismas instancias de Fabric, así que no se copian imágenes pesadas:
 * sólo se guardan referencias.
 *
 * Los cambios seguidos (un arrastre, mover el selector de color) se agrupan en
 * un único paso con una pequeña espera, para que «deshacer» revierta lo último
 * que hizo la persona y no un píxel del arrastre.
 */

const DEBOUNCE_MS = 400;
const MAX_STEPS = 40;

const BASE_PROPS = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'flipX', 'flipY', 'opacity', 'skewX', 'skewY'] as const;
const TEXT_PROPS = ['text', 'fontFamily', 'fontWeight', 'charSpacing', 'fill', 'lineHeight', 'fontSize'] as const;

type Source = CanvasImageSource;

interface ImageState {
  element: Source;
  original: Source;
  filters: unknown[];
  filtersSig: string;
  /** Imagen de origen de una pieza con degradado (para «Colores originales»). */
  base: Source | null;
}

interface ObjectState {
  obj: FabricObject;
  props: Record<string, unknown>;
  image: ImageState | null;
}

interface Snapshot {
  objects: ObjectState[];
  signature: string;
}

interface Track {
  canvas: Canvas;
  stack: Snapshot[];
  index: number;
  timer: number;
}

const tracks = new Map<HoodieView, Track>();
let restoring = false;

let counter = 0;
const ids = new WeakMap<object, number>();
const idOf = (o: object) => {
  let id = ids.get(o);
  if (!id) ids.set(o, (id = ++counter));
  return id;
};

const isTonal = (obj: FabricObject) => (obj as Styled).tecnica === TONAL_TECHNIQUE;
const filtersSignature = (filters: unknown[]) =>
  JSON.stringify(filters.map((f) => (f as { toObject?: () => unknown }).toObject?.() ?? null));

function capture(canvas: Canvas): Snapshot {
  const objects = getDesignObjects(canvas).map<ObjectState>((obj) => {
    const record = obj as unknown as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    for (const k of BASE_PROPS) props[k] = record[k];
    if (obj instanceof IText) for (const k of TEXT_PROPS) props[k] = record[k];
    for (const k of CUSTOM_PROPS) {
      // El hilo de un ton-sur-ton sigue al tejido: no forma parte del diseño que se deshace.
      if (isTonal(obj) && k === 'inkColor') continue;
      const v = record[k];
      props[k] = v && typeof v === 'object' ? { ...(v as object) } : v;
    }
    let image: ImageState | null = null;
    if (obj instanceof FabricImage) {
      const raw = obj as unknown as { _element: Source; _originalElement: Source; filters: unknown[] };
      const filters = isTonal(obj) ? [] : (raw.filters ?? []).slice();
      image = {
        element: raw._element,
        original: raw._originalElement ?? raw._element,
        filters,
        filtersSig: filtersSignature(filters),
        base: (gradientBase.get(obj) as Source | undefined) ?? null,
      };
    }
    return { obj, props, image };
  });
  const signature = JSON.stringify(
    objects.map((o) => [
      idOf(o.obj),
      o.props,
      o.image && [idOf(o.image.original as object), o.image.filtersSig, o.image.base ? idOf(o.image.base as object) : 0],
    ]),
  );
  return { objects, signature };
}

function restore(track: Track, view: HoodieView, snapshot: Snapshot) {
  const { canvas } = track;
  restoring = true;
  try {
    const selected = canvas.getActiveObject();
    canvas.discardActiveObject();
    const keep = new Set(snapshot.objects.map((o) => o.obj));
    for (const obj of getDesignObjects(canvas)) if (!keep.has(obj)) canvas.remove(obj);
    const present = new Set(canvas.getObjects());
    const below = canvas.getObjects().filter((o) => !isDesign(o)).length;
    const garment = useStudio.getState().garmentColor;

    snapshot.objects.forEach((state, i) => {
      const { obj } = state;
      if (!present.has(obj)) canvas.add(obj);
      obj.set(state.props as never);
      if (obj instanceof IText) obj.initDimensions();

      if (state.image && obj instanceof FabricImage) {
        const raw = obj as unknown as { _originalElement: Source; filters: unknown[] };
        const changed = raw._originalElement !== state.image.original || filtersSignature(raw.filters ?? []) !== state.image.filtersSig;
        if (changed) {
          obj.setElement(state.image.original as HTMLImageElement);
          obj.filters = state.image.filters.slice() as never;
          if (obj.filters.length) obj.applyFilters();
        }
        if (state.image.base) gradientBase.set(obj, state.image.base);
        else gradientBase.delete(obj);
      } else if (!(obj instanceof IText) && kindOfObject(obj) === 'svg') {
        // Los vectores guardan el tinte en el relleno de cada trazo: se vuelve a aplicar.
        const ink = state.props.inkColor as string | undefined;
        const original = state.props.originalInk as string | undefined;
        if (ink && ink !== original) tintObject(obj as Styled, ink);
        else restoreObject(obj as Styled, original);
      }

      if (isTonal(obj)) tintObject(obj as Styled, tonalInk(garment, (obj as Styled).tonoShift));
      canvas.moveObjectTo(obj, below + i);
      obj.setCoords();
    });
    // La pieza que se estaba editando sigue seleccionada si aún existe.
    if (selected && snapshot.objects.some((o) => o.obj === selected)) canvas.setActiveObject(selected);
    canvas.requestRenderAll();
    syncCanvasState(canvas, view);
  } finally {
    restoring = false;
  }
}

function publish(view: HoodieView) {
  const t = tracks.get(view);
  useStudio.getState().setHistoryFlags(view, {
    undo: !!t && (t.index > 0 || t.timer !== 0),
    redo: !!t && t.index < t.stack.length - 1,
  });
}

function commitNow(view: HoodieView) {
  const t = tracks.get(view);
  if (!t) return;
  if (t.timer) window.clearTimeout(t.timer);
  t.timer = 0;
  const snap = capture(t.canvas);
  if (snap.signature !== t.stack[t.index].signature) {
    t.stack.length = t.index + 1;
    t.stack.push(snap);
    if (t.stack.length > MAX_STEPS + 1) t.stack.shift();
    t.index = t.stack.length - 1;
  }
  publish(view);
}

function schedule(view: HoodieView) {
  const t = tracks.get(view);
  if (!t) return;
  if (t.timer) window.clearTimeout(t.timer);
  t.timer = window.setTimeout(() => commitNow(view), DEBOUNCE_MS);
  publish(view);
}

// Cualquier cambio que se anuncia al 3D (syncCanvasState) es candidato a paso.
setChangeListener((_canvas, view) => {
  if (!restoring) schedule(view);
});

/** Empieza a seguir una cara: el estado actual (normalmente vacío) es el punto de partida. */
export function initHistory(view: HoodieView, canvas: Canvas) {
  tracks.set(view, { canvas, stack: [capture(canvas)], index: 0, timer: 0 });
  publish(view);
}

export function disposeHistory(view: HoodieView, canvas: Canvas) {
  const t = tracks.get(view);
  if (!t || t.canvas !== canvas) return;
  if (t.timer) window.clearTimeout(t.timer);
  tracks.delete(view);
}

/** Revierte el último cambio de la cara. Devuelve false si no había nada que deshacer. */
export function undo(view: HoodieView) {
  const t = tracks.get(view);
  if (!t) return false;
  if (t.timer) commitNow(view); // lo último que se hizo cuenta como paso antes de volver atrás
  if (t.index <= 0) return false;
  t.index--;
  restore(t, view, t.stack[t.index]);
  publish(view);
  return true;
}

export function redo(view: HoodieView) {
  const t = tracks.get(view);
  if (!t || t.index >= t.stack.length - 1) return false;
  t.index++;
  restore(t, view, t.stack[t.index]);
  publish(view);
  return true;
}
