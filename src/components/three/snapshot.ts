'use client';

import type { RootState } from '@react-three/fiber';
import type { Vector3 } from 'three';

/**
 * Render de referencia del visor sin el fondo de estudio (PNG transparente),
 * para que el dossier pueda recortarlo y asentarlo sobre papel blanco.
 * Con `pose`, se fotografía desde ese encuadre (p. ej. la pieza entera) y la
 * cámara vuelve a donde estaba sin que el usuario lo note.
 */
export function captureTransparent(
  three: RootState | undefined | null,
  pose?: { position: Vector3; target: Vector3 },
) {
  if (!three) return null;
  const { gl, scene, camera } = three;
  const background = scene.background;
  const position = camera.position.clone();
  const quaternion = camera.quaternion.clone();
  if (pose) {
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld();
  }
  scene.background = null;
  gl.render(scene, camera);
  const url = gl.domElement.toDataURL('image/png');
  scene.background = background;
  if (pose) {
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.updateMatrixWorld();
  }
  gl.render(scene, camera);
  return url;
}
