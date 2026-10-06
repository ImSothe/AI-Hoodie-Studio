'use client';

import { useRef, useState } from 'react';
import { importFiles } from '@/lib/assets/importFiles';
import { addAssetToCanvas } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { VIEW_SPECS } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { AssetGallery } from './AssetGallery';
import { GeneratePanel } from './GeneratePanel';
import { SettingsPanel } from './SettingsPanel';
import { TextPanel } from './TextPanel';

type Mode = 'images' | 'text' | 'ai';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'images', label: 'Subir imagen', hint: 'PNG, SVG o JPG' },
  { id: 'text', label: 'Escribir texto', hint: 'Tipografías de la casa' },
  { id: 'ai', label: 'Crear con IA', hint: 'Genera un motivo' },
];

/**
 * Paso 1 · Diseño. Un solo sitio para añadir lo que irá en la prenda: subir una
 * imagen (se coloca al instante), escribir un texto o crear un motivo con IA.
 */
export function DesignPanel() {
  const [mode, setMode] = useState<Mode>('images');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeView = useStudio((s) => s.activeView);
  const hasPieces = useStudio((s) => s.elements.length > 0);

  // Subir = importar + colocar en la cara activa + pasar a «Ajustar». Sin pasos intermedios.
  async function upload(files: FileList) {
    setBusy(true);
    try {
      const imported = await importFiles(files);
      useStudio.getState().addAssets(imported);
      const canvas = getCanvas(activeView);
      if (canvas) {
        for (const asset of imported) await addAssetToCanvas(canvas, activeView, asset);
        if (imported.length) useStudio.getState().setSidebarTab('element');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="border-b border-line px-6 pt-5 pb-5">
        <p className="font-editorial text-[14px] leading-snug font-light text-muted italic">
          {hasPieces
            ? `Añada más piezas a la ${VIEW_SPECS[activeView].label.toLowerCase()} o toque una en la prenda para moverla.`
            : `Añada un motivo a la ${VIEW_SPECS[activeView].label.toLowerCase()}. Después arrástrelo directamente sobre la prenda.`}
        </p>
        <div role="radiogroup" aria-label="Qué quiere añadir" className="mt-4 grid grid-cols-3 gap-px bg-line">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => {
                setMode(m.id);
                if (m.id === 'images' && mode === 'images') fileRef.current?.click();
              }}
              className={cn(
                'px-2 py-3 text-left transition duration-300',
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
