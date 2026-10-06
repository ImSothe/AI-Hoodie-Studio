'use client';

import type { Canvas } from 'fabric';
import { VIEW_SPECS, type HoodieView, type TechniqueLayer } from '../hoodie/spec';

/**
 * Puente entre Fabric (2D) y Three (3D).
 *
 * Cada vista tiene su lienzo de Fabric y un <canvas> "de textura" estable que
 * contiene sólo el área de impresión con los gráficos (fondo transparente).
 * Three.js crea una CanvasTexture sobre ese elemento y sólo necesita marcar
 * `needsUpdate` cuando se le avisa de que el diseño ha cambiado.
 */

const canvases = new Map<HoodieView, Canvas>();
const textureCanvases = new Map<string, HTMLCanvasElement>();
const listeners = new Set<(view: HoodieView) => void>();

/** Lado largo de la textura que se envía a la GPU. */
export const TEXTURE_LONG_SIDE = 1024;

export function registerCanvas(view: HoodieView, canvas: Canvas) {
  canvases.set(view, canvas);
  notifyDesignChanged(view);
}

export function unregisterCanvas(view: HoodieView, canvas: Canvas) {
  if (canvases.get(view) === canvas) canvases.delete(view);
}

export function getCanvas(view: HoodieView): Canvas | undefined {
  return canvases.get(view);
}

/**
 * Capas de textura, una por técnica: "print" (serigrafía plana), "reflective"
 * (tinta reflectante) y "embroidery" (bordado). Cada capa va a un <Decal>
 * con su propio material; el bordado además lleva un mapa de relieve.
 */
export type TextureLayer = TechniqueLayer;
export const TEXTURE_LAYERS: TextureLayer[] = ['print', 'reflective', 'embroidery'];

export function getTextureCanvas(view: HoodieView, layer: TextureLayer | 'bump' | 'rough' = 'print'): HTMLCanvasElement {
  const key = `${view}:${layer}`;
  let el = textureCanvases.get(key);
  if (!el) {
    const { widthCm, heightCm } = VIEW_SPECS[view].printArea;
    const ratio = heightCm / widthCm;
    el = document.createElement('canvas');
    if (ratio >= 1) {
      el.height = TEXTURE_LONG_SIDE;
      el.width = Math.round(TEXTURE_LONG_SIDE / ratio);
    } else {
      el.width = TEXTURE_LONG_SIDE;
      el.height = Math.round(TEXTURE_LONG_SIDE * ratio);
    }
    textureCanvases.set(key, el);
  }
  return el;
}

export function notifyDesignChanged(view: HoodieView) {
  listeners.forEach((cb) => cb(view));
}

export function onDesignChanged(cb: (view: HoodieView) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
