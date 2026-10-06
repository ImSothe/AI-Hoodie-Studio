'use client';

import type { Canvas, FabricObject } from 'fabric';
import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { layerOfObject } from '../fabric/editor';
import type { TechniqueLayer } from '../hoodie/spec';
import { rafThrottle } from '../utils';
import { sizeOf, type PatternMode } from './layout';

/**
 * Puente entre el lienzo plano del patrón (Fabric) y el 3D: el contenido del
 * lienzo se copia a canvas de impresión que son las texturas de la prenda.
 *  - «pieces»: las piezas sueltas; «joined»: los tendidos unidos por sus costuras.
 *  - Una textura por técnica (estampado, reflectante, bordado): cada una se ve distinta en 3D.
 * Cada modo tiene su propio canvas y sus propias texturas. Las UV de cada modo van
 * en atributos de la malla (ver attachPatternUv): la textura sólo se muestrea en el shader.
 */

export const LAYERS: TechniqueLayer[] = ['print', 'reflective', 'embroidery'];

const canvases = new Map<string, HTMLCanvasElement>();
const textures = new Map<string, CanvasTexture>();
let source: Canvas | null = null;
let mode: PatternMode = 'joined';

const keyOf = (m: PatternMode, layer: TechniqueLayer) => `${m}:${layer}`;

export function getPrintCanvas(m: PatternMode = mode, layer: TechniqueLayer = 'print') {
  const key = keyOf(m, layer);
  let canvas = canvases.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = sizeOf(m).w;
    canvas.height = sizeOf(m).h;
    canvases.set(key, canvas);
  }
  return canvas;
}

export function getPrintTexture(m: PatternMode = mode, layer: TechniqueLayer = 'print') {
  const key = keyOf(m, layer);
  let texture = textures.get(key);
  if (!texture) {
    texture = new CanvasTexture(getPrintCanvas(m, layer));
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    textures.set(key, texture);
  }
  return texture;
}

export function setPrintMode(m: PatternMode) {
  mode = m;
  schedulePrint();
}

export function bindPrintSource(canvas: Canvas | null) {
  source = canvas;
  if (canvas) schedulePrint();
}

const isDesign = (o: FabricObject) => (o as FabricObject & { hoodieRole?: string }).hoodieRole === 'design';

/** El lienzo de diseño con sólo los elementos de una técnica, a `multiplier` veces su tamaño. */
export function renderLayer(layer: TechniqueLayer, multiplier = 1): HTMLCanvasElement | null {
  if (!source || source.destroyed) return null;
  return source.toCanvasElement(multiplier, {
    filter: (o) => isDesign(o as FabricObject) && layerOfObject(o as FabricObject) === layer,
  });
}

/** ¿Hay algún elemento de esta técnica en el lienzo? */
export function layerInUse(layer: TechniqueLayer) {
  return !!source && source.getObjects().some((o) => isDesign(o) && layerOfObject(o) === layer);
}

function paint(m: PatternMode) {
  if (!source || source.destroyed) return;
  const { w, h } = sizeOf(m);
  for (const layer of LAYERS) {
    const ctx = getPrintCanvas(m, layer).getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (layerInUse(layer)) {
      const out = renderLayer(layer, 1);
      if (out) ctx.drawImage(out, 0, 0, w, h);
    }
    getPrintTexture(m, layer).needsUpdate = true;
  }
}

/** Copia el lienzo de diseño a las texturas del modo actual (como mucho una vez por frame). */
export const schedulePrint = rafThrottle(() => paint(mode));

/** El patrón impreso como PNG con transparencia (lo que se manda a imprimir), todas las técnicas juntas. */
export function exportPatternPng(): string {
  schedulePrint.cancel?.();
  paint(mode);
  const { w, h } = sizeOf(mode);
  const all = document.createElement('canvas');
  all.width = w;
  all.height = h;
  const ctx = all.getContext('2d')!;
  for (const layer of LAYERS) ctx.drawImage(getPrintCanvas(mode, layer), 0, 0);
  return all.toDataURL('image/png');
}
