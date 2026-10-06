'use client';

import {
  Canvas,
  FabricImage,
  FabricText,
  IText,
  InteractiveFabricObject,
  cache as fabricCache,
  Line,
  Point,
  Rect as FabricRect,
  loadSVGFromString,
  loadSVGFromURL,
  util,
  type FabricObject,
} from 'fabric';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CENTER_X,
  HPS_Y,
  DEFAULT_TECHNIQUE,
  FONT_OPTIONS,
  TECHNIQUE_INFO,
  TONAL_TECHNIQUE,
  fontOption,
  VIEW_SPECS,
  cmToPx,
  getDesignZoneRect,
  getPrintAreaRect,
  pxToCm,
  type GradientSpec,
  type HoodieView,
  type Rect,
  type Technique,
  type TechniqueLayer,
  type ThreadFinish,
  type TonalShift,
} from '../hoodie/spec';
import { luminance } from '../color';
import { useStudio } from '../store';
import type { GeneratedAsset, PlacementMetrics } from '../types';
import { applyGarmentColor, toneReviver } from './garment';
import { notifyDesignChanged } from './registry';

/* -------------------------------------------------------------------------- */
/* Etiquetado de objetos                                                      */
/* -------------------------------------------------------------------------- */

/** template = sudadera de fondo · guide = ayudas visuales · design = gráficos del usuario */
export type ObjectRole = 'template' | 'guide' | 'design';

type Tagged = FabricObject & {
  hoodieRole?: ObjectRole;
  assetId?: string;
  assetName?: string;
  guideId?: string;
  /** HEX de la tinta aplicada (o la original conocida, p. ej. blanco de DALL·E). */
  inkColor?: string;
  /** Tinta original del asset, para «Colores originales». */
  originalInk?: string;
  /** Técnica de aplicación del elemento (custom data para fábrica y para el 3D). */
  tecnica?: Technique;
  /** Tipo de elemento: gráfico vectorial, gráfico raster o texto. */
  elementKind?: ElementKind;
  tonoShift?: TonalShift;
  hiloAcabado?: ThreadFinish;
  gradient?: GradientSpec;
};

export type ElementKind = 'svg' | 'png' | 'text';

/** Propiedades propias que deben sobrevivir a clone()/toObject(). */
export const CUSTOM_PROPS = [
  'hoodieRole',
  'assetId',
  'assetName',
  'inkColor',
  'originalInk',
  'tecnica',
  'elementKind',
  'tonoShift',
  'hiloAcabado',
  'inkBeforeTonal',
  'gradient',
];

export const techniqueOfObject = (obj: FabricObject) => (obj as Tagged).tecnica ?? DEFAULT_TECHNIQUE;
export const kindOfObject = (obj: FabricObject): ElementKind =>
  (obj as Tagged).elementKind ?? (obj instanceof IText ? 'text' : obj instanceof FabricImage ? 'png' : 'svg');
export const layerOfObject = (obj: FabricObject): TechniqueLayer => TECHNIQUE_INFO[techniqueOfObject(obj)].layer;

export const roleOf = (obj: FabricObject) => (obj as Tagged).hoodieRole;
export const isDesign = (obj: FabricObject) => roleOf(obj) === 'design';

function tag(obj: FabricObject, role: ObjectRole, extra: Partial<Tagged> = {}) {
  Object.assign(obj, { hoodieRole: role, ...extra });
  return obj;
}

export function getDesignObjects(canvas: Canvas) {
  return canvas.getObjects().filter(isDesign);
}

/* -------------------------------------------------------------------------- */
/* Inicialización del lienzo                                                  */
/* -------------------------------------------------------------------------- */

// Dirección de arte: filetes marfil sobre negro, sin color en la interfaz.
const IVORY = '#F4F1EA';
const HAIRLINE = 'rgba(244,241,234,0.55)';
const SNAP_DISTANCE = 10; // unidades de escena (~1,4 cm), cómodo en el lienzo miniatura

let controlsStyled = false;

