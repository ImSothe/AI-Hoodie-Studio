'use client';

import Link from 'next/link';
import { useStudio, type SidebarTab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { TextileCanvas } from '../canvas/TextileCanvas';
import { GarmentPanel } from './ColorPanel';
import { DesignPanel } from './DesignPanel';
import { ElementPanel } from './ElementPanel';
import { ExportPanel } from './ExportPanel';

/** Los cuatro pasos del atelier, en el orden en que se trabaja. */
const STEPS: { id: SidebarTab; label: string; hint: string }[] = [
  { id: 'design', label: 'Diseño', hint: 'Añada un motivo, una imagen o un texto' },
  { id: 'garment', label: 'Prenda', hint: 'Color y tejido de la sudadera' },
  { id: 'element', label: 'Ajustar', hint: 'Tamaño, giro y acabado de la pieza elegida' },
  { id: 'production', label: 'Entregar', hint: 'Dossier y archivos para el taller' },
];

export function Sidebar() {
  const rawTab = useStudio((s) => s.sidebarTab);
  const setTab = useStudio((s) => s.setSidebarTab);
  const hasSelection = useStudio((s) => s.selection !== null);
  const season = useStudio((s) => s.season);
  // «Texto» es ahora una forma de añadir dentro del paso Diseño.
  const tab = rawTab === 'text' ? 'design' : rawTab;
  const step = STEPS.find((s) => s.id === tab) ?? STEPS[0];

  return (
    <aside className="glass thin-scroll flex h-full min-h-0 w-full flex-col overflow-y-auto border-t border-white/10 md:border">
      <div className="flex items-end justify-between gap-3 border-b border-line px-(--pad-x) pt-(--pad-y) pb-4">
        <div>
          <h1 className="text-[11px] font-normal tracking-[0.42em] whitespace-nowrap text-fg uppercase">AI Hoodie Studio</h1>
          <p className="mt-1.5 font-editorial text-[15px] font-light text-muted italic">Atelier numérique — {season}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/configurador"
            title="Configurador de taller: tejido, personalización, tallas y orden"
            className="border-b border-muted pb-0.5 text-[9px] tracking-[0.22em] whitespace-nowrap text-muted uppercase hover:text-fg"
          >
            Configurador
          </Link>
          <Link
            href="/ayuda"
            title="Manual de usuario: cómo diseñar y enviar el dossier a fábrica"
            className="border-b border-muted pb-0.5 text-[9px] tracking-[0.22em] whitespace-nowrap text-muted uppercase hover:text-fg"
          >
            Ayuda
          </Link>
        </div>
      </div>

      {/* Pasos + lienzo 2D plegable: quedan fijos arriba mientras se hace scroll del contenido */}
      <div className="z-20 bg-black md:sticky md:top-0">
        <div role="tablist" aria-label="Pasos" className="flex border-b border-line">
          {STEPS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'relative flex-1 border-b py-3 text-center transition duration-300',
                tab === t.id ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <span className="num mr-1.5 text-[9px]">{i + 1}</span>
              <span className="text-[9.5px] tracking-[0.2em] uppercase">{t.label}</span>
              {t.id === 'element' && hasSelection && (
                <span className="absolute top-2.5 right-2 size-1 rounded-full bg-fg" aria-label="pieza seleccionada" />
              )}
            </button>
          ))}
        </div>
        <p className="border-b border-line px-(--pad-x) py-2 text-[10.5px] font-light tracking-[0.04em] text-muted">{step.hint}</p>
        <TextileCanvas />
      </div>

      <div role="tabpanel">
        {tab === 'design' && <DesignPanel />}
        {tab === 'garment' && <GarmentPanel />}
        {tab === 'element' && <ElementPanel />}
        {tab === 'production' && <ExportPanel />}
      </div>
    </aside>
  );
}
