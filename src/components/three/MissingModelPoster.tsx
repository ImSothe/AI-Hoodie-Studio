'use client';

import { MODEL_URL } from '@/lib/three/modelConfig';
import { Button } from '../ui/Button';

/** Aviso a pantalla completa del visor cuando no hay hoodie.glb (o está corrupto). */
export function MissingModelPoster({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="absolute inset-0 grid place-items-center p-8 md:pl-[calc(var(--panel-w)+36px)]">
      <div className="w-full max-w-2xl text-center">
        <p className="label-tech">{error ? 'Error de modelo' : 'Modelo no encontrado'}</p>
        <h2 className="mt-6 font-serif text-4xl leading-tight font-normal tracking-[0.12em] text-fg uppercase md:text-6xl">
          {error ? 'No se pudo cargar el archivo 3D' : 'Falta el archivo 3D'}
        </h2>
        <p className="mt-6 font-editorial text-xl font-light text-muted italic md:text-2xl">
          Sube tu <span className="num not-italic text-fg">hoodie.glb</span> a{' '}
          <span className="num not-italic text-fg">public/models/</span>
        </p>
        {error && <p className="num mt-5 text-[11px] break-words text-muted">{error}</p>}
        <div className="mx-auto mt-10 h-px w-24 bg-line" />
        <ol className="mx-auto mt-8 max-w-md space-y-2 text-left text-[11.5px] font-light text-muted">
          <li>
            <span className="num mr-3 text-fg">01</span>Exporte la sudadera en GLB (glTF 2.0 binario).
          </li>
          <li>
            <span className="num mr-3 text-fg">02</span>Guárdela como <span className="num text-fg">public{MODEL_URL}</span>.
          </li>
          <li>
            <span className="num mr-3 text-fg">03</span>Pulse «Reintentar» con <span className="num text-fg">npm run dev</span>; en producción
            ejecute de nuevo <span className="num text-fg">npm run build</span>.
          </li>
        </ol>
        <Button variant="outline" className="mt-10 px-8" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
