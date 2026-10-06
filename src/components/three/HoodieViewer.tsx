'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { NeutralToneMapping } from 'three';
import { useGLTF, useProgress } from '@react-three/drei';
import { placeFiles } from '@/lib/assets/placeFiles';
import { addAssetToCanvas } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { GARMENT, TECHNIQUE_INFO, VIEW_SPECS } from '@/lib/hoodie/spec';
import { useStudio, type CameraPreset } from '@/lib/store';
import { MODEL_URL } from '@/lib/three/modelConfig';
import { ASSET_DRAG_MIME, cn } from '@/lib/utils';
import { CalibrationPanel } from './CalibrationPanel';
import { cameraPose } from './CameraRig';
import { HoodieScene } from './HoodieScene';
import { MissingModelPoster } from './MissingModelPoster';
import { SelectionFrame } from './SelectionFrame';
import { captureTransparent } from './snapshot';
import { useModelStatus } from './useModelStatus';
import { ViewerErrorBoundary } from './ViewerErrorBoundary';
import { useDesktop } from '../useDesktop';

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Espalda' },
  { id: 'right', label: 'Lateral derecho' },
  { id: 'left', label: 'Lateral izquierdo' },
  { id: 'detail', label: 'Detalle' },
];

/** Ancho que ocupa el panel flotante en escritorio (panel + márgenes). */
const PANEL_SPACE = 404;

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <p className="label-tech">
        Cargando modelo <span className="num tracking-normal">{Math.round(progress)}%</span>
      </p>
    </div>
  );
}

