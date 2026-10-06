'use client';

import type { Canvas } from 'fabric';
import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { rafThrottle } from '../utils';
import { PATTERN_H, PATTERN_UV, PATTERN_W } from './layout';

/**
 * Puente entre el lienzo plano del patrón (Fabric) y el 3D: el contenido del
 * lienzo se copia a un canvas de impresión que es la textura de la prenda.
 * Las UV del GLB se desplazan y escalan (repeat/offset) para que su región de
 * patrón coincida con ese canvas.
 */

let printCanvas: HTMLCanvasElement | null = null;
let texture: CanvasTexture | null = null;
let source: Canvas | null = null;

export function getPrintCanvas() {
  if (!printCanvas) {
    printCanvas = document.createElement('canvas');
    printCanvas.width = PATTERN_W;
    printCanvas.height = PATTERN_H;
  }
  return printCanvas;
}

export function getPrintTexture() {
  if (!texture) {
    texture = new CanvasTexture(getPrintCanvas());
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    const du = PATTERN_UV.u1 - PATTERN_UV.u0;
    const dv = PATTERN_UV.v1 - PATTERN_UV.v0;
    // u invertida (ver uvToPx): x del lienzo = 0 en u1 y = 1 en u0.
    texture.repeat.set(-1 / du, 1 / dv);
    texture.offset.set(PATTERN_UV.u1 / du, -PATTERN_UV.v0 / dv);
  }
  return texture;
}

export function bindPrintSource(canvas: Canvas | null) {
  source = canvas;
  if (canvas) schedulePrint();
}

/** Copia el lienzo de diseño al canvas de impresión (como mucho una vez por frame). */
export const schedulePrint = rafThrottle(() => {
  if (!source || source.destroyed) return;
  const out = source.toCanvasElement(1);
  const ctx = getPrintCanvas().getContext('2d')!;
  ctx.clearRect(0, 0, PATTERN_W, PATTERN_H);
  ctx.drawImage(out, 0, 0, PATTERN_W, PATTERN_H);
  getPrintTexture().needsUpdate = true;
});

/** El patrón impreso como PNG con transparencia (lo que se manda a imprimir). */
export function exportPatternPng(): string {
  schedulePrint.cancel?.();
  if (source && !source.destroyed) {
    const ctx = getPrintCanvas().getContext('2d')!;
    ctx.clearRect(0, 0, PATTERN_W, PATTERN_H);
    ctx.drawImage(source.toCanvasElement(1), 0, 0, PATTERN_W, PATTERN_H);
  }
  return getPrintCanvas().toDataURL('image/png');
}
