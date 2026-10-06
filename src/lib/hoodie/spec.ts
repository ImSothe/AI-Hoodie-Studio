/**
 * Especificación física de la prenda. Es la "fuente de verdad" que comparten
 * el lienzo 2D (Fabric), la vista 3D (Three) y el Tech Pack, de modo que un
 * píxel del lienzo siempre equivale a la misma medida real en la sudadera.
 */

export type HoodieView = 'front' | 'back';

export const HOODIE_VIEWS: HoodieView[] = ['front', 'back'];

/** Tamaño lógico del lienzo (unidades de escena de Fabric). */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 760;

/** Escala del template: 7 px de escena = 1 cm real (ancho de pecho 66 cm = 462 px). */
export const PX_PER_CM = 7;

/** Eje vertical central de la prenda en el lienzo. */
export const CENTER_X = CANVAS_WIDTH / 2;

/** Altura del HPS (High Point Shoulder: unión cuello-hombro) en el lienzo. */
export const HPS_Y = 190;

export const GARMENT = {
  name: 'Sudadera oversize con capucha',
  color: 'Negro',
  chestWidthCm: 66,
  bodyLengthCm: 72,
} as const;

export interface PrintAreaSpec {
  widthCm: number;
  heightCm: number;
  /** Distancia desde el HPS hasta el borde superior del área. */
  topFromHpsCm: number;
}

export interface ViewSpec {
  id: HoodieView;
  label: string;
  template: string;
  printArea: PrintAreaSpec;
}

export const VIEW_SPECS: Record<HoodieView, ViewSpec> = {
  front: {
    id: 'front',
    label: 'Delantera',
    template: '/templates/hoodie-front.svg',
    // Por encima del bolsillo canguro (que empieza a ~41 cm del HPS).
    printArea: { widthCm: 30, heightCm: 24, topFromHpsCm: 15 },
  },
  back: {
    id: 'back',
    label: 'Trasera',
    template: '/templates/hoodie-back.svg',
    printArea: { widthCm: 38, heightCm: 48, topFromHpsCm: 10 },
  },
};

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Área de impresión en coordenadas de escena del lienzo. */
export function getPrintAreaRect(view: HoodieView): Rect {
  const { widthCm, heightCm, topFromHpsCm } = VIEW_SPECS[view].printArea;
  const width = widthCm * PX_PER_CM;
  return {
    left: CENTER_X - width / 2,
    top: HPS_Y + topFromHpsCm * PX_PER_CM,
    width,
    height: heightCm * PX_PER_CM,
  };
}

export const pxToCm = (px: number) => px / PX_PER_CM;
export const cmToPx = (cm: number) => cm * PX_PER_CM;

/* -------------------------------------------------------------------------- */
/* Técnicas de aplicación (por elemento)                                      */
/* -------------------------------------------------------------------------- */

export const TECHNIQUES = [
  'Serigrafía Plana',
  'Tinta Reflectante D3O/3M',
  'Bordado Alto Relieve',
  'Bordado Ton-sur-Ton (Tono sobre Tono)',
] as const;
export type Technique = (typeof TECHNIQUES)[number];
export const DEFAULT_TECHNIQUE: Technique = 'Serigrafía Plana';
export const TONAL_TECHNIQUE: Technique = 'Bordado Ton-sur-Ton (Tono sobre Tono)';

/** Capa 3D en la que se dibuja cada técnica (cada capa = un <Decal> con su material). */
export type TechniqueLayer = 'print' | 'reflective' | 'embroidery';

export const TECHNIQUE_INFO: Record<
  Technique,
  { layer: TechniqueLayer; slug: string; short: string; code: string; note: string }
> = {
  'Serigrafía Plana': {
    layer: 'print',
    slug: 'serigrafia-plana',
    short: 'Serigrafía',
    code: 'SER',
    note: 'Una pantalla por tinta. Malla 120 h/cm para línea fina.',
  },
  'Tinta Reflectante D3O/3M': {
    layer: 'reflective',
    slug: 'reflectante',
    short: 'Reflectante',
    code: 'REF',
    note: 'Tinta o vinilo retrorreflectante (tipo 3M Scotchlite). Validar lavados con el proveedor.',
  },
  'Bordado Alto Relieve': {
    layer: 'embroidery',
    slug: 'bordado-alto-relieve',
    short: 'Bordado 3D',
    code: 'BAR',
    note: 'Digitalizar (DST/PES) desde el SVG. Espuma 3 mm bajo satén para el relieve.',
  },
  'Bordado Ton-sur-Ton (Tono sobre Tono)': {
    layer: 'embroidery',
    slug: 'bordado-ton-sur-ton',
    short: 'Ton-sur-ton',
    code: 'BTT',
    note: 'Hilo del mismo tono que el tejido: el motivo se lee por relieve y brillo. Casar el hilo con tejido ya teñido.',
  },
};

export const techniqueOf = (layer: TechniqueLayer) =>
  TECHNIQUES.find((t) => TECHNIQUE_INFO[t].layer === layer) ?? DEFAULT_TECHNIQUE;

/** Ton-sur-ton: el hilo sigue al tejido, exacto o con un matiz casi imperceptible. */
export const TONAL_SHIFTS = [
  { id: 'exact', label: 'Mismo HEX', amount: 0 },
  { id: 'lighter', label: '+ claro', amount: 0.07 },
  { id: 'darker', label: '+ oscuro', amount: -0.07 },
] as const;
export type TonalShift = (typeof TONAL_SHIFTS)[number]['id'];

export const THREAD_FINISHES = [
  { id: 'satin', label: 'Satinado', detail: 'brilla con luz directa', roughness: 0.26, sheen: 1 },
  { id: 'matte', label: 'Mate', detail: 'absorbe la luz', roughness: 0.96, sheen: 0.25 },
] as const;
export type ThreadFinish = (typeof THREAD_FINISHES)[number]['id'];

