'use client';

import { useEffect, useState } from 'react';
import { selectElement, updateActiveText, type ElementKind } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { setActiveTechnique, setActiveTonal } from '@/lib/fabric/styleActions';
import { colorBreakdown, colorReference } from '@/lib/hoodie/references';
import {
  TECHNIQUE_INFO,
  TECHNIQUES,
  THREAD_FINISHES,
  TONAL_SHIFTS,
  TONAL_TECHNIQUE,
  type FontFamily,
  type Technique,
} from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Segmented } from '../ui/Button';
import { Section, SpecRow } from '../ui/Section';
import { ElementInkPanel } from './ColorPanel';
import { ActionsBar, LooksPanel, PartsSection } from './EffectsPanels';
import { SelectionPanel } from './SelectionPanel';
import { FontSelect } from './TextPanel';

const KIND_LABEL: Record<ElementKind | 'mixed', string> = {
  svg: 'Gráfico vectorial',
  png: 'Gráfico raster',
  text: 'Tipografía',
  mixed: 'Selección múltiple',
};

/** Nombres y explicación en lenguaje llano (el código de taller va en la ficha). */
const PLAIN: Record<Technique, { name: string; note: string }> = {
  'Serigrafía Plana': { name: 'Estampado', note: 'Tinta plana y mate. El acabado más versátil.' },
  'Tinta Reflectante D3O/3M': { name: 'Reflectante', note: 'Refleja la luz del flash: brilla en las fotos.' },
  'Bordado Alto Relieve': { name: 'Bordado en relieve', note: 'Hilo cosido con volumen que se nota al tacto.' },
  'Bordado Ton-sur-Ton (Tono sobre Tono)': { name: 'Tono sobre tono', note: 'Bordado del color de la prenda: sólo se ve con la luz.' },
};

/** Selector de técnica: se guarda como custom data `tecnica` en el objeto de Fabric. */
function TechniquePicker({ value }: { value: Technique | null }) {
  return (
    <div role="radiogroup" aria-label="Técnica de aplicación">
      {TECHNIQUES.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setActiveTechnique(t)}
            className="group flex w-full items-baseline gap-4 border-b border-line/70 py-3 text-left last:border-b-0"
          >
            <span className={cn('num w-8 shrink-0 text-[10px]', active ? 'text-fg' : 'text-muted')}>
              {TECHNIQUE_INFO[t].code}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-[11.5px] font-light tracking-[0.04em] transition',
                  active ? 'text-fg' : 'text-muted group-hover:text-fg',
                )}
              >
                {PLAIN[t].name}
              </span>
              {active && (
                <span className="mt-1 block font-editorial text-[13px] leading-snug font-light text-muted italic">
                  {PLAIN[t].note}
                </span>
              )}
            </span>
            <span className={cn('size-1.5 shrink-0 rounded-full', active ? 'bg-fg' : 'bg-transparent')} />
          </button>
        );
      })}
    </div>
  );
}

/** Opciones del bordado ton-sur-ton: matiz respecto al tejido y acabado del hilo. */
function TonalOptions() {
  const style = useStudio((s) => s.selectionStyle);
  if (!style || style.technique !== TONAL_TECHNIQUE) return null;
  return (
    <Section title="Ton-sur-ton">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="label-tech">Matiz</span>
          <Segmented
            label="Matiz del hilo"
            value={style.tonoShift ?? 'exact'}
            onChange={(v) => setActiveTonal({ tonoShift: v })}
            options={TONAL_SHIFTS.map((s) => ({ value: s.id, label: s.label }))}
          />
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="label-tech">Hilo</span>
          <Segmented
            label="Acabado del hilo"
            value={style.hiloAcabado ?? 'satin'}
            onChange={(v) => setActiveTonal({ hiloAcabado: v })}
            options={THREAD_FINISHES.map((f) => ({ value: f.id, label: f.label }))}
          />
        </div>
        <p className="font-editorial text-[13px] leading-snug font-light text-muted italic">
          {THREAD_FINISHES.find((f) => f.id === (style.hiloAcabado ?? 'satin'))?.detail}: el motivo apenas se percibe
          hasta que la luz incide directamente. Gire la prenda en el visor para comprobarlo.
        </p>
      </div>
    </Section>
  );
}

