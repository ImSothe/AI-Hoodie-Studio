'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cropObject, rasterizeForParts, type CropRect } from '@/lib/fabric/parts';
import { getCanvas } from '@/lib/fabric/registry';
import type { Styled } from '@/lib/fabric/tint';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | 'new';

/** Radio (px de pantalla) en el que se agarra una esquina o un lado. */
const GRAB = 12;
const MIN_SIZE = 8;

const HALVES: { label: string; rect: (w: number, h: number) => CropRect }[] = [
  { label: 'Mitad superior', rect: (w, h) => ({ x: 0, y: 0, w, h: h / 2 }) },
  { label: 'Mitad inferior', rect: (w, h) => ({ x: 0, y: h / 2, w, h: h / 2 }) },
  { label: 'Mitad izquierda', rect: (w, h) => ({ x: 0, y: 0, w: w / 2, h }) },
  { label: 'Mitad derecha', rect: (w, h) => ({ x: w / 2, y: 0, w: w / 2, h }) },
  { label: 'Todo', rect: (w, h) => ({ x: 0, y: 0, w, h }) },
];

/**
 * Recortar: se ajusta un rectángulo sobre la pieza seleccionada y «Aplicar»
 * deja sólo esa zona. Pensado para usarlo tras «Duplicar»: una copia se recorta
 * al texto y otra al dibujo, y cada una lleva su propia técnica.
 */
export function CropEditor() {
  const open = useStudio((s) => s.cropEditorOpen);
  const close = useCallback(() => useStudio.getState().setCropEditorOpen(false), []);
  if (!open) return null;
  return <Editor onClose={close} />;
}

