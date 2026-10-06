'use client';

import type { Canvas, FabricObject } from 'fabric';
import { PX_PER_CM, TONAL_TECHNIQUE, type Technique } from '../hoodie/spec';
import { renderRegion } from './render';

/**
 * Densidad media de puntada por técnica (puntadas / mm²). Referencia de taller:
 * ~2.000 puntadas por pulgada cuadrada en satén (≈ 3 / mm²); el relieve sobre
 * espuma lleva más densidad para cubrirla. Es una estimación para presupuestar
 * tiempo de máquina: el número real lo da el archivo digitalizado (DST/PES).
 */
export const STITCH_DENSITY: Partial<Record<Technique, number>> = {
  [TONAL_TECHNIQUE]: 3,
  'Bordado Alto Relieve': 3.6,
};

/** Superficie real (mm²) que cubre la tinta / el hilo de un objeto: píxeles opacos de su render. */
export function coverageMm2(canvas: Canvas, obj: FabricObject, pxPerUnit = 3) {
  const el = renderRegion(canvas, obj.getBoundingRect(), pxPerUnit, { filter: (o) => o === obj });
  const ctx = el.getContext('2d', { willReadFrequently: true });
  if (!ctx || !el.width || !el.height) return 0;
  const { data } = ctx.getImageData(0, 0, el.width, el.height);
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 127) opaque++;
  const mmPerPx = 10 / (PX_PER_CM * pxPerUnit);
  return opaque * mmPerPx * mmPerPx;
}

/** Puntadas estimadas (redondeadas a 50) o null si la técnica no es bordado. */
export function estimateStitches(technique: Technique, areaMm2: number) {
  const density = STITCH_DENSITY[technique];
  return density ? Math.round((areaMm2 * density) / 50) * 50 : null;
}
