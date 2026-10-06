'use client';

import { removeFakeCheckerboard } from '../image/fakeTransparency';
import { sanitizeSvg, svgToDataUrl } from '../svg/sanitize';
import type { GeneratedAsset } from '../types';

const RASTER_TYPES = ['image/png', 'image/webp', 'image/jpeg'];
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function readAs(file: File, mode: 'text' | 'dataUrl') {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    if (mode === 'text') reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

/** Convierte archivos subidos (SVG/PNG/WebP/JPG) en assets de la galería. */
export async function importFiles(files: FileList | File[]): Promise<GeneratedAsset[]> {
  const out: GeneratedAsset[] = [];
  for (const file of Array.from(files)) {
    if (file.size > MAX_FILE_BYTES) continue;
    const base = {
      id: `asset_${crypto.randomUUID()}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
      provider: 'upload' as const,
      createdAt: Date.now(),
    };
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      const svg = sanitizeSvg(await readAs(file, 'text'));
      out.push({ ...base, kind: 'svg', svg, src: svgToDataUrl(svg) });
    } else if (RASTER_TYPES.includes(file.type)) {
      const original = await readAs(file, 'dataUrl');
      // Si la imagen trae el damero de transparencia pintado, se convierte en alfa real.
      const clean = await removeFakeCheckerboard(original).catch(() => null);
      out.push({ ...base, kind: 'png', src: clean ?? original });
    }
  }
  return out;
}