function Editor({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rect, setRect] = useState<CropRect | null>(null);
  const [light, setLight] = useState(false);
  const [name, setName] = useState('Recorte');
  const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(false);

  const bitmap = useRef<HTMLCanvasElement | null>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const target = useRef<Styled | null>(null);
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; from: CropRect } | null>(null);

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
      setName(`${(obj.get('assetName' as never) as string | undefined) ?? 'Pieza'} · recorte`);
      try {
        const bmp = await rasterizeForParts(obj);
        if (cancelled) return;
        bitmap.current = bmp;
        setRect({ x: bmp.width * 0.1, y: bmp.height * 0.1, w: bmp.width * 0.8, h: bmp.height * 0.8 });
        setReady(true);
      } catch {
        if (!cancelled) setError('No se pudo preparar la pieza para recortarla.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Dibuja la pieza y el rectángulo (lo de fuera, atenuado).
  useEffect(() => {
    const bmp = bitmap.current;
    const disp = display.current;
    const ov = overlay.current;
    if (!ready || !bmp || !disp || !ov || !rect) return;
    disp.getContext('2d')!.clearRect(0, 0, disp.width, disp.height);
    disp.getContext('2d')!.drawImage(bmp, 0, 0);
    const ctx = ov.getContext('2d')!;
    const px = Math.max(2, bmp.width / 400); // grosor de línea constante en pantalla
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, ov.width, ov.height);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = px;
    ctx.setLineDash([px * 4, px * 3]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    const hs = px * 3.2;
    for (const [hx, hy] of [
      [rect.x, rect.y],
      [rect.x + rect.w / 2, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.h / 2],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x + rect.w / 2, rect.y + rect.h],
      [rect.x, rect.y + rect.h],
      [rect.x, rect.y + rect.h / 2],
    ])
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
  }, [ready, rect]);

  const toBitmap = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const bmp = bitmap.current!;
    return { x: ((e.clientX - r.left) / r.width) * bmp.width, y: ((e.clientY - r.top) / r.height) * bmp.height, scale: bmp.width / r.width };
  };

  const hit = (p: { x: number; y: number; scale: number }): Handle => {
    if (!rect) return 'new';
    const g = GRAB * p.scale;
    const near = (a: number, b: number) => Math.abs(a - b) <= g;
    const left = near(p.x, rect.x);
    const right = near(p.x, rect.x + rect.w);
    const top = near(p.y, rect.y);
    const bottom = near(p.y, rect.y + rect.h);
    const inX = p.x > rect.x - g && p.x < rect.x + rect.w + g;
    const inY = p.y > rect.y - g && p.y < rect.y + rect.h + g;
    if (left && top) return 'nw';
    if (right && top) return 'ne';
    if (right && bottom) return 'se';
    if (left && bottom) return 'sw';
    if (top && inX) return 'n';
    if (bottom && inX) return 's';
    if (left && inY) return 'w';
    if (right && inY) return 'e';
    if (p.x > rect.x && p.x < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h) return 'move';
    return 'new';
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready || !rect) return;
    e.preventDefault();
    const p = toBitmap(e);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético */
    }
    const handle = hit(p);
    drag.current = { handle, start: p, from: handle === 'new' ? { x: p.x, y: p.y, w: 0, h: 0 } : { ...rect } };
    if (handle === 'new') setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const bmp = bitmap.current;
    if (!bmp) return;
    const p = toBitmap(e);
    if (!drag.current) {
      const h = hit(p);
      e.currentTarget.style.cursor =
        h === 'move' ? 'move' : h === 'new' ? 'crosshair' : h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize';
      return;
    }
    const { handle, start, from } = drag.current;
    const clampX = (v: number) => Math.min(bmp.width, Math.max(0, v));
    const clampY = (v: number) => Math.min(bmp.height, Math.max(0, v));
    let { x, y, w, h } = from;
    if (handle === 'move') {
      x = Math.min(bmp.width - w, Math.max(0, from.x + (p.x - start.x)));
      y = Math.min(bmp.height - h, Math.max(0, from.y + (p.y - start.y)));
    } else if (handle === 'new') {
      const x2 = clampX(p.x);
      const y2 = clampY(p.y);
      x = Math.min(from.x, x2);
      y = Math.min(from.y, y2);
      w = Math.abs(x2 - from.x);
      h = Math.abs(y2 - from.y);
    } else {
      let x1 = from.x;
      let y1 = from.y;
      let x2 = from.x + from.w;
      let y2 = from.y + from.h;
      if (handle.includes('w')) x1 = Math.min(clampX(p.x), x2 - MIN_SIZE);
      if (handle.includes('e')) x2 = Math.max(clampX(p.x), x1 + MIN_SIZE);
      if (handle.includes('n')) y1 = Math.min(clampY(p.y), y2 - MIN_SIZE);
      if (handle.includes('s')) y2 = Math.max(clampY(p.y), y1 + MIN_SIZE);
      x = x1;
      y = y1;
      w = x2 - x1;
      h = y2 - y1;
    }
    setRect({ x, y, w, h });
  };

  const onUp = () => {
    drag.current = null;
  };

  const confirm = async () => {
    const { activeView } = useStudio.getState();
    const canvas = getCanvas(activeView);
    const obj = target.current;
    if (!canvas || !obj || !bitmap.current || !rect) return;
    setBusy(true);
    try {
      const piece = await cropObject(canvas, activeView, obj, bitmap.current, rect, name.trim() || 'Recorte', keep);
      if (!piece) {
        setError('El recorte no contiene dibujo o es demasiado pequeño.');
        return;
      }
      useStudio.getState().setSidebarTab('element');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bmp = bitmap.current;
  const size = rect && bmp ? { w: Math.round((rect.w / bmp.width) * 100), h: Math.round((rect.h / bmp.height) * 100) } : null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Recortar la pieza" className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-5xl flex-col border border-white/10 bg-black md:flex-row">
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {ready && bmp ? (
            <div
              className={cn('relative max-w-full overflow-hidden ring-1 ring-white/15', light ? 'bg-[#d9d9d9]' : 'bg-[#1b1b1b]')}
              style={{ aspectRatio: bmp.width / bmp.height, height: 'min(72dvh, 640px)' }}
            >
              <canvas ref={display} width={bmp.width} height={bmp.height} className="absolute inset-0 size-full" />
              <canvas
                ref={overlay}
                width={bmp.width}
                height={bmp.height}
                className="absolute inset-0 size-full touch-none"
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
            <h2 className="label-tech text-fg">Recortar</h2>
            <p className="mt-2 font-editorial text-[14px] leading-snug font-light text-muted italic">
              Arrastre las esquinas o los lados, o dibuje un rectángulo nuevo. Se queda sólo lo de dentro; marque «Conservar también la pieza original» si quiere sacar varios recortes de la misma pieza.
            </p>
          </header>

          <div className="grid grid-cols-2 gap-px bg-line">
            {HALVES.map((half) => (
              <button
                key={half.label}
                type="button"
                disabled={!ready}
                onClick={() => bmp && setRect(half.rect(bmp.width, bmp.height))}
                className="bg-black py-2.5 text-[10px] tracking-[0.16em] text-fg uppercase transition hover:bg-white/5 disabled:opacity-30"
              >
                {half.label}
              </button>
            ))}
          </div>

          {size && <p className="num text-[11px] text-muted">Conserva {size.w} % de ancho × {size.h} % de alto</p>}

          <label className="flex items-start gap-2 text-[11px] font-light text-fg">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5" />
            <span>
              Conservar también la pieza original
              <span className="block text-[10px] text-muted">Crea el recorte encima, en su mismo sitio, sin desplazarlo.</span>
            </span>
          </label>

          <label className="flex items-center gap-2 text-[11px] font-light text-muted">
            <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />
            Fondo claro (para ver mejor dibujos oscuros)
          </label>

          <label className="block">
            <span className="label-tech">Nombre de la pieza</span>
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
              disabled={!ready || !rect || rect.w < MIN_SIZE || rect.h < MIN_SIZE || busy}
              onClick={() => void confirm()}
              className="block w-full bg-fg py-3 text-[10px] tracking-[0.22em] text-ink uppercase transition disabled:opacity-30"
            >
              {busy ? 'Recortando…' : 'Aplicar recorte'}
            </button>
            <button type="button" onClick={onClose} className="block w-full bg-black py-3 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:bg-white/5">
              Cancelar
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
