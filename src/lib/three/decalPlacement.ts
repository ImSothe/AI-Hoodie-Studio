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
/**
 * Una cara se estampa si su normal apunta al proyector con al menos este coseno
 * (≈ 66°). Más abajo la proyección ortográfica estira el dibujo en rayas por
 * los costados, que es justo lo que no puede salir en un archivo para fábrica.
 */
export const PRINT_MIN_FACING = 0.4;
/** La geometría conserva un margen más amplio: el corte limpio lo hace el material por píxel. */
const KEEP_FACING = 0.25;
/** Un panel cuenta como tejido si su mayor dimensión es al menos este % de la del modelo. */
const MIN_PANEL_RATIO = 0.2;
/** Un panel que empieza por encima de HPS - este margen (m) no es cuerpo ni manga: es la capucha. */
const HOOD_MIN_BELOW_HPS_M = 0.18;
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
  /**
   * Plano medio de la prenda (z de mundo): la espalda sólo imprime por detrás
   * de él y el frente por delante, así un diseño nunca pasa al otro lado.
   */
  zMid: number;
  /** Zona de la capucha (cualquier panel): ahí no se estampa; el cuerpo queda cubierto por ella. */
  hood: Box3 | null;
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

/** Un panel que empieza por encima de HPS - este margen (m) no es cuerpo ni manga: es la capucha. */
export const isHoodMesh = (m: Mesh, hpsY: number) => new Box3().setFromObject(m).min.y >= hpsY - HOOD_MIN_BELOW_HPS_M;

/** Paneles del tejido: las mallas grandes (se descartan cordones, puntadas, botones...). */
export function garmentMeshes(root: Object3D) {
  const modelBox = new Box3().setFromObject(root);
  const modelSize = modelBox.getSize(new Vector3());
  const reference = Math.max(modelSize.x, modelSize.y, modelSize.z);
  const meshes: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry.getAttribute('position')) return;
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
  const all = garmentMeshes(root);
  // La capucha cae por encima del cuerpo: el estampado va sobre el cuerpo y las mangas, nunca sobre ella.
  const isBody = (m: Mesh) => !isHoodMesh(m, hpsY);
  const meshes = all.filter(isBody);
  const hoodMeshes = all.filter((m) => !isBody(m));
  const hood = hoodMeshes.length ? new Box3() : null;
  hoodMeshes.forEach((m) => hood?.expandByObject(m));
  if (!meshes.length) return null;

  const zone = getDesignZoneRect(view);
  const metersPerPx = scale / (PX_PER_CM * 100);
  const centerY = hpsY + offsetYCm / 100 - (zone.top + zone.height / 2 - HPS_Y) * metersPerPx;

  const box = new Box3();
  meshes.forEach((m) => box.expandByObject(m));
  const depth = box.max.z - box.min.z + DEPTH_PADDING_M * 2;

  // Plano medio: la z media de los vértices del tejido (sigue el cuerpo, no las mangas).
  const v = new Vector3();
  let sum = 0;
  let count = 0;
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      sum += v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).z;
      count++;
    }
  }

  return {
    view,
    meshes,
    hood,
    zMid: count ? sum / count : (box.max.z + box.min.z) / 2,
    position: new Vector3(0, centerY, (box.max.z + box.min.z) / 2),
    // De espalda el proyector gira 180° para que el gráfico se lea sin espejo.
    rotation: new Euler(0, view === 'front' ? 0 : Math.PI, 0),
    size: new Vector3(zone.width * metersPerPx, zone.height * metersPerPx, depth),
  };
}

/** Genera un parche por panel con la misma proyección y descarta las caras que no miran al proyector. */
export function buildDecalPatches(projector: DecalProjector): DecalPatch[] {
  const toward = new Vector3(0, 0, projector.view === 'front' ? 1 : -1);
  const side = projector.view === 'back' ? -1 : 1;
  const patches: DecalPatch[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();

  const hood = projector.hood;
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
    // Por vértice: cuánto mira al proyector y a qué lado del plano medio está.
    // El material descarta los píxeles fuera de rango, así el borde sale limpio y continuo.
    const keptCut: number[] = [];
    const facing = [0, 0, 0];
    for (let i = 0; i + 2 < pos.count; i += 3) {
      if (!normal) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        n.copy(b.sub(a)).cross(c.sub(a)).normalize();
      }
      let bestFacing = -1;
      let bestSide = -1;
      for (let k = 0; k < 3; k++) {
        facing[k] = normal ? n.fromBufferAttribute(normal, i + k).normalize().dot(toward) : n.dot(toward);
        bestFacing = Math.max(bestFacing, facing[k]);
        bestSide = Math.max(bestSide, (pos.getZ(i + k) - projector.zMid) * side);
      }
      if (bestFacing < KEEP_FACING || bestSide < 0) continue;
      if (hood) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        const cx = (a.x + b.x + c.x) / 3;
        const cy = (a.y + b.y + c.y) / 3;
        if (cx > hood.min.x && cx < hood.max.x && cy > hood.min.y) continue;
      }
      for (let k = 0; k < 3; k++) {
        keptPos.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        keptUv.push(uv.getX(i + k), uv.getY(i + k));
        if (normal) keptNormal.push(normal.getX(i + k), normal.getY(i + k), normal.getZ(i + k));
        keptCut.push(facing[k], (pos.getZ(i + k) - projector.zMid) * side);
      }
    }
    raw.dispose();
    if (!keptPos.length) continue;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(keptPos, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(keptUv, 2));
    geometry.setAttribute('cut', new Float32BufferAttribute(keptCut, 2));
    if (keptNormal.length) geometry.setAttribute('normal', new Float32BufferAttribute(keptNormal, 3));
    geometry.computeBoundingSphere();
    patches.push({ mesh, geometry });
  }
  return patches;
}

/** Paso entre el lienzo 2D (px de escena) y el espacio 3D de la proyección de una cara. */
export interface ProjectionMapper {
  /** Punto de mundo → coordenadas de escena del lienzo. */
  toCanvas: (p: Vector3) => { x: number; y: number };
  /** Coordenadas de escena del lienzo → punto de mundo, a la profundidad z dada. */
  toWorld: (x: number, y: number, z: number) => Vector3;
}

/**
 * Inversa exacta del proyector de computeProjector: como la proyección es
 * ortográfica, cada punto de la superficie visto de frente o de espalda tiene
 * un único punto del lienzo (y viceversa). Es lo que permite arrastrar un
 * gráfico directamente sobre la prenda.
 */
export function projectionMapper(view: HoodieView, { hpsY, scale, offsetYCm }: PlacementOptions): ProjectionMapper {
  const zone = getDesignZoneRect(view);
  const metersPerPx = scale / (PX_PER_CM * 100);
  const centerY = hpsY + offsetYCm / 100 - (zone.top + zone.height / 2 - HPS_Y) * metersPerPx;
  // De espalda el proyector está girado 180°: el +x del lienzo es el -x del mundo.
  const sign = view === 'front' ? 1 : -1;
  const cx = zone.left + zone.width / 2;
  const cy = zone.top + zone.height / 2;
  return {
    toCanvas: (p) => ({ x: cx + (sign * p.x) / metersPerPx, y: cy - (p.y - centerY) / metersPerPx }),
    toWorld: (x, y, z) => new Vector3(sign * (x - cx) * metersPerPx, centerY - (y - cy) * metersPerPx, z),
  };
}
