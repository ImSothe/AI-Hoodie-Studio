'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { contrastRatio, normalizeHex } from '@/lib/color';
import { restoreActiveColors, scheduleTintActive } from '@/lib/fabric/styleActions';
import {
  AGLET_LENGTHS_MM,
  CORD_TYPES,
  EYELET_DIAMETERS_MM,
  FABRIC_COMPOSITIONS,
  FABRIC_CONSTRUCTIONS,
  FABRIC_FINISHES,
  FABRIC_WEIGHTS,
  METAL_FINISHES,
  TONAL_TECHNIQUE,
  type MetalFinish,
} from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Section } from '../ui/Section';

/** Carta de tejidos: neutros minerales de colección. */
const GARMENT_SWATCHES = [
  { hex: '#0B0B0B', name: 'Noir' },
  { hex: '#232323', name: 'Graphite' },
  { hex: '#3D3C3A', name: 'Mineral' },
  { hex: '#6F6B64', name: 'Pierre' },
  { hex: '#B9B2A6', name: 'Grège' },
  { hex: '#E6E0D4', name: 'Écru' },
  { hex: '#141A24', name: 'Marine' },
  { hex: '#34141A', name: 'Bordeaux' },
];

/** Carta de tintas e hilos. */
const INK_SWATCHES = [
  { hex: '#FFFFFF', name: 'Blanc' },
  { hex: '#EDE8DF', name: 'Écru' },
  { hex: '#BFC1C2', name: 'Argent' },
  { hex: '#8E8A83', name: 'Pierre' },
  { hex: '#3A3A3A', name: 'Graphite' },
  { hex: '#0A0A0A', name: 'Noir' },
  { hex: '#5A1622', name: 'Bordeaux' },
  { hex: '#B5A27A', name: 'Or pâle' },
];

/** Picker HEX con carta de muestras y campo de texto. */
export function ColorField({
  label,
  color,
  swatches,
  onChange,
  disabled,
}: {
  label: string;
  color: string;
  swatches: { hex: string; name: string }[];
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const current = swatches.find((s) => s.hex === color.toUpperCase());
  return (
    <div className={cn('space-y-4', disabled && 'pointer-events-none opacity-30')} aria-disabled={disabled}>
      <div className="grid grid-cols-8 gap-1.5" role="group" aria-label={`${label}: muestras`}>
        {swatches.map((s) => (
          <button
            key={s.hex}
            type="button"
            title={`${s.name} · ${s.hex}`}
            aria-label={`${s.name} ${s.hex}`}
            aria-pressed={color.toUpperCase() === s.hex}
            onClick={() => onChange(s.hex)}
            className={cn(
              'aspect-square ring-1 ring-white/10 transition duration-300 hover:ring-white/40',
              color.toUpperCase() === s.hex && 'ring-fg ring-offset-2 ring-offset-black',
            )}
            style={{ background: s.hex }}
          />
        ))}
      </div>
      <HexColorPicker color={color} onChange={(c) => onChange(c.toUpperCase())} className="color-picker" />
      <div className="flex items-center gap-3 border-b border-line pb-2">
        <span className="size-5 shrink-0 ring-1 ring-white/15" style={{ background: color }} />
        <span className="label-tech">{current?.name ?? 'HEX'}</span>
        <HexColorInput
          color={color}
          onChange={(c) => {
            const hex = normalizeHex(c);
            if (hex) onChange(hex);
          }}
          prefixed
          aria-label={`${label} en hexadecimal`}
          className="num ml-auto w-24 bg-transparent text-right text-[12px] text-fg uppercase focus:outline-none"
        />
      </div>
    </div>
  );
}

/** Desplegable de ficha técnica: rótulo a la izquierda, valor a la derecha, filete fino. */
export function SpecSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <label className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2.5">
      <span className="label-tech shrink-0">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange((typeof value === 'number' ? Number(raw) : raw) as T);
        }}
        className="min-w-0 truncate bg-transparent text-right text-[11.5px] font-light text-fg focus:outline-none [&>option]:bg-black"
      >
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetalPicker({ value, onChange, label }: { value: MetalFinish; onChange: (v: MetalFinish) => void; label: string }) {
  return (
    <div className="border-b border-line/70 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="label-tech">{label}</span>
        <span className="text-[11.5px] font-light text-fg">{METAL_FINISHES.find((m) => m.id === value)?.label}</span>
      </div>
      <div className="mt-2.5 flex gap-2" role="radiogroup" aria-label={label}>
        {METAL_FINISHES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={value === m.id}
            aria-label={m.label}
            title={m.label}
            onClick={() => onChange(m.id)}
            className={cn(
              'size-5 rounded-full ring-1 ring-white/15 transition',
              value === m.id && 'ring-fg ring-offset-2 ring-offset-black',
            )}
            style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, ${m.hex} 55%, #000 120%)` }}
          />
        ))}
      </div>
    </div>
  );
}

function MmInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2.5">
      <span className="label-tech">{label}</span>
      <span className="flex items-baseline gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= min && v <= max) onChange(v);
          }}
          className="num w-14 bg-transparent text-right text-[11px] text-fg focus:outline-none"
        />
        <Unit>mm</Unit>
      </span>
    </label>
  );
}

function Unit({ children }: { children: ReactNode }) {
  return <span className="num text-[10px] text-muted">{children}</span>;
}

