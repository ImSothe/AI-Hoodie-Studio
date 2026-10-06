'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Canvas, FabricImage, loadSVGFromString, util, type FabricObject } from 'fabric';
import { importFiles } from '@/lib/assets/importFiles';
import { TEMPLATES, templateAsset } from '@/lib/assets/templates';
import { restoreObject, tintObject, type Styled } from '@/lib/fabric/tint';
import { sizeOf } from '@/lib/pattern/layout';
import type { PatternAnalysis } from '@/lib/pattern/analysis';
import { drawPatternGuide } from '@/lib/pattern/guide';
import type { PatternMode } from '@/lib/pattern/layout';
import { bindPrintSource, exportPatternPng, schedulePrint, setPrintMode } from '@/lib/pattern/print';
import type { GeneratedAsset } from '@/lib/types';
import { cn } from '@/lib/utils';

const SWATCHES = ['#FFFFFF', '#EDE8DF', '#BFC1C2', '#8E8A83', '#3A3A3A', '#0A0A0A', '#5A1622', '#B5A27A'];
const EVENTS = ['object:added', 'object:removed', 'object:modified', 'object:moving', 'object:scaling', 'object:rotating'] as const;

async function createObject(asset: GeneratedAsset): Promise<FabricObject> {
  if (asset.kind === 'svg' && asset.svg) {
    const { objects, options } = await loadSVGFromString(asset.svg);
    return util.groupSVGElements(
      objects.filter((o): o is FabricObject => Boolean(o)),
      options,
    );
  }
  return FabricImage.fromURL(asset.src);
}

const btn =
  'border border-fg/20 px-3 py-2 text-[10px] tracking-[0.2em] text-fg uppercase transition hover:border-fg/60 disabled:opacity-30 disabled:hover:border-fg/20';

/**
 * Lienzo plano del patrón: las piezas de tela desplegadas. Todo lo que se
 * coloca aquí aparece cosido en la prenda 3D (por las UV del modelo).
 */
