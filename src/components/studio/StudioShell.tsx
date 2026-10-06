'use client';

import dynamic from 'next/dynamic';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Sidebar } from '../sidebar/Sidebar';

// Three.js depende de WebGL/window: sólo se carga en el cliente.
const HoodieViewer = dynamic(() => import('../three/HoodieViewer').then((m) => m.HoodieViewer), {
  ssr: false,
  loading: () => (
    <div className="stage-bg grid h-full place-items-center">
      <p className="label-tech">Atelier</p>
    </div>
  ),
});

/**
 * Composición de pasarela: la prenda ocupa toda la pantalla y el panel de
 * atelier flota encima, translúcido. Al manipular el 3D el panel se retira
 * casi por completo (vuelve al pasar el cursor) para que sólo quede la prenda.
 */
export function StudioShell() {
  const immersive = useStudio((s) => s.immersive);
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-ink md:block">
      <main className="relative h-[56dvh] shrink-0 md:absolute md:inset-0 md:h-auto">
        <HoodieViewer />
      </main>
      <div
        className={cn(
          'relative min-h-0 flex-1 transition-opacity duration-700 ease-out',
          'md:absolute md:top-5 md:bottom-5 md:left-5 md:w-[384px] md:hover:opacity-100',
          immersive && 'md:opacity-[0.06]',
        )}
      >
        <Sidebar />
      </div>
    </div>
  );
}
