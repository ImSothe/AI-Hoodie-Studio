'use client';

import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { RootState } from '@react-three/fiber';
import { Raycaster, Vector3 } from 'three';
import { centerActive, commitObject, duplicateActive, flipActive, removeActive } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { VIEW_SPECS } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { getGarmentPanels } from '@/lib/three/garmentRegistry';
import { cn } from '@/lib/utils';
import { cameraFacesView, currentMapper } from './DirectEdit';

type Pt = [number, number];

interface Frame {
  corners: [Pt, Pt, Pt, Pt];
  center: Pt;
  rotate: Pt;
  label: string;
}

const round = (n: number) => Math.round(n * 2) / 2;

/** Pasa un punto de mundo a píxeles dentro del visor. */
function toScreen(p: Vector3, state: RootState): Pt {
  const v = p.clone().project(state.camera);
  return [round((v.x * 0.5 + 0.5) * state.size.width), round((-v.y * 0.5 + 0.5) * state.size.height)];
}

/**
 * Marco de edición sobre la prenda: sigue al gráfico seleccionado en el 3D con
 * esquinas para cambiar su tamaño, un tirador para girarlo y las acciones más
 * usadas a mano. Todo se hace sobre la propia prenda, sin ir al lienzo 2D.
 */
export function SelectionFrame({ getThree }: { getThree: MutableRefObject<(() => RootState) | null> }) {
  const activeView = useStudio((s) => s.activeView);
  const hasSelection = useStudio((s) => s.selection !== null);
  const immersive = useStudio((s) => s.immersive);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [facing, setFacing] = useState(true);
  const lastKey = useRef('');
  const gesture = useRef<null | {
    kind: 'scale' | 'rotate';
    centerScreen: Pt;
    startDist: number;
    startAngle: number;
    scaleX: number;
    scaleY: number;
    angle: number;
    centerPt: { x: number; y: number };
  }>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  // Sigue al objeto y a la cámara. Sólo se vuelve a pintar cuando algo se mueve de verdad.
  useEffect(() => {
    if (!hasSelection) {
      lastKey.current = '';
      setFrame(null);
      return;
    }
    const raycaster = new Raycaster();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const three = getThree.current?.();
      const canvas = getCanvas(activeView);
      const obj = canvas?.getActiveObject();
      if (!three || !canvas || !obj || obj.type === 'activeselection') return;

      const faces = cameraFacesView(three.camera, activeView);
      const mapper = currentMapper(activeView);
      const corners = obj.getCoords();
      const c = obj.getCenterPoint();

      // Profundidad de la superficie bajo el centro del gráfico (para colocar el marco sobre la tela).
      const probe = mapper.toWorld(c.x, c.y, 0);
      const dir = activeView === 'front' ? 1 : -1;
      raycaster.set(new Vector3(probe.x, probe.y, dir * 10), new Vector3(0, 0, -dir));
      const z = raycaster.intersectObjects(getGarmentPanels(), false)[0]?.point.z ?? 0;

      const toPx = (p: { x: number; y: number }) => toScreen(mapper.toWorld(p.x, p.y, z), three);
      const px = corners.map(toPx) as [Pt, Pt, Pt, Pt];
      const center = toPx(c);
      // Tirador de giro: sobre el punto medio del borde superior, alejado del centro.
      const top: Pt = [(px[0][0] + px[1][0]) / 2, (px[0][1] + px[1][1]) / 2];
      const len = Math.hypot(top[0] - center[0], top[1] - center[1]) || 1;
      const rotate: Pt = [
        round(top[0] + ((top[0] - center[0]) / len) * 30),
        round(top[1] + ((top[1] - center[1]) / len) * 30),
      ];
      const widthMm = Math.round(((obj.getScaledWidth() / 7) * 10) as number);
      const heightMm = Math.round(((obj.getScaledHeight() / 7) * 10) as number);
      const next: Frame = { corners: px, center, rotate, label: `${widthMm} × ${heightMm} mm` };

      const key = JSON.stringify([next, faces, three.size.width, three.size.height]);
      if (key === lastKey.current) return;
      lastKey.current = key;
      setFrame(next);
      setFacing(faces);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasSelection, activeView, getThree]);

  if (!hasSelection || !frame) return null;

  if (!facing) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-28 z-20 flex justify-center md:pl-[420px]">
        <button
          type="button"
          onClick={() => useStudio.getState().focusView(activeView)}
          className="pointer-events-auto border border-fg/25 bg-black/70 px-4 py-2 text-[10px] tracking-[0.22em] text-white uppercase backdrop-blur transition hover:border-white/70"
        >
          Volver a la {VIEW_SPECS[activeView].label.toLowerCase()} para mover la pieza
        </button>
      </div>
    );
  }

  const xs = frame.corners.map((p) => p[0]);
  const ys = frame.corners.map((p) => p[1]);
  const bottom = Math.max(...ys);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;

  const begin = (kind: 'scale' | 'rotate') => (e: ReactPointerEvent<HTMLElement>) => {
    const canvas = getCanvas(activeView);
    const obj = canvas?.getActiveObject();
    const host = hostRef.current;
    if (!canvas || !obj || !host) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético: se sigue sin captura */
    }
    const rect = host.getBoundingClientRect();
    const p: Pt = [e.clientX - rect.left, e.clientY - rect.top];
    const center = frame.center;
    gesture.current = {
      kind,
      centerScreen: center,
      startDist: Math.hypot(p[0] - center[0], p[1] - center[1]) || 1,
      startAngle: Math.atan2(p[1] - center[1], p[0] - center[0]),
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle,
      centerPt: obj.getCenterPoint(),
    };
  };

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    const host = hostRef.current;
    const canvas = getCanvas(activeView);
    const obj = canvas?.getActiveObject();
    if (!g || !host || !canvas || !obj) return;
    const rect = host.getBoundingClientRect();
    const p: Pt = [e.clientX - rect.left - g.centerScreen[0], e.clientY - rect.top - g.centerScreen[1]];
    if (g.kind === 'scale') {
      const k = Math.min(20, Math.max(0.03, Math.hypot(p[0], p[1]) / g.startDist));
      obj.set({ scaleX: g.scaleX * k, scaleY: g.scaleY * k });
    } else {
      let angle = g.angle + ((Math.atan2(p[1], p[0]) - g.startAngle) * 180) / Math.PI;
      const snapped = Math.round(angle / 15) * 15;
      if (Math.abs(angle - snapped) < 4) angle = snapped; // imán cada 15°
      obj.rotate(angle);
    }
    obj.setPositionByOrigin(g.centerPt as never, 'center', 'center');
    commitObject(canvas, activeView, obj);
  };

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const act = (fn: (canvas: NonNullable<ReturnType<typeof getCanvas>>) => void) => () => {
    const canvas = getCanvas(activeView);
    if (canvas) fn(canvas);
  };

  const handle = 'pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 border border-black bg-white';

  return (
    <div
      ref={hostRef}
      className={cn('pointer-events-none absolute inset-0 z-20 transition-opacity duration-500', immersive && 'opacity-0')}
    >
      <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <polygon
          points={frame.corners.map((p) => p.join(',')).join(' ')}
          fill="rgba(255,255,255,0.03)"
          stroke="#ffffff"
          strokeWidth={1}
          strokeDasharray="5 4"
          style={{ mixBlendMode: 'difference' }}
        />
        <line
          x1={(frame.corners[0][0] + frame.corners[1][0]) / 2}
          y1={(frame.corners[0][1] + frame.corners[1][1]) / 2}
          x2={frame.rotate[0]}
          y2={frame.rotate[1]}
          stroke="#ffffff"
          strokeWidth={1}
          style={{ mixBlendMode: 'difference' }}
        />
      </svg>

      {frame.corners.map((p, i) => (
        <div
          key={i}
          role="slider"
          aria-label="Cambiar tamaño"
          aria-valuetext={frame.label}
          title="Arrastre para cambiar el tamaño"
          className={cn(handle, 'cursor-nwse-resize')}
          style={{ left: p[0], top: p[1], touchAction: 'none' }}
          onPointerDown={begin('scale')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ))}
      <div
        role="slider"
        aria-label="Girar"
        title="Arrastre para girar (imán cada 15°)"
        className={cn(handle, 'cursor-grab rounded-full')}
        style={{ left: frame.rotate[0], top: frame.rotate[1], touchAction: 'none' }}
        onPointerDown={begin('rotate')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />

      {/* Acciones rápidas bajo la pieza */}
      <div
        className="pointer-events-auto absolute flex -translate-x-1/2 items-stretch border border-white/20 bg-black/80 text-white backdrop-blur"
        style={{ left: midX, top: Math.min(bottom + 22, 9999) }}
      >
        <span className="num flex items-center px-3 text-[10px] text-white/70">{frame.label}</span>
        {(
          [
            ['Centrar', act((c) => centerActive(c, activeView, 'x'))],
            ['Espejo', act((c) => flipActive(c, activeView))],
            ['Duplicar', act((c) => void duplicateActive(c, activeView))],
            ['Quitar', act((c) => removeActive(c, activeView))],
          ] as const
        ).map(([label, onClick]) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="border-l border-white/15 px-3 py-2 text-[9.5px] tracking-[0.18em] uppercase transition hover:bg-white/10"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