export function PatternEditor({ analysis, mode }: { analysis: PatternAnalysis | null; mode: PatternMode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  // Espacio disponible en pantalla; la escala sale de él y del tamaño del lienzo del modo actual.
  const [room, setRoom] = useState({ w: 800, h: 700 });
  const size = sizeOf(mode);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const scale = Math.max(0.1, Math.min(room.w / size.w, room.h / size.h));
  const [hasSelection, setHasSelection] = useState(false);
  const [labels, setLabels] = useState(true);
  const [busy, setBusy] = useState(false);

  // Lienzo de Fabric (resolución completa del patrón; en pantalla sólo se escala por CSS).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const el = document.createElement('canvas');
    host.appendChild(el);
    const canvas = new Canvas(el, {
      width: sizeRef.current.w,
      height: sizeRef.current.h,
      preserveObjectStacking: true,
      enableRetinaScaling: false,
      skipOffscreen: false,
      selectionColor: 'rgba(255,255,255,0.05)',
      selectionBorderColor: '#ffffff',
      selectionLineWidth: 2,
    });
    canvasRef.current = canvas;
    bindPrintSource(canvas);
    const offs = EVENTS.map((evt) => canvas.on(evt, schedulePrint));
    const sel = () => setHasSelection(canvas.getActiveObjects().length > 0);
    offs.push(canvas.on('selection:created', sel), canvas.on('selection:updated', sel), canvas.on('selection:cleared', sel));

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      // Flechas: mover la pieza (Mayús = 10 veces más).
      const step = e.shiftKey ? 20 : 2;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = arrows[e.key];
      const selected = canvas.getActiveObject();
      if (move && selected) {
        e.preventDefault();
        selected.set({ left: selected.left + move[0], top: selected.top + move[1] });
        selected.setCoords();
        canvas.requestRenderAll();
        schedulePrint();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = canvas.getActiveObjects();
        if (!active.length) return;
        e.preventDefault();
        canvas.discardActiveObject();
        canvas.remove(...active);
        canvas.requestRenderAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      offs.forEach((off) => off());
      bindPrintSource(null);
      canvasRef.current = null;
      void canvas.dispose();
      el.parentElement?.remove();
    };
  }, []);

  // Escala de pantalla: el patrón cabe entero en el espacio disponible.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setRoom({ w: width, h: height });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: `${size.w * scale}px`, height: `${size.h * scale}px` }, { cssOnly: true });
  }, [scale, size.w, size.h]);

  // Guía: las piezas planas con su nombre.
  useEffect(() => {
    const guide = guideRef.current;
    if (!guide) return;
    const ctx = guide.getContext('2d')!;
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, size.w, size.h);
    if (analysis) drawPatternGuide(ctx, analysis, mode, labels);
  }, [analysis, mode, labels, size.w, size.h]);

  // Cada modo tiene su propio diseño: al cambiar se guarda el actual y se carga el del otro.
  const modeRef = useRef(mode);
  const saved = useRef<Partial<Record<PatternMode, object>>>({});
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || modeRef.current === mode) return;
    saved.current[modeRef.current] = canvas.toObject(['hoodieRole', 'assetName']);
    modeRef.current = mode;
    canvas.discardActiveObject();
    canvas.clear();
    // Cada modo tiene su propio lienzo, con su propio tamaño.
    canvas.setDimensions({ width: sizeOf(mode).w, height: sizeOf(mode).h }, { backstoreOnly: true });
    void canvas.loadFromJSON(saved.current[mode] ?? { objects: [] }).then(() => {
      canvas.requestRenderAll();
      setPrintMode(mode);
    });
  }, [mode]);

  const place = useCallback(async (assets: GeneratedAsset[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    for (const asset of assets) {
      const obj = await createObject(asset);
      const { w, h } = sizeRef.current;
      const k = (Math.min(w, h) * 0.3) / Math.max(obj.width || 1, obj.height || 1);
      obj.set({ originX: 'center', originY: 'center', left: w / 2, top: h / 2, scaleX: k, scaleY: k });
      Object.assign(obj, { hoodieRole: 'design', assetName: asset.name });
      canvas.add(obj);
      canvas.setActiveObject(obj);
    }
    canvas.requestRenderAll();
    schedulePrint();
  }, []);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setBusy(true);
    try {
      await place(await importFiles(e.target.files));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const withActive = (fn: (obj: FabricObject, canvas: Canvas) => void | Promise<void>) => async () => {
    const canvas = canvasRef.current;
    const obj = canvas?.getActiveObject();
    if (!canvas || !obj) return;
    await fn(obj, canvas);
    canvas.requestRenderAll();
    schedulePrint();
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = exportPatternPng();
    a.download = 'patron-estampado.png';
    a.click();
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <label className={cn(btn, 'cursor-pointer')}>
          {busy ? 'Cargando…' : '+ Imagen'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="sr-only" onChange={onFiles} />
        </label>
        <select
          aria-label="Añadir plantilla"
          className={cn(btn, 'bg-black')}
          value=""
          onChange={(e) => {
            const a = templateAsset(e.target.value);
            if (a) void place([a]);
          }}
        >
          <option value="">+ Plantilla</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          disabled={!hasSelection}
          className={btn}
          onClick={withActive(async (obj, canvas) => {
            const copy = await obj.clone(['hoodieRole', 'assetName']);
            copy.set({ left: obj.left + 40, top: obj.top + 40 });
            canvas.add(copy);
            canvas.setActiveObject(copy);
          })}
        >
          Duplicar
        </button>
        <button type="button" disabled={!hasSelection} className={btn} onClick={withActive((obj) => void obj.set({ flipX: !obj.flipX }))}>
          Espejo
        </button>
        <button type="button" disabled={!hasSelection} className={btn} onClick={withActive((obj, canvas) => void canvas.bringObjectForward(obj))}>
          Subir
        </button>
        <button type="button" disabled={!hasSelection} className={btn} onClick={withActive((obj, canvas) => void canvas.sendObjectBackwards(obj))}>
          Bajar
        </button>
        <button
          type="button"
          disabled={!hasSelection}
          className={btn}
          onClick={withActive((obj, canvas) => {
            canvas.discardActiveObject();
            canvas.remove(obj);
          })}
        >
          Quitar
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button type="button" className={btn} aria-pressed={labels} onClick={() => setLabels((v) => !v)}>
          Nombres {labels ? 'sí' : 'no'}
        </button>
        <button type="button" className={cn(btn, 'ml-auto')} onClick={download}>
          Descargar patrón PNG
        </button>
      </div>

      <div className={cn('flex flex-wrap items-center gap-3 border-b border-line px-5 py-2.5', !hasSelection && 'opacity-40')}>
        <span className="label-tech">Color de la pieza</span>
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            disabled={!hasSelection}
            aria-label={`Color ${hex}`}
            title={hex}
            className="size-5 border border-white/25"
            style={{ background: hex }}
            onClick={withActive((obj) => tintObject(obj as Styled, hex))}
          />
        ))}
        <input
          type="color"
          aria-label="Otro color"
          disabled={!hasSelection}
          className="h-5 w-8 cursor-pointer border border-white/25 bg-transparent"
          onChange={(e) => {
            const canvas = canvasRef.current;
            const obj = canvas?.getActiveObject();
            if (!canvas || !obj) return;
            tintObject(obj as Styled, e.target.value);
            canvas.requestRenderAll();
            schedulePrint();
          }}
        />
        <button type="button" disabled={!hasSelection} className="label-tech underline" onClick={withActive((obj) => restoreObject(obj as Styled))}>
          Original
        </button>
      </div>

      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#0d0d0d] p-3">
        <div className="relative mx-auto" style={{ width: size.w * scale, height: size.h * scale }}>
          <canvas
            ref={guideRef}
            width={size.w}
            height={size.h}
            className="absolute inset-0"
            style={{ width: size.w * scale, height: size.h * scale }}
          />
          <div ref={hostRef} className="absolute inset-0" />
          {!analysis && (
            <p className="label-tech absolute inset-0 grid place-items-center text-center">Preparando el patrón…</p>
          )}
        </div>
      </div>
    </section>
  );
}
