'use client';

import type { Canvas, FabricObject, Gradient } from 'fabric';
import { luminance, mix } from '../color';
import { metalFinish, type HardwareSpec } from '../hoodie/spec';

/**
 * Recolorea el template 2D (y por tanto los planos del dossier) con el color
 * de la prenda. Cada forma del SVG lleva data-fill-tone / data-stroke-tone y
 * aquí se traduce ese "tono" a un color derivado del HEX elegido.
 */

type Tone = 'body' | 'hood' | 'inner' | 'panel' | 'seam' | 'stitch' | 'rib' | 'fold' | 'eyelet' | 'aglet' | 'cord';

type Toned = FabricObject & { fillTone?: Tone; strokeTone?: Tone; backdrop?: boolean };

/** Reviver para loadSVGFromURL: copia los tonos del SVG al objeto de Fabric. */
export function toneReviver(element: Element, obj: FabricObject) {
  const fill = element.getAttribute('data-fill-tone');
  const stroke = element.getAttribute('data-stroke-tone');
  if (fill) (obj as Toned).fillTone = fill as Tone;
  if (stroke) (obj as Toned).strokeTone = stroke as Tone;
  if (element.getAttribute('data-role') === 'backdrop') (obj as Toned).backdrop = true;
}

/** Ejecuta fn con el fondo de estudio del template oculto (planos técnicos sobre blanco). */
export function withoutBackdrop<T>(canvas: Canvas, fn: () => T): T {
  const template = canvas.backgroundImage as (FabricObject & { getObjects?: () => FabricObject[] }) | undefined;
  const backdrop = template?.getObjects?.().find((o) => (o as Toned).backdrop);
  if (!template || !backdrop) return fn();
  backdrop.visible = false;
  template.set('dirty', true);
  try {
    return fn();
  } finally {
    backdrop.visible = true;
    template.set('dirty', true);
  }
}

/** Color del cordón: tono sobre tono (un punto más claro que el tejido) o contraste. */
export const cordColor = (garmentHex: string, hw: Pick<HardwareSpec, 'cordTonal' | 'cordHex'>) =>
  hw.cordTonal ? mix(garmentHex, '#FFFFFF', 0.08) : hw.cordHex;

/** Paleta de taller a partir del color base: sombras, costuras, canalé y fornituras. */
export function garmentPalette(hex: string, hw?: HardwareSpec) {
  const light = luminance(hex) > 0.3;
  const ink = light ? '#000000' : '#FFFFFF';
  return {
    eyelet: hw ? metalFinish(hw.eyeletFinish).hex : '#55555E',
    aglet: hw ? metalFinish(hw.agletFinish).hex : '#9A9AA2',
    cord: hw ? cordColor(hex, hw) : '#D6D6D6',
    body: [mix(hex, '#FFFFFF', 0.06), mix(hex, '#000000', 0.35)] as const,
    hood: [mix(hex, '#FFFFFF', 0.1), mix(hex, '#000000', 0.25)] as const,
    panel: mix(hex, '#000000', 0.12),
    inner: mix(hex, '#000000', 0.75),
    seam: mix(hex, ink, light ? 0.28 : 0.16),
    stitch: mix(hex, ink, light ? 0.22 : 0.2),
    rib: mix(hex, ink, light ? 0.12 : 0.08),
    fold: mix(hex, '#000000', 0.55),
  };
}

function isGradient(fill: unknown): fill is Gradient<'linear'> {
  return !!fill && typeof fill === 'object' && 'colorStops' in fill;
}

export function applyGarmentColor(canvas: Canvas, hex: string, hw?: HardwareSpec) {
  const template = canvas.backgroundImage as (FabricObject & { getObjects?: () => FabricObject[] }) | undefined;
  if (!template?.getObjects) return;
  const p = garmentPalette(hex, hw);

  for (const child of template.getObjects() as Toned[]) {
    const { fillTone, strokeTone } = child;
    if (fillTone === 'body' || fillTone === 'hood') {
      const [top, bottom] = p[fillTone];
      if (isGradient(child.fill)) {
        child.fill.colorStops = [
          { offset: 0, color: top },
          { offset: 1, color: bottom },
        ];
        child.set('dirty', true);
      } else {
        child.set('fill', top);
      }
    } else if (fillTone) {
      child.set('fill', p[fillTone]);
    }
    if (strokeTone && strokeTone !== 'body' && strokeTone !== 'hood') child.set('stroke', p[strokeTone]);
  }
  template.set('dirty', true);
  canvas.requestRenderAll();
}
