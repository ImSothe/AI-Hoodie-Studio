import { uvToPx, type PatternMode } from './layout';
import { PIECE_LABELS } from './panels';
import type { Affine, Island, PatternAnalysis } from './analysis';

export type { PatternMode };

/** Camino 2D de una pieza con todos los triángulos con el mismo sentido (así los solapes no se anulan). */
function pathOf(island: Island, m?: Affine) {
  const uv = island.mesh.geometry.getAttribute('uv');
  const path = new Path2D();
  const t = island.tris;
  for (let i = 0; i + 2 < t.length; i += 3) {
    const pts = [0, 1, 2].map((k) => {
      const [x, y] = uvToPx(uv.getX(t[i + k]), uv.getY(t[i + k]));
      return m ? ([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as [number, number]) : ([x, y] as [number, number]);
    });
    const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
    if (area < 0) pts.reverse();
    path.moveTo(pts[0][0], pts[0][1]);
    path.lineTo(pts[1][0], pts[1][1]);
    path.lineTo(pts[2][0], pts[2][1]);
    path.closePath();
  }
  return path;
}

/** Dibuja las piezas planas (relleno gris) y sus nombres. «joined»: los dos tendidos unidos por sus costuras. */
export function drawPatternGuide(ctx: CanvasRenderingContext2D, analysis: PatternAnalysis, mode: PatternMode, labels = true) {
  ctx.fillStyle = '#cfcfcf';
  ctx.strokeStyle = '#cfcfcf';
  ctx.lineWidth = 1.5;
  const layouts = mode === 'joined' ? [analysis.joinedFront, analysis.joinedBack] : [analysis.pieces];
  for (const layout of layouts) {
    for (const island of analysis.islands) {
      const transform = layout.get(island);
      if (!transform) continue;
      const path = pathOf(island, transform);
      ctx.fill(path, 'nonzero');
      ctx.stroke(path);
    }
  }
  if (!labels) return;
  ctx.font = '600 26px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const list = mode === 'joined' ? analysis.joinedLabels : PIECE_LABELS;
  for (const p of list) ctx.fillText(p.label.toUpperCase(), p.x, p.y);
}
