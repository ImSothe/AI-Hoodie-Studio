/**
 * Saneado de SVG (isomórfico: servidor y navegador).
 *
 * Los SVG vienen de una API externa o de una subida del usuario. Nunca se
 * insertan en el DOM como HTML (se pintan con <img> o los parsea Fabric), pero
 * se limpian igualmente como defensa en profundidad: sin scripts, sin
 * manejadores de eventos, sin foreignObject y sin recursos externos (evita
 * tracking y que el lienzo quede "tainted", lo que rompería la exportación).
 */

const MAX_SVG_BYTES = 5 * 1024 * 1024;

export function sanitizeSvg(input: string): string {
  if (input.length > MAX_SVG_BYTES) throw new Error('SVG demasiado grande (máx. 5 MB).');

  let svg = input
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(iframe|embed|object|audio|video)[\s\S]*?(<\/\1\s*>|\/>)/gi, '')
    // on*="..." / on*='...' / on*=valor
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // href externos (se permiten anclas internas #id y data: de imagen)
    .replace(
      /\s(?:xlink:)?href\s*=\s*("|')(?!#|data:image\/(?:png|jpe?g|gif|webp);)[\s\S]*?\1/gi,
      '',
    )
    .replace(/javascript:/gi, '')
    .replace(/url\(\s*(?!["']?#)[^)]*\)/gi, 'none')
    .trim();

  const start = svg.search(/<svg[\s>]/i);
  if (start === -1) throw new Error('El contenido no es un SVG válido.');
  svg = svg.slice(start);
  if (!/^<svg[^>]*\sxmlns=/i.test(svg)) {
    svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // Un prefijo xlink sin declarar rompe el parser XML (text/xml) de Fabric.
  if (/\sxlink:/i.test(svg) && !/^<svg[^>]*\sxmlns:xlink=/i.test(svg)) {
    svg = svg.replace(/^<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return svg;
}

export function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
