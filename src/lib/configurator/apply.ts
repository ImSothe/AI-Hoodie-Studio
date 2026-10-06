'use client';

import { Point } from 'fabric';
import { coverageMm2, estimateStitches } from '../fabric/coverage';
import { addTextToCanvas, getDesignObjects, syncCanvasState } from '../fabric/editor';
import { getCanvas } from '../fabric/registry';
import { setTechnique, tintObject } from '../fabric/tint';
import { CENTER_X, HOODIE_VIEWS, HPS_Y, PX_PER_CM, TONAL_TECHNIQUE, cmToPx } from '../hoodie/spec';
import { finish, placement, thread, type Personalization } from './collection';

let latest = 0;
let chain: Promise<void> = Promise.resolve();

/**
 * Lleva la personalización a los lienzos de diseño (los mismos
 * que usa el atelier): un fabric.IText con su técnica, a la medida y posición
 * de la colocación elegida. Las llamadas se encadenan y sólo se aplica la
 * última (teclear rápido no duplica textos).
 */
export function applyPersonalization(p: Personalization, garmentHex: string) {
  const token = ++latest;
  chain = chain.then(() => (token === latest ? apply(p, garmentHex) : undefined)).catch(() => undefined);
  return chain;
}

async function apply(p: Personalization, garmentHex: string) {
  for (const view of HOODIE_VIEWS) {
    const canvas = getCanvas(view);
    if (!canvas) continue;
    getDesignObjects(canvas).forEach((o) => canvas.remove(o));
    canvas.requestRenderAll();
    syncCanvasState(canvas, view);
  }

  const text = p.text.trim();
  const spot = placement(p.placement);
  const canvas = getCanvas(spot.view);
  if (!text || !canvas) return;

  const { technique } = finish(p.finish);
  const tonal = technique === TONAL_TECHNIQUE;
  const ink = tonal ? garmentHex : thread(p.thread).hex;
  const obj = await addTextToCanvas(canvas, spot.view, { text, fontFamily: p.font, fill: ink });

  // A la medida de la colocación: cabe en su caja (ancho × alto) sin deformarse.
  const fit = Math.min(cmToPx(spot.widthCm) / obj.getScaledWidth(), cmToPx(spot.heightCm) / obj.getScaledHeight());
  obj.scale(obj.scaleX * fit);
  obj.setPositionByOrigin(
    new Point(CENTER_X + cmToPx(spot.xCm), HPS_Y + cmToPx(spot.topCm) + obj.getScaledHeight() / 2),
    'center',
    'center',
  );
  setTechnique(obj, technique, garmentHex);
  if (!tonal) tintObject(obj, ink);
  obj.set({ selectable: false, evented: false });
  obj.setCoords();
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  syncCanvasState(canvas, spot.view);
}

/** Medidas reales de la pieza aplicada (mm desde el HPS) y estimación de puntadas. */
export interface PieceMetrics {
  widthMm: number;
  heightMm: number;
  xFromAxisMm: number;
  topFromHpsMm: number;
  /** Superficie que cubre el hilo / la tinta. */
  areaMm2: number;
  stitches: number | null;
}

const mm = (px: number) => Math.round((px / PX_PER_CM) * 10);

export function measurePersonalization(p: Personalization): PieceMetrics | null {
  const spot = placement(p.placement);
  const canvas = getCanvas(spot.view);
  const obj = canvas ? getDesignObjects(canvas)[0] : undefined;
  if (!canvas || !obj || !p.text.trim()) return null;
  const r = obj.getBoundingRect();
  const area = coverageMm2(canvas, obj);
  return {
    widthMm: mm(r.width),
    heightMm: mm(r.height),
    xFromAxisMm: mm(r.left + r.width / 2 - CENTER_X),
    topFromHpsMm: mm(r.top - HPS_Y),
    areaMm2: Math.round(area),
    stitches: estimateStitches(finish(p.finish).technique, area),
  };
}
