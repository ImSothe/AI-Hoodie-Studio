'use client';

import type { MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useProgress } from '@react-three/drei';
import { NeutralToneMapping } from 'three';
import { useStudio } from '@/lib/store';
import { MODEL_URL } from '@/lib/three/modelConfig';
import type { HoodieView } from '@/lib/hoodie/spec';
import type { StageMood } from '@/lib/three/stage';
import { cameraPose } from '../three/CameraRig';
import { HoodieScene } from '../three/HoodieScene';
import { captureTransparent } from '../three/snapshot';
import { useModelStatus } from '../three/useModelStatus';
import { ViewerErrorBoundary } from '../three/ViewerErrorBoundary';

/** Plano de detalle del configurador: se ve la pieza entera de cintura para arriba. */
const DETAIL_DISTANCE = 1.6;

function Loading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center md:pr-[420px]">
      <div className="w-40 text-center">
        <p className="label-tech">Preparando la pieza</p>
        <div className="mt-4 h-px w-full bg-(--cfg-line)">
          <div className="h-px bg-(--cfg-fg) transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Aviso si el servidor no tiene el modelo 3D (con la pista técnica). */
function Unavailable({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="absolute inset-0 grid place-items-center p-8 md:pr-[420px]">
      <div className="max-w-md text-center">
        <p className="label-tech">{error ? 'Error de modelo' : 'Modelo no encontrado'}</p>
        <p className="mt-5 font-serif text-3xl md:text-4xl">Modelo 3D no disponible</p>
        <p className="mt-4 font-editorial text-[16px] font-light italic text-(--cfg-muted)">
          Falta <span className="num text-[13px] not-italic">public{MODEL_URL}</span> en el servidor.
        </p>
        {error && <p className="num mt-3 text-[11px] break-words text-(--cfg-muted)">{error}</p>}
        <button
          type="button"
          onClick={onRetry}
          className="mt-8 border-b border-(--cfg-fg) pb-1 text-[10px] tracking-[0.28em] uppercase"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

interface Props {
  mood: StageMood;
  autoRotate: boolean;
  frameOffsetPx: number;
  onInteract: () => void;
  /** Se rellena con una función que fotografía la pieza entera desde una cara (PNG transparente). */
  captureRef: MutableRefObject<((view: HoodieView) => string | null) | null>;
}

/** Visor del configurador: la prenda a sangre en el plató, con giro de exposición. */
export function ConfiguratorViewer({ mood, autoRotate, frameOffsetPx, onInteract, captureRef }: Props) {
  const { status, retry, fail } = useModelStatus(MODEL_URL);
  const camera = useStudio((s) => s.camera);
  const activeView = useStudio((s) => s.activeView);

  const reload = () => {
    useGLTF.clear(MODEL_URL);
    retry();
  };

  return (
    <div className="absolute inset-0">
      {status.state === 'ready' && (
        <ViewerErrorBoundary onError={fail}>
          <Canvas
            dpr={[1, 2]}
            camera={{ position: cameraPose(camera.preset, activeView).position.toArray(), fov: 28, near: 0.05, far: 20 }}
            gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: NeutralToneMapping }}
            onCreated={({ get }) => {
              captureRef.current = (view) => captureTransparent(get(), cameraPose(view, view));
            }}
          >
            <HoodieScene
              mood={mood}
              immersive={false}
              autoRotate={autoRotate}
              onInteract={onInteract}
              frameOffsetPx={frameOffsetPx}
              detailDistance={DETAIL_DISTANCE}
            />
          </Canvas>
          <Loading />
        </ViewerErrorBoundary>
      )}
      {status.state === 'missing' && <Unavailable onRetry={reload} />}
      {status.state === 'error' && <Unavailable error={status.message} onRetry={reload} />}
    </div>
  );
}
