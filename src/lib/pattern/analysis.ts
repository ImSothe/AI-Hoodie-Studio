import { BufferAttribute, Matrix3, Raycaster, Vector3, type Mesh, type Object3D } from 'three';
import { JOINED_H, JOINED_W, PATTERN_H, PATTERN_W, uvToPx } from './layout';
import { fabricPanels, islandsOf, PIECE_LABELS } from './panels';

/**
 * Análisis del patrón del GLB:
 *  1. separa cada malla en piezas planas («islas»);
 *  2. distingue la capa exterior del forro (las dos ocupan el mismo hueco);
 *  3. encuentra qué piezas se cosen con cuáles (sus bordes coinciden en 3D);
 *  4. despliega las piezas exteriores UNIDAS por sus costuras en una sola superficie plana,
 *     para poder poner un dibujo que pase de la espalda a la manga y a la capucha.
 */

/** Transformación 2D con la forma de canvas: x' = a·x + c·y + e,  y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
const apply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** a∘b: primero b y después a. */
const compose = (a: Affine, b: Affine): Affine => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const FLIP_X: Affine = [-1, 0, 0, 1, 0, 0];
/** Espejo horizontal de una pieza sobre su propio centro. */
const mirrorOf = (i: Island): Affine => [-1, 0, 0, 1, i.bbox[0] + i.bbox[2], 0];

export interface Island {
  mesh: Mesh;
  /** Triángulos (índices de vértice de tres en tres). */
  tris: number[];
  /** Vértices únicos de la pieza. */
  verts: number[];
  /** Posición en el plano del patrón (px) de cada vértice de `verts`. */
  px: Float32Array;
  /** Posición 3D de mundo de cada vértice de `verts`. */
  pts: Vector3[];
  bbox: [number, number, number, number];
  boundary: number[]; // posiciones dentro de `verts`
  /** Superficie de la pieza en el plano (px²). */
  area: number;
  /** Es la capa exterior (si no, es forro). */
  outer: boolean;
  /** El dibujo de esta pieza en el plano está en espejo respecto a verla desde fuera. */
  mirrored: boolean;
}

export interface PatternAnalysis {
  islands: Island[];
  /** Por malla: 1 = tela exterior, 0 = forro. */
  masks: Map<Mesh, Float32Array>;
  /** Tendido unido centrado en el delantero (delantero + mangas + capucha): pieza → lienzo unido. */
  joinedFront: Map<Island, Affine>;
  /** Tendido unido centrado en la espalda (espalda + mangas + capucha + piezas menores): pieza → lienzo unido. */
  joinedBack: Map<Island, Affine>;
  /** Piezas sueltas: cada una en su sitio del plano, ya sin el espejo. */
  pieces: Map<Island, Affine>;
  joinedLabels: { label: string; x: number; y: number }[];
}

/**
 * ¿El dibujo de la pieza en el plano está en espejo respecto a verla desde fuera? Se compara el
 * sentido de giro de sus triángulos en 3D (con la normal hacia fuera) con el que tienen en el plano.
 */
function isMirrored(mesh: Mesh, tris: number[], slot: Map<number, number>, px: Float32Array, pts: Vector3[]) {
  const normal = mesh.geometry.getAttribute('normal');
  if (!normal) return false;
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  const n = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  const g = new Vector3();
  let vote = 0;
  const step = Math.max(3, Math.floor(tris.length / 3 / 60) * 3);
  for (let t = 0; t + 2 < tris.length; t += step) {
    const i = [0, 1, 2].map((k) => slot.get(tris[t + k])!);
    e1.subVectors(pts[i[1]], pts[i[0]]);
    e2.subVectors(pts[i[2]], pts[i[0]]);
    g.crossVectors(e1, e2);
    n.set(0, 0, 0);
    for (const k of [0, 1, 2]) n.add(new Vector3().fromBufferAttribute(normal, tris[t + k]).applyMatrix3(normalMatrix));
    const side = Math.sign(g.dot(n)) || 1;
    const area = (px[i[1] * 2] - px[i[0] * 2]) * (px[i[2] * 2 + 1] - px[i[0] * 2 + 1]) - (px[i[2] * 2] - px[i[0] * 2]) * (px[i[1] * 2 + 1] - px[i[0] * 2 + 1]);
    // Vista desde fuera, un triángulo «antihorario» sale con área negativa en un plano con y hacia abajo.
    vote += Math.sign(area) * side;
  }
  return vote > 0;
}

