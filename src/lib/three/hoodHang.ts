import { Box3, BufferAttribute, Matrix4, Vector3, type Mesh, type Object3D } from 'three';
import { garmentMeshes, isHoodMesh } from './decalPlacement';
import {
  BODY_Z_UNDER_HOOD,
  HANG_FLATTEN,
  HANG_LIFT_M,
  HANG_STRETCH_Y,
  HANG_WIDEN,
  HANG_Z,
  MODEL_HPS_Y,
} from './modelConfig';

/**
 * «Colgar de la percha»: la prenda cuelga por la capucha y ésta queda estirada
 * y plana, como una lámina sobre los hombros, para poder dibujar sobre ella.
 *
 * No parte la malla: cada vértice recibe un peso de «capucha» (1 en los paneles
 * de la capucha, 0 en el cuerpo, gradual en la costura) y se desplaza según
 * ese peso. Es una deformación continua, sin cortes, y se anima con `progress`.
 */

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
};

interface Part {
  mesh: Mesh;
  inverse: Matrix4;
  /** Índices de vértice con peso > 0, con su posición de mundo en reposo y su peso. */
  index: Uint32Array;
  world: Float32Array;
  weight: Float32Array;
  restNormals: Float32Array | null;
  /** Vértices con peso 0: su normal no cambia al recalcular. */
  untouched: Uint32Array;
}

export interface HoodHang {
  meshes: Mesh[];
  /** 0 = prenda normal, 1 = capucha colgada y estirada. */
  setProgress: (t: number) => void;
  /** Recalcula normales y volúmenes al terminar la animación. */
  settle: (t: number) => void;
}

export function createHoodHang(root: Object3D): HoodHang | null {
  root.updateMatrixWorld(true);
  const panels = garmentMeshes(root);
  const hoods = panels.filter((m) => isHoodMesh(m, MODEL_HPS_Y));
  if (!hoods.length) return null;

  const box = new Box3();
  hoods.forEach((m) => box.expandByObject(m));
  const cx = (box.min.x + box.max.x) / 2;
  const halfWidth = (box.max.x - box.min.x) / 2;
  const [zLo, zHi] = BODY_Z_UNDER_HOOD;
  const zMid = (zLo + zHi) / 2;
  const yBase = box.min.y;

  const parts: Part[] = [];
  const v = new Vector3();

  for (const mesh of panels) {
    // La geometría del GLB está en caché y compartida: cada panel trabaja con la suya.
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.getAttribute('position');
    if (!(pos instanceof BufferAttribute)) continue;
    const isHood = hoods.includes(mesh);

    // ¿Sobresale el panel del grosor del cuerpo en la zona de la capucha? Entonces todo lo que
    // tiene allí es capucha (forro incluido).
    let sticksOut = false;
    if (!isHood) {
      for (let i = 0; i < pos.count && !sticksOut; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.x - cx) < halfWidth && v.y > yBase - 0.03 && (v.z < zLo || v.z > zHi)) sticksOut = true;
      }
    }

    const index: number[] = [];
    const world: number[] = [];
    const weight: number[] = [];
    const untouched: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      let w = 0;
      if (isHood) {
        w = 1;
      } else {
        const inX = 1 - smooth(0, 0.04, Math.abs(v.x - cx) - halfWidth);
        if (v.z < zMid) {
          const zStep = sticksOut ? 1 : smooth(0, 0.03, zLo - v.z);
          w = inX * smooth(yBase - 0.05, yBase, v.y) * zStep;
        } else {
          const zStep = sticksOut ? 1 : smooth(0, 0.03, v.z - zHi);
          w = inX * smooth(MODEL_HPS_Y - 0.02, MODEL_HPS_Y + 0.02, v.y) * zStep;
        }
      }
      if (w > 0.001) {
        index.push(i);
        world.push(v.x, v.y, v.z);
        weight.push(w);
      } else {
        untouched.push(i);
      }
    }
    if (!index.length) continue;

    const normal = mesh.geometry.getAttribute('normal');
    parts.push({
      mesh,
      inverse: mesh.matrixWorld.clone().invert(),
      index: Uint32Array.from(index),
      world: Float32Array.from(world),
      weight: Float32Array.from(weight),
      restNormals: normal ? (normal.array as Float32Array).slice() : null,
      untouched: Uint32Array.from(untouched),
    });
    mesh.frustumCulled = false;
  }
  if (!parts.length) return null;

  const p = new Vector3();

  return {
    meshes: parts.map((part) => part.mesh),
    setProgress(t) {
      for (const part of parts) {
        const pos = part.mesh.geometry.getAttribute('position') as BufferAttribute;
        for (let k = 0; k < part.index.length; k++) {
          const flat = t * part.weight[k];
          const x = part.world[k * 3];
          const y = part.world[k * 3 + 1];
          const z = part.world[k * 3 + 2];
          p.set(
            cx + (x - cx) * (1 + HANG_WIDEN * flat),
            yBase + (y - yBase) * (1 + HANG_STRETCH_Y * flat) + HANG_LIFT_M * flat,
            HANG_Z + (z - HANG_Z) * (1 - HANG_FLATTEN * flat),
          ).applyMatrix4(part.inverse);
          pos.setXYZ(part.index[k], p.x, p.y, p.z);
        }
        pos.needsUpdate = true;
      }
    },
    settle(t) {
      for (const part of parts) {
        const geo = part.mesh.geometry;
        const normal = geo.getAttribute('normal') as BufferAttribute | undefined;
        if (normal && part.restNormals) {
          if (t <= 0) {
            (normal.array as Float32Array).set(part.restNormals);
          } else {
            geo.computeVertexNormals();
            // Lo que no se ha movido conserva su normal original (no cambia el sombreado de las costuras).
            for (const i of part.untouched) {
              normal.setXYZ(i, part.restNormals[i * 3], part.restNormals[i * 3 + 1], part.restNormals[i * 3 + 2]);
            }
          }
          normal.needsUpdate = true;
        }
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
      }
    },
  };
}
