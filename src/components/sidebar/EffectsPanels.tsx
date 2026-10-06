'use client';

import { useState } from 'react';
import { HexColorInput } from 'react-colorful';
import { normalizeHex } from '@/lib/color';
import { applyLookActive, scheduleGradientActive } from '@/lib/fabric/effects';
import { LOOKS } from '@/lib/hoodie/looks';
import type { GradientSpec } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';

/** Muestras para los dos extremos del degradado. */
const STOPS = ['#FFFFFF', '#EDE8DF', '#BFC1C2', '#8E8A83', '#C8A24A', '#FF5F6D', '#FF2A00', '#FFB000', '#00F5A0', '#00B8FF', '#7C5CFF', '#0A0A0A'];

export const gradientCss = (g: GradientSpec) => `linear-gradient(${g.angle + 90}deg, ${g.from}, ${g.to})`;

/** Estilos de un clic: técnica + color o degradado en un solo toque. */
export function LooksPanel() {
  const style = useStudio((s) => s.selectionStyle);
  const garment = useStudio((s) => s.garmentColor);
  if (!style) return null;
  return (
    <Section title="Estilos rápidos">
      <p className="mb-4 font-editorial text-[13.5px] leading-snug font-light text-muted italic">
        Un toque y la pieza queda como una prenda de marca. Después puede ajustar cada cosa.
      </p>
      <div className="grid grid-cols-3 gap-px bg-line">
        {LOOKS.map((look) => (
          <button
            key={look.id}
            type="button"
            title={look.hint}
            onClick={() => void applyLookActive(look)}
            className="group bg-black p-2 text-left transition hover:bg-white/5"
          >
            <span
              className="mb-2 block h-7 ring-1 ring-white/15"
              style={{ background: look.gradient ? gradientCss(look.gradient) : (look.ink ?? garment) }}
            />
            <span className="block text-[10px] leading-tight tracking-[0.1em] text-fg uppercase">{look.label}</span>
            <span className="mt-0.5 block text-[9.5px] leading-tight font-light text-muted">{look.hint}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function StopRow({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="label-tech w-14 shrink-0">{label}</span>
        <span className="size-5 shrink-0 ring-1 ring-white/20" style={{ background: value }} />
        <HexColorInput
          color={value}
          onChange={(c) => {
            const hex = normalizeHex(c);
            if (hex) onChange(hex);
          }}
          prefixed
          aria-label={`${label} en hexadecimal`}
          className="num ml-auto w-24 border-b border-line bg-transparent text-right text-[12px] text-fg uppercase focus:border-fg/60 focus:outline-none"
        />
      </div>
      <div className="mt-2 grid grid-cols-12 gap-1" role="group" aria-label={`${label}: muestras`}>
        {STOPS.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            onClick={() => onChange(hex)}
            className={cn('aspect-square ring-1 ring-white/10 transition hover:ring-white/50', value.toUpperCase() === hex && 'ring-fg')}
            style={{ background: hex }}
          />
        ))}
      </div>
    </div>
  );
}

/** Editor de degradado de dos colores con ángulo. Se aplica en vivo a la pieza. */
export function GradientEditor({ initial }: { initial: GradientSpec }) {
  const [spec, setSpec] = useState(initial);
  const change = (patch: Partial<GradientSpec>) => {
    const next = { ...spec, ...patch };
    setSpec(next);
    scheduleGradientActive(next);
  };
  return (
    <div className="space-y-5">
      <div className="h-8 ring-1 ring-white/15" style={{ background: gradientCss(spec) }} aria-hidden />
      <StopRow label="Desde" value={spec.from} onChange={(from) => change({ from })} />
      <StopRow label="Hasta" value={spec.to} onChange={(to) => change({ to })} />
      <label className="block">
        <span className="flex items-baseline justify-between">
          <span className="label-tech">Dirección</span>
          <span className="num text-[11px] text-fg">{spec.angle}°</span>
        </span>
        <input
          type="range"
          min={0}
          max={360}
          step={5}
          value={spec.angle}
          onChange={(e) => change({ angle: Number(e.target.value) })}
          className="mt-2 w-full"
        />
        <span className="mt-1 flex justify-between text-[9.5px] font-light text-muted">
          <span>→ derecha</span>
          <span>↓ abajo</span>
          <span>← izquierda</span>
          <span>↑ arriba</span>
        </span>
      </label>
    </div>
  );
}

/** Separar una zona de la pieza (las alas de un dragón, un adorno…) para tratarla aparte. */
export function PartsSection() {
  const style = useStudio((s) => s.selectionStyle);
  if (!style || style.count !== 1) return null;
  return (
    <Section title="Partes">
      <p className="font-editorial text-[13.5px] leading-snug font-light text-muted italic">
        ¿Quiere las alas reflectantes y el cuerpo bordado? Separe esa zona: tendrá su propio color, degradado y acabado.
      </p>
      <Button className="mt-4 w-full" onClick={() => useStudio.getState().setPartsEditorOpen(true)}>
        Separar una parte…
      </Button>
    </Section>
  );
}
