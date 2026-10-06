'use client';

import type { Canvas } from 'fabric';
import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { rafThrottle } from '../utils';
import { sizeOf, type PatternMode } from './layout';

/**
 * Puente entre el lienzo plano del patrón (Fabric) y el 3D: el contenido del
 * lienzo se copia a un canvas de impresión que es la textura de la prenda.
 *  - «pieces»: las piezas sueltas; las UV del GLB se desplazan y escalan (repeat/offset).
 *  - «joined»: las piezas cosidas entre sí; usa un segundo juego de UV (`uv1`) ya normalizado.
 * Cada modo tiene su propio canvas y su propia textura.
 */

const canvases: Partial<Record<PatternMode, HTMLCanvasElement>> = {};
const textures: Partial<Record<PatternMode, CanvasTexture>> = {};
let source: Canvas | null = null;
let mode: PatternMode = 'joined';

export function getPrintCanvas(m: PatternMode = mode) {
  let canvas = canvases[m];
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = sizeOf(m).w;
    canvas.height = sizeOf(m).h;
    canvases[m] = canvas;
  }
  return canvas;
}

export function getPrintTexture(m: PatternMode = mode) {
  let texture = textures[m];
  if (!texture) {
    texture = new CanvasTexture(getPrintCanvas(m));
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    // Cada modo lee sus propias UV (ver attachPatternUv): la textura sólo se muestrea en el shader de la prenda.
    textures[m] = texture;
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

function paint(m: PatternMode) {
  if (!source || source.destroyed) return;
  const ctx = getPrintCanvas(m).getContext('2d')!;
  const { w, h } = sizeOf(m);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source.toCanvasElement(1), 0, 0, w, h);
  getPrintTexture(m).needsUpdate = true;
}

/** Copia el lienzo de diseño al canvas de impresión del modo actual (como mucho una vez por frame). */
export const schedulePrint = rafThrottle(() => paint(mode));

/** El patrón impreso como PNG con transparencia (lo que se manda a imprimir). */
export function exportPatternPng(): string {
  schedulePrint.cancel?.();
  paint(mode);
  return getPrintCanvas(mode).toDataURL('image/png');
}
