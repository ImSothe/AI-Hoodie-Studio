import type { Mesh, Object3D } from 'three';
import { garmentMeshes } from './decalPlacement';

/**
 * Acceso al modelo cargado desde fuera de GltfHoodie (edición directa sobre la
 * prenda): la raíz normalizada y sus paneles de tejido, calculados una sola vez.
 */
let root: Object3D | null = null;
let meshes: Mesh[] = [];

export function setGarmentRoot(next: Object3D | null) {
  root = next;
  if (next) {
    next.updateMatrixWorld(true);
    meshes = garmentMeshes(next);
  } else meshes = [];
}

export const getGarmentRoot = () => root;
export const getGarmentPanels = () => meshes;