/** Pestaña Prenda: color del tejido, ficha de tejido y fornituras. */
export function GarmentPanel() {
  const garmentColor = useStudio((s) => s.garmentColor);
  const setGarmentColor = useStudio((s) => s.setGarmentColor);
  const fabric = useStudio((s) => s.fabric);
  const setFabric = useStudio((s) => s.setFabric);
  const hw = useStudio((s) => s.hardware);
  const setHardware = useStudio((s) => s.setHardware);

  return (
    <>
      <Section title="Color del tejido" index="01">
        <ColorField label="Color de la prenda" color={garmentColor} swatches={GARMENT_SWATCHES} onChange={setGarmentColor} />
      </Section>

      <Section title="Tejido" index="02">
        <SpecSelect label="Construcción" value={fabric.construction} options={FABRIC_CONSTRUCTIONS} onChange={(v) => setFabric({ construction: v })} />
        <SpecSelect
          label="Gramaje"
          value={fabric.weightGsm}
          options={FABRIC_WEIGHTS}
          onChange={(v) => setFabric({ weightGsm: v })}
          format={(v) => `${v} g/m²`}
        />
        <SpecSelect label="Composición" value={fabric.composition} options={FABRIC_COMPOSITIONS} onChange={(v) => setFabric({ composition: v })} />
        <SpecSelect label="Acabado" value={fabric.finish} options={FABRIC_FINISHES} onChange={(v) => setFabric({ finish: v })} />
      </Section>

      <Section title="Fornituras" index="03">
        <MetalPicker label="Ojales" value={hw.eyeletFinish} onChange={(v) => setHardware({ eyeletFinish: v })} />
        <SpecSelect
          label="Ø ojal"
          value={hw.eyeletDiameterMm}
          options={EYELET_DIAMETERS_MM}
          onChange={(v) => setHardware({ eyeletDiameterMm: v })}
          format={(v) => `${v} mm`}
        />
        <MmInput label="Entre centros" value={hw.eyeletSpacingMm} min={30} max={120} onChange={(v) => setHardware({ eyeletSpacingMm: v })} />
        <MmInput label="Bajo HPS" value={hw.eyeletDropMm} min={20} max={200} onChange={(v) => setHardware({ eyeletDropMm: v })} />
        <MetalPicker label="Herretes" value={hw.agletFinish} onChange={(v) => setHardware({ agletFinish: v })} />
        <SpecSelect
          label="Largo herrete"
          value={hw.agletLengthMm}
          options={AGLET_LENGTHS_MM}
          onChange={(v) => setHardware({ agletLengthMm: v })}
          format={(v) => `${v} mm`}
        />
        <SpecSelect label="Cordón" value={hw.cordType} options={CORD_TYPES} onChange={(v) => setHardware({ cordType: v })} />
        <div className="flex items-center justify-between gap-4 border-b border-line/70 py-2.5">
          <span className="label-tech">Color cordón</span>
          <span className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHardware({ cordTonal: true })}
              className={cn('text-[10px] tracking-[0.18em] uppercase', hw.cordTonal ? 'text-fg' : 'text-muted hover:text-fg')}
            >
              Tono sobre tono
            </button>
            <span className="h-3 w-px bg-line" />
            <label className={cn('flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase', !hw.cordTonal ? 'text-fg' : 'text-muted')}>
              <input
                type="color"
                value={hw.cordHex}
                onChange={(e) => setHardware({ cordTonal: false, cordHex: e.target.value.toUpperCase() })}
                className="size-4 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Color de contraste del cordón"
              />
              Contraste
            </label>
          </span>
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-[10.5px] font-light text-muted">
          <input type="checkbox" checked={hw.show3d} onChange={(e) => setHardware({ show3d: e.target.checked })} />
          Mostrar ojales en el visor 3D
        </label>
      </Section>
    </>
  );
}

/** Color de tinta / hilo del elemento seleccionado (SVG, PNG o texto). */
export function ElementInkPanel() {
  const garmentColor = useStudio((s) => s.garmentColor);
  const style = useStudio((s) => s.selectionStyle);

  // El color se aplica en el siguiente frame: mientras se arrastra el picker
  // manda el estado local para que no "salte" hacia atrás.
  const storeInk = style?.inkColor ?? '#FFFFFF';
  const [ink, setInk] = useState(storeInk);
  const interacting = useRef(false);
  useEffect(() => {
    if (!interacting.current) setInk(storeInk);
  }, [storeInk, style]);

  if (!style) return null;

  if (style.technique === TONAL_TECHNIQUE) {
    return (
      <Section title="Hilo">
        <div className="flex items-center gap-3">
          <span className="size-5 ring-1 ring-white/15" style={{ background: style.inkColor ?? garmentColor }} />
          <span className="num text-[12px] text-fg">{style.inkColor}</span>
          <span className="ml-auto font-editorial text-[13px] font-light text-muted italic">sigue al tejido</span>
        </div>
      </Section>
    );
  }

  const changeInk = (hex: string) => {
    setInk(hex);
    scheduleTintActive(hex);
  };
  const lowContrast = contrastRatio(ink, garmentColor) < 1.6;
  const label = style.technique === 'Bordado Alto Relieve' ? 'Hilo' : 'Tinta';

  return (
    <Section title={label}>
      {style.mixedInk && (
        <p className="mb-4 text-[10.5px] font-light text-muted">{style.count} piezas con colores distintos: se aplicará a todas.</p>
      )}
      <div
        onPointerDown={() => (interacting.current = true)}
        onPointerUp={() => (interacting.current = false)}
        onPointerLeave={() => (interacting.current = false)}
      >
        <ColorField label="Color del elemento" color={ink} swatches={INK_SWATCHES} onChange={changeInk} />
      </div>
      {lowContrast && (
        <p className="mt-3 font-editorial text-[13px] font-light text-muted italic">
          Contraste mínimo con el tejido: valore la técnica ton-sur-ton.
        </p>
      )}
      {style.tinted && (
        <button type="button" onClick={restoreActiveColors} className="mt-3 text-[10px] tracking-[0.18em] text-muted uppercase hover:text-fg">
          Colores originales
        </button>
      )}
    </Section>
  );
}
