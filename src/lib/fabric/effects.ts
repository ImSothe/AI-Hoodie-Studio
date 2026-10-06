'use client';

import { FabricImage, type Canvas, type FabricObject } from 'fabric';
import type { GradientSpec, HoodieView } from '../hoodie/spec';
import type { Look } from '../hoodie/looks';
import { useStudio } from '../store';
import { CUSTOM_PROPS, syncCanvasState } from './editor';
import { getCanvas } from './registry';
import { activeDesignObjects, gradientBase, isTonal, restoreObject, setTechnique, tintObject, type Styled } from './tint';

/**
 * Efectos de color de una pieza: degradados y «estilos» de un clic.
 *
 * El degradado se pinta sobre la propia imagen (el color de cada píxel pasa a
 * ser el del degradado y se conserva su transparencia), así que sirve igual
 * para el estampado plano, el reflectante y el bordado: cada capa 3D usa la
 * imagen ya coloreada. Un SVG o un texto se convierte antes en imagen.
 */

const MAX_BITMAP_SIDE = 1500;

/** Pasa cualquier objeto a imagen (con su tamaño, posición, giro y etiquetas) y lo deja en su sitio de la pila. */
export async function convertToImage(canvas: Canvas, obj: Styled): Promise<FabricImage> {
  if (obj instanceof FabricImage) return obj;
  const clone = (await obj.clone(CUSTOM_PROPS)) as Styled;
  clone.set({ angle: 0, flipX: false, flipY: false });
  const box = clone.getBoundingRect();
  const multiplier = Math.min(4, MAX_BITMAP_SIDE / Math.max(box.width, box.height, 1));
  const element = clone.toCanvasElement({ multiplier, enableRetinaScaling: false });

  const center = clone.getCenterPoint();
  const image = new FabricImage(element, {
    originX: 'center',
    originY: 'center',
    left: center.x,
    top: center.y,
    scaleX: box.width / element.width,
    scaleY: box.height / element.height,
    angle: obj.angle,
    flipX: obj.flipX,
    flipY: obj.flipY,
  });
  Object.assign(image, {
    hoodieRole: 'design',
    assetId: obj.get('assetId' as never),
    assetName: obj.get('assetName' as never),
    inkColor: obj.inkColor,
    originalInk: obj.originalInk,
    tecnica: obj.tecnica,
    elementKind: 'png',
    tonoShift: obj.tonoShift,
    hiloAcabado: obj.hiloAcabado,
  });

  const index = canvas.getObjects().indexOf(obj);
  canvas.remove(obj);
  canvas.insertAt(Math.max(index, 0), image);
  return image;
}

/** Dibuja el degradado sobre la imagen original conservando su transparencia. */
function paintGradient(base: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }, spec: GradientSpec) {
  const w = base.naturalWidth ?? base.width ?? 1;
  const h = base.naturalHeight ?? base.height ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(base, 0, 0, w, h);

  const rad = (spec.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Largo del degradado: lo que mide la imagen proyectada sobre su dirección.
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const gradient = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
  gradient.addColorStop(0, spec.from);
  gradient.addColorStop(1, spec.to);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

export async function applyGradient(canvas: Canvas, obj: Styled, spec: GradientSpec): Promise<Styled> {
  const image = (await convertToImage(canvas, obj)) as FabricImage & Styled;
  if (!gradientBase.has(image)) gradientBase.set(image, (image as unknown as { _originalElement?: CanvasImageSource })._originalElement ?? (image.getElement() as CanvasImageSource));
  image.filters = [];
  image.setElement(paintGradient(gradientBase.get(image) as never, spec));
  image.gradient = { ...spec };
  image.inkColor = spec.from;
  image.set('dirty', true);
  return image;
}

function withCanvas(fn: (canvas: Canvas, view: HoodieView) => Promise<void> | void) {
  const view = useStudio.getState().activeView;
  const canvas = getCanvas(view);
  if (!canvas) return Promise.resolve();
  return Promise.resolve(fn(canvas, view)).then(() => {
    canvas.requestRenderAll();
    syncCanvasState(canvas, view);
  });
}

/** Aplica el degradado a las piezas seleccionadas y las mantiene seleccionadas. */
export function applyGradientActive(spec: GradientSpec) {
  return withCanvas(async (canvas) => {
    const targets = activeDesignObjects(canvas).filter((o) => !isTonal(o));
    const result: Styled[] = [];
    for (const obj of targets) result.push(await applyGradient(canvas, obj, spec));
    if (result.length === 1) canvas.setActiveObject(result[0]);
  });
}

let pending: GradientSpec | null = null;
let busy = false;

/** Los selectores de color disparan decenas de eventos: sólo se pinta el último, uno a la vez. */
export function scheduleGradientActive(spec: GradientSpec) {
  pending = spec;
  if (busy) return;
  busy = true;
  const run = async () => {
    while (pending) {
      const next = pending;
      pending = null;
      await applyGradientActive(next);
    }
    busy = false;
  };
  void run();
}

/** Vuelve a color liso (el de origen de la pieza). */
export function clearGradientActive() {
  return withCanvas((canvas) => {
    activeDesignObjects(canvas).forEach((o) => restoreObject(o, o.originalInk));
  });
}

/** Aplica un estilo de un clic a las piezas seleccionadas: técnica + color o degradado. */
export function applyLookActive(look: Look) {
  const garment = useStudio.getState().garmentColor;
  return withCanvas(async (canvas) => {
    const targets = activeDesignObjects(canvas);
    const result: Styled[] = [];
    for (const obj of targets) {
      setTechnique(obj, look.technique, garment);
      if (isTonal(obj)) {
        result.push(obj);
      } else if (look.gradient) {
        result.push(await applyGradient(canvas, obj, look.gradient));
      } else {
        if (look.ink) tintObject(obj, look.ink);
        result.push(obj);
      }
    }
    if (result.length === 1) canvas.setActiveObject(result[0]);
  });
}

export type { FabricObject };
