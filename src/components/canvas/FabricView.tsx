'use client';

import { useEffect, useRef } from 'react';
import type { Canvas } from 'fabric';
import { createDesignCanvas, fitCanvasToBox, getDesignObjects, syncCanvasState } from '@/lib/fabric/editor';
import { applyGarmentColor } from '@/lib/fabric/garment';
import { isTonal, tintObject, tonalInk, type Styled } from '@/lib/fabric/tint';
import { disposeHistory, initHistory } from '@/lib/fabric/history';
import { registerCanvas, unregisterCanvas } from '@/lib/fabric/registry';
import type { HoodieView } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { cn, rafThrottle } from '@/lib/utils';

const SYNC_EVENTS = [
  'object:added',
  'object:removed',
  'object:modified',
  'object:moving',
  'object:scaling',
  'object:rotating',
  'selection:created',
  'selection:updated',
  'selection:cleared',
  'text:changed',
  'text:editing:exited',
] as const;

interface Props {
  view: HoodieView;
  visible: boolean;
  /** Espacio disponible en el escenario (px CSS). */
  box: { width: number; height: number };
}

/** Un lienzo Fabric por vista. Ambos permanecen montados para conservar el diseño. */
export function FabricView({ view, visible, box }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const boxRef = useRef(box);
  boxRef.current = box;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = createDesignCanvas(host, view);
    const { canvas } = handle;
    canvasRef.current = canvas;
    registerCanvas(view, canvas);
    initHistory(view, canvas);
    fitCanvasToBox(canvas, boxRef.current.width, boxRef.current.height);

    const sync = rafThrottle(() => syncCanvasState(canvas, view));
    const offs = SYNC_EVENTS.map((evt) => canvas.on(evt, sync));

    // Clic del usuario sobre un elemento → se abre su inspector (pestaña Elemento).
    // Las selecciones programáticas (añadir un asset) no traen evento y no cambian de pestaña.
    const openInspector = ({ e }: { e?: Event }) => {
      if (e) useStudio.getState().setSidebarTab('element');
    };
    offs.push(canvas.on('selection:created', openInspector), canvas.on('selection:updated', openInspector));

    // El template 2D sigue al color de la prenda y a las fornituras, y los
    // bordados ton-sur-ton re-tiñen su hilo (máx. una vez por frame).
    const recolor = rafThrottle(() => {
      const { garmentColor, hardware } = useStudio.getState();
      applyGarmentColor(canvas, garmentColor, hardware);
      const tonal = getDesignObjects(canvas).filter(isTonal) as Styled[];
      if (tonal.length) {
        tonal.forEach((o) => tintObject(o, tonalInk(garmentColor, o.tonoShift)));
        canvas.requestRenderAll();
        syncCanvasState(canvas, view);
      }
    });
    const offColor = useStudio.subscribe((s, prev) => {
      if (s.garmentColor !== prev.garmentColor || s.hardware !== prev.hardware) recolor();
    });

    return () => {
      offs.forEach((off) => off());
      sync.cancel();
      offColor();
      recolor.cancel();
      unregisterCanvas(view, canvas);
      disposeHistory(view, canvas);
      canvasRef.current = null;
      void handle.dispose();
    };
  }, [view]);

  useEffect(() => {
    if (canvasRef.current) fitCanvasToBox(canvasRef.current, box.width, box.height);
  }, [box.width, box.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (visible) syncCanvasState(canvas, view);
    else {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  }, [visible, view]);

  return (
    <div
      ref={hostRef}
      data-view={view}
      className={cn('overflow-hidden ring-1 ring-line', !visible && 'hidden')}
    />
  );
}
