'use client';

import { useState } from 'react';
import { HexColorInput } from 'react-colorful';
import { normalizeHex } from '@/lib/color';
import { duplicateActive } from '@/lib/fabric/editor';
import { applyLookActive, scheduleGradientActive } from '@/lib/fabric/effects';
import { redo, undo } from '@/lib/fabric/history';
import { getCanvas } from '@/lib/fabric/registry';
import { LOOKS } from '@/lib/hoodie/looks';
import type { GradientSpec } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';

/** Muestras para los dos extremos del degradado. */
const STOPS = ['#FFFFFF', '#EDE8DF', '#BFC1C2', '#8E8A83', '#C8A24A', '#FF5F6D', '#FF2A00', '#FFB000', '#00F5A0', '#00B8FF', '#7C5CFF', '#0A0A0A'];

export const gradientCss = (g: GradientSpec) => `linear-gradient(${g.angle + 90}deg, ${g.from}, ${g.to})`;

/** Deshacer y rehacer, duplicar y dividir la pieza: lo que se necesita siempre a mano. */
export function ActionsBar() {
  const view = useStudio((s) => s.activeView);
  const flags = useStudio((s) => s.history[view]);
  const style = useStudio((s) => s.selectionStyle);
  const single = style?.count === 1;
  const cell = 'bg-black px-2 py-3 text-[10px] tracking-[0.16em] text-fg uppercase transition hover:bg-white/5 disabled:opacity-25 disabled:hover:bg-black';
  return (
    <section className="border-b border-line px-(--pad-x) py-4">
      <div className="grid grid-cols-2 gap-px bg-line">
        <button type="button" className={cell} disabled={!flags.undo} onClick={() => undo(view)} title="Revierte el último cambio (Ctrl+Z)">
          ↶ Deshacer
        </button>
        <button type="button" className={cell} disabled={!flags.redo} onClick={() => redo(view)} title="Vuelve a aplicar lo deshecho (Ctrl+Y)">
          Rehacer ↷
        </button>
      </div>
      {style && (
        <div className="mt-px grid grid-cols-3 gap-px bg-line">
          <button
            type="button"
            className={cell}
            title="Copia la pieza para recortarla o darle otro acabado"
            onClick={() => {
              const canvas = getCanvas(view);
              if (canvas) void duplicateActive(canvas, view);
            }}
          >
            Duplicar
          </button>
          <button
            type="button"
            className={cell}
            disabled={!single}
            title="Deja sólo un rectángulo de la pieza"
            onClick={() => useStudio.getState().setCropEditorOpen(true)}
          >
            Recortar
          </button>
          <button
            type="button"
            className={cell}
            disabled={!single}
            title="Separa zonas con pincel para darles otro color o acabado"
            onClick={() => useStudio.getState().setPartsEditorOpen(true)}
          >
            Partes
          </button>
        </div>
      )}
    </section>
  );
}

/** Estilos de un clic: técnica + color o degradado en un solo toque. */
export function LooksPanel() {
  const style = useStudio((s) => s.selectionStyle);
  const garment = useStudio((s) => s.garmentColor);
  if (!style) return null;
  return (
    <Section title="Atajos de estilo (opcional)">
      <p className="mb-4 font-editorial text-[13.5px] leading-snug font-light text-muted italic">
        Si no quiere ajustar a mano, un toque deja la pieza con un acabado de marca. Después puede cambiar cualquier cosa más arriba.
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

/** Dividir una pieza: recortar un rectángulo o separar zonas con pincel. */
export function PartsSection() {
  const style = useStudio((s) => s.selectionStyle);
  if (!style || style.count !== 1) return null;
  return (
    <Section title="Dividir la pieza">
      <p className="font-editorial text-[13.5px] leading-snug font-light text-muted italic">
        ¿Texto arriba y dibujo abajo? Duplique la pieza y recorte cada copia. ¿Las alas de un dragón con otro acabado? Sepárelas con el pincel.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-px bg-line">
        <Button className="border-0 bg-black" onClick={() => useStudio.getState().setCropEditorOpen(true)}>
          Recortar
        </Button>
        <Button className="border-0 bg-black" onClick={() => useStudio.getState().setPartsEditorOpen(true)}>
          Partes
        </Button>
      </div>
    </Section>
  );
}
