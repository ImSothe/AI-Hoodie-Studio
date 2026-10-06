'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCalibration } from '@/lib/three/calibration';
import { Button, Segmented } from '../ui/Button';

const ROTATIONS = [0, 90, 180, 270] as const;

/** Ajustes del GLB: orientación, altura y escala del estampado (independientes de las UVs). */
export function CalibrationPanel() {
  const [open, setOpen] = useState(false);
  const { rotationY, offsetYCm, scale, debug, set, reset } = useCalibration();

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="border border-fg/20 px-3 py-2 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:border-fg/60"
      >
        Calibrar
      </button>
      {open && (
        <div className="glass absolute top-full right-0 z-30 mt-2 w-80 space-y-5 border border-line p-5 text-[11px] font-light">
          <div className="flex items-center justify-between">
            <p className="label-tech text-fg">Calibración del modelo</p>
            <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="text-muted hover:text-fg">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-1.5">
            <p className="text-fg">Orientación del modelo</p>
            <Segmented<string>
              label="Rotación del modelo"
              value={String(rotationY)}
              onChange={(v) => set({ rotationY: Number(v) as (typeof ROTATIONS)[number] })}
              options={ROTATIONS.map((r) => ({ value: String(r), label: `${r}°` }))}
            />
            <p className="text-[10px] text-muted">Gira hasta que el pecho mire a la cámara en «Frente».</p>
          </div>

          <label className="block space-y-1.5">
            <span className="flex justify-between text-fg">
              Altura del estampado <span className="font-mono tabular-nums">{offsetYCm > 0 ? '+' : ''}{offsetYCm} cm</span>
            </span>
            <input
              type="range"
              min={-20}
              max={20}
              step={0.5}
              value={offsetYCm}
              onChange={(e) => set({ offsetYCm: Number(e.target.value) })}
              className="w-full"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="flex justify-between text-fg">
              Escala del estampado <span className="font-mono tabular-nums">{Math.round(scale * 100)} %</span>
            </span>
            <input
              type="range"
              min={60}
              max={150}
              step={1}
              value={Math.round(scale * 100)}
              onChange={(e) => set({ scale: Number(e.target.value) / 100 })}
              className="w-full"
            />
            <span className="block text-[10px] text-muted">100 % = prenda de 66 cm de pecho, como el lienzo 2D.</span>
          </label>

          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={debug} onChange={(e) => set({ debug: e.target.checked })} className="accent-ivory" />
            Mostrar caja de proyección
          </label>

          <Button className="w-full" onClick={reset}>
            Restablecer
          </Button>
        </div>
      )}
    </div>
  );
}
