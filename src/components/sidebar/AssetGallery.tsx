'use client';

import { addAssetToCanvas } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { useStudio } from '@/lib/store';
import type { GeneratedAsset } from '@/lib/types';
import { ASSET_DRAG_MIME } from '@/lib/utils';
import { Section } from '../ui/Section';

async function placeOnActiveCanvas(asset: GeneratedAsset) {
  const { activeView } = useStudio.getState();
  const canvas = getCanvas(activeView);
  if (canvas) {
    await addAssetToCanvas(canvas, activeView, asset);
    useStudio.getState().setSidebarTab('element');
  }
}

/** Biblioteca de motivos generados o subidos: se arrastran al lienzo o al 3D. */
export function AssetGallery() {
  const assets = useStudio((s) => s.assets);
  const removeAsset = useStudio((s) => s.removeAsset);

  return (
    <Section title="Biblioteca">
      {assets.length === 0 ? (
        <p className="border-l border-line pl-3 font-editorial text-[13px] leading-snug font-light text-muted italic">
          Aquí aparecerán sus motivos. Toque uno para colocarlo en la prenda o arrástrelo sobre ella.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3">
          {assets.map((asset, i) => (
            <li key={asset.id} className="group relative">
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ASSET_DRAG_MIME, asset.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => void placeOnActiveCanvas(asset)}
                title={`${asset.name}\nToque para colocar, o arrastre sobre la prenda${asset.revisedPrompt ? `\n\nDALL·E: ${asset.revisedPrompt}` : ''}`}
                className="checker aspect-square cursor-grab overflow-hidden border border-line p-2 transition duration-300 hover:border-fg/40 active:cursor-grabbing"
              >
                <img src={asset.src} alt={asset.name} draggable={false} className="h-full w-full object-contain" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="num text-[9px] text-muted uppercase">
                  {String(i + 1).padStart(2, '0')} · {asset.kind}
                </span>
                <span className="flex gap-2 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Añadir ${asset.name} al lienzo`}
                    onClick={() => void placeOnActiveCanvas(asset)}
                    className="text-[9px] tracking-[0.18em] text-fg uppercase"
                  >
                    Añadir
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar ${asset.name}`}
                    onClick={() => removeAsset(asset.id)}
                    className="text-[9px] tracking-[0.18em] text-muted uppercase hover:text-fg"
                  >
                    ×
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
