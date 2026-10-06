/**
 * Extrae los colores sólidos de un SVG. En serigrafía cada color es una
 * pantalla, así que este dato va al Tech Pack para presupuestar.
 */

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function normalize(raw: string): string | null {
  const c = raw.trim().toLowerCase();
  if (!c || c === 'none' || c === 'transparent' || c.startsWith('url(')) return null;
  const rgb = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/);
  if (rgb) {
    if (rgb[4] !== undefined && parseFloat(rgb[4]) === 0) return null;
    return toHex(+rgb[1], +rgb[2], +rgb[3]);
  }
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    return `#${h}`.toUpperCase();
  }
  return null;
}

export function extractSvgColors(svg: string): string[] {
  const found = new Set<string>();
  const re = /(?:fill|stroke|stop-color)\s*(?:=\s*["']|:\s*)([^"';)]+\)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const hex = normalize(m[1]);
    if (hex) found.add(hex);
  }
  return [...found];
}

/** El SVG contiene imágenes raster incrustadas (assets PNG). */
export function svgHasRaster(svg: string) {
  return /<image\b/i.test(svg);
}
