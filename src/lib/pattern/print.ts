'use client';

import type { Canvas } from 'fabric';
import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { rafThrottle } from '../utils';
import type { PatternMode } from './guide';
import { PATTERN_H, PATTERN_W } from './layout';

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
    canvas.width = PATTERN_W;
    canvas.height = PATTERN_H;
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
    // Los dos modos leen un juego de UV propio, ya normalizado al lienzo (ver attachPatternUv).
    texture.channel = m === 'joined' ? 1 : 2;
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
  ctx.clearRect(0, 0, PATTERN_W, PATTERN_H);
  ctx.drawImage(source.toCanvasElement(1), 0, 0, PATTERN_W, PATTERN_H);
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