function collect(root: Object3D): Island[] {
  const islands: Island[] = [];
  for (const mesh of fabricPanels(root)) {
    const pos = mesh.geometry.getAttribute('position');
    const uv = mesh.geometry.getAttribute('uv');
    for (const tris of islandsOf(mesh)) {
      const verts = [...new Set(tris)];
      const slot = new Map<number, number>();
      verts.forEach((v, i) => slot.set(v, i));
      const px = new Float32Array(verts.length * 2);
      const bbox: Island['bbox'] = [1e9, 1e9, -1e9, -1e9];
      const pts = verts.map((vi, i) => {
        const [x, y] = uvToPx(uv.getX(vi), uv.getY(vi));
        px[i * 2] = x;
        px[i * 2 + 1] = y;
        bbox[0] = Math.min(bbox[0], x);
        bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x);
        bbox[3] = Math.max(bbox[3], y);
        return new Vector3().fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      });
      // Borde de la pieza: vértices de aristas que sólo tiene un triángulo.
      const edges = new Map<number, number>();
      const key = (a: number, b: number) => (a < b ? a * 1_000_003 + b : b * 1_000_003 + a);
      for (let t = 0; t + 2 < tris.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          const e = key(tris[t + k], tris[t + ((k + 1) % 3)]);
          edges.set(e, (edges.get(e) ?? 0) + 1);
        }
      }
      const boundary = new Set<number>();
      for (let t = 0; t + 2 < tris.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          const a = tris[t + k];
          const b = tris[t + ((k + 1) % 3)];
          if (edges.get(key(a, b)) === 1) {
            boundary.add(slot.get(a)!);
            boundary.add(slot.get(b)!);
          }
        }
      }
      let area = 0;
      for (let t = 0; t + 2 < tris.length; t += 3) {
        const a = slot.get(tris[t])! * 2;
        const b = slot.get(tris[t + 1])! * 2;
        const c = slot.get(tris[t + 2])! * 2;
        area += Math.abs((px[b] - px[a]) * (px[c + 1] - px[a + 1]) - (px[c] - px[a]) * (px[b + 1] - px[a + 1])) / 2;
      }
      const mirrored = isMirrored(mesh, tris, slot, px, pts);
      islands.push({ mesh, tris, verts, px, pts, bbox, boundary: [...boundary], area, outer: true, mirrored });
    }
  }
  return islands;
}

const twin = (p: Island, q: Island) =>
  p !== q && p.verts.length === q.verts.length && p.bbox.every((value, k) => Math.abs(value - q.bbox[k]) < 3);

/** Marca como forro la capa de cada pareja cuyo rayo (en la dirección en que mira) choca con la tela del otro lado. */
function markLinings(islands: Island[]) {
  const meshes = [...new Set(islands.map((i) => i.mesh))];
  const raycaster = new Raycaster();
  raycaster.far = 3;
  const origin = new Vector3();
  const dir = new Vector3();
  const normalMatrix = new Matrix3();
  const escape = (i: Island) => {
    const normal = i.mesh.geometry.getAttribute('normal');
    if (!normal) return 0.5;
    normalMatrix.getNormalMatrix(i.mesh.matrixWorld);
    const samples = 6;
    let free = 0;
    for (let k = 0; k < samples; k++) {
      const idx = Math.floor((k + 0.5) * (i.verts.length / samples));
      dir.fromBufferAttribute(normal, i.verts[idx]).applyMatrix3(normalMatrix).normalize();
      origin.copy(i.pts[idx]).addScaledVector(dir, 0.003);
      raycaster.set(origin, dir);
      if (raycaster.intersectObjects(meshes, false).length === 0) free++;
    }
    return free / samples;
  };
  const seen = new Set<Island>();
  for (const first of islands) {
    if (seen.has(first)) continue;
    const group = islands.filter((q) => q === first || twin(first, q));
    group.forEach((g) => seen.add(g));
    if (group.length < 2) continue;
    const score = group.map(escape);
    const best = Math.max(...score);
    if (score.every((v) => v === best)) continue;
    group.forEach((g, i) => {
      if (score[i] < best) g.outer = false;
    });
  }
}

