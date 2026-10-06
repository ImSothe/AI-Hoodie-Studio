'use client';

import type { Canvas, FabricObject } from 'fabric';
import {
  THREAD_FINISHES,
  TONAL_TECHNIQUE,
  getPrintAreaRect,
  type ThreadFinish,
  type HoodieView,
  type Rect,
} from '../hoodie/spec';
import { getDesignBounds, isDesign, layerOfObject, roleOf, techniqueOfObject } from './editor';
import { withoutBackdrop } from './garment';
import { getCanvas, getTextureCanvas, type TextureLayer } from './registry';

interface RenderOptions {
  /** Incluir el template de la sudadera (mockup) o sólo el arte (transparente). */
  includeBackground?: boolean;
  filter?: (obj: FabricObject) => boolean;
}

/**
 * Renderiza una región del lienzo (coordenadas de escena) a un <canvas> nuevo
 * con una densidad exacta de `pxPerUnit` píxeles por unidad de escena.
 * Usa toCanvasElement de Fabric para que las cachés de objetos se regeneren a
 * la resolución de salida (nada de bitmaps reescalados y borrosos).
 */
export function renderRegion(
  canvas: Canvas,
  region: Rect,
  pxPerUnit: number,
  { includeBackground = false, filter = isDesign }: RenderOptions = {},
): HTMLCanvasElement {
  const zoom = canvas.getZoom() || 1;
  const vpt = canvas.viewportTransform;
  const bgImage = canvas.backgroundImage;
  const bgColor = canvas.backgroundColor;
  if (!includeBackground) {
    canvas.backgroundImage = undefined;
    canvas.backgroundColor = '';
  }
  try {
    return canvas.toCanvasElement(pxPerUnit / zoom, {
      left: region.left * zoom + vpt[4],
      top: region.top * zoom + vpt[5],
      width: region.width * zoom,
      height: region.height * zoom,
      // toCanvasElement tipa el objeto base; los del lienzo son FabricObject.
      filter: (obj) => filter(obj as FabricObject),
    });
  } finally {
    canvas.backgroundImage = bgImage;
    canvas.backgroundColor = bgColor;
  }
}

/**
 * Repinta el canvas-textura de una capa con el área de impresión actual.
 * Cada capa sólo contiene los elementos de su técnica (serigrafía plana,
 * reflectante o bordado), así cada <Decal> 3D lleva su propio material.
 */
export function paintPrintTexture(view: HoodieView, layer: TextureLayer = 'print'): HTMLCanvasElement {
  const target = getTextureCanvas(view, layer);
  const ctx = target.getContext('2d')!;
  ctx.clearRect(0, 0, target.width, target.height);

  const canvas = getCanvas(view);
  if (!canvas || canvas.destroyed) return target;

  const filter = (o: FabricObject) => isDesign(o) && layerOfObject(o) === layer;
  if (!canvas.getObjects().some(filter)) return target; // capa vacía: nada que renderizar

  const pa = getPrintAreaRect(view);
  const rendered = renderRegion(canvas, pa, target.width / pa.width, { filter });
  ctx.drawImage(rendered, 0, 0, target.width, target.height);
  return target;
}

let stitchTile: HTMLCanvasElement | null = null;

/** Baldosa de puntadas de satén en diagonal (claro = hilo, oscuro = hueco). */
function stitchPattern() {
  if (!stitchTile) {
    stitchTile = document.createElement('canvas');
    stitchTile.width = stitchTile.height = 8;
    const t = stitchTile.getContext('2d')!;
    t.fillStyle = '#8a8a8a';
    t.fillRect(0, 0, 8, 8);
    t.strokeStyle = '#ffffff';
    t.lineWidth = 2.6;
    t.beginPath();
    for (const o of [-8, 0, 8]) {
      t.moveTo(o, 8);
      t.lineTo(o + 8, 0);
    }
    t.stroke();
  }
  return stitchTile;
}

