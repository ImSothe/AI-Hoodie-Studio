/**
 * Recraft (vector_illustration) suele devolver el SVG con un primer <path> o
 * <rect> que cubre todo el viewBox a modo de fondo. Para imprimir sobre tela
 * negra necesitamos el gráfico aislado, así que eliminamos ese fondo.
 *
 * Heurística conservadora: sólo se quita una de las 3 primeras formas si es un
 * polígono simple (≤ 8 vértices, sin curvas) que ocupa ≥ 97 % del viewBox.
 */

function viewBoxSize(svg: string): { w: number; h: number } | null {
  const vb = svg.match(/viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (vb) return { w: parseFloat(vb[3]), h: parseFloat(vb[4]) };
  const w = svg.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i);
  const h = svg.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i);
  return w && h ? { w: parseFloat(w[1]), h: parseFloat(h[1]) } : null;
}

/** Bounds de un path poligonal (M/L/H/V/Z). Devuelve null si tiene curvas o > 8 vértices. */
function polygonBounds(d: string) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let x = 0;
  let y = 0;
  let cmd = '';
  let points = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < tokens.length; ) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === 'z' || cmd === 'Z') continue;
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
        x = (rel ? x : 0) + Number(tokens[i]);
        y = (rel ? y : 0) + Number(tokens[i + 1]);
        i += 2;
        break;
      case 'H':
        x = (rel ? x : 0) + Number(tokens[i++]);
        break;
      case 'V':
        y = (rel ? y : 0) + Number(tokens[i++]);
        break;
      default:
        return null; // curvas, arcos o datos inválidos
    }
    if (Number.isNaN(x) || Number.isNaN(y) || ++points > 8) return null;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return points >= 3 ? { minX, minY, maxX, maxY } : null;
}

function isFullBleedPath(d: string, w: number, h: number) {
  const b = polygonBounds(d);
  return !!b && (b.maxX - b.minX) / w >= 0.97 && (b.maxY - b.minY) / h >= 0.97;
}

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}

export function stripSvgBackground(svg: string): { svg: string; removed: boolean } {
  const size = viewBoxSize(svg);
  if (!size) return { svg, removed: false };

  const shapeRe = /<(path|rect)\b[^>]*?(\/>|>[\s\S]*?<\/\1>)/gi;
  let match: RegExpExecArray | null;
  let checked = 0;
  while ((match = shapeRe.exec(svg)) && checked < 3) {
    checked++;
    const [tag, kind] = match;
    let isBg = false;
    if (kind.toLowerCase() === 'rect') {
      const w = attr(tag, 'width');
      const h = attr(tag, 'height');
      const full = (v: string | null, total: number) =>
        v !== null && (v.trim() === '100%' || parseFloat(v) >= total * 0.97);
      isBg = full(w, size.w) && full(h, size.h);
    } else {
      const d = attr(tag, 'd');
      isBg = d !== null && isFullBleedPath(d, size.w, size.h);
    }
    if (isBg) {
      return { svg: svg.slice(0, match.index) + svg.slice(match.index + tag.length), removed: true };
    }
  }
  return { svg, removed: false };
}
