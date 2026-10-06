'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Box3, MeshPhysicalMaterial, NeutralToneMapping, Vector3, type Mesh } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { fabricPanels, describePanels, type PatternPanel } from '@/lib/pattern/panels';
import { getPrintTexture } from '@/lib/pattern/print';
import { useCalibration } from '@/lib/three/calibration';
import { knitNormalMap } from '@/lib/three/fabricTexture';
import { FABRIC_MATERIAL, GLB_TARGET_HEIGHT, HEM_Y, MODEL_URL } from '@/lib/three/modelConfig';
import { ProductLighting, ProductShadows } from '../three/ProductLighting';

/** Sudadera con el patrón estampado: cada pieza lee su zona del lienzo plano por sus UV. */
function PatternGarment({ color, onPanels }: { color: string; onPanels: (p: PatternPanel[]) => void }) {
  const { scene } = useGLTF(MODEL_URL);
  const rotationY = useCalibration((s) => s.rotationY);

  const { root, materials } = useMemo(() => {
    const root = scene.clone(true);
    root.rotation.y = (rotationY * Math.PI) / 180;
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    root.scale.multiplyScalar(GLB_TARGET_HEIGHT / (size.y || 1));
    root.updateMatrixWorld(true);
    box.setFromObject(root);
    const center = box.getCenter(new Vector3());
    root.position.set(root.position.x - center.x, root.position.y + HEM_Y - box.min.y, root.position.z - center.z);
    root.updateMatrixWorld(true);

    const texture = getPrintTexture();
    const panels = new Set<Mesh>(fabricPanels(root));
    const materials: MeshPhysicalMaterial[] = [];
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (!panels.has(mesh)) {
        mesh.visible = false; // cordones, cremalleras y puntadas: fuera
        return;
      }
      const mat = new MeshPhysicalMaterial({ ...FABRIC_MATERIAL });
      mat.map = texture;
      mat.normalMap = knitNormalMap();
      mat.normalScale.set(0.24, 0.24);
      // El mapa no multiplica el color de la tela: la estampa se pinta encima, con su transparencia.
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
  vec4 printColor = texture2D( map, vMapUv );
  diffuseColor.rgb = mix( diffuseColor.rgb, printColor.rgb, printColor.a );
#endif`,
        );
      };
      mat.customProgramCacheKey = () => 'pattern-print';
      mesh.material = mat;
      materials.push(mat);
    });
    return { root, materials };
  }, [scene, rotationY]);

  useEffect(() => onPanels(describePanels(root)), [root, onPanels]);
  useEffect(() => {
    materials.forEach((m) => m.color.set(color));
  }, [materials, color]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  return <primitive object={root} />;
}

const POSES = {
  espalda: [0, 0.08, -2.3],
  frente: [0, 0.08, 2.3],
  izquierda: [-2.3, 0.08, 0],
  derecha: [2.3, 0.08, 0],
  capucha: [0, 0.45, -1.3],
} as const;
export type PatternPose = keyof typeof POSES;

interface Props {
  garmentColor: string;
  onPanels: (p: PatternPanel[]) => void;
  /** Cambia cuando se pide otra vista de cámara. */
  pose: { name: PatternPose; n: number };
}

export function PatternViewer({ garmentColor, onPanels, pose }: Props) {
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const [x, y, z] = POSES[pose.name];
    c.object.position.set(x, y, z);
    c.target.set(0, pose.name === 'capucha' ? 0.3 : -0.02, 0);
    c.update();
  }, [pose]);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [...POSES.espalda], fov: 30, near: 0.05, far: 20 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: NeutralToneMapping }}
    >
      <ProductLighting mood="nuit" />
      <Suspense fallback={null}>
        <PatternGarment color={garmentColor} onPanels={onPanels} />
      </Suspense>
      <ProductShadows mood="nuit" />
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.5} maxDistance={4} />
    </Canvas>
  );
}
