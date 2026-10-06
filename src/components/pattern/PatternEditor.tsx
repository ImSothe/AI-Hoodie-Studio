'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Canvas, FabricImage, Point, Rect, loadSVGFromString, util, type FabricObject } from 'fabric';
import { importFiles } from '@/lib/assets/importFiles';
import { TEMPLATES, templateAsset } from '@/lib/assets/templates';
import { layerOfObject } from '@/lib/fabric/editor';
import { restoreObject, tintObject, type Styled } from '@/lib/fabric/tint';
import { TECHNIQUE_INFO, techniqueOf, type TechniqueLayer } from '@/lib/hoodie/spec';
import { sizeOf } from '@/lib/pattern/layout';
import type { PatternAnalysis } from '@/lib/pattern/analysis';
import { drawPatternGuide } from '@/lib/pattern/guide';
import type { PatternMode } from '@/lib/pattern/layout';
import { bakeToPieces } from '@/lib/pattern/bake';
import { LAYERS, bindPrintSource, exportPatternPng, layerInUse, renderLayer, schedulePrint, setPrintMode } from '@/lib/pattern/print';
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

const SAVED_PROPS = ['hoodieRole', 'assetName', 'tecnica'];
const LAYER_LABEL: Record<TechniqueLayer, string> = { print: 'Estampado', reflective: 'Reflectante', embroidery: 'Bordado' };
const LAYER_HINT: Record<TechniqueLayer, string> = {
  print: 'Tinta plana y mate. Lo más versátil.',
  reflective: 'Brilla con el flash: metálico y liso.',
  embroidery: 'Hilo con puntadas y relieve. Para logos y detalles.',
};

