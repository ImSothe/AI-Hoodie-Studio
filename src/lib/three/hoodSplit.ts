import { Box3, BufferGeometry, Mesh, Vector3, type Object3D } from 'three';
import { garmentMeshes, isHoodMesh } from './decalPlacement';
import { BODY_Z_UNDER_HOOD, MODEL_HPS_Y } from './modelConfig';

/**
 * El GLB trae la capucha repartida entre paneles propios y triángulos mezclados
 * con el cuerpo. Aquí se separa en mallas aparte (marcadas con userData.hood)
 * que comparten material y atributos con el original, para poder moverlas sin
 * tocar el cuerpo. Devuelve las mallas de la capucha.
 */
/** Holgura (m) alrededor de la caja de la capucha para no dejar tiras de su borde en el cuerpo. */
const HOOD_EDGE_MARGIN_M = 0.03;
/** Por delante, la capucha empieza a esta distancia bajo el HPS (m); por debajo es pecho. */
const HOOD_FRONT_BELOW_HPS_M = 0;

export function splitHood(root: Object3D): Mesh[] {
  root.updateMatrixWorld(true);
  const panels = garmentMeshes(root);
  const hoods = panels.filter((m) => isHoodMesh(m, MODEL_HPS_Y));
  if (!hoods.length) return [];

  const box = new Box3();
  hoods.forEach((m) => box.expandByObject(m));
  hoods.forEach((m) => (m.userData.hood = true));

  const [zLo, zHi] = BODY_Z_UNDER_HOOD;
  const zMid = (zLo + zHi) / 2;
  const result: Mesh[] = [...hoods];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();

  for (const mesh of panels) {
    if (mesh.userData.hood || !mesh.parent) continue;
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const source = geo.getIndex();
    const count = source ? source.count : pos.count;
    const rest: number[] = [];
    const hood: number[] = [];
    // Un panel cuya zona de capucha cabe en el grosor del cuerpo es cuerpo puro; si sobresale, todo lo que
    // tiene en esa zona es capucha (forro incluido), no sólo lo que sobresale.
    let sticksOut = false;
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (a.x > box.min.x && a.x < box.max.x && a.y > box.min.y - HOOD_EDGE_MARGIN_M && (a.z < zLo || a.z > zHi)) {
        sticksOut = true;
        break;
      }
    }
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = source ? source.getX(i) : i;
      const ib = source ? source.getX(i + 1) : i + 1;
      const ic = source ? source.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
      const x = (a.x + b.x + c.x) / 3;
      const y = (a.y + b.y + c.y) / 3;
      const z = (a.z + b.z + c.z) / 3;
      const inRegion = x > box.min.x - HOOD_EDGE_MARGIN_M && x < box.max.x + HOOD_EDGE_MARGIN_M && y > box.min.y - HOOD_EDGE_MARGIN_M;
      // Atrás la capucha cuelga sobre la espalda; delante sólo es capucha lo que está a la altura del cuello o por encima (el pecho no).
      const inHood = z < zMid ? inRegion && (sticksOut || z < zLo) : y > MODEL_HPS_Y - HOOD_FRONT_BELOW_HPS_M && inRegion && (sticksOut || z > zHi);
      (inHood ? hood : rest).push(ia, ib, ic);
    }
    if (!hood.length) continue;

    // Geometrías nuevas con los mismos atributos: la del GLB en caché no se toca.
    const restGeo = new BufferGeometry();
    const hoodGeo = new BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      restGeo.setAttribute(name, geo.getAttribute(name));
      hoodGeo.setAttribute(name, geo.getAttribute(name));
    }
    restGeo.setIndex(rest);
    hoodGeo.setIndex(hood);
    restGeo.computeBoundingSphere();
    hoodGeo.computeBoundingSphere();
    mesh.geometry = restGeo;

    const part = new Mesh(hoodGeo, mesh.material);
    part.name = `${mesh.name}_hood`;
    part.position.copy(mesh.position);
    part.quaternion.copy(mesh.quaternion);
    part.scale.copy(mesh.scale);
    part.userData.hood = true;
    mesh.parent.add(part);
    result.push(part);
  }
  root.updateMatrixWorld(true);
  return result;
}
