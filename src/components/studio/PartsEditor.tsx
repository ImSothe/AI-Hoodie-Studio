'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPart, rasterizeForParts } from '@/lib/fabric/parts';
import { getCanvas } from '@/lib/fabric/registry';
import type { Styled } from '@/lib/fabric/tint';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';

type Tool = 'brush' | 'eraser' | 'wand';

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'brush', label: 'Pincel', hint: 'Pinte encima de la zona que quiere separar' },
  { id: 'eraser', label: 'Goma', hint: 'Borre lo que sobre' },
  { id: 'wand', label: 'Varita', hint: 'Un clic selecciona la zona del mismo color' },
];

/** Máx. de pasos de «Deshacer». */
const HISTORY = 20;

/**
 * Editor de partes: se pinta una máscara sobre la pieza seleccionada (p. ej.
 * las alas de un dragón) y «Separar parte» la convierte en una pieza propia
 * con su color, degradado y técnica. Sólo se separa lo que tiene dibujo.
 */
export function PartsEditor() {
  const open = useStudio((s) => s.partsEditorOpen);
  const close = useCallback(() => useStudio.getState().setPartsEditorOpen(false), []);
  if (!open) return null;
  return <Editor onClose={close} />;
}

function Editor({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [size, setSize] = useState(48);
  const [tolerance, setTolerance] = useState(40);
  const [everywhere, setEverywhere] = useState(false);
  const [light, setLight] = useState(false);
  const [name, setName] = useState('Parte');
  const [hasMask, setHasMask] = useState(false);
  const [busy, setBusy] = useState(false);

  const bitmap = useRef<HTMLCanvasElement | null>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<ImageData[]>([]);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const target = useRef<Styled | null>(null);

  // Rasteriza la pieza seleccionada.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { activeView } = useStudio.getState();
      const obj = getCanvas(activeView)?.getActiveObject() as Styled | undefined;
      if (!obj) {
        setError('Seleccione primero una pieza en la prenda.');
        return;
      }
      target.current = obj;
      const nameOf = (obj.get('assetName' as never) as string | undefined) ?? 'Parte';
      setName(`${nameOf} · parte`);
      try {
        const bmp = await rasterizeForParts(obj);
        if (cancelled) return;
        bitmap.current = bmp;
        const m = document.createElement('canvas');
        m.width = bmp.width;
        m.height = bmp.height;
        mask.current = m;
        setReady(true);
      } catch {
        if (!cancelled) setError('No se pudo preparar la pieza para separarla.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const redraw = useCallback(() => {
    const bmp = bitmap.current;
    const m = mask.current;
    const ov = overlay.current;
    const disp = display.current;
    if (!bmp || !m || !ov || !disp) return;
    const dctx = disp.getContext('2d')!;
    dctx.clearRect(0, 0, disp.width, disp.height);
    dctx.drawImage(bmp, 0, 0);
    const ctx = ov.getContext('2d')!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(m, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = 'rgba(255, 64, 96, 0.62)';
    ctx.fillRect(0, 0, ov.width, ov.height);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  const maskHasPixels = () => {
    const m = mask.current!;
    const { data } = m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, m.width, m.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return true;
    return false;
  };

  const snapshot = () => {
    const m = mask.current!;
    history.current.push(m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, m.width, m.height));
    if (history.current.length > HISTORY) history.current.shift();
  };

  const refresh = () => {
    redraw();
    setHasMask(maskHasPixels());
  };

  const toBitmap = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const bmp = bitmap.current!;
    return {
      x: ((e.clientX - rect.left) / rect.width) * bmp.width,
      y: ((e.clientY - rect.top) / rect.height) * bmp.height,
      scale: bmp.width / rect.width,
    };
  };

  /** Varita: rellena la zona de color parecido (contigua o en toda la pieza). */
  const wand = (x0: number, y0: number) => {
    const bmp = bitmap.current!;
    const m = mask.current!;
    const w = bmp.width;
    const h = bmp.height;
    const src = bmp.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
    const sx = Math.min(w - 1, Math.max(0, Math.floor(x0)));
    const sy = Math.min(h - 1, Math.max(0, Math.floor(y0)));
    const s = (sy * w + sx) * 4;
    if (src[s + 3] < 24) return; // sobre un hueco no hay nada que seleccionar
    const [r0, g0, b0] = [src[s], src[s + 1], src[s + 2]];
    const near = (i: number) =>
      src[i + 3] >= 24 && Math.hypot(src[i] - r0, src[i + 1] - g0, src[i + 2] - b0) <= tolerance * 1.8;

    const out = m.getContext('2d')!;
    const img = out.getImageData(0, 0, w, h);
    const mark = (p: number) => {
      const i = p * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    };
    if (everywhere) {
      for (let p = 0; p < w * h; p++) if (near(p * 4)) mark(p);
    } else {
      const seen = new Uint8Array(w * h);
      const stack = [sy * w + sx];
      seen[stack[0]] = 1;
      while (stack.length) {
        const p = stack.pop()!;
        mark(p);
        const x = p % w;
        const y = (p - x) / w;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!seen[n] && near(n * 4)) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    out.putImageData(img, 0, 0);
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, scale: number) => {
    const ctx = mask.current!.getContext('2d')!;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * scale;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, (size * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    e.preventDefault();
    const p = toBitmap(e);
    snapshot();
    if (tool === 'wand') {
      wand(p.x, p.y);
      refresh();
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético */
    }
    drawing.current = { x: p.x, y: p.y };
    stroke(p, p, p.scale);
    redraw();
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = toBitmap(e);
    stroke(drawing.current, p, p.scale);
    drawing.current = { x: p.x, y: p.y };
    redraw();
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = null;
    refresh();
  };

  const undo = () => {
    const last = history.current.pop();
    if (!last) return;
    mask.current!.getContext('2d')!.putImageData(last, 0, 0);
    refresh();
  };

  const clearMask = () => {
    snapshot();
    const m = mask.current!;
    m.getContext('2d')!.clearRect(0, 0, m.width, m.height);
    refresh();
  };

  /** Invierte la selección dentro del dibujo (lo no pintado pasa a pintado). */
  const invert = () => {
    snapshot();
    const bmp = bitmap.current!;
    const m = mask.current!;
    const w = bmp.width;
    const h = bmp.height;
    const art = bmp.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
    const ctx = m.getContext('2d')!;
    const cur = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < cur.data.length; i += 4) {
      const painted = cur.data[i + 3] > 8;
      const on = !painted && art[i + 3] > 12;
      cur.data[i] = cur.data[i + 1] = cur.data[i + 2] = 255;
      cur.data[i + 3] = on ? 255 : 0;
    }
    ctx.putImageData(cur, 0, 0);
    refresh();
  };

  const confirm = async () => {
    const { activeView } = useStudio.getState();
    const canvas = getCanvas(activeView);
    const obj = target.current;
    if (!canvas || !obj || !bitmap.current || !mask.current) return;
    setBusy(true);
    try {
      const part = await createPart(canvas, activeView, obj, bitmap.current, mask.current, name.trim() || 'Parte');
      if (!part) {
        setError('Lo pintado no recoge ningún dibujo. Pinte sobre la zona con trazo.');
        return;
      }
      useStudio.getState().setSidebarTab('element');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const bmp = bitmap.current;
  const aspect = bmp ? bmp.width / bmp.height : 1;

  return (
    <div role="dialog" aria-modal="true" aria-label="Separar partes de la pieza" className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-5xl flex-col border border-white/10 bg-black md:flex-row">
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {ready && bmp ? (
            <div
              className={cn('relative max-h-[72dvh] max-w-full overflow-hidden ring-1 ring-white/15', light ? 'bg-[#d9d9d9]' : 'bg-[#1b1b1b]')}
              style={{ aspectRatio: aspect, height: 'min(72dvh, 640px)' }}
            >
              <canvas ref={display} width={bmp.width} height={bmp.height} className="absolute inset-0 size-full" />
              <canvas
                ref={overlay}
                width={bmp.width}
                height={bmp.height}
                className="absolute inset-0 size-full touch-none"
                style={{ cursor: tool === 'wand' ? 'crosshair' : 'cell' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
            </div>
          ) : (
            <p className="label-tech py-24">{error ?? 'Preparando la pieza…'}</p>
          )}
        </div>

        <aside className="thin-scroll w-full shrink-0 space-y-6 overflow-y-auto border-t border-white/10 p-6 md:w-[320px] md:border-t-0 md:border-l">
          <header>
            <h2 className="label-tech text-fg">Separar una parte</h2>
            <p className="mt-2 font-editorial text-[14px] leading-snug font-light text-muted italic">
              Pinte la zona que quiere tratar aparte (las alas, un adorno…). Después tendrá su propio color, degradado y acabado.
            </p>
          </header>

          <div role="radiogroup" aria-label="Herramienta" className="grid grid-cols-3 gap-px bg-line">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tool === t.id}
                title={t.hint}
                onClick={() => setTool(t.id)}
                className={cn('py-2.5 text-[10px] tracking-[0.18em] uppercase transition', tool === t.id ? 'bg-fg text-ink' : 'bg-black text-fg hover:bg-white/5')}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="-mt-3 text-[10.5px] font-light text-muted">{TOOLS.find((t) => t.id === tool)?.hint}</p>

          {tool === 'wand' ? (
            <div className="space-y-3">
              <label className="block">
                <span className="flex justify-between">
                  <span className="label-tech">Tolerancia</span>
                  <span className="num text-[11px] text-fg">{tolerance}</span>
                </span>
                <input type="range" min={5} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="mt-2 w-full" />
              </label>
              <label className="flex items-center gap-2 text-[11px] font-light text-fg">
                <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} />
                En todo el dibujo (no sólo la zona contigua)
              </label>
            </div>
          ) : (
            <label className="block">
              <span className="flex justify-between">
                <span className="label-tech">Tamaño</span>
                <span className="num text-[11px] text-fg">{size}</span>
              </span>
              <input type="range" min={6} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-2 w-full" />
            </label>
          )}

          <div className="grid grid-cols-3 gap-px bg-line">
            {[
              ['Deshacer', undo],
              ['Invertir', invert],
              ['Limpiar', clearMask],
            ].map(([label, fn]) => (
              <button key={label as string} type="button" onClick={fn as () => void} className="bg-black py-2.5 text-[10px] tracking-[0.16em] text-fg uppercase transition hover:bg-white/5">
                {label as string}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[11px] font-light text-muted">
            <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />
            Fondo claro (para ver mejor dibujos oscuros)
          </label>

          <label className="block">
            <span className="label-tech">Nombre de la parte</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="mt-2 w-full border-b border-line bg-transparent pb-2 text-[13px] font-light text-fg focus:border-fg/60 focus:outline-none"
            />
          </label>

          {error && ready && <p className="text-[11px] font-light text-fg">{error}</p>}

          <div className="space-y-px bg-line">
            <button
              type="button"
              disabled={!ready || !hasMask || busy}
              onClick={() => void confirm()}
              className="block w-full bg-fg py-3 text-[10px] tracking-[0.22em] text-ink uppercase transition disabled:opacity-30"
            >
              {busy ? 'Separando…' : 'Separar parte'}
            </button>
            <button type="button" onClick={onClose} className="block w-full bg-black py-3 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:bg-white/5">
              Cerrar
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
