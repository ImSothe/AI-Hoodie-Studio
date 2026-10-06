'use client';

import { FabricImage, type Canvas } from 'fabric';
import type { HoodieView } from '../hoodie/spec';
import { CUSTOM_PROPS, syncCanvasState } from './editor';
import type { Styled } from './tint';

/**
 * Partes de una pieza. Un diseño (p. ej. un dragón) se puede separar en
 * partes —las alas, el cuerpo, un adorno— y cada parte pasa a ser una pieza
 * independiente: su propio color, degradado, técnica (reflectante, bordado…).
 *
 * Se pinta una máscara sobre la pieza en un editor aparte; aquí se corta la
 * imagen con ella. Sólo cuenta lo que tiene dibujo: pintar por encima de los
 * huecos transparentes no crea nada.
 */

const MAX_BITMAP_SIDE = 1600;
const MIN_ALPHA = 12;

/** Imagen de la pieza tal y como se ve (sin giro ni espejo) para pintar la máscara encima. */
export async function rasterizeForParts(obj: Styled): Promise<HTMLCanvasElement> {
  const clone = (await obj.clone(CUSTOM_PROPS)) as Styled;
  clone.set({ angle: 0, flipX: false, flipY: false });
  const box = clone.getBoundingRect();
  // Imágenes: no hace falta más resolución que la propia del archivo.
  const natural = clone instanceof FabricImage ? Math.max(clone.width, clone.height) : MAX_BITMAP_SIDE;
  const targetLong = Math.min(MAX_BITMAP_SIDE, natural);
  const multiplier = targetLong / Math.max(box.width, box.height, 1);
  return clone.toCanvasElement({ multiplier, enableRetinaScaling: false });
}

function hasInk(canvas: HTMLCanvasElement) {
  const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] > MIN_ALPHA) return true;
  return false;
}

function compose(bitmap: HTMLCanvasElement, mask: HTMLCanvasElement, op: 'destination-in' | 'destination-out') {
  const out = document.createElement('canvas');
  out.width = bitmap.width;
  out.height = bitmap.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  ctx.globalCompositeOperation = op;
  ctx.drawImage(mask, 0, 0);
  return out;
}

/**
 * Corta `obj` con `mask` (mismo tamaño que `bitmap`; opaco donde se pintó).
 * La parte sale como pieza nueva encima y la pieza original se queda con el
 * resto. Devuelve la parte creada, o null si la máscara no recogía dibujo.
 */
export async function createPart(
  canvas: Canvas,
  view: HoodieView,
  obj: Styled,
  bitmap: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  name: string,
): Promise<FabricImage | null> {
  const part = compose(bitmap, mask, 'destination-in');
  if (!hasInk(part)) return null;
  const rest = compose(bitmap, mask, 'destination-out');

  const box = (await obj.clone(CUSTOM_PROPS)) as Styled;
  box.set({ angle: 0, flipX: false, flipY: false });
  const rect = box.getBoundingRect();
  const center = obj.getCenterPoint();
  const placement = {
    originX: 'center' as const,
    originY: 'center' as const,
    left: center.x,
    top: center.y,
    scaleX: rect.width / bitmap.width,
    scaleY: rect.height / bitmap.height,
    angle: obj.angle,
    flipX: obj.flipX,
    flipY: obj.flipY,
  };
  const tags = {
    hoodieRole: 'design' as const,
    assetId: obj.get('assetId' as never),
    inkColor: obj.inkColor,
    originalInk: obj.originalInk,
    tecnica: obj.tecnica,
    // El degradado ya está pintado en la imagen: cada parte conserva su ficha (colores de salida).
    gradient: obj.gradient,
    tonoShift: obj.tonoShift,
    hiloAcabado: obj.hiloAcabado,
    elementKind: 'png' as const,
  };

  const index = Math.max(canvas.getObjects().indexOf(obj), 0);
  const partImage = new FabricImage(part, placement);
  Object.assign(partImage, tags, { assetName: name });

  canvas.discardActiveObject();
  canvas.remove(obj);
  if (hasInk(rest)) {
    const restImage = new FabricImage(rest, placement);
    Object.assign(restImage, tags, { assetName: `${obj.get('assetName' as never) ?? 'Gráfico'} · resto` });
    canvas.insertAt(index, restImage);
    canvas.insertAt(index + 1, partImage);
  } else {
    canvas.insertAt(index, partImage);
  }
  canvas.setActiveObject(partImage);
  partImage.setCoords();
  canvas.requestRenderAll();
  syncCanvasState(canvas, view);
  return partImage;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Recorta una pieza a un rectángulo (en píxeles del bitmap que devuelve
 * `rasterizeForParts`). La pieza recortada ocupa exactamente el mismo sitio y
 * tamaño que esa zona tenía en la original, y sustituye a la original en la
 * pila (o se queda debajo si `keepOriginal`). Sirve para sacar, por ejemplo, el
 * texto de un lado y el dibujo del otro, cada uno con su técnica.
 */
export async function cropObject(
  canvas: Canvas,
  view: HoodieView,
  obj: Styled,
  bitmap: HTMLCanvasElement,
  rect: CropRect,
  name: string,
  keepOriginal = false,
): Promise<FabricImage | null> {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const w = Math.min(bitmap.width - x, Math.round(rect.w));
  const h = Math.min(bitmap.height - y, Math.round(rect.h));
  if (w < 4 || h < 4) return null;

  const sub = document.createElement('canvas');
  sub.width = w;
  sub.height = h;
  sub.getContext('2d')!.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  if (!hasInk(sub)) return null;

  const box = (await obj.clone(CUSTOM_PROPS)) as Styled;
  box.set({ angle: 0, flipX: false, flipY: false });
  const shown = box.getBoundingRect();
  const sx = shown.width / bitmap.width;
  const sy = shown.height / bitmap.height;

  // El centro de la zona recortada, medido desde el centro de la pieza, girado con ella.
  const dx = (x + w / 2 - bitmap.width / 2) * sx * (obj.flipX ? -1 : 1);
  const dy = (y + h / 2 - bitmap.height / 2) * sy * (obj.flipY ? -1 : 1);
  const rad = (obj.angle * Math.PI) / 180;
  const center = obj.getCenterPoint();

  const image = new FabricImage(sub, {
    originX: 'center',
    originY: 'center',
    left: center.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    top: center.y + dx * Math.sin(rad) + dy * Math.cos(rad),
    scaleX: sx,
    scaleY: sy,
    angle: obj.angle,
    flipX: obj.flipX,
    flipY: obj.flipY,
  });
  Object.assign(image, {
    hoodieRole: 'design' as const,
    assetId: obj.get('assetId' as never),
    assetName: name,
    inkColor: obj.inkColor,
    originalInk: obj.originalInk,
    tecnica: obj.tecnica,
    gradient: obj.gradient,
    tonoShift: obj.tonoShift,
    hiloAcabado: obj.hiloAcabado,
    elementKind: 'png' as const,
  });

  const index = Math.max(canvas.getObjects().indexOf(obj), 0);
  canvas.discardActiveObject();
  if (keepOriginal) {
    canvas.insertAt(index + 1, image);
  } else {
    canvas.remove(obj);
    canvas.insertAt(index, image);
  }
  canvas.setActiveObject(image);
  image.setCoords();
  canvas.requestRenderAll();
  syncCanvasState(canvas, view);
  return image;
}
