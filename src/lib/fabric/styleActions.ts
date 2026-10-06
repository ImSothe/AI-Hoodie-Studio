'use client';

import type { Technique, ThreadFinish, TonalShift } from '../hoodie/spec';
import { useStudio } from '../store';
import { syncCanvasState } from './editor';
import { getCanvas } from './registry';
import { activeDesignObjects, isTonal, restoreObject, setTechnique, setTonal, tintObject } from './tint';

function withActive(fn: (canvas: NonNullable<ReturnType<typeof getCanvas>>) => void) {
  const view = useStudio.getState().activeView;
  const canvas = getCanvas(view);
  if (!canvas) return;
  fn(canvas);
  canvas.requestRenderAll();
  syncCanvasState(canvas, view);
}

let pendingInk: string | null = null;
let frame = 0;

/**
 * Tiñe los gráficos seleccionados. El picker dispara decenas de eventos por
 * segundo: se aplica sólo el último color en cada frame (filtros/redibujado).
 */
export function scheduleTintActive(hex: string) {
  pendingInk = hex;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const ink = pendingInk;
    pendingInk = null;
    // El ton-sur-ton tiene el hilo bloqueado al tejido: no se tiñe a mano.
    if (ink) withActive((canvas) => activeDesignObjects(canvas).filter((o) => !isTonal(o)).forEach((o) => tintObject(o, ink)));
  });
}

export function restoreActiveColors() {
  withActive((canvas) => activeDesignObjects(canvas).forEach((o) => restoreObject(o, o.originalInk)));
}

export function setActiveTechnique(tecnica: Technique) {
  const garment = useStudio.getState().garmentColor;
  withActive((canvas) => activeDesignObjects(canvas).forEach((o) => setTechnique(o, tecnica, garment)));
}

export function setActiveTonal(patch: { tonoShift?: TonalShift; hiloAcabado?: ThreadFinish }) {
  const garment = useStudio.getState().garmentColor;
  withActive((canvas) => activeDesignObjects(canvas).forEach((o) => setTonal(o, patch, garment)));
}