/** Estilo global de los controles tipo bounding-box (se aplica una sola vez). */
function styleControls() {
  if (controlsStyled) return;
  controlsStyled = true;
  Object.assign(InteractiveFabricObject.ownDefaults, {
    cornerColor: '#000000',
    cornerStrokeColor: IVORY,
    cornerStyle: 'rect',
    cornerSize: 7,
    touchCornerSize: 28,
    transparentCorners: false,
    borderColor: HAIRLINE,
    borderScaleFactor: 1,
    padding: 5,
  });
}

/** Carga el template SVG de la sudadera como fondo vectorial (nítido a cualquier zoom). */
async function loadTemplate(view: HoodieView) {
  const { objects, options } = await loadSVGFromURL(VIEW_SPECS[view].template, toneReviver);
  const shapes = objects.filter((o): o is FabricObject => Boolean(o));
  const template = util.groupSVGElements(shapes, options);
  // El SVG trae un rect a sangre de 800x760, así que su centro es el del lienzo.
  template.set({
    originX: 'center',
    originY: 'center',
    left: CANVAS_WIDTH / 2,
    top: CANVAS_HEIGHT / 2,
    selectable: false,
    evented: false,
    excludeFromExport: true,
  });
  return tag(template, 'template');
}

function createGuides(view: HoodieView) {
  const pa = getPrintAreaRect(view);
  const { widthCm, heightCm } = VIEW_SPECS[view].printArea;
  const common = {
    selectable: false,
    evented: false,
    excludeFromExport: true,
    objectCaching: false,
  };

  const printArea = new FabricRect({
    ...common,
    originX: 'left',
    originY: 'top',
    left: pa.left,
    top: pa.top,
    width: pa.width,
    height: pa.height,
    fill: 'rgba(244,241,234,0.012)',
    stroke: 'rgba(244,241,234,0.32)',
    strokeWidth: 1,
    strokeDashArray: [2, 5],
    strokeUniform: true,
  });

  const label = new FabricText(`ZONA RECOMENDADA   ${widthCm * 10} × ${heightCm * 10} MM`, {
    ...common,
    originX: 'left',
    originY: 'bottom',
    left: pa.left,
    top: pa.top - 4,
    fontSize: 13,
    fontFamily: '"Inter", "Helvetica Neue", sans-serif',
    fontWeight: 300,
    fill: 'rgba(244,241,234,0.5)',
    charSpacing: 320,
  });

  const vGuide = new Line([CENTER_X, 0, CENTER_X, CANVAS_HEIGHT], {
    ...common,
    stroke: HAIRLINE,
    strokeWidth: 1,
    strokeDashArray: [1, 4],
    visible: false,
  });

  const paCenterY = pa.top + pa.height / 2;
  const hGuide = new Line([pa.left - 40, paCenterY, pa.left + pa.width + 40, paCenterY], {
    ...common,
    stroke: HAIRLINE,
    strokeWidth: 1,
    strokeDashArray: [1, 4],
    visible: false,
  });

  tag(printArea, 'guide', { guideId: 'print-area' });
  tag(label, 'guide', { guideId: 'label' });
  tag(vGuide, 'guide', { guideId: 'snap-v' });
  tag(hGuide, 'guide', { guideId: 'snap-h' });
  return { printArea, label, vGuide, hGuide };
}

/**
 * Crea un lienzo Fabric para una vista. El <canvas> se crea aquí (no en JSX)
 * para que el doble montaje de React StrictMode nunca reutilice un elemento
 * ya inicializado por Fabric.
 */
