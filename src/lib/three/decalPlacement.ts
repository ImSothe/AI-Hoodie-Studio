import { Box3, Euler, Matrix4, Quaternion, Raycaster, Vector3, type Mesh, type Object3D } from 'three';
import { VIEW_SPECS, type HoodieView } from '../hoodie/spec';

/**
 * Colocación de los <Decal> SIN depender de las UVs del modelo.
 *
 * 1. Se define el proyector en coordenadas de mundo: centrado en el eje de la
 *    prenda, a la altura real del área de impresión respecto al HPS, mirando
 *    de frente (pecho) o desde atrás (espalda), con el tamaño físico del área.
 * 2. Un raycast localiza la superficie y la malla principal en ese punto
 *    (se ignoran piezas pequeñas como cordones o etiquetas).
 * 3. Todo se pasa al espacio LOCAL de esa malla, que es como <Decal> de drei
 *    construye la geometría. Así funciona aunque el GLB tenga nodos rotados o
 *    escalados (típico de exportaciones de Sketchfab o Blender en Z-up).
 */

/** Profundidad del proyector (m) y margen por delante de la superficie. */
const DEPTH_M = 0.18;
const FRONT_MARGIN_M = 0.03;
/** Una malla es "principal" si mide al menos este % de la altura del modelo. */
const MIN_HEIGHT_RATIO = 0.3;

export interface DecalPlacement {
  view: HoodieView;
  mesh: Mesh;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  /** Para depurar: punto de impacto en mundo. */
  hit: Vector3;
}

export interface PlacementOptions {
  hpsY: number;
  /** Escala de calibración (1 = prenda de 66 cm de pecho). */
  scale: number;
  offsetYCm: number;
}

function principalMeshes(root: Object3D) {
  const modelBox = new Box3().setFromObject(root);
  const modelHeight = modelBox.max.y - modelBox.min.y;
  const meshes: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const box = new Box3().setFromObject(mesh);
    if (box.max.y - box.min.y >= modelHeight * MIN_HEIGHT_RATIO) meshes.push(mesh);
  });
  return meshes;
}

/** Centro vertical (mundo) del área de impresión de una cara. */
export function printCenterY(view: HoodieView, { hpsY, scale, offsetYCm }: PlacementOptions) {
  const pa = VIEW_SPECS[view].printArea;
  return hpsY + offsetYCm / 100 - ((pa.topFromHpsCm + pa.heightCm / 2) / 100) * scale;
}

/**
 * Punto de la superficie en (x, y) visto de frente o de espalda (mundo).
 * Prueba primero la malla principal; con `anyMesh`, si no la encuentra, acepta
 * cualquier malla visible (la capucha suele ser una pieza aparte).
 */
export function surfaceHit(root: Object3D, x: number, y: number, side: HoodieView, { anyMesh = false } = {}) {
  root.updateMatrixWorld(true);
  const dir = side === 'front' ? 1 : -1;
  const raycaster = new Raycaster(new Vector3(x, y, dir * 10), new Vector3(0, 0, -dir));
  let hit = raycaster.intersectObjects(principalMeshes(root), false)[0];
  if (!hit && anyMesh) {
    const visible: Mesh[] = [];
    root.traverse((obj) => {
      if ((obj as Mesh).isMesh && obj.visible) visible.push(obj as Mesh);
    });
    hit = raycaster.intersectObjects(visible, false)[0];
  }
  if (!hit) return null;
  const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new Vector3(0, 0, dir);
  if (normal.z * dir < 0) normal.negate();
  return { point: hit.point.clone(), normal };
}

export function computeDecalPlacement(
  root: Object3D,
  view: HoodieView,
  opts: PlacementOptions,
): DecalPlacement | null {
  root.updateMatrixWorld(true);
  const candidates = principalMeshes(root);
  if (!candidates.length) return null;

  const pa = VIEW_SPECS[view].printArea;
  const dir = view === 'front' ? 1 : -1;
  const y = printCenterY(view, opts);
  const raycaster = new Raycaster();

  // Si el centro tiene un hueco (cremallera abierta...) se prueba un poco al lado.
  let hit: { point: Vector3; object: Mesh } | null = null;
  for (const x of [0, 0.02, -0.02, 0.05, -0.05]) {
    raycaster.set(new Vector3(x, y, dir * 10), new Vector3(0, 0, -dir));
    const first = raycaster.intersectObjects(candidates, false)[0];
    if (first) {
      hit = { point: first.point.clone().setX(0), object: first.object as Mesh };
      break;
    }
  }
  if (!hit) return null;

  const mesh = hit.object;
  if ((mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) {
    console.warn('[hoodie] La malla principal es un SkinnedMesh: el decal usa su pose de reposo.');
  }

  // Proyector en mundo: retrasado para cubrir la curvatura sin llegar a la cara opuesta.
  const worldPos = hit.point.clone().add(new Vector3(0, 0, -dir * (DEPTH_M / 2 - FRONT_MARGIN_M)));
  const worldQuat = new Quaternion().setFromEuler(new Euler(0, view === 'front' ? 0 : Math.PI, 0));

  // Mundo → espacio local de la malla.
  mesh.updateWorldMatrix(true, false);
  const meshPos = new Vector3();
  const meshQuat = new Quaternion();
  const meshScale = new Vector3();
  mesh.matrixWorld.decompose(meshPos, meshQuat, meshScale);
  const s = (Math.abs(meshScale.x) + Math.abs(meshScale.y) + Math.abs(meshScale.z)) / 3 || 1;

  const localPos = worldPos.clone().applyMatrix4(new Matrix4().copy(mesh.matrixWorld).invert());
  const localRot = new Euler().setFromQuaternion(meshQuat.clone().invert().multiply(worldQuat));
  const w = (pa.widthCm / 100) * opts.scale;
  const h = (pa.heightCm / 100) * opts.scale;

  return {
    view,
    mesh,
    position: localPos.toArray() as [number, number, number],
    rotation: [localRot.x, localRot.y, localRot.z],
    scale: [w / s, h / s, DEPTH_M / s],
    hit: hit.point,
  };
}
