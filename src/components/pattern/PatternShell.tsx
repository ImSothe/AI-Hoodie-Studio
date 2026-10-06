'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { PatternAnalysis } from '@/lib/pattern/analysis';
import type { PatternMode } from '@/lib/pattern/layout';
import { cn } from '@/lib/utils';
import { PatternEditor } from './PatternEditor';
import { PatternViewer, type PatternPose } from './PatternViewer';

const GARMENT_COLORS = ['#161618', '#0A0A0A', '#3A3A3A', '#8E8A83', '#EDE8DF', '#5A1622'];
const POSES: { id: PatternPose; label: string }[] = [
  { id: 'espalda', label: 'Espalda' },
  { id: 'frente', label: 'Frente' },
  { id: 'izquierda', label: 'Lado izq.' },
  { id: 'derecha', label: 'Lado der.' },
  { id: 'capucha', label: 'Capucha' },
];
const MODES: { id: PatternMode; label: string; hint: string }[] = [
  { id: 'joined', label: 'Todo unido', hint: 'Las piezas cosidas entre sí: un dibujo pasa de la espalda a las mangas y a la capucha.' },
  { id: 'pieces', label: 'Piezas sueltas', hint: 'Cada pieza de tela por separado, como en el taller.' },
];

/** Estampado continuo por patrón: el diseño se coloca sobre las piezas planas y se ve cosido en 3D. */
export function PatternShell() {
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null);
  const [mode, setMode] = useState<PatternMode>('joined');
  const [garmentColor, setGarmentColor] = useState(GARMENT_COLORS[0]);
  const [pose, setPose] = useState<{ name: PatternPose; n: number }>({ name: 'espalda', n: 0 });
  const onAnalysis = useCallback((a: PatternAnalysis) => setAnalysis(a), []);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-black text-fg">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-3">
        <h1 className="text-[11px] font-normal tracking-[0.42em] whitespace-nowrap uppercase">AI Hoodie Studio · Patrón</h1>
        <div role="tablist" aria-label="Tipo de patrón" className="flex">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              title={m.hint}
              onClick={() => setMode(m.id)}
              className={cn(
                'border-b px-4 py-1.5 text-[10px] tracking-[0.22em] uppercase transition',
                mode === m.id ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="hidden font-editorial text-[15px] font-light text-muted italic lg:block">
          {MODES.find((m) => m.id === mode)?.hint}
        </p>
        <Link href="/" className="ml-auto border-b border-muted pb-0.5 text-[9px] tracking-[0.22em] text-muted uppercase hover:text-fg">
          Volver al atelier
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-h-0 border-r border-line">
          <PatternEditor analysis={analysis} mode={mode} />
        </div>

        <section className="relative min-h-0 bg-[#151515]">
          <div className="absolute inset-0">
            <PatternViewer garmentColor={garmentColor} mode={mode} onAnalysis={onAnalysis} pose={pose} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-wrap justify-center gap-2 px-3">
            {POSES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPose((s) => ({ name: p.id, n: s.n + 1 }))}
                className="pointer-events-auto border border-fg/20 bg-black/60 px-3 py-1.5 text-[9.5px] tracking-[0.2em] uppercase backdrop-blur hover:border-fg/60"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2">
            <span className="label-tech">Tejido</span>
            {GARMENT_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Color de la prenda ${hex}`}
                onClick={() => setGarmentColor(hex)}
                className={cn('pointer-events-auto size-5 border', hex === garmentColor ? 'border-white' : 'border-white/25')}
                style={{ background: hex }}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
