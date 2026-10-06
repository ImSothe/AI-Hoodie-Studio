'use client';

import { IText, type Canvas, type FabricObject } from 'fabric';
import type { jsPDF } from 'jspdf';
import { hexToRgb, luminance } from '../color';
import {
  CENTER_X,
  GARMENT,
  HOODIE_VIEWS,
  HPS_Y,
  MAX_EXPORT_SIDE_PX,
  PRINT_DPI,
  PX_PER_CM,
  TECHNIQUE_INFO,
  TECHNIQUES,
  THREAD_FINISHES,
  TONAL_SHIFTS,
  TONAL_TECHNIQUE,
  VIEW_SPECS,
  getPrintAreaRect,
  metalFinish,
  pxToCm,
  type FabricSpec,
  type GradientSpec,
  type HardwareSpec,
  type HoodieView,
  type Rect,
  type Technique,
  type ThreadFinish,
  type TonalShift,
} from '../hoodie/spec';
import { colorBreakdown, colorReference } from '../hoodie/references';
import {
  elementCode,
  elementName,
  fontFamilyName,
  getDesignBounds,
  getDesignObjects,
  kindOfObject,
  measureRect,
  techniqueOfObject,
  type ElementKind,
} from '../fabric/editor';
import { cordColor } from '../fabric/garment';
import { getCanvas } from '../fabric/registry';
import { renderFlat, renderRegion } from '../fabric/render';
import type { Styled } from '../fabric/tint';
import { coverageMm2, estimateStitches, STITCH_DENSITY } from '../fabric/coverage';
import { extractSvgColors, svgHasRaster } from '../svg/colors';

export interface TechPackOptions {
  designName: string;
  /** Referencia de estilo del atelier (p. ej. AHS-FW26-001). */
  styleCode: string;
  season: string;
  /** HEX exacto del tejido. */
  garmentColor: string;
  fabric: FabricSpec;
  hardware: HardwareSpec;
  snapshot3d?: string | null;
  /** Orden de taller (configurador): numera el dossier y añade el desglose por tallas. */
  order?: ProductionOrder;
}

export interface ProductionOrder {
  number: string;
  sizes: { size: string; qty: number }[];
  /** Talla sobre la que están definidas las colocaciones. */
  baseSize: string;
}

/**
 * Ficha de una pieza del lienzo (una fila del desglose de taller).
 * Coordenadas en mm con origen en el HPS sobre el eje central:
 * X = centro de la pieza (+ derecha mirando la prenda), Y = borde superior bajo el HPS.
 */
export interface ElementSpec {
  /** Código de pieza (F·01, B·02…), el mismo que se rotula en la lámina. */
  code: string;
  /** Orden de apilado (1 = la de más abajo). */
  index: number;
  type: 'Gráfico' | 'Texto';
  kind: ElementKind;
  name: string;
  text: string | null;
  font: string | null;
  widthMm: number;
  heightMm: number;
  xFromAxisMm: number;
  topFromHpsMm: number;
  rotationDeg: number;
  /** HEX de tinta/hilo, o null si conserva los colores originales del arte. */
  hex: string | null;
  technique: Technique;
  techniqueCode: string;
  /** Referencia interna de tinta/hilo (p. ej. BTT-0B0B0B-SAT). */
  colorRef: string;
  threadFinish: ThreadFinish | null;
  tonalShift: TonalShift | null;
  /** Degradado de dos colores (hex = el color de salida), o null si el color es liso. */
  gradient: GradientSpec | null;
  /** Ubicación estimada en la prenda: Cuerpo, Manga izq./der. (de quien viste), Capucha. */
  zone: string;
  /** Superficie que cubre el hilo / la tinta (mm²). */
  areaMm2: number;
  /** Puntadas estimadas (sólo bordados). */
  stitchesEstimate: number | null;
}

/** Calibre y posición del conjunto de una cara, en mm desde el HPS. */
interface Placement {
  widthMm: number;
  heightMm: number;
  xFromAxisMm: number;
  topFromHpsMm: number;
  rotationDeg: number;
  insidePrintArea: boolean;
}

interface TechniqueFiles {
  technique: Technique;
  dir: string;
  svg: string;
  png: Blob;
  dpi: number;
  size: { width: number; height: number };
  hasRaster: boolean;
}

interface ViewExport {
  view: HoodieView;
  label: string;
  placement: Placement;
  svg: string;
  colors: string[];
  hasRaster: boolean;
  dpi: number;
  printPng: Blob;
  printSize: { width: number; height: number };
  /** Geometría en coordenadas de escena, para acotar la lámina en vectorial. */
  bounds: Rect;
  pieces: Rect[];
  /** Plano recortado al torso (lámina, JPEG) y plano completo transparente (portada sin render 3D, PNG). */
  plate: { jpeg: string; png: Blob; region: Rect };
  flat: string;
  elements: ElementSpec[];
  techniqueFiles: TechniqueFiles[];
}

/** Densidad de los planos raster (px por unidad de escena; 1 cm = 7 unidades). */
const PLATE_SCALE = 4;
const FULL_FLAT: Rect = { left: 30, top: 18, width: 740, height: 700 };

const mmOf = (px: number) => Math.round((px / PX_PER_CM) * 10);

const uniqueHex = (list: { hex: string | null }[]) => [...new Set(list.map((e) => e.hex).filter((h): h is string => !!h))];

function countTechniques(elements: ElementSpec[]) {
  return Object.fromEntries(
    TECHNIQUES.map((t) => [t, elements.filter((e) => e.technique === t).length]).filter(([, n]) => n),
  ) as Partial<Record<Technique, number>>;
}

/* -------------------------------------------------------------------------- */
/* Extracción por vista                                                       */
/* -------------------------------------------------------------------------- */

function boundsOf(objects: FabricObject[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    const b = o.getBoundingRect();
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.left + b.width);
    maxY = Math.max(maxY, b.top + b.height);
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

/** Ejecuta fn exportando SÓLO `subset` (el resto de gráficos se excluye temporalmente del SVG). */
function withOnly<T>(canvas: Canvas, subset: FabricObject[], fn: () => T): T {
  const keep = new Set(subset);
  const hidden = getDesignObjects(canvas).filter((o) => !keep.has(o) && !o.excludeFromExport);
  hidden.forEach((o) => (o.excludeFromExport = true));
  try {
    return fn();
  } finally {
    hidden.forEach((o) => (o.excludeFromExport = false));
  }
}

/** SVG puro del arte aislado, recortado a su bounding box y en tamaño real (cm). */
export function exportArtworkSvg(canvas: Canvas, bounds: Rect) {
  return canvas.toSVG({
    viewBox: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
    width: `${pxToCm(bounds.width).toFixed(2)}cm`,
    height: `${pxToCm(bounds.height).toFixed(2)}cm`,
  });
}

function canvasToBlob(el: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    el.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), type, quality),
  );
}

/** 300 dpi salvo que el lado largo supere el límite de memoria del navegador. */
function dpiFor(bounds: Rect) {
  const longSideIn = Math.max(pxToCm(bounds.width), pxToCm(bounds.height)) / 2.54;
  return Math.min(PRINT_DPI, Math.floor(MAX_EXPORT_SIDE_PX / longSideIn));
}

function placementOf(view: HoodieView, r: Rect, angle = 0): Placement {
  const m = measureRect(view, r, angle);
  return {
    widthMm: mmOf(r.width),
    heightMm: mmOf(r.height),
    xFromAxisMm: mmOf(r.left + r.width / 2 - CENTER_X),
    topFromHpsMm: mmOf(r.top - HPS_Y),
    rotationDeg: m.angle,
    insidePrintArea: m.insidePrintArea,
  };
}

