'use client';

import { useState } from 'react';
import { addTextToCanvas } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { FONT_OPTIONS, fontOption, type FontFamily } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';

/** Selector de tipografía de alta gama (cada opción se muestra con su propia fuente). */
export function FontSelect({ value, onChange, id }: { value: string; onChange: (f: FontFamily) => void; id?: string }) {
  const opt = fontOption(value) ?? FONT_OPTIONS[0];
  return (
    <select
      id={id}
      value={opt.family}
      onChange={(e) => onChange(e.target.value as FontFamily)}
      aria-label="Tipografía"
      className="w-full border-b border-line bg-transparent pb-2 text-[13px] text-fg focus:border-fg/60 focus:outline-none [&>option]:bg-black"
      style={{ fontFamily: opt.stack, fontWeight: opt.weight }}
    >
      {FONT_OPTIONS.map((f) => (
        <option key={f.family} value={f.family} style={{ fontFamily: f.stack, fontWeight: f.weight }}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/** Pestaña Texto: compone un fabric.IText con tracking de pasarela en la cara activa. */
export function TextPanel() {
  const [text, setText] = useState('MAISON');
  const [font, setFont] = useState<FontFamily>('Bodoni Moda');
  const [busy, setBusy] = useState(false);
  const activeView = useStudio((s) => s.activeView);
  const opt = fontOption(font) ?? FONT_OPTIONS[0];

  async function add() {
    const canvas = getCanvas(activeView);
    if (!canvas || !text.trim()) return;
    setBusy(true);
    try {
      await addTextToCanvas(canvas, activeView, { text, fontFamily: font });
      useStudio.getState().setSidebarTab('element');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Composición tipográfica" index="01">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="block space-y-2">
          <span className="label-tech">Texto</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={60}
            placeholder="Escriba el texto"
            className="w-full border-b border-line bg-transparent pb-2 text-[13px] font-light tracking-[0.08em] text-fg placeholder:text-muted/60 focus:border-fg/60 focus:outline-none"
          />
        </label>
        <label className="block space-y-2">
          <span className="label-tech">Tipografía</span>
          <FontSelect value={font} onChange={setFont} />
        </label>

        <div className="grid min-h-28 place-items-center overflow-hidden border border-line bg-black px-4 py-6">
          <p
            className="max-w-full truncate text-center text-[28px] text-fg uppercase"
            style={{ fontFamily: opt.stack, fontWeight: opt.weight, letterSpacing: '0.26em' }}
          >
            {text || 'Texto'}
          </p>
        </div>
        {opt.fallback && (
          <p className="text-[10.5px] font-light text-muted">
            {opt.family} es una fuente de sistema: donde no esté instalada se previsualiza con {opt.fallback}.
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full py-3.5" disabled={busy || !text.trim()}>
          {busy ? 'Componiendo…' : `Aplicar en la ${activeView === 'front' ? 'delantera' : 'espalda'}`}
        </Button>
        <p className="font-editorial text-[13px] leading-snug font-light text-muted italic">
          Doble clic sobre el texto en el lienzo para corregirlo letra a letra. Técnica, color y calibres en «Pieza».
        </p>
      </form>
    </Section>
  );
}