/* -------------------------------------------------------------------------- */
/* Tipografías (autoalojadas con @fontsource, importadas en app/layout.tsx)   */
/* -------------------------------------------------------------------------- */

/**
 * `stack` es lo que recibe Fabric (lista CSS con reserva). Helvetica Neue es
 * de sistema (macOS/iOS); donde no está instalada se previsualiza con Inter.
 */
export const FONT_OPTIONS = [
  { family: 'Helvetica Neue', stack: '"Helvetica Neue", "Inter", Helvetica, Arial, sans-serif', weight: 300, label: 'Helvetica Neue — Light', fallback: 'Inter Light' },
  { family: 'Inter', stack: '"Inter", sans-serif', weight: 200, label: 'Inter — Extra Light', fallback: null },
  { family: 'Bodoni Moda', stack: '"Bodoni Moda", serif', weight: 400, label: 'Bodoni Moda — Didone', fallback: null },
  { family: 'Cormorant Garamond', stack: '"Cormorant Garamond", serif', weight: 300, label: 'Cormorant Garamond — Light', fallback: null },
  { family: 'IBM Plex Mono', stack: '"IBM Plex Mono", monospace', weight: 300, label: 'IBM Plex Mono — Light', fallback: null },
] as const;

export type FontOption = (typeof FONT_OPTIONS)[number];
export type FontFamily = FontOption['family'];

/** Busca la opción por nombre o por la lista CSS guardada en el objeto de Fabric. */
export const fontOption = (familyOrStack: string) =>
  FONT_OPTIONS.find((f) => f.family === familyOrStack || f.stack === familyOrStack);

/* -------------------------------------------------------------------------- */
/* Tejido y fornituras                                                        */
/* -------------------------------------------------------------------------- */

export const FABRIC_CONSTRUCTIONS = ['Felpa perchada', 'French terry (rizo)', 'Loopback heavyweight'] as const;
export const FABRIC_WEIGHTS = [380, 420, 460, 500] as const;
export const FABRIC_COMPOSITIONS = [
  '100% algodón orgánico peinado',
  '100% algodón',
  '80% algodón · 20% poliéster reciclado',
] as const;
export const FABRIC_FINISHES = ['Garment dyed', 'Enzyme wash', 'Prelavado (pre-shrunk)', 'Sin acabado'] as const;

export interface FabricSpec {
  construction: (typeof FABRIC_CONSTRUCTIONS)[number];
  weightGsm: (typeof FABRIC_WEIGHTS)[number];
  composition: (typeof FABRIC_COMPOSITIONS)[number];
  finish: (typeof FABRIC_FINISHES)[number];
}

export const DEFAULT_FABRIC: FabricSpec = {
  construction: 'Felpa perchada',
  weightGsm: 460,
  composition: '100% algodón orgánico peinado',
  finish: 'Garment dyed',
};

/** Acabados de metal para ojales y herretes (también definen el material 3D). */
export const METAL_FINISHES = [
  { id: 'gunmetal', label: 'Gunmetal pavonado', code: 'GM', hex: '#3E4044', metalness: 1, roughness: 0.32 },
  { id: 'black', label: 'Negro mate esmaltado', code: 'BK', hex: '#141414', metalness: 0.4, roughness: 0.7 },
  { id: 'palladium', label: 'Paladio cepillado', code: 'PD', hex: '#B8B6B1', metalness: 1, roughness: 0.28 },
  { id: 'nickel', label: 'Níquel pulido', code: 'NI', hex: '#D9D9D7', metalness: 1, roughness: 0.1 },
  { id: 'brass', label: 'Latón envejecido', code: 'BR', hex: '#8C7752', metalness: 1, roughness: 0.42 },
] as const;
export type MetalFinish = (typeof METAL_FINISHES)[number]['id'];
export const metalFinish = (id: MetalFinish) => METAL_FINISHES.find((m) => m.id === id)!;

export const EYELET_DIAMETERS_MM = [8, 10, 12] as const;
export const AGLET_LENGTHS_MM = [25, 30, 35] as const;
export const CORD_TYPES = ['Redondo Ø 8 mm', 'Plano 12 mm'] as const;

export interface HardwareSpec {
  eyeletFinish: MetalFinish;
  eyeletDiameterMm: (typeof EYELET_DIAMETERS_MM)[number];
  /** Separación entre centros de ojales. */
  eyeletSpacingMm: number;
  /** Altura de los ojales bajo el HPS. */
  eyeletDropMm: number;
  agletFinish: MetalFinish;
  agletLengthMm: (typeof AGLET_LENGTHS_MM)[number];
  cordType: (typeof CORD_TYPES)[number];
  /** Cordón tono sobre tono (sigue a la prenda) o de contraste. */
  cordTonal: boolean;
  cordHex: string;
  /** Pintar los herrajes en el visor 3D. */
  show3d: boolean;
}

// Coinciden con el template 2D: ojales a ±29 mm del eje y 60 mm bajo el HPS.
export const DEFAULT_HARDWARE: HardwareSpec = {
  eyeletFinish: 'gunmetal',
  eyeletDiameterMm: 10,
  eyeletSpacingMm: 58,
  eyeletDropMm: 60,
  agletFinish: 'gunmetal',
  agletLengthMm: 30,
  cordType: 'Redondo Ø 8 mm',
  cordTonal: true,
  cordHex: '#EDE8DF',
  show3d: true,
};

/** Resolución objetivo de los PNG de producción. */
export const PRINT_DPI = 300;
/** Límite de lado del PNG para no reventar la memoria del navegador. */
export const MAX_EXPORT_SIDE_PX = 6000;
