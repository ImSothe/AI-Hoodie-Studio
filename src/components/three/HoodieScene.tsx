'use client';

import { Suspense, useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useStudio } from '@/lib/store';
import { MODEL_URL } from '@/lib/three/modelConfig';
import type { StageMood } from '@/lib/three/stage';
import { CameraRig } from './CameraRig';
import { DirectEdit } from './DirectEdit';
import { GltfHoodie } from './GltfHoodie';
import { ProductLighting, ProductShadows } from './ProductLighting';
import { useDesignTextures } from './useDesignTextures';

/**
 * Desplaza el encuadre para que la prenda quede centrada en el espacio libre
 * junto a un panel flotante (px > 0 → la prenda se desplaza a la derecha).
 */
function FrameOffset({ px }: { px: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (px !== 0) camera.setViewOffset(size.width, size.height, -px, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, px]);
  return null;
}

interface HoodieSceneProps {
  frameOffsetPx?: number;
  mood?: StageMood;
  /** Retira la interfaz mientras se manipula la prenda (atelier). */
  immersive?: boolean;
  /** Giro lento de plató mientras nadie toca la prenda (configurador). */
  autoRotate?: boolean;
  /** Primer contacto del usuario con la prenda (arrastre o zoom). */
  onInteract?: () => void;
  /** Distancia del plano de detalle. */
  detailDistance?: number;
  /** Permite mover los gráficos arrastrándolos sobre la prenda (atelier). */
  directEdit?: boolean;
}

/** Contenido del <Canvas>: estudio, sudadera GLB con los decals en vivo y cámara. */
export function HoodieScene({
  frameOffsetPx = 0,
  mood,
  immersive = true,
  autoRotate = false,
  onInteract,
  detailDistance,
  directEdit = false,
}: HoodieSceneProps) {
  const textures = useDesignTextures();
  const stageMood = useStudio((s) => s.stageMood);
  const setImmersive = useStudio((s) => s.setImmersive);
  const restore = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mientras se orbita/zoom la interfaz se retira; vuelve con un pequeño retardo.
  const onStart = () => {
    onInteract?.();
    if (!immersive) return;
    if (restore.current) clearTimeout(restore.current);
    setImmersive(true);
  };
  const onEnd = () => {
    if (immersive) restore.current = setTimeout(() => setImmersive(false), 900);
  };
  useEffect(() => () => void (restore.current && clearTimeout(restore.current)), []);

  return (
    <>
      <ProductLighting mood={mood ?? stageMood} />
      <Suspense fallback={null}>
        <GltfHoodie url={MODEL_URL} textures={textures} />
      </Suspense>
      <ProductShadows mood={mood ?? stageMood} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={0.6}
        maxDistance={4}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        onStart={onStart}
        onEnd={onEnd}
      />
      {directEdit && <DirectEdit />}
      <CameraRig detailDistance={detailDistance} />
      <FrameOffset px={frameOffsetPx} />
    </>
  );
}
