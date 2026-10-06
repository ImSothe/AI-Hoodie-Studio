'use client';

import { useRef, useState } from 'react';
import { placeFiles } from '@/lib/assets/placeFiles';
import { TEMPLATES, templateAsset } from '@/lib/assets/templates';
import { addAssetToCanvas } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { VIEW_SPECS } from '@/lib/hoodie/spec';
import { useStudio, type DesignMode } from '@/lib/store';
import { cn } from '@/lib/utils';
import { AssetGallery } from './AssetGallery';
import { GeneratePanel } from './GeneratePanel';
import { SettingsPanel } from './SettingsPanel';
import { TextPanel } from './TextPanel';

const MODES: { id: DesignMode; label: string; hint: string }[] = [
  { id: 'images', label: 'Subir imagen', hint: 'PNG, SVG o JPG' },
  { id: 'templates', label: 'Plantillas', hint: 'Motivos listos' },
  { id: 'text', label: 'Texto', hint: 'Tipografías gruesas y finas' },
  { id: 'ai', label: 'Crear con IA', hint: 'Genera un motivo' },
];

/** Plantillas de la casa: un toque y el motivo queda colocado en la prenda. */
function Templates() {
  const activeView = useStudio((s) => s.activeView);
  const place = async (id: string) => {
    const canvas = getCanvas(activeView);
    const asset = templateAsset(id);
    if (!canvas || !asset) return;
    await addAssetToCanvas(canvas, activeView, asset);
    useStudio.getState().setSidebarTab('element');
  };
  return (
    <section className="border-b border-line px-(--pad-x) py-5">
      <h2 className="label-tech mb-4 text-fg">Plantillas</h2>
      <ul className="grid grid-cols-4 gap-2">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => void place(t.id)}
              title={`Colocar «${t.name}» en la prenda`}
              className="checker group block aspect-square w-full border border-line p-2 transition hover:border-fg/50"
            >
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(t.svg)}`}
                alt={t.name}
                draggable={false}
                className="size-full object-contain"
              />
            </button>
            <span className="mt-1 block truncate text-center text-[9px] tracking-[0.1em] text-muted uppercase">{t.name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-editorial text-[13px] leading-snug font-light text-muted italic">
        Son vectoriales: se pueden recolorear, separar en partes y bordar.
      </p>
    </section>
  );
}

/**
 * Paso 1 · Diseño. Un solo sitio para añadir lo que irá en la prenda: subir una
 * imagen (se coloca al instante), una plantilla, un texto o un motivo con IA.
 */
export function DesignPanel() {
  const mode = useStudio((s) => s.designMode);
  const setMode = useStudio((s) => s.setDesignMode);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeView = useStudio((s) => s.activeView);
  const hasPieces = useStudio((s) => s.elements.length > 0);

  async function upload(files: FileList) {
    setBusy(true);
    try {
      await placeFiles(files);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="border-b border-line px-(--pad-x) pt-5 pb-5">
        <p className="font-editorial text-[14px] leading-snug font-light text-muted italic">
          {hasPieces
            ? `Añada más piezas a la ${VIEW_SPECS[activeView].label.toLowerCase()} o toque una en la prenda para moverla.`
            : `Elija cómo empezar la ${VIEW_SPECS[activeView].label.toLowerCase()}. Después arrastre el motivo directamente sobre la prenda.`}
        </p>
        <div role="radiogroup" aria-label="Qué quiere añadir" className="mt-4 grid grid-cols-2 gap-px bg-line">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'px-3 py-3 text-left transition duration-300',
                mode === m.id ? 'bg-fg text-ink' : 'bg-black text-fg hover:bg-white/5',
              )}
            >
              <span className="block text-[10px] tracking-[0.16em] uppercase">{m.label}</span>
              <span className={cn('mt-1 block text-[9.5px] font-light', mode === m.id ? 'text-ink/60' : 'text-muted')}>
                {m.hint}
              </span>
            </button>
          ))}
        </div>

        {mode === 'images' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="mt-3 w-full border border-dashed border-fg/30 py-5 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:border-fg/70 disabled:opacity-40"
            >
              {busy ? 'Colocando…' : 'Elegir archivo y colocar en la prenda'}
            </button>
            <p className="mt-2 text-[10.5px] font-light text-muted">También puede soltar el archivo directamente sobre la prenda.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml,image/png,image/webp,image/jpeg"
              multiple
              hidden
              onChange={async (e) => {
                if (e.target.files?.length) await upload(e.target.files);
                e.target.value = '';
              }}
            />
          </>
        )}
      </section>

      {mode === 'images' && <AssetGallery />}
      {mode === 'templates' && <Templates />}
      {mode === 'text' && <TextPanel />}
      {mode === 'ai' && (
        <>
          <SettingsPanel />
          <GeneratePanel />
          <AssetGallery />
        </>
      )}
    </>
  );
}