/**
 * Ubicación aproximada de una pieza a partir de su centro en el plano de la
 * prenda. Izquierda y derecha son las de quien viste la prenda (criterio de
 * fábrica): de frente es el lado derecho de la imagen, de espalda el izquierdo.
 */
function zoneOf(view: HoodieView, r: Rect): string {
  const half = (GARMENT.chestWidthCm / 2) * PX_PER_CM;
  const cx = r.left + r.width / 2 - CENTER_X;
  const cy = r.top + r.height / 2;
  if (cy < HPS_Y - 20) return 'Capucha';
  const spans = r.left < CENTER_X - half || r.left + r.width > CENTER_X + half;
  if (Math.abs(cx) > half) {
    const wearerLeft = view === 'front' ? cx > 0 : cx < 0;
    return wearerLeft ? 'Manga izq.' : 'Manga der.';
  }
  return spans ? 'Cuerpo y mangas' : 'Cuerpo';
}

function describeElement(canvas: Canvas, view: HoodieView, o: FabricObject, index: number): ElementSpec {
  const p = placementOf(view, o.getBoundingRect(), o.angle);
  const area = coverageMm2(canvas, o);
  const s = o as Styled;
  const kind = kindOfObject(o);
  const technique = techniqueOfObject(o);
  const tonal = technique === TONAL_TECHNIQUE;
  const gradient = !tonal && s.gradient ? { ...s.gradient } : null;
  const hex = gradient ? gradient.from.toUpperCase() : (s.inkColor ?? null);
  const threadFinish = tonal ? (s.hiloAcabado ?? 'satin') : null;
  return {
    code: elementCode(view, index),
    index: index + 1,
    type: kind === 'text' ? 'Texto' : 'Gráfico',
    kind,
    name: elementName(o),
    text: o instanceof IText ? o.text : null,
    font: o instanceof IText ? fontFamilyName(o) : null,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    xFromAxisMm: p.xFromAxisMm,
    topFromHpsMm: p.topFromHpsMm,
    rotationDeg: p.rotationDeg,
    hex,
    technique,
    techniqueCode: TECHNIQUE_INFO[technique].code,
    colorRef: gradient
      ? `${TECHNIQUE_INFO[technique].code}-GRAD-${gradient.from.replace('#', '').toUpperCase()}-${gradient.to.replace('#', '').toUpperCase()}`
      : colorReference(technique, hex, threadFinish),
    threadFinish,
    tonalShift: tonal ? (s.tonoShift ?? 'exact') : null,
    gradient,
    zone: zoneOf(view, o.getBoundingRect()),
    areaMm2: Math.round(area),
    stitchesEstimate: estimateStitches(technique, area),
  };
}

/** Recorte de la lámina: torso simétrico respecto al eje, desde un poco por encima del HPS. */
function plateRegion(view: HoodieView, b: Rect): Rect {
  const pa = getPrintAreaRect(view);
  const half = Math.min(
    CENTER_X,
    Math.max(pa.width / 2 + 70, CENTER_X - b.left + 30, b.left + b.width - CENTER_X + 30),
  );
  const top = Math.max(0, Math.min(HPS_Y - 60, b.top - 30));
  const bottom = Math.min(760, Math.max(pa.top + pa.height + 50, b.top + b.height + 30));
  return { left: CENTER_X - half, top, width: half * 2, height: bottom - top };
}

async function extractView(view: HoodieView, canvas: Canvas): Promise<ViewExport | null> {
  // Primero se suelta la selección: así cada objeto vuelve a coordenadas del lienzo.
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  const objects = getDesignObjects(canvas);
  const bounds = getDesignBounds(canvas);
  if (!objects.length || !bounds) return null;

  const elements = objects.map((o, i) => describeElement(canvas, view, o, i));
  const placement = placementOf(view, bounds, objects.length === 1 ? objects[0].angle : 0);
  const svg = exportArtworkSvg(canvas, bounds);
  const dpi = dpiFor(bounds);
  const print = renderRegion(canvas, bounds, dpi / 2.54 / PX_PER_CM);

  // Archivos separados por técnica: cada taller (serigrafía / bordado) recibe sólo lo suyo.
  const techniqueFiles: TechniqueFiles[] = [];
  for (const technique of TECHNIQUES) {
    const subset = objects.filter((o) => techniqueOfObject(o) === technique);
    if (!subset.length) continue;
    const b = boundsOf(subset);
    const tDpi = dpiFor(b);
    const tSvg = withOnly(canvas, subset, () => exportArtworkSvg(canvas, b));
    const keep = new Set(subset);
    const tPng = renderRegion(canvas, b, tDpi / 2.54 / PX_PER_CM, { filter: (o) => keep.has(o) });
    techniqueFiles.push({
      technique,
      dir: `${view}/${TECHNIQUE_INFO[technique].slug}`,
      svg: tSvg,
      png: await canvasToBlob(tPng),
      dpi: tDpi,
      size: { width: tPng.width, height: tPng.height },
      hasRaster: svgHasRaster(tSvg),
    });
  }

  const region = plateRegion(view, bounds);
  const plate = renderFlat(canvas, region, PLATE_SCALE);
  const flat = renderFlat(canvas, FULL_FLAT, 1.6, { paper: false });

  return {
    view,
    label: VIEW_SPECS[view].label,
    placement,
    svg,
    colors: extractSvgColors(svg),
    hasRaster: svgHasRaster(svg),
    dpi,
    printPng: await canvasToBlob(print),
    printSize: { width: print.width, height: print.height },
    bounds,
    pieces: objects.map((o) => o.getBoundingRect()),
    plate: { jpeg: plate.toDataURL('image/jpeg', 0.92), png: await canvasToBlob(plate), region },
    flat: flat.toDataURL('image/png'),
    elements,
    techniqueFiles,
  };
}

/** Recorta los márgenes transparentes del render 3D (el visor deja hueco para el panel). */
async function trimTransparent(dataUrl: string): Promise<{ url: string; width: number; height: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { url: dataUrl, width, height };
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(width, maxX + pad + 1) - sx;
  const sh = Math.min(height, maxY + pad + 1) - sy;
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d')!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
  return { url: out.toDataURL('image/png'), width: sw, height: sh };
}

/* -------------------------------------------------------------------------- */
/* Datos de materiales                                                        */
/* -------------------------------------------------------------------------- */

interface InkRow {
  ref: string;
  technique: Technique;
  hex: string | null;
  finish: string;
  shift: TonalShift | null;
  /** Segundo color si la referencia es un degradado. */
  hexTo: string | null;
  pieces: string[];
}

function techniqueFinish(technique: Technique, finish: ThreadFinish | null) {
  switch (TECHNIQUE_INFO[technique].code) {
    case 'SER':
      return 'Tinta plana mate';
    case 'REF':
      return 'Retrorreflectante';
    case 'BAR':
      return 'Satén / espuma 3 mm';
    default:
      return THREAD_FINISHES.find((f) => f.id === (finish ?? 'satin'))!.label;
  }
}

/** Una fila por referencia de tinta / hilo, con las piezas que la usan. */
function inkRows(elements: ElementSpec[]): InkRow[] {
  const rows = new Map<string, InkRow>();
  for (const e of elements) {
    const row = rows.get(e.colorRef);
    if (row) row.pieces.push(e.code);
    else
      rows.set(e.colorRef, {
        ref: e.colorRef,
        technique: e.technique,
        hex: e.hex,
        finish: `${techniqueFinish(e.technique, e.threadFinish)}${e.gradient ? ` · degradado ${e.gradient.angle}°` : ''}`,
        shift: e.tonalShift,
        hexTo: e.gradient ? e.gradient.to.toUpperCase() : null,
        pieces: [e.code],
      });
  }
  return [...rows.values()];
}

const shiftLabel = (shift: TonalShift | null) =>
  shift === 'lighter' ? 'Matiz +7 % claro' : shift === 'darker' ? 'Matiz -7 % oscuro' : 'Mismo HEX que el tejido';
