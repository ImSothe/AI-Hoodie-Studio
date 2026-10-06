import { Box3, Vector3, type Mesh, type Object3D } from 'three';

/** Paneles de tela: mallas grandes con UV (se descartan cordones, puntadas, botones…). */
export function fabricPanels(root: Object3D): Mesh[] {
  root.updateMatrixWorld(true);
  const model = new Box3().setFromObject(root).getSize(new Vector3());
  const reference = Math.max(model.x, model.y, model.z);
  const out: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry.getAttribute('uv') || !mesh.geometry.getAttribute('position')) return;
    const size = new Box3().setFromObject(mesh).getSize(new Vector3());
    if (Math.max(size.x, size.y, size.z) >= reference * 0.2) out.push(mesh);
  });
  return out;
}

/** Separa una malla en sus piezas planas: los triángulos que comparten vértices forman una pieza. */
export function islandsOf(mesh: Mesh): number[][] {
  const geo = mesh.geometry;
  const index = geo.getIndex();
  if (!index) return [Array.from({ length: geo.getAttribute('position').count }, (_, i) => i)];
  const parent = new Int32Array(geo.getAttribute('position').count).map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let t = 0; t + 2 < index.count; t += 3) {
    const a = find(index.getX(t));
    parent[find(index.getX(t + 1))] = a;
    parent[find(index.getX(t + 2))] = a;
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t + 2 < index.count; t += 3) {
    const root = find(index.getX(t));
    const list = groups.get(root) ?? [];
    list.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
    groups.set(root, list);
  }
  return [...groups.values()];
}

/**
 * Nombres de las piezas del patrón de ESTE modelo (posición de cada pieza en el lienzo, en px).
 * El patrón del GLB mezcla piezas apiladas (forros) y varias piezas en una malla, así que los
 * nombres se fijan por su sitio en el plano. Si cambia de modelo, hay que actualizar la lista.
 */
export const PIECE_LABELS: { label: string; x: number; y: number }[] = [
  { label: 'Manga izquierda', x: 1545, y: 1189 },
  { label: 'Manga derecha', x: 257, y: 1152 },
  { label: 'Delantero', x: 955, y: 1246 },
  { label: 'Espalda', x: 1545, y: 452 },
  { label: 'Capucha · lado', x: 825, y: 438 },
  { label: 'Capucha · centro', x: 535, y: 316 },
  { label: 'Capucha · lado', x: 287, y: 435 },
  { label: 'Cintura', x: 838, y: 1671 },
  { label: 'Puño', x: 1543, y: 1574 },
  { label: 'Puño', x: 257, y: 1542 },
];

