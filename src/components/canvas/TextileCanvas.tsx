'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { FabricObject } from 'fabric';
import { importFiles } from '@/lib/assets/importFiles';
import { addAssetToCanvas, clientToScene, nudgeActive, removeActive, syncCanvasState } from '@/lib/fabric/editor';
import { redo, undo } from '@/lib/fabric/history';
import { getCanvas } from '@/lib/fabric/registry';
import { CANVAS_HEIGHT, CANVAS_WIDTH, HOODIE_VIEWS, VIEW_SPECS, type HoodieView } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { ASSET_DRAG_MIME } from '@/lib/utils';
import { Segmented } from '../ui/Button';
import { FabricView } from './FabricView';

/**
 * Lienzo textil en miniatura (panel lateral). Es el editor 2D real: cada
 * movimiento, escalado o giro repinta la textura y se ve al instante en el 3D.
 */
export function TextileCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);
  // El lienzo 2D es el editor avanzado: la edición normal se hace directamente sobre la prenda 3D.
  const [open, setOpen] = useState(false);
  const activeView = useStudio((s) => s.activeView);
  const counts = useStudio((s) => s.designCounts);
  const focusView = useStudio((s) => s.focusView);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      setBox({ width, height: Math.floor((width * CANVAS_HEIGHT) / CANVAS_WIDTH) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Atajos: Supr/Retroceso borra, flechas mueven (Mayús = x10).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Ctrl/Cmd+Z deshace el último cambio; Ctrl+Y o Ctrl+Mayús+Z lo rehace.
      const state = useStudio.getState();
      const editing = (getCanvas(activeView)?.getActiveObject() as { isEditing?: boolean } | undefined)?.isEditing;
      if ((e.ctrlKey || e.metaKey) && !state.partsEditorOpen && !state.cropEditorOpen && !editing) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo(activeView);
          return;
        }
        if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo(activeView);
          return;
        }
      }
      const canvas = getCanvas(activeView);
      const active = canvas?.getActiveObject() as (FabricObject & { isEditing?: boolean }) | undefined;
      // Mientras se edita un texto en el lienzo, las teclas son para escribir.
      if (!canvas || !active || active.isEditing) return;
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (e.key === 'Escape') {
        // Esc suelta la selección (y deja ver la lista de piezas).
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        syncCanvasState(canvas, activeView);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeActive(canvas, activeView);
      } else if (moves[e.key]) {
        e.preventDefault();
        nudgeActive(canvas, activeView, ...moves[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeView]);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const canvas = getCanvas(activeView);
    if (!canvas) return;
    const point = clientToScene(canvas, e.clientX, e.clientY);
    const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME);
    if (assetId) {
      const asset = useStudio.getState().assets.find((a) => a.id === assetId);
      if (asset) await addAssetToCanvas(canvas, activeView, asset, point);
      return;
    }
    if (e.dataTransfer.files.length) {
      const imported = await importFiles(e.dataTransfer.files);
      useStudio.getState().addAssets(imported);
      for (const asset of imported) await addAssetToCanvas(canvas, activeView, asset, point);
    }
  };

  return (
    <section className={open ? 'border-b border-line px-(--pad-x) pt-4 pb-4' : 'border-b border-line px-(--pad-x) py-3'}>
      <header className={open ? 'mb-3 flex items-baseline justify-between gap-2' : 'flex items-baseline justify-between gap-2'}>
        <h2 className="label-tech text-fg">Lienzo 2D</h2>
        <Segmented<HoodieView>
          label="Cara de la prenda"
          value={activeView}
          onChange={focusView}
          options={(['back', 'front'] as const).map((v) => ({
            value: v,
            label: `${VIEW_SPECS[v].label}${counts[v] ? ` ${counts[v]}` : ''}`,
          }))}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="border-b border-muted pb-0.5 text-[9px] tracking-[0.22em] text-muted uppercase hover:text-fg"
        >
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </header>

      <div
        ref={wrapRef}
        className={open ? 'relative' : 'pointer-events-none fixed top-0 -left-[3000px] w-[340px]'}
        aria-hidden={!open}
        style={{ minHeight: box.height || undefined }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME) && !e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        {HOODIE_VIEWS.map((view) => (
          <FabricView key={view} view={view} visible={view === activeView} box={box} />
        ))}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center border border-dashed border-fg/40 bg-black/40">
            <span className="label-tech text-fg">Soltar</span>
          </div>
        )}
      </div>
      {open && (
        <p className="mt-2.5 text-[10px] font-light tracking-[0.06em] text-muted">
          Editor avanzado: lo que haga aquí se ve al instante en la prenda.
        </p>
      )}
    </section>
  );
}