/** Tiradores grandes y visibles: el lienzo se ve reducido en pantalla, así que se dimensionan según la escala. */
function styleControls(obj: FabricObject, scale: number) {
  obj.set({
    cornerStyle: 'circle',
    cornerSize: 26 / scale,
    touchCornerSize: 44 / scale,
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#111111',
    borderColor: '#ffffff',
    borderScaleFactor: 2.5 / scale,
    borderDashArray: [10 / scale, 6 / scale],
    padding: 4 / scale,
  });
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
  const [activeLayer, setActiveLayer] = useState<TechniqueLayer | null>(null);
  const [clipped, setClipped] = useState(false);
  const [crop, setCrop] = useState<{ target: FabricObject; rect: Rect } | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

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
    const sel = () => {
      const active = canvas.getActiveObject();
      setHasSelection(canvas.getActiveObjects().length > 0);
      const design = active && (active as FabricObject & { hoodieRole?: string }).hoodieRole === 'design' ? active : null;
      setActiveLayer(design ? layerOfObject(design) : null);
      setClipped(!!design?.clipPath);
    };
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

  // Tiradores visibles para cualquier escala de pantalla.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((o) => styleControls(o, scale));
    canvas.requestRenderAll();
  }, [scale, mode]);

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
    saved.current[modeRef.current] = canvas.toObject(SAVED_PROPS);
    modeRef.current = mode;
    canvas.discardActiveObject();
    canvas.clear();
    // Cada modo tiene su propio lienzo, con su propio tamaño.
    canvas.setDimensions({ width: sizeOf(mode).w, height: sizeOf(mode).h }, { backstoreOnly: true });
    void canvas.loadFromJSON(saved.current[mode] ?? { objects: [] }).then(() => {
      canvas.getObjects().forEach((o) => styleControls(o, scaleRef.current));
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
      styleControls(obj, scaleRef.current);
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

  const setLayer = (layer: TechniqueLayer) =>
    withActive((obj) => {
      obj.set('tecnica' as never, techniqueOf(layer) as never);
      setActiveLayer(layer);
    })();

  // Recortar: un rectángulo ajustable sobre la pieza; al aplicarlo se queda como recorte de la propia pieza.
  const startCrop = () => {
    const canvas = canvasRef.current;
    const target = canvas?.getActiveObject();
    if (!canvas || !target) return;
    const b = target.getBoundingRect();
    const rect = new Rect({
      left: b.left + b.width * 0.1,
      top: b.top + b.height * 0.1,
      width: b.width * 0.8,
      height: b.height * 0.8,
      fill: 'rgba(255,255,255,0.12)',
      stroke: '#ffffff',
      strokeWidth: 3 / scaleRef.current,
      strokeUniform: true,
      strokeDashArray: [18 / scaleRef.current, 12 / scaleRef.current],
      objectCaching: false,
    });
    styleControls(rect, scaleRef.current);
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    setCrop({ target, rect });
  };
  const finishCrop = (apply: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || !crop) return;
    const { target, rect } = crop;
    if (apply) {
      // El rectángulo (en el plano) se pasa al espacio de la pieza, que puede estar escalada o girada.
      const inverse = util.invertTransform(target.calcTransformMatrix());
      const r = rect.getBoundingRect();
      const corners = [
        new Point(r.left, r.top),
        new Point(r.left + r.width, r.top),
        new Point(r.left + r.width, r.top + r.height),
        new Point(r.left, r.top + r.height),
      ].map((p) => p.transform(inverse));
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      target.clipPath = new Rect({
        left: (Math.min(...xs) + Math.max(...xs)) / 2,
        top: (Math.min(...ys) + Math.max(...ys)) / 2,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        originX: 'center',
        originY: 'center',
      });
      target.dirty = true;
    }
    canvas.remove(rect);
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
    schedulePrint();
    setCrop(null);
    setClipped(!!target.clipPath);
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = exportPatternPng();
    a.download = mode === 'joined' ? 'patron-unido.png' : 'patron-piezas.png';
    a.click();
  };

  /**
   * Para fábrica: el dibujo cortado en las piezas sueltas de taller (cada pieza con su trozo, ya encajado con las
   * vecinas) + un plano con los contornos y nombres para que el taller sepa qué es cada una.
   */
  const [exporting, setExporting] = useState(false);
  const downloadFactory = async () => {
    if (!analysis) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 30)); // deja pintar el aviso antes del cálculo
      const used = LAYERS.filter(layerInUse);
      if (!used.length) {
        setNotice('Aún no hay ningún diseño en el plano.');
        return;
      }
      // Un archivo por técnica: el taller imprime, borda o aplica reflectante por separado.
      const arts = used.map((layer) => {
        const raw = renderLayer(layer, mode === 'joined' ? 2 : 1) ?? document.createElement('canvas');
        return { layer, canvas: mode === 'joined' ? bakeToPieces(analysis, raw) : raw };
      });
      const outline = document.createElement('canvas');
      outline.width = sizeOf('pieces').w;
      outline.height = sizeOf('pieces').h;
      const octx = outline.getContext('2d')!;
      octx.fillStyle = '#3a3a3a';
      octx.fillRect(0, 0, outline.width, outline.height);
      drawPatternGuide(octx, analysis, 'pieces', true);
      for (const { canvas } of arts) octx.drawImage(canvas, 0, 0);
      const blobOf = (c: HTMLCanvasElement) => new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const lines: string[] = [];
      for (const { layer, canvas } of arts) {
        const info = TECHNIQUE_INFO[techniqueOf(layer)];
        const name = `${info.code}-${info.slug}.png`;
        zip.file(name, await blobOf(canvas));
        lines.push(`${name}: ${LAYER_LABEL[layer]} (${techniqueOf(layer)}). ${info.note}`);
      }
      zip.file('plano-con-nombres.png', await blobOf(outline));
      zip.file(
        'LEEME.txt',
        'Diseño cortado en las piezas de taller, un archivo por técnica (fondo transparente, todas las piezas en una imagen):\n' +
          lines.join('\n') +
          '\n\nplano-con-nombres.png: todo sobre las siluetas de cada pieza, con su nombre, para que el taller sepa cuál es cuál.\n' +
          'Los dibujos que pasan de una pieza a otra encajan en las costuras. No incluyen margen de costura ni sangrado.\n',
      );
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'patron-para-fabrica.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setExporting(false);
    }
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
            const copy = await obj.clone(SAVED_PROPS);
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
        {crop ? (
          <>
            <button type="button" className={cn(btn, 'border-fg')} onClick={() => finishCrop(true)}>
              Aplicar recorte
            </button>
            <button type="button" className={btn} onClick={() => finishCrop(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={!hasSelection || !activeLayer} className={btn} onClick={startCrop} title="Deja sólo una parte del diseño">
              Recortar
            </button>
            {clipped && (
              <button
                type="button"
                className={btn}
                onClick={withActive((obj) => {
                  obj.clipPath = undefined;
                  obj.dirty = true;
                  setClipped(false);
                })}
              >
                Quitar recorte
              </button>
            )}
          </>
        )}
        <button
          type="button"
          disabled={!hasSelection || !!crop}
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
          PNG de este plano
        </button>
        <button type="button" className={btn} disabled={!analysis || exporting} onClick={() => void downloadFactory()}>
          {exporting ? 'Preparando…' : 'Para fábrica (piezas)'}
        </button>
      </div>

      <div className={cn('flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5', !activeLayer && 'opacity-40')}>
        <span className="label-tech mr-1">Técnica</span>
        {LAYERS.map((layer) => (
          <button
            key={layer}
            type="button"
            disabled={!activeLayer}
            aria-pressed={activeLayer === layer}
            title={LAYER_HINT[layer]}
            className={cn(btn, activeLayer === layer && 'border-fg bg-white/10')}
            onClick={() => void setLayer(layer)}
          >
            {LAYER_LABEL[layer]}
          </button>
        ))}
        <span className="font-editorial text-[14px] font-light text-muted italic">{activeLayer ? LAYER_HINT[activeLayer] : 'Elija un diseño del plano.'}</span>
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
          {notice && (
            <p role="status" className="label-tech absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 px-3 py-2">
              {notice}
            </p>
          )}
          {!analysis && (
            <p className="label-tech absolute inset-0 grid place-items-center text-center">Preparando el patrón…</p>
          )}
        </div>
      </div>
    </section>
  );
}
