'use client';

/**
 * Convierte arte claro sobre fondo negro (lo que devuelve DALL·E con el
 * prompt de la colección) en PNG transparente listo para la prenda negra.
 *
 * El brillo de cada píxel pasa a ser su opacidad ("luminance to alpha"): el
 * negro desaparece por completo —también los huecos interiores del diseño—,
 * los bordes antialias quedan suaves y el color se recupera dividiendo por
 * el alfa. Es lo que haría un separador de color para una tinta blanca.
 */
export async function knockoutBlack(src: string, { blackPoint = 24, whitePoint = 232 } = {}): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const range = whitePoint - blackPoint;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const level = Math.max(r, g, b);
    // Niveles: por debajo del punto negro → transparente; por encima del blanco → opaco.
    const alpha = Math.round(Math.min(1, Math.max(0, (level - blackPoint) / range)) * 255);
    if (alpha === 0) {
      px[i + 3] = 0;
      continue;
    }
    const k = 255 / Math.max(level, 1);
    px[i] = Math.min(255, Math.round(r * k));
    px[i + 1] = Math.min(255, Math.round(g * k));
    px[i + 2] = Math.min(255, Math.round(b * k));
    px[i + 3] = Math.round((alpha * px[i + 3]) / 255);
  }

  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = src;
  });
}