/** Edición del texto seleccionado (contenido y tipografía). */
function TextFields({ text, fontFamily }: { text: string; fontFamily: string }) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const apply = (patch: { text?: string; fontFamily?: FontFamily }) => {
    const { activeView } = useStudio.getState();
    const canvas = getCanvas(activeView);
    if (canvas) void updateActiveText(canvas, activeView, patch);
  };
  return (
    <Section title="Tipografía">
      <div className="space-y-3">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) apply({ text: e.target.value });
          }}
          maxLength={60}
          aria-label="Contenido del texto"
          className="w-full border-b border-line bg-transparent pb-2 text-[13px] font-light tracking-[0.08em] text-fg focus:border-fg/60 focus:outline-none"
        />
        <FontSelect value={fontFamily} onChange={(f) => apply({ fontFamily: f })} />
      </div>
    </Section>
  );
}

/** Lista de piezas de la cara activa (cuando no hay nada seleccionado). */
function ElementList() {
  const elements = useStudio((s) => s.elements);
  const activeView = useStudio((s) => s.activeView);
  if (!elements.length) {
    return (
      <Section title="Piezas" index="01">
        <p className="font-editorial text-[14px] leading-relaxed font-light text-muted italic">
          Aún no hay piezas en esta cara. Añádalas en el paso 1 · Diseño.
        </p>
      </Section>
    );
  }
  return (
    <Section title={`Piezas · ${elements.length}`} index="01">
      <ol>
        {[...elements].reverse().map((el) => (
          <li key={el.index}>
            <button
              type="button"
              onClick={() => {
                const canvas = getCanvas(activeView);
                if (canvas) selectElement(canvas, activeView, el.index);
              }}
              className="group flex w-full items-baseline gap-4 border-b border-line/70 py-3 text-left"
            >
              <span className="num w-9 shrink-0 text-[10px] text-muted">{el.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-light text-fg/90 group-hover:text-fg">{el.name}</span>
                <span className="num mt-0.5 block text-[10px] text-muted">
                  {Math.round(el.widthCm * 10)} × {Math.round(el.heightCm * 10)} mm · {TECHNIQUE_INFO[el.technique].code}
                </span>
              </span>
              <span
                className="size-3 shrink-0 ring-1 ring-white/20"
                style={{ background: el.hex ?? 'linear-gradient(135deg,#888,#222)' }}
                title={el.hex ?? 'Colores originales'}
              />
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[10.5px] font-light text-muted">Toque una pieza para ajustarla, o pulse sobre ella en la prenda.</p>
    </Section>
  );
}

/** Inspector de pieza con formato de ficha técnica de autor. */
export function ElementPanel() {
  const style = useStudio((s) => s.selectionStyle);
  if (!style) {
    return (
      <>
        <ActionsBar />
        <ElementList />
      </>
    );
  }
  const technique = style.technique;

  return (
    <>
      <div className="border-b border-line px-(--pad-x) pt-(--pad-y) pb-4">
        <div className="flex items-baseline justify-between">
          <span className="num text-[11px] text-muted">{style.code}</span>
          <span className="label-tech">{KIND_LABEL[style.kind]}</span>
        </div>
        <p className="mt-3 truncate font-serif text-2xl font-normal tracking-[0.06em] text-fg">{style.name}</p>
        {technique && (
          <details className="group mt-3">
            <summary className="label-tech flex cursor-pointer list-none items-center justify-between py-1 transition hover:text-fg [&::-webkit-details-marker]:hidden">
              Ficha técnica
              <span className="num text-[10px] text-muted">
                {TECHNIQUE_INFO[technique].code}
                {style.inkColor ? ` · ${style.inkColor.toUpperCase()}` : ''}
              </span>
            </summary>
            <div className="mt-2">
            <SpecRow label="Técnica">{TECHNIQUE_INFO[technique].code}</SpecRow>
            {style.inkColor && (
              <>
                <SpecRow label="Ref. color">{colorReference(technique, style.inkColor, style.hiloAcabado)}</SpecRow>
                <SpecRow label="RGB">{colorBreakdown(style.inkColor).rgb}</SpecRow>
                <SpecRow label="CMYK aprox.">{colorBreakdown(style.inkColor).cmyk}</SpecRow>
              </>
            )}
            {style.fontFamily && <SpecRow label="Fuente">{style.fontFamily}</SpecRow>}
            </div>
          </details>
        )}
      </div>
      <ActionsBar />
      <Section title="Acabado">
        <TechniquePicker value={technique} />
      </Section>
      <TonalOptions />
      {style.kind === 'text' && style.text !== null && style.fontFamily && (
        <TextFields text={style.text} fontFamily={style.fontFamily} />
      )}
      <ElementInkPanel />
      <SelectionPanel />
      <PartsSection />
      <LooksPanel />
    </>
  );
}
