'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Spherical, Vector3 } from 'three';
import type { HoodieView } from '@/lib/hoodie/spec';
import { useStudio, type CameraPreset } from '@/lib/store';
import { useCalibration } from '@/lib/three/calibration';
import { printCenterY } from '@/lib/three/decalPlacement';
import { MODEL_HPS_Y } from '@/lib/three/modelConfig';

/** Distancia de la cámara: más cerca en pantallas de poca altura (1080p), para que la prenda ocupe más. */
const distance = () => (typeof window !== 'undefined' && window.innerHeight <= 1000 ? 2.3 : 2.6);
const EYE_Y = 0.08;
const TARGET_Y = -0.02;

/**
 * glTF mira hacia +Z. "Lateral derecho" es el lado derecho de quien viste la
 * prenda (criterio de fábrica), que queda en -X.
 */
export function cameraPose(preset: CameraPreset, activeView: HoodieView, detailDistance = 0.95) {
  switch (preset) {
    case 'front':
      return { position: new Vector3(0, EYE_Y, distance()), target: new Vector3(0, TARGET_Y, 0) };
    case 'back':
      return { position: new Vector3(0, EYE_Y, -distance()), target: new Vector3(0, TARGET_Y, 0) };
    case 'right':
      return { position: new Vector3(-distance(), EYE_Y, 0), target: new Vector3(0, TARGET_Y, 0) };
    case 'left':
      return { position: new Vector3(distance(), EYE_Y, 0), target: new Vector3(0, TARGET_Y, 0) };
    case 'detail': {
      const { scale, offsetYCm } = useCalibration.getState();
      const y = printCenterY(activeView, { hpsY: MODEL_HPS_Y, scale, offsetYCm });
      const z = activeView === 'front' ? 1 : -1;
      return { position: new Vector3(0, y + 0.02, z * detailDistance), target: new Vector3(0, y, 0) };
    }
  }
}

type Controls = { target: Vector3; update: () => void; addEventListener: (t: string, cb: () => void) => void; removeEventListener: (t: string, cb: () => void) => void };

/**
 * Interpola cámara y objetivo hasta el preset pedido desde la barra de vistas.
 * `detailDistance`: distancia del plano de detalle (más abierto en el configurador).
 */
export function CameraRig({ detailDistance = 0.95 }: { detailDistance?: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const request = useStudio((s) => s.camera);
  const goal = useRef<ReturnType<typeof cameraPose> | null>(null);

  useEffect(() => {
    goal.current = cameraPose(request.preset, useStudio.getState().activeView, detailDistance);
  }, [request, detailDistance]);

  // Si el usuario arrastra a mano, se cancela la animación en curso.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  // Interpolación en coordenadas esféricas alrededor del objetivo: la cámara
  // orbita (nunca atraviesa la prenda) y la velocidad no depende de los FPS.
  useFrame((_, delta) => {
    const g = goal.current;
    if (!g || !controls) return;
    const t = 1 - Math.exp(-delta * 7);
    controls.target.lerp(g.target, t);
    const from = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const to = new Spherical().setFromVector3(g.position.clone().sub(g.target));
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta)); // camino más corto
    from.theta += dTheta * t;
    from.phi = MathUtils.lerp(from.phi, to.phi, t);
    from.radius = MathUtils.lerp(from.radius, to.radius, t);
    camera.position.setFromSpherical(from).add(controls.target);
    controls.update();
    if (camera.position.distanceTo(g.position) < 0.003 && controls.target.distanceTo(g.target) < 0.003) {
      camera.position.copy(g.position);
      controls.target.copy(g.target);
      controls.update();
      goal.current = null;
    }
  });
  return null;
}
