import { Box3, Matrix3, Raycaster, Vector3, type Mesh, type Object3D } from 'three';
import { uvToPx } from './layout';

/** Una pieza plana del patrón (una «isla» de la malla): sus triángulos y cómo se llama. */
export interface PatternPanel {
  mesh: Mesh;
  /** Triángulos de la pieza: índices de vértice de tres en tres. */
  triangles: number[];
  /** Centro de la pieza en el lienzo (px), para poner la etiqueta. */
  center: [number, number];
}

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
  { label: 'Manga izquierda', x: 255, y: 523 },
  { label: 'Manga derecha', x: 1543, y: 560 },
  { label: 'Delantero', x: 845, y: 466 },
  { label: 'Espalda', x: 255, y: 1260 },
  { label: 'Capucha · lado', x: 975, y: 1274 },
  { label: 'Capucha · centro', x: 1265, y: 1396 },
  { label: 'Capucha · lado', x: 1513, y: 1277 },
  { label: 'Cintura', x: 962, y: 41 },
  { label: 'Puño', x: 257, y: 138 },
  { label: 'Puño', x: 1543, y: 170 },
];

/**
 * Marca por vértice qué tela es la cara EXTERIOR (1) y cuál el forro (0). Las dos capas
 * (p. ej. capucha por fuera y forro por dentro) comparten hueco en el patrón; sin esto el
 * dibujo saldría también por dentro. De las piezas que se solapan en el plano, la exterior
 * es la que queda más lejos del centro del conjunto.
 */
export function outerMasks(root: Object3D): Map<Mesh, Float32Array> {
  root.updateMatrixWorld(true);
  interface Island {
    mesh: Mesh;
    verts: number[];
    uv: [number, number, number, number]; // x0, y0, x1, y1 en el lienzo
    pts: Vector3[];
  }
  const islands: Island[] = [];
  const masks = new Map<Mesh, Float32Array>();
  for (const mesh of fabricPanels(root)) {
    const pos = mesh.geometry.getAttribute('position');
    const uv = mesh.geometry.getAttribute('uv');
    masks.set(mesh, new Float32Array(pos.count).fill(1));
    for (const tri of islandsOf(mesh)) {
      const verts = [...new Set(tri)];
      const uvBox: Island['uv'] = [1e9, 1e9, -1e9, -1e9];
      const pts = verts.map((vi) => {
        const [x, y] = uvToPx(uv.getX(vi), uv.getY(vi));
        uvBox[0] = Math.min(uvBox[0], x);
        uvBox[1] = Math.min(uvBox[1], y);
        uvBox[2] = Math.max(uvBox[2], x);
        uvBox[3] = Math.max(uvBox[3], y);
        return new Vector3().fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      });
      islands.push({ mesh, verts, uv: uvBox, pts });
    }
  }
  // Cada pieza de tela viene duplicada (capa exterior y forro, casi pegadas): mismas UV y mismo número
  // de vértices. Cada capa mira hacia su lado: la exterior mira al mundo (un rayo en esa dirección
  // sale libre) y el forro mira a la cavidad de la prenda (el rayo choca con la tela del otro lado).
  const panelMeshes = [...masks.keys()];
  const raycaster = new Raycaster();
  raycaster.far = 3;
  const origin = new Vector3();
  const dir = new Vector3();
  const normalOf = new Matrix3();
  const escape = (i: Island) => {
    const normal = i.mesh.geometry.getAttribute('normal');
    if (!normal) return 0.5;
    normalOf.getNormalMatrix(i.mesh.matrixWorld);
    const samples = 6;
    let free = 0;
    for (let k = 0; k < samples; k++) {
      const idx = Math.floor((k + 0.5) * (i.verts.length / samples));
      const vi = i.verts[idx];
      dir.fromBufferAttribute(normal, vi).applyMatrix3(normalOf).normalize();
      origin.copy(i.pts[idx]).addScaledVector(dir, 0.003);
      raycaster.set(origin, dir);
      if (raycaster.intersectObjects(panelMeshes, false).length === 0) free++;
    }
    return free / samples;
  };
  const same = (p: Island, q: Island) =>
    p !== q &&
    p.verts.length === q.verts.length &&
    p.uv.every((value, k) => Math.abs(value - q.uv[k]) < 3);
  const seen = new Set<Island>();
  for (const first of islands) {
    if (seen.has(first)) continue;
    const group = islands.filter((q) => q === first || same(first, q));
    group.forEach((g) => seen.add(g));
    if (group.length < 2) continue;
    const d = group.map(escape);
    const best = Math.max(...d);
    if (d.every((v) => v === best)) continue; // no se distinguen: se dejan las dos
    group.forEach((g, i) => {
      if (d[i] >= best) return;
      const mask = masks.get(g.mesh)!;
      for (const vi of g.verts) mask[vi] = 0;
    });
  }
  return masks;
}

/** Lista las piezas planas con su nombre y su centro sobre el lienzo del patrón. */
export function describePanels(root: Object3D): PatternPanel[] {
  const out: PatternPanel[] = [];
  for (const mesh of fabricPanels(root)) {
    const uv = mesh.geometry.getAttribute('uv');
    for (const triangles of islandsOf(mesh)) {
      let sx = 0;
      let sy = 0;
      for (const vi of triangles) {
        const [x, y] = uvToPx(uv.getX(vi), uv.getY(vi));
        sx += x;
        sy += y;
      }
      out.push({ mesh, triangles, center: [sx / triangles.length, sy / triangles.length] });
    }
  }
  return out;
}

/** Camino 2D de una pieza con todos los triángulos con el mismo sentido (así los solapes no se anulan). */
function pathOf(panel: PatternPanel) {
  const uv = panel.mesh.geometry.getAttribute('uv');
  const path = new Path2D();
  const t = panel.triangles;
  for (let i = 0; i + 2 < t.length; i += 3) {
    const pts = [0, 1, 2].map((k) => uvToPx(uv.getX(t[i + k]), uv.getY(t[i + k])));
    const area =
      (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
    if (area < 0) pts.reverse();
    path.moveTo(pts[0][0], pts[0][1]);
    path.lineTo(pts[1][0], pts[1][1]);
    path.lineTo(pts[2][0], pts[2][1]);
    path.closePath();
  }
  return path;
}

/** Dibuja las piezas planas (relleno gris) y sus nombres sobre un canvas 2D. */
export function drawPatternGuide(ctx: CanvasRenderingContext2D, panels: PatternPanel[], labels = true) {
  ctx.fillStyle = '#cfcfcf';
  ctx.strokeStyle = '#cfcfcf';
  ctx.lineWidth = 1.5;
  for (const panel of panels) {
    const path = pathOf(panel);
    ctx.fill(path, 'nonzero');
    ctx.stroke(path);
  }
  if (!labels) return;
  ctx.font = '600 26px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const p of PIECE_LABELS) ctx.fillText(p.label.toUpperCase(), p.x, p.y);
}