/** Silueta de un subconjunto de objetos rellena de un color plano (para mapas de datos). */
function silhouette(view: HoodieView, filter: (o: FabricObject) => boolean, color: string, w: number, h: number) {
  const canvas = getCanvas(view);
  if (!canvas || !canvas.getObjects().some(filter)) return null;
  const pa = getPrintAreaRect(view);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(renderRegion(canvas, pa, w / pa.width, { filter }), 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return out;
}

const grey = (v: number) => {
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${c},${c},${c})`;
};

/**
 * Mapas de datos de la capa de bordado (blanco = alto / rugoso):
 * - bump: el alto relieve se acolcha con un desenfoque amplio; el
 *   ton-sur-ton es bordado plano, apenas elevado. Encima, las puntadas.
 * - rough: rugosidad por píxel. El hilo satinado del ton-sur-ton refleja
 *   la luz (≈0.26) frente al tejido mate: por eso «aparece» con luz directa.
 */
export function paintEmbroideryMaps(view: HoodieView) {
  const bump = getTextureCanvas(view, 'bump');
  const rough = getTextureCanvas(view, 'rough');
  const { width: w, height: h } = bump;
  const b = bump.getContext('2d')!;
  const r = rough.getContext('2d')!;
  b.globalCompositeOperation = 'source-over';
  b.filter = 'none';
  b.fillStyle = '#000';
  b.fillRect(0, 0, w, h);
  r.fillStyle = grey(0.55);
  r.fillRect(0, 0, w, h);

  const isLayer = (o: FabricObject) => isDesign(o) && layerOfObject(o) === 'embroidery';
  const raised = (o: FabricObject) => isLayer(o) && techniqueOfObject(o) !== TONAL_TECHNIQUE;
  const tonalFinish = (finish: ThreadFinish) => (o: FabricObject) =>
    isLayer(o) && techniqueOfObject(o) === TONAL_TECHNIQUE && ((o as { hiloAcabado?: ThreadFinish }).hiloAcabado ?? 'satin') === finish;

  const raisedSil = silhouette(view, raised, '#FFFFFF', w, h);
  const tonalSil = silhouette(view, (o) => isLayer(o) && techniqueOfObject(o) === TONAL_TECHNIQUE, '#8C8C8C', w, h);
  if (!raisedSil && !tonalSil) return; // sin bordado: mapas planos

  // Relieve (si el navegador no soporta ctx.filter queda nítido)
  if (raisedSil) {
    b.filter = `blur(${Math.max(2, Math.round(w / 220))}px)`;
    b.drawImage(raisedSil, 0, 0);
  }
  if (tonalSil) {
    b.filter = `blur(${Math.max(1, Math.round(w / 700))}px)`;
    b.drawImage(tonalSil, 0, 0);
  }
  b.filter = 'none';
  b.globalCompositeOperation = 'multiply';
  b.fillStyle = b.createPattern(stitchPattern(), 'repeat')!;
  b.fillRect(0, 0, w, h);
  b.globalCompositeOperation = 'source-over';

  // Rugosidad por acabado de hilo
  if (raisedSil) r.drawImage(silhouette(view, raised, grey(0.55), w, h)!, 0, 0);
  for (const f of THREAD_FINISHES) {
    const sil = silhouette(view, tonalFinish(f.id), grey(f.roughness), w, h);
    if (sil) r.drawImage(sil, 0, 0);
  }
}

/**
 * Plano técnico para el dossier: prenda (con su color real) + arte sin el fondo
 * de estudio ni las guías del editor. Con `paper` se asienta sobre blanco (JPEG);
 * sin él queda transparente (PNG que se funde con la página).
 */
export function renderFlat(canvas: Canvas, region: Rect, pxPerUnit: number, { paper = true } = {}) {
  const art = withoutBackdrop(canvas, () =>
    renderRegion(canvas, region, pxPerUnit, { includeBackground: true, filter: (o) => roleOf(o) !== 'guide' }),
  );
  if (!paper) return art;
  const out = document.createElement('canvas');
  out.width = art.width;
  out.height = art.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(art, 0, 0);
  return out;
}

export { getDesignBounds };
