'use client';

import Link from 'next/link';
import { useOpenAIKey } from '@/lib/settings';
import { useStudio, type SidebarTab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { TextileCanvas } from '../canvas/TextileCanvas';
import { AssetGallery } from './AssetGallery';
import { GarmentPanel } from './ColorPanel';
import { ElementPanel } from './ElementPanel';
import { ExportPanel } from './ExportPanel';
import { GeneratePanel } from './GeneratePanel';
import { SettingsPanel } from './SettingsPanel';
import { TextPanel } from './TextPanel';

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'design', label: 'Generar' },
  { id: 'text', label: 'Texto' },
  { id: 'garment', label: 'Prenda' },
  { id: 'element', label: 'Pieza' },
  { id: 'production', label: 'Dossier' },
];

export function Sidebar() {
  const tab = useStudio((s) => s.sidebarTab);
  const setTab = useStudio((s) => s.setSidebarTab);
  const hasSelection = useStudio((s) => s.selection !== null);
  const season = useStudio((s) => s.season);
  const apiKey = useOpenAIKey();

  return (
    <aside className="glass thin-scroll flex h-full min-h-0 w-full flex-col overflow-y-auto border-t border-white/10 md:border">
      <div className="flex items-end justify-between gap-3 border-b border-line px-6 pt-6 pb-5">
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
          {!apiKey && (
            <button
              type="button"
              onClick={() => setTab('design')}
              className="border-b border-muted pb-0.5 text-[9px] tracking-[0.22em] text-muted uppercase hover:text-fg"
            >
              Configurar IA
            </button>
          )}
        </div>
      </div>

      {/* Lienzo + pestañas quedan fijos arriba mientras se hace scroll del contenido */}
      <div className="z-20 bg-black md:sticky md:top-0">
        <TextileCanvas />
        <div role="tablist" aria-label="Paneles" className="flex justify-between border-b border-line px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'relative -mb-px border-b py-3.5 text-[9.5px] tracking-[0.24em] uppercase transition duration-300',
                tab === t.id ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {t.label}
              {t.id === 'element' && hasSelection && (
                <span className="absolute top-2.5 -right-2 size-1 rounded-full bg-fg" aria-label="pieza seleccionada" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        {tab === 'design' && (
          <>
            <SettingsPanel />
            <GeneratePanel />
            <AssetGallery />
          </>
        )}
        {tab === 'text' && <TextPanel />}
        {tab === 'garment' && <GarmentPanel />}
        {tab === 'element' && <ElementPanel />}
        {tab === 'production' && <ExportPanel />}
      </div>
    </aside>
  );
}