interface Seam {
  a: Island;
  b: Island;
  /** Parejas de vértices (posición en a.verts, posición en b.verts) que coinciden en 3D. */
  pairs: [number, number][];
}

/** Costuras: bordes de dos piezas exteriores cuyos vértices coinciden en el espacio 3D. */
function findSeams(outer: Island[]): Seam[] {
  const CELL = 0.01;
  const TOL = 0.006;
  const grid = new Map<string, { island: Island; slot: number }[]>();
  const cellOf = (p: Vector3) => [Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL)] as const;
  for (const island of outer) {
    for (const slot of island.boundary) {
      const [x, y, z] = cellOf(island.pts[slot]);
      const k = `${x},${y},${z}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push({ island, slot });
    }
  }
  const order = new Map(outer.map((island, i) => [island, i]));
  const seams = new Map<string, Seam>();
  for (const a of outer) {
    for (const slot of a.boundary) {
      const p = a.pts[slot];
      const [cx, cy, cz] = cellOf(p);
      const perIsland = new Map<Island, { slot: number; d: number }>();
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const c of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
              if (c.island === a || order.get(c.island)! < order.get(a)!) continue; // cada costura se guarda una vez
              const d = p.distanceTo(c.island.pts[c.slot]);
              if (d > TOL) continue;
              const prev = perIsland.get(c.island);
              if (!prev || d < prev.d) perIsland.set(c.island, { slot: c.slot, d });
            }
      for (const [b, m] of perIsland) {
        const k = `${order.get(a)}-${order.get(b)}`;
        const seam = seams.get(k) ?? { a, b, pairs: [] };
        seam.pairs.push([slot, m.slot]);
        seams.set(k, seam);
      }
    }
  }
  // Dos piezas pueden coserse por varios sitios (los dos costados del cuerpo): cada tramo continuo
  // es una costura distinta; si no, se mezclarían y una pieza acabaría encima de la otra.
  const result: Seam[] = [];
  for (const seam of seams.values()) {
    const n = seam.pairs.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const at = (i: number) => [seam.a.px[seam.pairs[i][0] * 2], seam.a.px[seam.pairs[i][0] * 2 + 1]];
    const pts = Array.from({ length: n }, (_, i) => at(i));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 45) parent[find(i)] = find(j);
      }
    }
    const groups = new Map<number, [number, number][]>();
    seam.pairs.forEach((pair, i) => {
      const g = groups.get(find(i)) ?? [];
      g.push(pair);
      groups.set(find(i), g);
    });
    for (const pairs of groups.values()) result.push({ a: seam.a, b: seam.b, pairs });
  }
  return result;
}

/** Rotación + desplazamiento que lleva los puntos `p` sobre los `q` (mínimos cuadrados). */
function rigid(p: [number, number][], q: [number, number][]): { m: Affine; error: number } {
  const n = p.length;
  const cp = p.reduce((s, v) => [s[0] + v[0] / n, s[1] + v[1] / n], [0, 0]);
  const cq = q.reduce((s, v) => [s[0] + v[0] / n, s[1] + v[1] / n], [0, 0]);
  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    const px = p[i][0] - cp[0];
    const py = p[i][1] - cp[1];
    const qx = q[i][0] - cq[0];
    const qy = q[i][1] - cq[1];
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
  }
  const t = Math.atan2(cross, dot);
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const m: Affine = [cos, sin, -sin, cos, cq[0] - (cos * cp[0] - sin * cp[1]), cq[1] - (sin * cp[0] + cos * cp[1])];
  let error = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = apply(m, p[i][0], p[i][1]);
    error += Math.hypot(x - q[i][0], y - q[i][1]);
  }
  return { m, error: error / n };
}

/**
 * Despliega unas piezas exteriores unidas por sus costuras en una sola superficie plana (árbol que parte
 * de `root`). Sólo coloca las piezas de `allowed`; una pieza que no cabe sin solaparse se queda fuera.
 */
function unfold(root: Island, seams: Seam[], allowed: Set<Island>, tier: Map<Island, number>): Map<Island, Affine> {
  const placed = new Map<Island, Affine>();
  placed.set(root, root.mirrored ? mirrorOf(root) : IDENTITY);
  const blocked = new Set<Island>();

  const usable = seams.filter((s) => s.pairs.length >= 8 && allowed.has(s.a) && allowed.has(s.b));

  // Casillas del plano que ocupa cada pieza colocada: sirve para que una pieza no se pegue donde ya hay otra.
  const CELL = 24;
  const cellsOf = (island: Island, m: Affine) => {
    const cells = new Set<number>();
    for (let i = 0; i < island.verts.length; i++) {
      const [x, y] = apply(m, island.px[i * 2], island.px[i * 2 + 1]);
      cells.add((Math.floor(x / CELL) + 5000) * 10000 + Math.floor(y / CELL) + 5000);
    }
    return cells;
  };
  const occupied = new Map<Island, Set<number>>();
  occupied.set(root, cellsOf(root, placed.get(root)!));

  // Ajuste de una pieza a una costura con una pieza ya colocada.
  const attach = (seam: Seam, from: Island, to: Island) => {
    const fromIsA = from === seam.a;
    const p: [number, number][] = [];
    const q: [number, number][] = [];
    for (const [sa, sb] of seam.pairs) {
      const fi = fromIsA ? sa : sb;
      const ti = fromIsA ? sb : sa;
      p.push([to.px[ti * 2], to.px[ti * 2 + 1]]);
      q.push(apply(placed.get(from)!, from.px[fi * 2], from.px[fi * 2 + 1]));
    }
    // Dos piezas con distinto «espejo» se alinean con una simetría; con el mismo, con un giro.
    // Sólo se prefiere la simetría si el giro no encaja de verdad (con costuras cortas ambos encajan por azar).
    const turn = rigid(p, q);
    const flip = rigid(p.map(([x, y]) => [-x, y] as [number, number]), q);
    const useFlip = turn.error > 12 && flip.error < turn.error * 0.5;
    const m = useFlip ? compose(flip.m, FLIP_X) : turn.m;
    const error = useFlip ? flip.error : turn.error;
    const cells = cellsOf(to, m);
    let overlap = 0;
    for (const taken of occupied.values()) for (const c of cells) if (taken.has(c)) overlap++;
    return { m, error, cells, overlap };
  };

  for (;;) {
    // Piezas por colocar que tienen costura con alguna ya colocada.
    const options = new Map<Island, { seam: Seam; from: Island }[]>();
    for (const seam of usable) {
      const aIn = placed.has(seam.a);
      const bIn = placed.has(seam.b);
      if (aIn === bIn) continue;
      const to = aIn ? seam.b : seam.a;
      if (blocked.has(to)) continue;
      const list = options.get(to) ?? [];
      list.push({ seam, from: aIn ? seam.a : seam.b });
      options.set(to, list);
    }
    if (!options.size) break;
    // Primero las piezas principales (mangas) y la capucha al final; dentro de cada grupo, la costura más larga.
    let target: Island | null = null;
    let rank = [99, 0];
    for (const [island, list] of options) {
      const t = tier.get(island) ?? 9;
      const len = Math.max(...list.map((o) => o.seam.pairs.length));
      if (t < rank[0] || (t === rank[0] && len > rank[1])) {
        rank = [t, len];
        target = island;
      }
    }
    const candidates = options.get(target!)!;
    // De sus costuras, la que no solape con lo ya colocado (y, a igualdad, la más larga).
    let best: { opt: (typeof candidates)[number]; fit: ReturnType<typeof attach> } | null = null;
    for (const opt of candidates) {
      const result = attach(opt.seam, opt.from, target!);
      // Una pieza que cae encima de otra no vale (el borde común sólo comparte unas casillas).
      if (result.overlap > 80) continue;
      if (result.error > 60) {
        usable.splice(usable.indexOf(opt.seam), 1);
        continue;
      }
      const better =
        !best ||
        result.overlap < best.fit.overlap - 40 ||
        (Math.abs(result.overlap - best.fit.overlap) <= 40 && opt.seam.pairs.length > best.opt.seam.pairs.length);
      if (better) best = { opt, fit: result };
    }
    if (!best) {
      blocked.add(target!); // no cabe sin solaparse
      continue;
    }
    placed.set(target!, best.fit.m);
    occupied.set(target!, best.fit.cells);
  }
  return placed;
}

/** Encaja unas piezas ya colocadas en una región del lienzo (escala uniforme y centrado). */
function fitInto(placed: Map<Island, Affine>, region: { x: number; y: number; w: number; h: number }) {
  const b = [1e9, 1e9, -1e9, -1e9];
  for (const [island, m] of placed) {
    for (let i = 0; i < island.verts.length; i++) {
      const [x, y] = apply(m, island.px[i * 2], island.px[i * 2 + 1]);
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  }
  const k = Math.min(region.w / (b[2] - b[0]), region.h / (b[3] - b[1]));
  const ox = region.x + (region.w - (b[2] - b[0]) * k) / 2 - b[0] * k;
  const oy = region.y + (region.h - (b[3] - b[1]) * k) / 2 - b[1] * k;
  const map = new Map<Island, Affine>();
  for (const [island, m] of placed) map.set(island, compose([k, 0, 0, k, ox, oy], m));
  return { map, k };
}

export function analyzePattern(root: Object3D): PatternAnalysis {
  root.updateMatrixWorld(true);
  const islands = collect(root);
  markLinings(islands);

  const masks = new Map<Mesh, Float32Array>();
  for (const island of islands) {
    const count = island.mesh.geometry.getAttribute('position').count;
    const mask = masks.get(island.mesh) ?? masks.set(island.mesh, new Float32Array(count).fill(1)).get(island.mesh)!;
    if (!island.outer) for (const v of island.verts) mask[v] = 0;
  }

  // Las piezas sin superficie (rendijas de costura) no se dibujan ni se estampan.
  const flat = (i: Island) => i.bbox[2] - i.bbox[0] < 6 || i.bbox[3] - i.bbox[1] < 6 || i.area < 2500;
  const outer = islands.filter((i) => i.outer && !flat(i));

  // Cada etiqueta del plano de piezas sueltas se asigna a su pieza (y a sus copias apiladas).
  const labelOf = new Map<Island, string>();
  for (const piece of PIECE_LABELS) {
    const island = outer
      .filter((i) => i.verts.length > 800 && piece.x >= i.bbox[0] && piece.x <= i.bbox[2] && piece.y >= i.bbox[1] && piece.y <= i.bbox[3])
      .sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]))[0];
    if (!island) continue;
    for (const copy of outer.filter((q) => q === island || twin(island, q))) if (!labelOf.has(copy)) labelOf.set(copy, piece.label);
  }
  const named = (label: string) =>
    [...labelOf].filter(([, l]) => l === label).map(([i]) => i).sort((a, b) => b.verts.length - a.verts.length);
  const back = named('Espalda')[0];
  const front = named('Delantero')[0];
  const shared = outer.filter((i) => ['Manga izquierda', 'Manga derecha', 'Capucha · lado', 'Capucha · centro'].includes(labelOf.get(i) ?? ''));
  const TIER: Record<string, number> = { 'Manga izquierda': 2, 'Manga derecha': 2, 'Capucha · lado': 3, 'Capucha · centro': 3 };
  const tier = new Map<Island, number>();
  for (const i of shared) tier.set(i, TIER[labelOf.get(i)!] ?? 9);

  // Dos tendidos unidos: uno parte del delantero y otro de la espalda. Las mangas y la capucha salen en los dos
  // (lo que se pinte en una pieza se ve en la prenda venga de donde venga). Una banda única no cabe sin solaparse.
  const seams = findSeams(outer);
  const frontLayout = front ? unfold(front, seams, new Set([front, ...shared]), tier) : new Map<Island, Affine>();
  const backLayout = back ? unfold(back, seams, new Set([back, ...shared]), tier) : new Map<Island, Affine>();

  const margin = 40;
  const topH = JOINED_H * 0.8;
  const half = JOINED_W / 2;
  const fitFront = fitInto(frontLayout, { x: margin, y: margin, w: half - margin * 1.5, h: topH - margin });
  const fitBack = fitInto(backLayout, { x: half + margin * 0.5, y: margin, w: half - margin * 1.5, h: topH - margin });
  const joinedFront = fitFront.map;
  const joinedBack = fitBack.map;

  // Piezas menores (cintura, puños…): en fila bajo los tendidos, a la misma escala.
  const placedAny = new Set([...frontLayout.keys(), ...backLayout.keys()]);
  const apart = outer.filter((i) => !placedAny.has(i)).sort((a, b) => b.verts.length - a.verts.length);
  const k = fitBack.k;
  let cursorX = margin;
  let rowY = topH + margin / 2;
  let rowH = 0;
  for (const island of apart) {
    const w = (island.bbox[2] - island.bbox[0]) * k;
    const h = (island.bbox[3] - island.bbox[1]) * k;
    if (cursorX + w > JOINED_W - margin && rowH > 0) {
      cursorX = margin;
      rowY += rowH + 20;
      rowH = 0;
    }
    joinedBack.set(
      island,
      compose([k, 0, 0, k, cursorX - island.bbox[0] * k, rowY - island.bbox[1] * k], island.mirrored ? mirrorOf(island) : IDENTITY),
    );
    cursorX += w + 20;
    rowH = Math.max(rowH, h);
  }

  // Los forros siguen a su pareja exterior.
  for (const island of islands) {
    if (island.outer && !flat(island)) continue;
    const partner = flat(island) ? undefined : outer.find((o) => twin(o, island));
    if (!partner) continue;
    if (joinedFront.has(partner)) joinedFront.set(island, joinedFront.get(partner)!);
    if (joinedBack.has(partner)) joinedBack.set(island, joinedBack.get(partner)!);
  }

  // Nombres de cada tendido.
  const joinedLabels: PatternAnalysis['joinedLabels'] = [];
  for (const piece of PIECE_LABELS) {
    const island = outer
      .filter((i) => i.verts.length > 800 && piece.x >= i.bbox[0] && piece.x <= i.bbox[2] && piece.y >= i.bbox[1] && piece.y <= i.bbox[3])
      .sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]))[0];
    if (!island) continue;
    for (const layout of [joinedFront, joinedBack]) {
      const m = layout.get(island);
      if (!m) continue;
      const [x, y] = apply(m, piece.x, piece.y);
      joinedLabels.push({ label: piece.label, x, y });
    }
  }

  const pieces = new Map<Island, Affine>();
  for (const island of islands) pieces.set(island, island.mirrored ? mirrorOf(island) : IDENTITY);
  return { islands, masks, joinedFront, joinedBack, pieces, joinedLabels };
}

/**
 * Añade a cada malla los juegos de UV con la posición de cada vértice en el lienzo del patrón:
 *  - `uvFront` y `uvBack`: los dos tendidos unidos (lienzo de `JOINED_*`);
 *  - `uvPieces`: las piezas sueltas (lienzo de `PATTERN_*`).
 * Un vértice que no está en un tendido apunta a la esquina del lienzo (transparente).
 */
export function attachPatternUv(analysis: PatternAnalysis) {
  const write = (name: string, transforms: Map<Island, Affine>, w: number, h: number) => {
    const byMesh = new Map<Mesh, Float32Array>();
    for (const island of analysis.islands) {
      const count = island.mesh.geometry.getAttribute('position').count;
      const uv = byMesh.get(island.mesh) ?? byMesh.set(island.mesh, new Float32Array(count * 2)).get(island.mesh)!;
      const m = transforms.get(island);
      island.verts.forEach((vi, i) => {
        if (!m) return; // se queda en (0, 0): esquina transparente
        const [x, y] = apply(m, island.px[i * 2], island.px[i * 2 + 1]);
        uv[vi * 2] = x / w;
        uv[vi * 2 + 1] = 1 - y / h;
      });
    }
    for (const [mesh, data] of byMesh) mesh.geometry.setAttribute(name, new BufferAttribute(data, 2));
  };
  write('uvFront', analysis.joinedFront, JOINED_W, JOINED_H);
  write('uvBack', analysis.joinedBack, JOINED_W, JOINED_H);
  write('uvPieces', analysis.pieces, PATTERN_W, PATTERN_H);
}
