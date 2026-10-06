import { Box3, BufferGeometry, Euler, Float32BufferAttribute, Raycaster, Vector3, type Mesh, type Object3D } from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { HPS_Y, PX_PER_CM, VIEW_SPECS, getDesignZoneRect, type HoodieView } from '../hoodie/spec';

/**
 * Proyección del diseño SIN depender de las UVs del modelo.
 *
 * Un único proyector ortográfico, en coordenadas de mundo, cubre la zona de
 * diseño completa (cuerpo, mangas y capucha) vista de frente o de espalda. El
 * GLB suele venir fragmentado en paneles (torso, mangas, capucha, puños...):
 * por cada panel del tejido se genera un parche de DecalGeometry con la MISMA
 * proyección, así el gráfico cruza las costuras sin cortes ni desfases.
 *
 * Los parches se calculan en espacio de mundo (no dependen de nodos rotados o
 * escalados del GLB) y sólo conservan las caras que miran al proyector, de modo
 * que la estampa de la espalda nunca asoma por delante.
 */

/** Holgura (m) del proyector por delante y por detrás del tejido. */
const DEPTH_PADDING_M = 0.1;
/** Una cara se estampa si su normal apunta al proyector con al menos este coseno. */
const MIN_FACING = 0.2;
/** Un panel cuenta como tejido si su mayor dimensión es al menos este % de la del modelo. */
const MIN_PANEL_RATIO = 0.2;
/** Una malla es "principal" si mide al menos este % de la altura del modelo. */
const MIN_HEIGHT_RATIO = 0.3;

export interface DecalProjector {
  view: HoodieView;
  /** Centro, orientación y tamaño del proyector en mundo. */
  position: Vector3;
  rotation: Euler;
  size: Vector3;
  /** Paneles del tejido sobre los que se proyecta. */
  meshes: Mesh[];
}

/** Parche de decal ya recortado sobre un panel, en coordenadas de mundo. */
export interface DecalPatch {
  mesh: Mesh;
  geometry: BufferGeometry;
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

/** Paneles del tejido: las mallas grandes (se descartan cordones, puntadas, botones...). */
function garmentMeshes(root: Object3D) {
  const modelBox = new Box3().setFromObject(root);
  const modelSize = modelBox.getSize(new Vector3());
  const reference = Math.max(modelSize.x, modelSize.y, modelSize.z);
  const meshes: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry.getAttribute('position')) return;
    const size = new Box3().setFromObject(mesh).getSize(new Vector3());
    if (Math.max(size.x, size.y, size.z) >= reference * MIN_PANEL_RATIO) meshes.push(mesh);
  });
  return meshes;
}

/**
 * Proyector de una cara: cubre toda la zona de diseño del lienzo (7 px = 1 cm,
 * con la escala de calibración) y el grosor entero de la prenda.
 */
export function computeProjector(root: Object3D, view: HoodieView, { hpsY, scale, offsetYCm }: PlacementOptions): DecalProjector | null {
  root.updateMatrixWorld(true);
  const meshes = garmentMeshes(root);
  if (!meshes.length) return null;

  const zone = getDesignZoneRect(view);
  const metersPerPx = scale / (PX_PER_CM * 100);
  const centerY = hpsY + offsetYCm / 100 - (zone.top + zone.height / 2 - HPS_Y) * metersPerPx;

  const box = new Box3();
  meshes.forEach((m) => box.expandByObject(m));
  const depth = box.max.z - box.min.z + DEPTH_PADDING_M * 2;

  return {
    view,
    meshes,
    position: new Vector3(0, centerY, (box.max.z + box.min.z) / 2),
    // De espalda el proyector gira 180° para que el gráfico se lea sin espejo.
    rotation: new Euler(0, view === 'front' ? 0 : Math.PI, 0),
    size: new Vector3(zone.width * metersPerPx, zone.height * metersPerPx, depth),
  };
}

/** Genera un parche por panel con la misma proyección y descarta las caras que no miran al proyector. */
export function buildDecalPatches(projector: DecalProjector): DecalPatch[] {
  const toward = new Vector3(0, 0, projector.view === 'front' ? 1 : -1);
  const patches: DecalPatch[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();

  for (const mesh of projector.meshes) {
    mesh.updateWorldMatrix(true, false);
    const raw = new DecalGeometry(mesh, projector.position, projector.rotation, projector.size);
    const pos = raw.getAttribute('position');
    const uv = raw.getAttribute('uv');
    const normal = raw.getAttribute('normal');
    if (!pos || pos.count < 3) {
      raw.dispose();
      continue;
    }

    const keptPos: number[] = [];
    const keptUv: number[] = [];
    const keptNormal: number[] = [];
    for (let i = 0; i + 2 < pos.count; i += 3) {
      if (normal) {
        n.set(0, 0, 0);
        for (let k = 0; k < 3; k++) n.add(a.fromBufferAttribute(normal, i + k));
      } else {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        n.copy(b.sub(a)).cross(c.sub(a));
      }
      if (n.normalize().dot(toward) < MIN_FACING) continue;
      for (let k = 0; k < 3; k++) {
        keptPos.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        keptUv.push(uv.getX(i + k), uv.getY(i + k));
        if (normal) keptNormal.push(normal.getX(i + k), normal.getY(i + k), normal.getZ(i + k));
      }
    }
    raw.dispose();
    if (!keptPos.length) continue;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(keptPos, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(keptUv, 2));
    if (keptNormal.length) geometry.setAttribute('normal', new Float32BufferAttribute(keptNormal, 3));
    geometry.computeBoundingSphere();
    patches.push({ mesh, geometry });
  }
  return patches;
}