export function createDesignCanvas(host: HTMLElement, view: HoodieView) {
  styleControls();
  const el = document.createElement('canvas');
  host.appendChild(el);

  const canvas = new Canvas(el, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    preserveObjectStacking: true,
    controlsAboveOverlay: true,
    // Las texturas/exportaciones se pintan fuera de pantalla: no descartar nada.
    skipOffscreen: false,
    selectionColor: 'rgba(244,241,234,0.04)',
    selectionBorderColor: HAIRLINE,
    selectionLineWidth: 1,
  });

  const guides = createGuides(view);
  canvas.add(guides.printArea, guides.label, guides.vGuide, guides.hGuide);

  const disposeSnapping = enableSnapping(canvas, view, guides);

  const ready = loadTemplate(view)
    .then((template) => {
      if (canvas.destroyed) return;
      canvas.backgroundImage = template;
      const { garmentColor, hardware } = useStudio.getState();
      applyGarmentColor(canvas, garmentColor, hardware);
      notifyDesignChanged(view);
    })
    .catch((err) => console.error('[hoodie] No se pudo cargar el template', err));

  return {
    canvas,
    ready,
    async dispose() {
      disposeSnapping();
      // Fabric devuelve el <canvas> original al sitio de su contenedor; se
      // retira sólo ESE nodo: con StrictMode el segundo montaje ya ha creado
      // su propio lienzo en el mismo host y no hay que tocarlo.
      await canvas.dispose();
      el.remove();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Snapping al eje central y al centro del área de impresión                  */
/* -------------------------------------------------------------------------- */

function enableSnapping(
  canvas: Canvas,
  view: HoodieView,
  guides: { vGuide: Line; hGuide: Line },
) {
  const pa = getPrintAreaRect(view);
  const paCenterY = pa.top + pa.height / 2;

  const onMoving = ({ target }: { target: FabricObject }) => {
    const c = target.getCenterPoint();
    const snapX = Math.abs(c.x - CENTER_X) < SNAP_DISTANCE;
    const snapY = Math.abs(c.y - paCenterY) < SNAP_DISTANCE;
    if (snapX || snapY) {
      target.setPositionByOrigin(
        new Point(snapX ? CENTER_X : c.x, snapY ? paCenterY : c.y),
        'center',
        'center',
      );
    }
    guides.vGuide.set({ visible: snapX });
    guides.hGuide.set({ visible: snapY });
  };

  const hide = () => {
    if (!guides.vGuide.visible && !guides.hGuide.visible) return;
    guides.vGuide.set({ visible: false });
    guides.hGuide.set({ visible: false });
    canvas.requestRenderAll();
  };

  const offMoving = canvas.on('object:moving', onMoving);
  const clamp = ({ target }: { target: FabricObject }) => {
    clampToZone(target, view);
    target.setCoords();
  };
  const offClampMove = canvas.on('object:moving', clamp);
  const offClampScale = canvas.on('object:scaling', clamp);
  const offClampDone = canvas.on('object:modified', clamp);
  const offUp = canvas.on('mouse:up', hide);
  return () => {
    offMoving();
    offClampMove();
    offClampScale();
    offClampDone();
    offUp();
  };
}

/* -------------------------------------------------------------------------- */
/* Assets → objetos de Fabric                                                 */
/* -------------------------------------------------------------------------- */

async function createAssetObject(asset: GeneratedAsset): Promise<FabricObject> {
  if (asset.kind === 'svg' && asset.svg) {
    const { objects, options } = await loadSVGFromString(asset.svg);
    const shapes = objects.filter((o): o is FabricObject => Boolean(o));
    if (!shapes.length) throw new Error('El SVG no contiene formas compatibles con Fabric.');
    return util.groupSVGElements(shapes, options);
  }
  return FabricImage.fromURL(asset.src);
}

/**
 * Añade un asset al lienzo, escalado para caber en el área de impresión y
 * centrado en el punto de soltado (o en el centro del área).
 */
export async function addAssetToCanvas(
  canvas: Canvas,
  view: HoodieView,
  asset: GeneratedAsset,
  dropPoint?: { x: number; y: number },
) {
  const obj = await createAssetObject(asset);
  const pa = getPrintAreaRect(view);

  const fit = Math.min((pa.width * 0.7) / obj.width, (pa.height * 0.7) / obj.height);
  obj.set({ scaleX: fit, scaleY: fit, originX: 'center', originY: 'center' });

  // Se puede soltar en cualquier punto de la pieza (mangas y capucha incluidas).
  const zone = getDesignZoneRect(view);
  const x = dropPoint ? clamp(dropPoint.x, zone.left, zone.left + zone.width) : CENTER_X;
  const y = dropPoint ? clamp(dropPoint.y, zone.top, zone.top + zone.height) : pa.top + pa.height / 2;
  obj.setPositionByOrigin(new Point(x, y), 'center', 'center');

  tag(obj, 'design', {
    assetId: asset.id,
    assetName: asset.name,
    inkColor: asset.inkColor,
    originalInk: asset.inkColor,
    tecnica: DEFAULT_TECHNIQUE,
    elementKind: asset.kind,
  });
  canvas.add(obj);
  canvas.setActiveObject(obj);
  obj.setCoords();
  canvas.requestRenderAll();
  syncCanvasState(canvas, view);
  return obj;
}

/* -------------------------------------------------------------------------- */
/* Motor de texto (fabric.IText)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Las fuentes web se cargan bajo demanda: Fabric mide el texto al crearlo,
 * así que hay que esperar a la fuente real y vaciar su caché de medidas para
 * no quedarse con las métricas de la fuente de reserva. `family` es el nombre
 * (p. ej. "Bodoni Moda"); Fabric recibe la lista CSS con reservas (`stack`).
 */
export async function ensureFontLoaded(family: string) {
  const opt = fontOption(family) ?? FONT_OPTIONS[0];
  try {
    await document.fonts.load(`${opt.weight} 64px ${opt.stack}`);
  } catch {
    /* fuente de sistema o no disponible: se usa la de reserva */
  }
  fabricCache.clearFontCache(opt.stack);
  return opt;
}

/** Nombre de la tipografía de un texto (Fabric guarda la lista CSS completa). */
export const fontFamilyName = (obj: IText) => fontOption(obj.fontFamily)?.family ?? obj.fontFamily;

export interface TextOptions {
  text: string;
  fontFamily: string;
  fill?: string;
}

/** Añade un IText editable (doble clic en el lienzo) centrado en el área de impresión. */
export async function addTextToCanvas(canvas: Canvas, view: HoodieView, { text, fontFamily, fill }: TextOptions) {
  const font = await ensureFontLoaded(fontFamily);
  const pa = getPrintAreaRect(view);
  // Tinta por defecto: blanca sobre prenda oscura, negra sobre prenda clara.
  const ink = fill ?? (luminance(useStudio.getState().garmentColor) > 0.35 ? '#111111' : '#FFFFFF');
  const obj = new IText(text.trim() || 'TEXTO', {
    fontFamily: font.stack,
    fontWeight: font.weight,
    fontSize: 64,
    fill: ink,
    textAlign: 'center',
    // Tracking de pasarela: espaciado amplio y aire entre letras.
    charSpacing: 260,
    originX: 'center',
    originY: 'center',
    editingBorderColor: HAIRLINE,
    cursorColor: IVORY,
    cursorWidth: 1,
  });
  if (obj.width > pa.width * 0.85) obj.scaleToWidth(pa.width * 0.85);
  obj.setPositionByOrigin(new Point(CENTER_X, pa.top + pa.height * 0.3), 'center', 'center');
  tag(obj, 'design', {
    assetName: obj.text,
    inkColor: ink,
    originalInk: ink,
    tecnica: DEFAULT_TECHNIQUE,
    elementKind: 'text',
  });
  canvas.add(obj);
  canvas.setActiveObject(obj);
  obj.setCoords();
  canvas.requestRenderAll();
  syncCanvasState(canvas, view);
  return obj;
}

/** Cambia el contenido o la fuente del texto seleccionado. */
export async function updateActiveText(canvas: Canvas, view: HoodieView, patch: Partial<Omit<TextOptions, 'fill'>>) {
  const obj = canvas.getActiveObject();
  if (!(obj instanceof IText)) return;
  if (patch.fontFamily) {
    const font = await ensureFontLoaded(patch.fontFamily);
    obj.set({ fontFamily: font.stack, fontWeight: font.weight });
  }
  if (patch.text !== undefined && patch.text.length) obj.set({ text: patch.text });
  obj.initDimensions();
  (obj as Tagged).assetName = obj.text;
  obj.set('dirty', true);
  commit(canvas, view, obj);
}

/* -------------------------------------------------------------------------- */
/* Métricas de producción                                                     */
/* -------------------------------------------------------------------------- */

const round1 = (n: number) => Math.round(n * 10) / 10;

export function measureRect(view: HoodieView, r: Rect, angle = 0): PlacementMetrics {
  const pa = getPrintAreaRect(view);
  const tol = 0.5;
  return {
    view,
    widthCm: round1(pxToCm(r.width)),
    heightCm: round1(pxToCm(r.height)),
    offsetXCm: round1(pxToCm(r.left + r.width / 2 - CENTER_X)),
    topFromHpsCm: round1(pxToCm(r.top - HPS_Y)),
    angle: Math.round(((angle % 360) + 360) % 360),
    insidePrintArea:
      r.left >= pa.left - tol &&
      r.top >= pa.top - tol &&
      r.left + r.width <= pa.left + pa.width + tol &&
      r.top + r.height <= pa.top + pa.height + tol,
  };
}

/** Bounding box (escena) que engloba todos los gráficos de la vista. */
export function getDesignBounds(canvas: Canvas): Rect | null {
  const objs = getDesignObjects(canvas);
  if (!objs.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objs) {
    const b = o.getBoundingRect();
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.left + b.width);
    maxY = Math.max(maxY, b.top + b.height);
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

/** Vuelca al store las métricas de la selección y avisa a la vista 3D. */
let changeListener: ((canvas: Canvas, view: HoodieView) => void) | null = null;

/** El historial (deshacer) se engancha aquí para enterarse de cada cambio del diseño. */
export function setChangeListener(fn: (canvas: Canvas, view: HoodieView) => void) {
  changeListener = fn;
}

export function syncCanvasState(canvas: Canvas, view: HoodieView) {
  const store = useStudio.getState();
  const active = canvas.getActiveObject();
  if (store.activeView === view) {
    store.setSelection(active ? measureRect(view, active.getBoundingRect(), active.angle) : null);
  }
  const designs = getDesignObjects(canvas) as Tagged[];
  if (store.designCounts[view] !== designs.length) store.setDesignCount(view, designs.length);
  const layers = { print: 0, reflective: 0, embroidery: 0 } as Record<TechniqueLayer, number>;
  designs.forEach((o) => layers[layerOfObject(o)]++);
  const prev = store.layerCounts[view];
  if (prev.print !== layers.print || prev.reflective !== layers.reflective || prev.embroidery !== layers.embroidery) {
    store.setLayerCounts(view, layers);
  }
  if (store.activeView === view) {
    store.setSelectionStyle(selectionStyle(canvas, view));
    store.setElements(summarizeElements(canvas, view));
  }
  notifyDesignChanged(view);
  changeListener?.(canvas, view);
}

/** Nombre legible de un elemento para listas y Tech Pack. */
export function elementName(obj: FabricObject) {
  if (obj instanceof IText) return `«${obj.text.replace(/\s+/g, ' ').slice(0, 32)}»`;
  return (obj as Tagged).assetName ?? 'Gráfico';
}

/** Código de pieza del atelier: cara + número de orden (p. ej. «B·02» = espalda, elemento 2). */
export const elementCode = (view: HoodieView, index: number) =>
  `${view === 'front' ? 'F' : 'B'}·${String(index + 1).padStart(2, '0')}`;

/** Lista de elementos de una cara (orden de apilado, de abajo arriba). */
function summarizeElements(canvas: Canvas, view: HoodieView) {
  const active = new Set(canvas.getActiveObjects());
  return getDesignObjects(canvas).map((o, index) => {
    const m = measureRect(view, o.getBoundingRect(), o.angle);
    return {
      index,
      code: elementCode(view, index),
      kind: kindOfObject(o),
      name: elementName(o),
      technique: techniqueOfObject(o),
      hex: (o as Tagged).inkColor ?? null,
      widthCm: m.widthCm,
      heightCm: m.heightCm,
      active: active.has(o),
    };
  });
}

export type ElementSummary = ReturnType<typeof summarizeElements>[number];

/** Selecciona el elemento n.º index de la cara activa (desde la lista del panel). */
export function selectElement(canvas: Canvas, view: HoodieView, index: number) {
  const obj = getDesignObjects(canvas)[index];
  if (!obj) return;
  canvas.setActiveObject(obj);
  commit(canvas, view, obj);
}

/** Color y acabado de la selección (para los controles del panel Color). */
function selectionStyle(canvas: Canvas, view: HoodieView) {
  const objs = canvas.getActiveObjects().filter(isDesign) as Tagged[];
  if (!objs.length) return null;
  const inks = [...new Set(objs.map((o) => o.inkColor ?? null))];
  const techniques = [...new Set(objs.map(techniqueOfObject))];
  const kinds = [...new Set(objs.map(kindOfObject))];
  const single = objs.length === 1 ? objs[0] : null;
  const singleIndex = single ? getDesignObjects(canvas).indexOf(single) : -1;
  const tonal = objs.filter((o) => o.tecnica === TONAL_TECHNIQUE);
  const shifts = [...new Set(tonal.map((o) => o.tonoShift ?? 'exact'))];
  const finishes = [...new Set(tonal.map((o) => o.hiloAcabado ?? 'satin'))];
  return {
    count: objs.length,
    code: single ? elementCode(view, singleIndex) : `${objs.length} piezas`,
    inkColor: inks.length === 1 ? inks[0] : null,
    mixedInk: inks.length > 1,
    technique: techniques.length === 1 ? techniques[0] : null,
    kind: kinds.length === 1 ? kinds[0] : ('mixed' as const),
    name: single ? elementName(single) : `${objs.length} elementos`,
    text: single instanceof IText ? single.text : null,
    fontFamily: single instanceof IText ? fontFamilyName(single) : null,
    tonoShift: shifts.length === 1 ? shifts[0] : null,
    hiloAcabado: finishes.length === 1 ? finishes[0] : null,
    gradient: single?.gradient ?? null,
    tinted: objs.some((o) => o.inkColor && o.inkColor !== o.originalInk),
  };
}

export type SelectionStyle = NonNullable<ReturnType<typeof selectionStyle>>;

/* -------------------------------------------------------------------------- */
/* Acciones sobre la selección                                                */
/* -------------------------------------------------------------------------- */

/**
 * Mantiene una pieza dentro de la zona de diseño (el torso): si es mayor se reduce
 * y, si se sale, se empuja hacia dentro. Lo que cae fuera de la zona no se estampa,
 * así el gráfico nunca queda cortado en seco ni pasa a hombros o mangas.
 */
export function clampToZone(obj: FabricObject, view: HoodieView) {
  if (!isDesign(obj)) return;
  const zone = getDesignZoneRect(view);
  const box = () => {
    const xs = obj.getCoords().map((p) => p.x);
    const ys = obj.getCoords().map((p) => p.y);
    return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
  };
  let b = box();
  const factor = Math.min(1, zone.width / (b.r - b.l), zone.height / (b.b - b.t));
  if (factor < 1) {
    const center = obj.getCenterPoint();
    obj.set({ scaleX: obj.scaleX * factor, scaleY: obj.scaleY * factor });
    obj.setPositionByOrigin(center, 'center', 'center');
    obj.setCoords();
    b = box();
  }
  let dx = 0;
  let dy = 0;
  if (b.l < zone.left) dx = zone.left - b.l;
  else if (b.r > zone.left + zone.width) dx = zone.left + zone.width - b.r;
  if (b.t < zone.top) dy = zone.top - b.t;
  else if (b.b > zone.top + zone.height) dy = zone.top + zone.height - b.b;
  if (dx || dy) obj.set({ left: obj.left + dx, top: obj.top + dy });
}

function commit(canvas: Canvas, view: HoodieView, obj?: FabricObject) {
  if (obj) clampToZone(obj, view);
  obj?.setCoords();
  canvas.requestRenderAll();
  syncCanvasState(canvas, view);
}

/** Aplica un cambio hecho directamente sobre un objeto (mover, escalar, girar) y avisa al 3D. */
export function commitObject(canvas: Canvas, view: HoodieView, obj: FabricObject) {
  commit(canvas, view, obj);
}

export function centerActive(canvas: Canvas, view: HoodieView, axis: 'x' | 'y' | 'both') {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  const pa = getPrintAreaRect(view);
  const c = obj.getCenterPoint();
  const x = axis === 'y' ? c.x : CENTER_X;
  const y = axis === 'x' ? c.y : pa.top + pa.height / 2;
  obj.setPositionByOrigin(new Point(x, y), 'center', 'center');
  commit(canvas, view, obj);
}

/** Escala la selección para que su ancho real impreso sea `cm`. */
export function setActiveWidthCm(canvas: Canvas, view: HoodieView, cm: number) {
  const obj = canvas.getActiveObject();
  if (!obj || !(cm > 0)) return;
  const center = obj.getCenterPoint();
  obj.scaleToWidth(cmToPx(cm));
  obj.setPositionByOrigin(center, 'center', 'center');
  commit(canvas, view, obj);
}

/** Escala la selección para ocupar el máximo posible del área de impresión. */
export function fitActiveToPrintArea(canvas: Canvas, view: HoodieView) {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  const pa = getPrintAreaRect(view);
  const b = obj.getBoundingRect();
  const factor = Math.min(pa.width / b.width, pa.height / b.height);
  obj.set({ scaleX: obj.scaleX * factor, scaleY: obj.scaleY * factor });
  obj.setPositionByOrigin(new Point(CENTER_X, pa.top + pa.height / 2), 'center', 'center');
  commit(canvas, view, obj);
}

export function setActiveAngle(canvas: Canvas, view: HoodieView, deg: number) {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  obj.rotate(deg);
  commit(canvas, view, obj);
}

export function flipActive(canvas: Canvas, view: HoodieView) {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  obj.set({ flipX: !obj.flipX });
  commit(canvas, view, obj);
}

export function changeActiveStacking(canvas: Canvas, view: HoodieView, dir: 'up' | 'down') {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  if (dir === 'up') canvas.bringObjectForward(obj);
  else canvas.sendObjectBackwards(obj);
  commit(canvas, view, obj);
}

export async function duplicateActive(canvas: Canvas, view: HoodieView) {
  const obj = canvas.getActiveObject();
  if (!obj || !isDesign(obj)) return; // las selecciones múltiples no se duplican
  const copy = await obj.clone(CUSTOM_PROPS);
  copy.set({ left: obj.left + 14, top: obj.top + 14 });
  canvas.add(copy);
  canvas.setActiveObject(copy);
  commit(canvas, view, copy);
}

export function removeActive(canvas: Canvas, view: HoodieView) {
  const objs = canvas.getActiveObjects().filter(isDesign);
  if (!objs.length) return;
  canvas.discardActiveObject();
  canvas.remove(...objs);
  commit(canvas, view);
}

export function nudgeActive(canvas: Canvas, view: HoodieView, dx: number, dy: number) {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  obj.set({ left: obj.left + dx, top: obj.top + dy });
  commit(canvas, view, obj);
}

/** Ajusta el tamaño CSS del lienzo y el zoom para que quepa en el contenedor. */
export function fitCanvasToBox(canvas: Canvas, boxWidth: number, boxHeight: number) {
  if (boxWidth <= 0 || boxHeight <= 0) return; // contenedor oculto: no tocar
  const zoom = Math.min(boxWidth / CANVAS_WIDTH, boxHeight / CANVAS_HEIGHT);
  canvas.setDimensions({
    width: Math.floor(CANVAS_WIDTH * zoom),
    height: Math.floor(CANVAS_HEIGHT * zoom),
  });
  canvas.setZoom(zoom);
  canvas.requestRenderAll();
}

/** Convierte un punto de pantalla (p. ej. un evento drop) a coordenadas de escena. */
export function clientToScene(canvas: Canvas, clientX: number, clientY: number) {
  const rect = canvas.upperCanvasEl.getBoundingClientRect();
  const vpt = canvas.viewportTransform;
  return {
    x: (clientX - rect.left - vpt[4]) / vpt[0],
    y: (clientY - rect.top - vpt[5]) / vpt[3],
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