const shiftShort = (shift: TonalShift | null) =>
  shift === 'lighter' ? 'Tejido +7 %' : shift === 'darker' ? 'Tejido -7 %' : 'HEX del tejido';

const cordCode = (type: HardwareSpec['cordType']) => (type.startsWith('Plano') ? 'P12' : 'R08');

function hardwareRows(opts: TechPackOptions) {
  const hw = opts.hardware;
  const eyelet = metalFinish(hw.eyeletFinish);
  const aglet = metalFinish(hw.agletFinish);
  const cordHex = cordColor(opts.garmentColor, hw);
  const half = Math.round(hw.eyeletSpacingMm / 2);
  return [
    {
      ref: `OJ-${eyelet.code}-${hw.eyeletDiameterMm}`,
      item: 'Ojal metálico de capucha',
      finish: `${eyelet.label} · ${eyelet.code}`,
      hex: eyelet.hex,
      caliber: `Ø ${hw.eyeletDiameterMm} mm`,
      qty: 2,
      position: `X ±${half} · Y ${hw.eyeletDropMm} mm bajo HPS`,
    },
    {
      ref: `HR-${aglet.code}-${hw.agletLengthMm}`,
      item: 'Herrete de cordón',
      finish: `${aglet.label} · ${aglet.code}`,
      hex: aglet.hex,
      caliber: `L ${hw.agletLengthMm} mm`,
      qty: 2,
      position: 'Extremos del cordón',
    },
    {
      ref: `CR-${cordCode(hw.cordType)}-${cordHex.replace('#', '')}`,
      item: 'Cordón de capucha',
      finish: hw.cordTonal ? `Tono sobre tono ${cordHex}` : `Contraste ${cordHex}`,
      hex: cordHex,
      caliber: hw.cordType,
      qty: 1,
      position: 'Pasa por ambos ojales',
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* PDF: dossier de taller                                                     */
/* -------------------------------------------------------------------------- */

type RGB = [number, number, number];
const INK: RGB = [22, 22, 22];
const SOFT: RGB = [88, 86, 82];
const MUTED: RGB = [138, 135, 130];
const RULE: RGB = [214, 211, 204];
const FRAME: RGB = [168, 165, 158];
const IVORY: RGB = [244, 241, 234];
/** Grosor de los filetes: 0,1 mm (cotas) y 0,07 mm (reglas y separadores). */
const HAIR = 0.1;
const FINE = 0.07;

const W = 210;
const M = 16;
const CW = W - 2 * M;
const BOTTOM = 276;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const decimal = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',');

/**
 * Papeles tipográficos del dossier, los mismos que la interfaz:
 * Bodoni Moda (títulos), Cormorant Garamond (nombres y notas), Inter (rótulos
 * y datos) e IBM Plex Mono (cifras, códigos y rutas).
 */
type Face = 'display' | 'serif' | 'italic' | 'sans' | 'light' | 'mono';

/** TTF convertidas desde @fontsource con `npm run fonts:pdf` (public/fonts/pdf). */
const PDF_FONTS: { face: Face; file: string }[] = [
  { face: 'display', file: 'BodoniModa-Regular.ttf' },
  { face: 'serif', file: 'CormorantGaramond-Regular.ttf' },
  { face: 'italic', file: 'CormorantGaramond-Italic.ttf' },
  { face: 'sans', file: 'Inter-Regular.ttf' },
  { face: 'light', file: 'Inter-Light.ttf' },
  { face: 'mono', file: 'IBMPlexMono-Light.ttf' },
];

/** Reserva con las fuentes estándar de PDF si las TTF no se pueden cargar. */
const STANDARD_FACES: Record<Face, [string, string]> = {
  display: ['times', 'normal'],
  serif: ['times', 'normal'],
  italic: ['times', 'italic'],
  sans: ['helvetica', 'normal'],
  light: ['helvetica', 'normal'],
  mono: ['courier', 'normal'],
};

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

let fontFiles: Promise<Map<string, string> | null> | null = null;

/** Descarga (una vez por sesión) las TTF del dossier; null si falla alguna. */
function loadPdfFonts() {
  fontFiles ??= Promise.all(
    PDF_FONTS.map(async ({ file }) => {
      const res = await fetch(`/fonts/pdf/${file}`);
      if (!res.ok) throw new Error(`No se pudo cargar ${file}`);
      return [file, toBase64(await res.arrayBuffer())] as const;
    }),
  )
    .then((entries) => new Map(entries))
    .catch((err) => {
      console.warn('[dossier] Fuentes TTF no disponibles, se usan las estándar de PDF.', err);
      fontFiles = null;
      return null;
    });
  return fontFiles;
}

interface TextStyle {
  size?: number;
  face?: Face;
  /** Tracking en mm. */
  cs?: number;
  align?: 'left' | 'center' | 'right';
  color?: RGB;
}

async function buildPdf(views: ViewExport[], opts: TechPackOptions, reference: string, date: Date) {
  const { jsPDF: JsPDF, GState } = await import('jspdf');
  const doc: jsPDF = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const files = await loadPdfFonts();
  if (files) {
    for (const { face, file } of PDF_FONTS) {
      doc.addFileToVFS(file, files.get(file)!);
      doc.addFont(file, `ahs-${face}`, 'normal');
    }
  }
  const setFace = (face: Face) => (files ? doc.setFont(`ahs-${face}`, 'normal') : doc.setFont(...STANDARD_FACES[face]));
  const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
  const title = (opts.designName || 'Sin título').trim();
  const styleCode = opts.styleCode.trim() || reference;
  const garment = opts.garmentColor.toUpperCase();
  const all = views.flatMap((v) => v.elements);
  const codes = [...new Set(all.map((e) => e.techniqueCode))].join(' · ');
  const orderTotal = opts.order?.sizes.reduce((n, s) => n + s.qty, 0) ?? 0;

  /* ---------------------------------------------------------------- primitivas */

  const width = (s: string, size: number, face: Face = 'sans', cs = 0) => {
    setFace(face);
    doc.setFontSize(size);
    doc.setCharSpace(0);
    return doc.getTextWidth(s) + cs * Math.max(0, s.length - 1);
  };

  /** Texto con tracking real (jsPDF no lo tiene en cuenta al alinear). */
  const text = (s: string, x: number, y: number, o: TextStyle = {}) => {
    const { size = 8, face = 'sans', cs = 0, align = 'left', color = INK } = o;
    const w = width(s, size, face, cs);
    const tx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    doc.setTextColor(...color);
    doc.setCharSpace(cs);
    doc.text(s, tx, y);
    doc.setCharSpace(0);
    return w;
  };

  /** Recorta un texto al ancho disponible (con elipsis de tres puntos). */
  const fit = (s: string, max: number, size: number, face: Face = 'sans', cs = 0) => {
    if (width(s, size, face, cs) <= max) return s;
    let out = s;
    while (out.length > 1 && width(`${out}...`, size, face, cs) > max) out = out.slice(0, -1);
    return `${out.trimEnd()}...`;
  };

  /** Versalitas diminutas muy espaciadas: el rótulo de ficha técnica (`max` recorta al ancho). */
  const caps = (s: string, x: number, y: number, o: TextStyle & { max?: number } = {}) => {
    const { max, ...style } = o;
    const t = { size: 5.6, cs: 0.5, color: MUTED, ...style };
    const upper = s.toUpperCase();
    return text(max ? fit(upper, max, t.size, t.face, t.cs) : upper, x, y, t);
  };

  const line = (x1: number, y1: number, x2: number, y2: number, color: RGB = RULE, w = FINE, dash?: number[]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.setLineDashPattern(dash ?? [], 0);
    doc.line(x1, y1, x2, y2);
    if (dash) doc.setLineDashPattern([], 0);
  };

  const alpha = (a: number) => doc.setGState(new GState({ opacity: a, 'stroke-opacity': a }));

  const swatch = (hex: string, x: number, y: number, w: number, h = w) => {
    doc.setFillColor(...hexToRgb(hex));
    doc.setDrawColor(...FRAME);
    doc.setLineWidth(FINE);
    doc.rect(x, y, w, h, 'FD');
  };

  /** Cota de arquitecto: filete de 0,1 mm con trazos oblicuos en los extremos. */
  const dimension = (x1: number, y1: number, x2: number, y2: number) => {
    line(x1, y1, x2, y2, INK, HAIR);
    const t = 0.75;
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ]) {
      line(x - t, y + t, x + t, y - t, INK, 0.16);
    }
  };

  /** Cabecera de página: rótulo de lámina + referencia del modelo. */
  const pageHeader = (left: string) => {
    const used = caps(left, M, 14, { color: INK, cs: 0.55 });
    caps(`${styleCode}  ·  ${title}`, W - M, 14, { align: 'right', max: CW - used - 12 });
    line(M, 17.5, W - M, 17.5, INK, FINE);
  };

  const pageTitle = (main: string, sub: string, y = 31) => {
    text(main, M, y, { face: 'display', size: 22, cs: 0.35 });
    text(sub, M, y + 6.2, { face: 'italic', size: 10.5, color: SOFT });
  };

  /** Rótulo de sección con índice y filete. */
  const sectionTitle = (index: string, label: string, y: number) => {
    text(index, M, y, { face: 'mono', size: 6.5, color: MUTED });
    caps(label, M + 8, y, { color: INK, size: 6 });
    line(M, y + 2.2, W - M, y + 2.2, INK, FINE);
    return y + 7;
  };

  type SpecStyle = { hex?: string; serif?: boolean; mono?: boolean };

  /** Bloque etiqueta / valor apilado (rótulo en versalitas, dato debajo). */
  const spec = (label: string, value: string, x: number, y: number, w: number, o: SpecStyle = {}) => {
    caps(label, x, y);
    let vx = x;
    if (o.hex) {
      swatch(o.hex, x, y + 2.2, 3, 3);
      vx += 4.6;
    }
    const face: Face = o.serif ? 'serif' : o.mono ? 'mono' : 'light';
    const size = o.serif ? 11.5 : o.mono ? 8.2 : 8.6;
    text(fit(value, w - (vx - x) - 1, size, face), vx, y + 4.9, { size, face });
    return y + 10;
  };

  interface Column {
    title: string;
    w: number;
    align?: 'left' | 'right';
    /** Sangría izquierda (separa una columna de texto de una numérica alineada a la derecha). */
    pad?: number;
  }

  /** Cabecera de tabla: versalitas y filete de 0,1 mm. */
  const tableHead = (cols: Column[], y: number) => {
    let x = M;
    for (const c of cols) {
      caps(c.title, c.align === 'right' ? x + c.w - 1.5 : x + (c.pad ?? 0), y, { align: c.align ?? 'left', size: 5.2, cs: 0.4 });
      x += c.w;
    }
    line(M, y + 2, W - M, y + 2, INK, HAIR);
    return y + 2;
  };

  /* ---------------------------------------------------------------- portada */

  const cover = async () => {
    caps('AI Hoodie Studio', M, 16, { color: INK, cs: 1.1, size: 6.2 });
    caps('Dossier technique', W - M, 16, { align: 'right', cs: 1.1, size: 6.2 });
    line(M, 19.5, W - M, 19.5, INK, FINE);

    caps(`Temporada ${opts.season}  ·  ${styleCode}`, W / 2, 36, { align: 'center', cs: 0.8, size: 6.2 });
    let size = 34;
    const upper = title.toUpperCase();
    while (size > 16 && width(upper, size, 'display', size * 0.07) > CW - 8) size -= 1;
    text(upper, W / 2, 52, { face: 'display', size, cs: size * 0.07, align: 'center' });
    text(
      `${GARMENT.name}  ·  ${opts.fabric.construction} ${opts.fabric.weightGsm} g/m²`,
      W / 2,
      61,
      { face: 'italic', size: 12.5, color: SOFT, align: 'center' },
    );

    // Imagen principal: render 3D (recortado) o, sin él, los planos de las caras con diseño.
    const box = { x: M, y: 72, w: CW, h: 146 };
    if (opts.snapshot3d) {
      const shot = await trimTransparent(opts.snapshot3d);
      const k = Math.min(box.w / shot.width, box.h / shot.height);
      const w = shot.width * k;
      const h = shot.height * k;
      doc.addImage(shot.url, 'PNG', box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
      caps('Render de referencia', W / 2, box.y + box.h + 4, { align: 'center', size: 5 });
    } else if (views.length) {
      const gap = 8;
      const cellW = (box.w - gap * (views.length - 1)) / views.length;
      const k = Math.min(cellW / FULL_FLAT.width, (box.h - 6) / FULL_FLAT.height);
      const w = FULL_FLAT.width * k;
      const h = FULL_FLAT.height * k;
      const top = box.y + (box.h - h - 6) / 2;
      views.forEach((v, i) => {
        const cx = box.x + i * (cellW + gap) + cellW / 2;
        doc.addImage(v.flat, 'PNG', cx - w / 2, top, w, h);
        caps(v.label, cx, top + h + 4.5, { align: 'center', size: 5.2 });
      });
    }

    line(M, 228, W - M, 228, INK, FINE);
    const cell = CW / 4;
    const rows: [string, string, SpecStyle?][][] = [
      [
        [opts.order ? 'Orden de taller' : 'Dossier', reference, { mono: true }],
        ['Referencia de estilo', styleCode, { mono: true }],
        ['Temporada', opts.season, { mono: true }],
        ['Fecha', dateStr, { mono: true }],
      ],
      [
        ['Tejido', opts.fabric.construction, { serif: true }],
        ['Gramaje', `${opts.fabric.weightGsm} g/m²`, { mono: true }],
        ['Color del tejido', garment, { hex: garment, mono: true }],
        opts.order
          ? ['Unidades', `${orderTotal} uds${codes ? `  ·  ${codes}` : ''}`, { mono: true }]
          : ['Piezas', `${all.length}  ·  ${codes}`, { mono: true }],
      ],
    ];
    rows.forEach((row, r) =>
      row.forEach(([label, value, o], c) => spec(label, value, M + c * cell, 235 + r * 14, cell - 4, o)),
    );
    text(
      'Documento de taller confidencial. Cotas en milímetros desde el HPS (High Point Shoulder) sobre el eje central.',
      W / 2,
      268,
      { face: 'italic', size: 9.6, color: MUTED, align: 'center' },
    );
  };

  /* ---------------------------------------------------------------- lámina por vista */

  const plate = (v: ViewExport, planche: number) => {
    const head = `Planche ${String(planche).padStart(2, '0')}  ·  ${v.label}`;
    pageHeader(head);
    pageTitle(v.label, 'Plano de colocación  ·  cotas en milímetros desde el HPS');

    // Encaje del plano: columna izquierda con margen para reglas y cotas.
    const r = v.plate.region;
    const maxW = 98;
    const maxH = 118;
    const k = Math.min(maxW / r.width, maxH / r.height);
    const iw = r.width * k;
    const ih = r.height * k;
    const ix = M + 18;
    const iy = 50;
    const px = (x: number) => ix + (x - r.left) * k;
    const py = (y: number) => iy + (y - r.top) * k;
    doc.addImage(v.plate.jpeg, 'JPEG', ix, iy, iw, ih);
    line(ix, iy, ix + iw, iy, RULE, FINE);
    line(ix, iy + ih, ix + iw, iy + ih, RULE, FINE);

    const b = v.bounds;
    const p = v.placement;
    // Trazos sobre la prenda: marfil sobre tejidos oscuros, tinta sobre los claros.
    const over: RGB = luminance(opts.garmentColor) > 0.35 ? INK : IVORY;

    // — Referencias dentro del plano
    const pa = getPrintAreaRect(v.view);
    alpha(0.5);
    doc.setDrawColor(...over);
    doc.setLineWidth(HAIR);
    doc.setLineDashPattern([0.8, 0.9], 0);
    doc.rect(px(pa.left), py(pa.top), pa.width * k, pa.height * k);
    line(px(CENTER_X), py(HPS_Y - 35), px(CENTER_X), iy + ih, over, HAIR, [2.4, 0.8, 0.4, 0.8]);
    alpha(0.7);
    line(ix, py(HPS_Y), ix + iw, py(HPS_Y), over, HAIR, [0.5, 0.7]);
    // Líneas de referencia hasta las cotas exteriores
    alpha(0.45);
    line(px(b.left), iy, px(b.left), py(b.top), over, FINE, [0.6, 0.6]);
    line(px(b.left + b.width), iy, px(b.left + b.width), py(b.top), over, FINE, [0.6, 0.6]);
    line(px(b.left + b.width), py(b.top), ix + iw, py(b.top), over, FINE, [0.6, 0.6]);
    line(px(b.left + b.width), py(b.top + b.height), ix + iw, py(b.top + b.height), over, FINE, [0.6, 0.6]);
    line(ix, py(b.top), px(b.left), py(b.top), over, FINE, [0.6, 0.6]);
    alpha(1);
    // Piezas con su código
    v.pieces.forEach((rect, i) => {
      doc.setDrawColor(...over);
      doc.setLineWidth(FINE);
      doc.setLineDashPattern([], 0);
      doc.rect(px(rect.left), py(rect.top), rect.width * k, rect.height * k);
      caps(v.elements[i].code, px(rect.left), py(rect.top) - 0.9, { color: over, size: 4.6, cs: 0.25 });
    });

    // — Cota superior: ancho del conjunto
    const yTop = iy - 4.5;
    line(px(b.left), yTop - 1.2, px(b.left), iy, INK, FINE);
    line(px(b.left + b.width), yTop - 1.2, px(b.left + b.width), iy, INK, FINE);
    dimension(px(b.left), yTop, px(b.left + b.width), yTop);
    text(String(p.widthMm), px(b.left + b.width / 2), yTop - 1.2, { face: 'mono', size: 6.4, align: 'center' });

    // — Cota derecha: alto del conjunto
    const xRight = ix + iw + 4.5;
    line(ix + iw, py(b.top), xRight + 1.2, py(b.top), INK, FINE);
    line(ix + iw, py(b.top + b.height), xRight + 1.2, py(b.top + b.height), INK, FINE);
    dimension(xRight, py(b.top), xRight, py(b.top + b.height));
    text(String(p.heightMm), xRight + 1.8, py(b.top + b.height / 2) + 0.9, { face: 'mono', size: 6.4 });

    // — Regla vertical desde el HPS (mm) + cota HPS → borde superior
    const xRuler = ix - 3;
    const yEnd = iy + ih;
    line(xRuler, py(HPS_Y), xRuler, yEnd, SOFT, FINE);
    for (let cm = 0; py(HPS_Y + cm * PX_PER_CM) <= yEnd + 0.01; cm++) {
      const y = py(HPS_Y + cm * PX_PER_CM);
      const major = cm % 5 === 0;
      line(xRuler - (major ? 1.5 : 0.7), y, xRuler, y, SOFT, FINE);
      if (major && cm > 0) text(String(cm * 10), xRuler - 2.1, y + 0.8, { face: 'mono', size: 4.6, color: SOFT, align: 'right' });
    }
    caps('HPS', xRuler - 2.1, py(HPS_Y) - 1, { color: INK, size: 4.6, cs: 0.2, align: 'right' });
    const xHps = ix - 13;
    line(xHps - 1.2, py(HPS_Y), ix, py(HPS_Y), INK, FINE);
    line(xHps - 1.2, py(b.top), xRuler - 1.5, py(b.top), INK, FINE);
    if (Math.abs(py(b.top) - py(HPS_Y)) > 1.5) {
      dimension(xHps, py(HPS_Y), xHps, py(b.top));
      text(String(p.topFromHpsMm), xHps - 1.6, (py(HPS_Y) + py(b.top)) / 2 + 0.9, { face: 'mono', size: 6.4, align: 'right' });
    }

    // — Regla horizontal desde el eje (mm)
    const yRuler = iy + ih + 3;
    line(ix, yRuler, ix + iw, yRuler, SOFT, FINE);
    const maxCm = Math.floor(pxToCm(r.width / 2));
    for (let cm = -maxCm; cm <= maxCm; cm++) {
      const x = px(CENTER_X + cm * PX_PER_CM);
      const major = cm % 5 === 0;
      line(x, yRuler, x, yRuler + (major ? 1.5 : 0.7), SOFT, FINE);
      if (major && cm % 10 === 0) {
        text(cm === 0 ? '0' : signed(cm * 10), x, yRuler + 4, { face: 'mono', size: 4.6, color: SOFT, align: 'center' });
      }
    }
    caps('X · mm desde el eje', ix + iw, yRuler + 7.2, { align: 'right', size: 4.6, cs: 0.3 });

    // — Columna de datos del conjunto
    const cx = 152;
    const cw = W - M - cx;
    const spa = VIEW_SPECS[v.view].printArea;
    let y = iy + 1;
    caps('Conjunto de la cara', cx, y, { color: INK });
    line(cx, y + 2, W - M, y + 2, INK, FINE);
    y += 7;
    y = spec('Calibre', `${p.widthMm} × ${p.heightMm} mm`, cx, y, cw, { mono: true });
    y = spec('Borde superior', `${p.topFromHpsMm} mm bajo HPS`, cx, y, cw, { mono: true });
    y = spec('Centro', p.xFromAxisMm === 0 ? 'En el eje central' : `X ${signed(p.xFromAxisMm)} mm`, cx, y, cw, {
      mono: p.xFromAxisMm !== 0,
      serif: p.xFromAxisMm === 0,
    });
    y = spec('Área máxima', `${spa.widthCm * 10} × ${spa.heightCm * 10} mm`, cx, y, cw, { mono: true });
    y = spec('Conformidad', p.insidePrintArea ? 'Dentro del área' : 'Fuera del área: revisar', cx, y, cw, { serif: true });
    y = spec('Tejido', garment, cx, y, cw, { hex: garment, mono: true });
    y = spec('Piezas', `${v.elements.length}  ·  ${[...new Set(v.elements.map((e) => e.techniqueCode))].join(' · ')}`, cx, y, cw, {
      mono: true,
    });

    // Leyenda de trazos, alineada con el pie del plano
    let ly = Math.max(y + 4, iy + ih - 22);
    caps('Leyenda', cx, ly, { color: INK });
    ly += 4.5;
    const legend: [string, () => void][] = [
      ['Cota (mm)', () => dimension(cx, ly - 0.9, cx + 9, ly - 0.9)],
      ['Área de impresión', () => line(cx, ly - 0.9, cx + 9, ly - 0.9, INK, HAIR, [0.8, 0.9])],
      ['Eje central', () => line(cx, ly - 0.9, cx + 9, ly - 0.9, INK, HAIR, [2.4, 0.8, 0.4, 0.8])],
      ['Línea HPS', () => line(cx, ly - 0.9, cx + 9, ly - 0.9, INK, HAIR, [0.5, 0.7])],
    ];
    for (const [label, draw] of legend) {
      draw();
      text(label, cx + 12, ly, { face: 'light', size: 6.6, color: SOFT });
      ly += 4.2;
    }

    // — Desglose de piezas
    y = iy + ih + 16;
    const ensure = (h: number) => {
      if (y + h <= BOTTOM) return false;
      doc.addPage();
      pageHeader(`${head}  (cont.)`);
      y = 28;
      return true;
    };
    const cols: Column[] = [
      { title: 'Ref.', w: 13 },
      { title: 'Pieza', w: 39 },
      { title: 'Técnica', w: 31 },
      { title: 'Calibre mm', w: 22, align: 'right' },
      { title: 'X eje', w: 14, align: 'right' },
      { title: 'Y HPS', w: 14, align: 'right' },
      { title: 'Rot.', w: 10, align: 'right' },
      { title: 'Tinta / hilo', w: 35, pad: 3.5 },
    ];
    y = sectionTitle('01', 'Desglose de piezas', y);
    y = tableHead(cols, y + 1);
    for (const e of v.elements) {
      const rowH = 10;
      if (ensure(rowH)) y = tableHead(cols, y + 1);
      const base = y + 4.6;
      const sub = y + 8;
      let x = M;
      const at = (i: number) => {
        const c = cols[i];
        const start = x;
        x += c.w;
        return { x: start + (c.pad ?? 0), right: start + c.w - 1.5, w: c.w - 2 - (c.pad ?? 0) };
      };
      const c0 = at(0);
      text(e.code, c0.x, base, { face: 'mono', size: 7.4 });
      const c1 = at(1);
      text(fit(e.name, c1.w, 10.5, 'serif'), c1.x, base, { face: 'serif', size: 10.5 });
      const kindLabel = e.font ? `${e.font} · texto` : e.kind === 'png' ? 'Raster PNG' : 'Vector SVG';
      caps(`${kindLabel} · ${e.zone}`, c1.x, sub, { size: 4.8, cs: 0.25, max: c1.w });
      const c2 = at(2);
      text(e.techniqueCode, c2.x, base, { face: 'mono', size: 7.4, cs: 0.3 });
      const tSub = e.threadFinish
        ? `Hilo ${techniqueFinish(e.technique, e.threadFinish).toLowerCase()}`
        : TECHNIQUE_INFO[e.technique].short;
      caps(tSub, c2.x, sub, { size: 4.8, cs: 0.25, max: c2.w });
      const c3 = at(3);
      text(`${e.widthMm} × ${e.heightMm}`, c3.right, base, { face: 'mono', size: 7.4, align: 'right' });
      const c4 = at(4);
      text(signed(e.xFromAxisMm), c4.right, base, { face: 'mono', size: 7.4, align: 'right' });
      const c5 = at(5);
      text(String(e.topFromHpsMm), c5.right, base, { face: 'mono', size: 7.4, align: 'right' });
      const c6 = at(6);
      text(`${e.rotationDeg}°`, c6.right, base, { face: 'mono', size: 7.4, align: 'right' });
      const c7 = at(7);
      if (e.hex && e.gradient) {
        swatch(e.hex, c7.x, y + 2.2, 3, 1.5);
        swatch(e.gradient.to, c7.x, y + 3.7, 3, 1.5);
      } else if (e.hex) swatch(e.hex, c7.x, y + 2.2, 3, 3);
      const refSize = e.gradient ? 5.2 : 6.8;
      text(fit(e.colorRef, c7.w - 4.5, refSize, 'mono'), c7.x + 4.5, base, { face: 'mono', size: refSize });
      const inkSub = e.gradient
        ? `${e.hex} a ${e.gradient.to.toUpperCase()} · ${e.gradient.angle}°`
        : e.tonalShift
          ? shiftShort(e.tonalShift)
          : e.hex
            ? e.hex
            : 'Colores del arte';
      caps(inkSub, c7.x + 4.5, sub, { size: 4.8, cs: 0.25, max: c7.w - 4.5 });
      line(M, y + rowH, W - M, y + rowH, RULE, FINE);
      y += rowH;
    }

    // — Notas de taller
    const notes: [string, string][] = v.techniqueFiles.map((f) => [TECHNIQUE_INFO[f.technique].code, TECHNIQUE_INFO[f.technique].note]);
    for (const e of v.elements) {
      if (e.stitchesEstimate === null) continue;
      notes.push([
        e.code,
        `Superficie bordada ${decimal(e.areaMm2 / 100)} cm² · ${e.stitchesEstimate.toLocaleString('es-ES')} puntadas por pieza (estimación a ${decimal(STITCH_DENSITY[e.technique] ?? 0)} pt/mm²; el número real lo da el archivo digitalizado).`,
      ]);
    }
    const fonts = [...new Set(v.elements.map((e) => e.font).filter(Boolean))];
    if (fonts.length) notes.push(['TXT', `Textos en ${fonts.join(', ')}: convertir a contornos antes de digitalizar o grabar pantallas.`]);
    for (const e of v.elements) {
      if (!e.gradient) continue;
      const g = e.gradient;
      const range = `${e.hex} a ${g.to.toUpperCase()}, dirección ${g.angle}° (0° = de izquierda a derecha, 90° = de arriba abajo)`;
      const code = TECHNIQUE_INFO[e.technique].code;
      if (code === 'REF') {
        notes.push([
          e.code,
          `Degradado ${range} sobre tinta reflectante. La tinta reflectante es de un solo color: el degradado sólo es una referencia visual. Confirmar con el taller si se resuelve con plata plana, en capas o sustituyendo el efecto.`,
        ]);
      } else if (code === 'BAR') {
        notes.push([
          e.code,
          `Degradado ${range} en bordado. Se resuelve mezclando hilos de la gama entre los dos colores; el taller debe proponer la paleta de hilos y el número de colores.`,
        ]);
      } else {
        notes.push([
          e.code,
          `Degradado ${range} en serigrafía. Exige pantalla de degradado (fuente dividida) o impresión digital; confirmar el proceso y las pasadas. El archivo por técnica trae el degradado ya pintado.`,
        ]);
      }
    }
    if (v.elements.some((e) => e.kind === 'png')) {
      const codes = v.elements
        .filter((e) => e.kind === 'png')
        .map((e) => e.code)
        .join(' · ');
      notes.push([
        'RAS',
        `Piezas raster (${codes}): imágenes subidas, de IA o partes separadas de un diseño. Para pantalla o digitalización de bordado hay que vectorizarlas o entregar el original a 300 dpi o más.`,
      ]);
    }
    const onSleeves = v.elements.filter((e) => e.zone !== 'Cuerpo');
    if (onSleeves.length) {
      notes.push([
        'UBI',
        `Ubicación estimada a partir del plano (${onSleeves.map((e) => `${e.code} ${e.zone}`).join(' · ')}). Izquierda y derecha son las de quien viste la prenda. Confirmar con el plano técnico antes de producir.`,
      ]);
    }
    if (!p.insidePrintArea) {
      notes.push([
        '!',
        'El conjunto sobrepasa la zona recomendada del cuerpo (38 × 48 cm en espalda, 30 × 24 cm en pecho): es válido, pero confirmar con el taller el tamaño máximo de pantalla o bastidor antes de producir.',
      ]);
    }
    y += 7;
    ensure(12);
    y = sectionTitle('02', 'Notas de taller', y);
    for (const [code, note] of notes) {
      setFace('serif');
      doc.setFontSize(10.2);
      const lines = doc.splitTextToSize(note, CW - 16) as string[];
      ensure(lines.length * 4.1 + 2);
      text(code, M, y + 1, { face: 'mono', size: 6.4, cs: 0.3, color: SOFT });
      setFace('serif');
      doc.setFontSize(10.2);
      doc.setTextColor(...INK);
      doc.text(lines, M + 16, y + 1);
      y += lines.length * 4.1 + 1.8;
    }

    // — Archivos de producción
    y += 5;
    ensure(10 + v.techniqueFiles.length * 4.2);
    y = sectionTitle('03', 'Archivos de producción', y);
    const files: [string, string][] = [
      ['Conjunto', `${v.view}/artwork.svg  ·  ${v.view}/print-${v.dpi}dpi.png`],
      ...v.techniqueFiles.map<[string, string]>((f) => [
        TECHNIQUE_INFO[f.technique].code,
        `${f.dir}/artwork.svg${f.hasRaster ? ' (raster)' : ''}  ·  print-${f.dpi}dpi.png  ${f.size.width}×${f.size.height} px`,
      ]),
    ];
    for (const [k2, v2] of files) {
      text(k2, M, y + 1, { face: 'mono', size: 6.4, cs: 0.3, color: SOFT });
      text(fit(v2, CW - 16, 6.6, 'mono'), M + 16, y + 1, { face: 'mono', size: 6.6, color: INK });
      y += 4.2;
    }
  };

  /* ---------------------------------------------------------------- materiales */

  const materials = (planche: number) => {
    pageHeader(`Planche ${String(planche).padStart(2, '0')}  ·  Materiales y fornituras`);
    pageTitle('Materiales y fornituras', 'Tejido, tintas, hilos y herrajes metálicos');

    // 01 Tejido
    let y = sectionTitle('01', 'Tejido', 50);
    swatch(garment, M, y, 24, 24);
    const { rgb, cmyk } = colorBreakdown(garment);
    const gx = M + 32;
    const gw = (W - M - gx) / 2;
    const oz = opts.fabric.weightGsm / 33.906;
    const fabricRows: [string, string, SpecStyle?][] = [
      ['Construcción', opts.fabric.construction, { serif: true }],
      ['Gramaje', `${opts.fabric.weightGsm} g/m²  ·  ${decimal(oz)} oz/yd²`, { mono: true }],
      ['Composición', opts.fabric.composition, { serif: true }],
      ['Acabado', opts.fabric.finish, { serif: true }],
      ['Color  ·  HEX', garment, { mono: true }],
      ['RGB  ·  CMYK aprox.', `${rgb}   /   ${cmyk}`, { mono: true }],
    ];
    fabricRows.forEach(([label, value, o], i) => spec(label, value, gx + (i % 2) * gw, y + Math.floor(i / 2) * 10.5, gw - 4, o));
    y += 36;

    // 02 Tintas e hilos
    y = sectionTitle('02', 'Tintas e hilos', y);
    const cols: Column[] = [
      { title: 'Referencia', w: 37 },
      { title: 'Muestra', w: 12 },
      { title: 'Técnica', w: 24 },
      { title: 'HEX', w: 17 },
      { title: 'RGB', w: 24 },
      { title: 'CMYK aprox.', w: 24 },
      { title: 'Acabado', w: 24 },
      { title: 'Piezas', w: 16 },
    ];
    y = tableHead(cols, y + 1);
    if (!all.length) {
      text('Prenda lisa: sin tintas ni hilos de personalización.', M, y + 6, { face: 'italic', size: 10, color: SOFT });
      y += 10;
    }
    for (const ink of inkRows(all)) {
      const rowH = 10;
      const base = y + 4.6;
      const sub = y + 8;
      let x = M;
      const next = (i: number) => {
        const start = x;
        x += cols[i].w;
        return start;
      };
      text(fit(ink.ref, cols[0].w - 1.5, 6.6, 'mono'), next(0), base, { face: 'mono', size: 6.6 });
      const sx = next(1);
      if (ink.hex && ink.hexTo) {
        swatch(ink.hex, sx, y + 1.8, 7, 3);
        swatch(ink.hexTo, sx, y + 4.8, 7, 3);
      } else if (ink.hex) swatch(ink.hex, sx, y + 1.8, 7, 6);
      const tx = next(2);
      text(TECHNIQUE_INFO[ink.technique].short, tx, base, { face: 'serif', size: 10.5 });
      const techSub = ink.hexTo
        ? `${TECHNIQUE_INFO[ink.technique].code} · a ${ink.hexTo}`
        : ink.technique === TONAL_TECHNIQUE
          ? shiftLabel(ink.shift)
          : TECHNIQUE_INFO[ink.technique].code;
      caps(techSub, tx, sub, {
        size: 4.8,
        cs: 0.25,
        max: cols[2].w - 1.5,
      });
      const parts = ink.hex ? colorBreakdown(ink.hex) : null;
      const cell = (value: string, i: number, face: Face, color = INK) =>
        text(fit(value, cols[i].w - 1.5, face === 'mono' ? 6.6 : 7.2, face), next(i), base, {
          face,
          size: face === 'mono' ? 6.6 : 7.2,
          color,
        });
      cell(ink.hex ?? 'Arte', 3, 'mono');
      cell(parts?.rgb ?? 'Originales', 4, 'mono', parts ? INK : MUTED);
      cell(parts?.cmyk ?? '', 5, 'mono');
      cell(ink.finish, 6, 'light');
      cell(ink.pieces.join(' '), 7, 'mono');
      line(M, y + rowH, W - M, y + rowH, RULE, FINE);
      y += rowH;
    }
    y += 3;
    setFace('italic');
    doc.setFontSize(9.4);
    const disclaimer = doc.splitTextToSize(
      'Referencia interna = código de técnica + HEX exacto (+ acabado del hilo en ton-sur-ton). La equivalencia Pantone TCX / Madeira Polyneon se casa en taller sobre muestra física del tejido ya teñido; los valores CMYK son orientativos (sin perfil ICC).',
      CW,
    ) as string[];
    setFace('italic');
    doc.setFontSize(9.4);
    doc.setTextColor(...SOFT);
    doc.text(disclaimer, M, y + 2);
    y += disclaimer.length * 3.8 + 9;

    // 03 Fornituras
    y = sectionTitle('03', 'Fornituras', y);
    const hcols: Column[] = [
      { title: 'Referencia', w: 28 },
      { title: 'Elemento', w: 43 },
      { title: 'Acabado', w: 43 },
      { title: 'Calibre', w: 24 },
      { title: 'Cant.', w: 10, align: 'right' },
      { title: 'Posición', w: 30, pad: 3 },
    ];
    y = tableHead(hcols, y + 1);
    for (const h of hardwareRows(opts)) {
      const rowH = 10;
      const base = y + 4.6;
      let x = M;
      const next = (i: number) => {
        const start = x;
        x += hcols[i].w;
        return start;
      };
      text(fit(h.ref, hcols[0].w - 1.5, 6.6, 'mono'), next(0), base, { face: 'mono', size: 6.6 });
      text(fit(h.item, hcols[1].w - 2, 10.5, 'serif'), next(1), base, { face: 'serif', size: 10.5 });
      const fx = next(2);
      swatch(h.hex, fx, y + 2.2, 3, 3);
      text(fit(h.finish, hcols[2].w - 6.5, 7.2, 'light'), fx + 4.5, base, { face: 'light', size: 7.2 });
      text(fit(h.caliber, hcols[3].w - 1.5, 6.6, 'mono'), next(3), base, { face: 'mono', size: 6.6 });
      const qx = next(4);
      text(String(h.qty), qx + hcols[4].w - 1.5, base, { face: 'mono', size: 7, align: 'right' });
      const posX = next(5) + 3;
      setFace('light');
      doc.setFontSize(6.6);
      doc.setTextColor(...INK);
      const pos = doc.splitTextToSize(h.position, hcols[5].w - 3) as string[];
      doc.text(pos.slice(0, 2), posX, base - (pos.length > 1 ? 1.4 : 0));
      line(M, y + rowH, W - M, y + rowH, RULE, FINE);
      y += rowH;
    }
    y += 4;
    text(
      `Ojales centrados a ±${Math.round(opts.hardware.eyeletSpacingMm / 2)} mm del eje (${opts.hardware.eyeletSpacingMm} mm entre centros), con arandela del mismo acabado.`,
      M,
      y + 2,
      { face: 'italic', size: 9.4, color: SOFT },
    );

    // 04 Orden de producción (configurador de taller)
    if (opts.order) {
      y = sectionTitle('04', `Orden de producción  ·  ${opts.order.number}`, y + 14);
      const sizes = opts.order.sizes;
      const colW = CW / (sizes.length + 1);
      sizes.forEach((s, i) => caps(s.size, M + i * colW, y + 1, { size: 5.4 }));
      caps('Total', M + sizes.length * colW, y + 1, { color: INK, size: 5.4 });
      line(M, y + 3, W - M, y + 3, INK, HAIR);
      sizes.forEach((s, i) =>
        text(String(s.qty), M + i * colW, y + 9, { face: 'mono', size: 9, color: s.qty ? INK : MUTED }),
      );
      text(String(orderTotal), M + sizes.length * colW, y + 9, { face: 'mono', size: 9 });
      line(M, y + 12, W - M, y + 12, RULE, FINE);
      text(
        `Colocaciones y calibres referidos a la talla ${opts.order.baseSize}; escalar según la tabla de gradación del taller.`,
        M,
        y + 17,
        { face: 'italic', size: 9.4, color: SOFT },
      );
      y += 17;
    }

    // Visto bueno
    const sy = Math.max(254, y + 22);
    const sw = CW / 3;
    ['Atelier', 'Producción', 'Fecha'].forEach((label, i) => {
      const x = M + i * sw;
      line(x, sy, x + sw - 8, sy, INK, FINE);
      caps(label, x, sy + 3.6);
    });
    caps('Visto bueno', M, sy - 12, { color: INK });
  };

  /* ---------------------------------------------------------------- composición */

  await cover();
  views.forEach((v, i) => {
    doc.addPage();
    plate(v, i + 1);
  });
  doc.addPage();
  materials(views.length + 1);

  // Pie en todas las páginas salvo la portada
  const pages = doc.getNumberOfPages();
  for (let n = 2; n <= pages; n++) {
    doc.setPage(n);
    line(M, 283, W - M, 283, RULE, FINE);
    caps(`${styleCode}  ·  ${title}  ·  Dossier technique  ·  ${dateStr}`, M, 287, { size: 5, max: CW - 20 });
    text(`${n} / ${pages}`, W - M, 287, { face: 'mono', size: 6.2, color: MUTED, align: 'right' });
  }

  return doc.output('blob');
}

/* -------------------------------------------------------------------------- */
/* ZIP                                                                        */
/* -------------------------------------------------------------------------- */

function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'diseno'
  );
}