/** Visor protagonista: la prenda a sangre, con la interfaz reducida a lo esencial. */
export function HoodieViewer() {
  const { status, retry, fail } = useModelStatus(MODEL_URL);
  const camera = useStudio((s) => s.camera);
  const activeView = useStudio((s) => s.activeView);
  const designName = useStudio((s) => s.designName);
  const styleCode = useStudio((s) => s.styleCode);
  const season = useStudio((s) => s.season);
  const fabric = useStudio((s) => s.fabric);
  const elements = useStudio((s) => s.elements);
  const garmentColor = useStudio((s) => s.garmentColor);
  const immersive = useStudio((s) => s.immersive);
  const stageMood = useStudio((s) => s.stageMood);
  const autoRotate = useStudio((s) => s.autoRotate);
  const showDetails = useStudio((s) => s.showDetails);
  const { requestCamera, focusView, setSnapshot3d } = useStudio.getState();
  const getThree = useRef<(() => RootState) | null>(null);
  const [flash, setFlash] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const desktop = useDesktop();
  const ready = status.state === 'ready';
  const techniques = [...new Set(elements.map((e) => TECHNIQUE_INFO[e.technique].short))].join(' · ');

  // useGLTF cachea también los fallos: hay que vaciarlo para reintentar con un archivo nuevo.
  const reload = () => {
    useGLTF.clear(MODEL_URL);
    retry();
  };

  const choosePreset = (preset: CameraPreset) => {
    if (preset === 'front' || preset === 'back') focusView(preset);
    else requestCamera(preset);
  };

  // El render de referencia sale sin el fondo de estudio (transparente) para que el dossier lo recorte.
  const capture = () => {
    const shot = captureTransparent(getThree.current?.());
    if (!shot) return;
    setSnapshot3d(shot);
    setFlash(true);
    setTimeout(() => setFlash(false), 500);
  };

  // Soltar un asset sobre el 3D lo coloca en la cara activa.
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      await placeFiles(e.dataTransfer.files);
      return;
    }
    const id = e.dataTransfer.getData(ASSET_DRAG_MIME);
    const { assets, activeView: view } = useStudio.getState();
    const asset = assets.find((a) => a.id === id);
    const canvas = getCanvas(view);
    if (asset && canvas) await addAssetToCanvas(canvas, view, asset);
  };

  // Superposiciones: se retiran mientras se manipula la prenda.
  const chrome = cn('transition-opacity duration-700 ease-out', immersive && 'opacity-0');

  return (
    <div
      className="stage-bg relative h-full min-h-0"
      data-mood={stageMood}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME) && !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="absolute inset-0">
        {ready && (
          <ViewerErrorBoundary onError={fail}>
            <Canvas
              dpr={[1, 2]}
              camera={{ position: cameraPose(camera.preset, activeView).position.toArray(), fov: 30, near: 0.05, far: 20 }}
              gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: NeutralToneMapping }}
              onCreated={({ get }) => {
                getThree.current = get;
              }}
            >
              <HoodieScene frameOffsetPx={desktop ? PANEL_SPACE / 2 : 0} directEdit />
            </Canvas>
            <LoadingOverlay />
          </ViewerErrorBoundary>
        )}
        {status.state === 'missing' && <MissingModelPoster onRetry={reload} />}
        {status.state === 'error' && <MissingModelPoster error={status.message} onRetry={reload} />}
      </div>

      {ready && <SelectionFrame getThree={getThree} />}

      {/* Añadir: siempre a la vista, sea cual sea el paso */}
      {ready && (
        <nav
          aria-label="Añadir a la prenda"
          className={cn('absolute bottom-24 left-6 z-10 flex flex-col gap-px md:top-1/2 md:bottom-auto md:left-[420px] md:-translate-y-1/2', chrome)}
        >
          <span className="label-tech mb-2">Añadir</span>
          {(
            [
              ['Imagen', () => fileRef.current?.click()],
              ['Plantilla', () => useStudio.getState().setDesignMode('templates')],
              ['Texto', () => useStudio.getState().setDesignMode('text')],
              ['IA', () => useStudio.getState().setDesignMode('ai')],
            ] as const
          ).map(([label, onClick]) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="border border-fg/20 bg-black/40 px-4 py-2.5 text-left text-[10px] tracking-[0.22em] text-fg uppercase backdrop-blur transition hover:border-fg/60 hover:bg-black/60"
            >
              + {label}
            </button>
          ))}
          <input
            ref={fileRef}
            type="file"
            accept=".svg,image/svg+xml,image/png,image/webp,image/jpeg"
            multiple
            hidden
            onChange={async (e) => {
              if (e.target.files?.length) await placeFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </nav>
      )}

      {/* Cabecera editorial */}
      <header
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-6 px-6 pt-6 md:pr-8 md:pl-[440px]',
          chrome,
        )}
      >
        <div className="min-w-0">
          <p className="label-tech">
            {season} <span className="mx-2 text-fg/25">|</span>
            <span className="num tracking-[0.12em]">{styleCode}</span>
          </p>
          <h2 className="mt-3 truncate font-serif text-4xl font-normal tracking-[0.14em] text-fg uppercase md:text-5xl">
            {designName || 'Sin título'}
          </h2>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-light tracking-[0.08em] text-muted">
            <span>{GARMENT.name}</span>
            <span className="text-fg/25">—</span>
            <span>
              {fabric.construction} <span className="num">{fabric.weightGsm} g/m²</span>
            </span>
            <span className="text-fg/25">—</span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block size-2 ring-1 ring-fg/25" style={{ background: garmentColor }} />
              <span className="num">{garmentColor}</span>
            </span>
          </p>
          <p className="mt-1 text-[11px] font-light tracking-[0.08em] text-muted">
            {VIEW_SPECS[activeView].label}
            {techniques && <span> · {techniques}</span>}
          </p>
        </div>
        {ready && (
          <div className="pointer-events-auto flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => useStudio.getState().setStageMood(stageMood === 'nuit' ? 'salon' : 'nuit')}
              aria-pressed={stageMood === 'salon'}
              title="Cambiar entre estudio oscuro y sala clara"
              className="border border-fg/20 px-3 py-2 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:border-fg/60"
            >
              {stageMood === 'nuit' ? 'Fondo claro' : 'Fondo oscuro'}
            </button>
            <button
              type="button"
              onClick={() => useStudio.getState().setAutoRotate(!autoRotate)}
              aria-pressed={autoRotate}
              title="La prenda gira sola mientras no edita nada"
              className="border border-fg/20 px-3 py-2 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:border-fg/60"
            >
              {autoRotate ? 'Girando' : 'Fija'}
            </button>
            <button
              type="button"
              onClick={() => useStudio.getState().setShowDetails(!showDetails)}
              aria-pressed={showDetails}
              title="Mostrar u ocultar cordones, cremalleras y puntadas del modelo"
              className="border border-fg/20 px-3 py-2 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:border-fg/60"
            >
              {showDetails ? 'Con detalles' : 'Modelo limpio'}
            </button>
            <CalibrationPanel />
            <button
              type="button"
              onClick={capture}
              className="border border-fg/20 px-3 py-2 text-[10px] tracking-[0.22em] text-fg uppercase transition hover:border-fg/60"
            >
              Capturar
            </button>
          </div>
        )}
      </header>

      {/* Barra de cámaras */}
      <nav
        aria-label="Vistas de cámara"
        className={cn('absolute inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-7 md:pl-[420px]', chrome)}
      >
        <div className="flex max-w-full items-center overflow-x-auto">
          {PRESETS.map((p, i) => (
            <span key={p.id} className="flex items-center">
              {i > 0 && <span className="mx-4 h-3 w-px bg-line" aria-hidden />}
              <button
                type="button"
                disabled={!ready}
                aria-pressed={camera.preset === p.id}
                onClick={() => choosePreset(p.id)}
                className={cn(
                  'border-b pb-1 text-[10px] tracking-[0.26em] whitespace-nowrap uppercase transition duration-300 disabled:opacity-20',
                  camera.preset === p.id ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {p.label}
              </button>
            </span>
          ))}
        </div>
      </nav>

      {dragOver && (
        <div className="pointer-events-none absolute inset-8 z-20 grid place-items-center border border-dashed border-fg/30 md:left-[440px]">
          <span className="label-tech text-fg">Soltar en la {VIEW_SPECS[activeView].label.toLowerCase()}</span>
        </div>
      )}
      {flash && <div className="pointer-events-none absolute inset-0 z-30 bg-white/5" />}
    </div>
  );
}