export async function buildTechPack(opts: TechPackOptions) {
  const views: ViewExport[] = [];
  for (const view of HOODIE_VIEWS) {
    const canvas = getCanvas(view);
    const exported = canvas ? await extractView(view, canvas) : null;
    if (exported) views.push(exported);
  }
  // Una orden de taller puede ser una prenda lisa (color y tallas); un dossier de diseño necesita piezas.
  if (!views.length && !opts.order) throw new Error('No hay elementos en el lienzo. Añade un gráfico o un texto.');

  const date = new Date();
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  const reference = opts.order?.number ?? `DT-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const [{ default: JSZip }, pdf] = await Promise.all([import('jszip'), buildPdf(views, opts, reference, date)]);
  const zip = new JSZip();
  zip.file('dossier-technique.pdf', pdf);

  for (const v of views) {
    const dir = zip.folder(v.view)!;
    dir.file('artwork.svg', v.svg);
    dir.file(`print-${v.dpi}dpi.png`, v.printPng);
    dir.file('plano-tecnico.png', v.plate.png);
    for (const f of v.techniqueFiles) {
      zip.file(`${f.dir}/artwork.svg`, f.svg);
      zip.file(`${f.dir}/print-${f.dpi}dpi.png`, f.png);
    }
  }
  if (opts.snapshot3d) {
    zip.file('render-3d.png', opts.snapshot3d.split(',')[1], { base64: true });
  }

  const allElements = views.flatMap((v) => v.elements);
  const inks = uniqueHex(allElements);
  const techniques = countTechniques(allElements);
  const garmentHex = opts.garmentColor.toUpperCase();
  const garmentParts = colorBreakdown(garmentHex);

  const spec = {
    reference,
    styleCode: opts.styleCode,
    season: opts.season,
    designName: opts.designName,
    createdAt: date.toISOString(),
    units: 'mm',
    coordinates: {
      origin: 'HPS (High Point Shoulder) sobre el eje central',
      x: 'Centro de la pieza; + = derecha mirando la prenda',
      y: 'Borde superior de la pieza bajo el HPS',
      scale: { pxPerCm: PX_PER_CM },
    },
    garment: {
      name: GARMENT.name,
      chestWidthMm: GARMENT.chestWidthCm * 10,
      bodyLengthMm: GARMENT.bodyLengthCm * 10,
      colorHex: garmentHex,
      rgb: garmentParts.rgb,
      cmykApprox: garmentParts.cmyk,
    },
    fabric: { ...opts.fabric, weightOzYd2: Math.round((opts.fabric.weightGsm / 33.906) * 10) / 10 },
    hardware: {
      spec: opts.hardware,
      items: hardwareRows(opts).map(({ ref, item, finish, hex, caliber, qty, position }) => ({
        ref,
        item,
        finish,
        hex,
        caliber,
        qty,
        position,
      })),
    },
    inks: inkRows(allElements).map((r) => ({
      ref: r.ref,
      technique: r.technique,
      hex: r.hex,
      ...(r.hex ? colorBreakdown(r.hex) : {}),
      finish: r.finish,
      gradientTo: r.hexTo,
      tonalShift: r.shift,
      pieces: r.pieces,
    })),
    garmentHex,
    /** Color único del diseño, o null si hay varios / colores originales (ver graphicHexes). */
    graphicHex: inks.length === 1 && allElements.every((e) => e.hex) ? inks[0] : null,
    graphicHexes: inks,
    techniques,
    reflectiveFinish: !!techniques['Tinta Reflectante D3O/3M'],
    embroidery: !!(techniques['Bordado Alto Relieve'] || techniques[TONAL_TECHNIQUE]),
    tonalEmbroidery: !!techniques[TONAL_TECHNIQUE],
    tonalShifts: TONAL_SHIFTS.map(({ id, amount }) => ({ id, amount })),
    elementCount: allElements.length,
    order: opts.order
      ? { ...opts.order, total: opts.order.sizes.reduce((n, s) => n + s.qty, 0) }
      : null,
    views: views.map((v) => ({
      view: v.view,
      label: v.label,
      ...v.placement,
      printAreaMm: {
        width: VIEW_SPECS[v.view].printArea.widthCm * 10,
        height: VIEW_SPECS[v.view].printArea.heightCm * 10,
        topFromHps: VIEW_SPECS[v.view].printArea.topFromHpsCm * 10,
      },
      containsRaster: v.hasRaster,
      elements: v.elements,
      files: {
        vector: `${v.view}/artwork.svg`,
        raster: `${v.view}/print-${v.dpi}dpi.png`,
        flat: `${v.view}/plano-tecnico.png`,
        byTechnique: Object.fromEntries(
          v.techniqueFiles.map((f) => [f.technique, { vector: `${f.dir}/artwork.svg`, raster: `${f.dir}/print-${f.dpi}dpi.png` }]),
        ),
      },
      dpi: v.dpi,
    })),
  };
  zip.file('spec.json', JSON.stringify(spec, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const code = slug(opts.styleCode || 'ahs').toUpperCase();
  const prefix = opts.order ? `${opts.order.number}_${code}` : code;
  return { blob, filename: `${prefix}_${slug(opts.designName)}_dossier.zip`, spec };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
