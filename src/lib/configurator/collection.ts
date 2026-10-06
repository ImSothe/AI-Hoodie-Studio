import { TECHNIQUE_INFO, TONAL_TECHNIQUE, type FontFamily, type HoodieView, type Technique } from '../hoodie/spec';

/**
 * Catálogo del configurador de taller: el modelo base, los colores de tejido
 * en stock, las técnicas que hace el taller, los hilos y las colocaciones
 * homologadas (en cm desde el HPS, siempre dentro de las áreas de impresión).
 * Es lo que un atelier ajusta a su producción.
 */
export const ATELIER = {
  house: 'Maison Nocturne',
  unit: 'Atelier de confección',
  season: 'FW26',
  category: 'Sudadera con capucha',
  model: 'Nocturne',
  reference: 'AHS-FW26-001',
  /** Talla sobre la que se definen las colocaciones. */
  baseSize: 'M',
} as const;

export const COLORWAYS = [
  { id: 'noir', name: 'Noir', hex: '#0B0B0B' },
  { id: 'graphite', name: 'Graphite', hex: '#2A2A2A' },
  { id: 'pierre', name: 'Pierre', hex: '#6F6B64' },
  { id: 'grege', name: 'Grège', hex: '#B9B2A6' },
  { id: 'ecru', name: 'Écru', hex: '#E6E0D4' },
  { id: 'marine', name: 'Marine', hex: '#141A24' },
  { id: 'bordeaux', name: 'Bordeaux', hex: '#3A141B' },
] as const;
export type ColorwayId = (typeof COLORWAYS)[number]['id'];

export const FINISHES: readonly {
  id: 'tonal' | 'relief' | 'print';
  name: string;
  note: string;
  technique: Technique;
  /** ¿Permite elegir el color del hilo / tinta? */
  threads: boolean;
}[] = [
  {
    id: 'tonal',
    name: 'Bordado tono sobre tono',
    note: 'Hilo del HEX exacto del tejido, satinado: se lee por relieve y brillo.',
    technique: TONAL_TECHNIQUE,
    threads: false,
  },
  {
    id: 'relief',
    name: 'Bordado en relieve',
    note: 'Satén sobre espuma de 3 mm, en el hilo elegido.',
    technique: 'Bordado Alto Relieve',
    threads: true,
  },
  {
    id: 'print',
    name: 'Serigrafía',
    note: 'Tinta plana mate, una pantalla.',
    technique: 'Serigrafía Plana',
    threads: true,
  },
];
export type FinishId = (typeof FINISHES)[number]['id'];

export const THREADS = [
  { id: 'blanc', name: 'Blanc', hex: '#F4F2EE' },
  { id: 'ecru', name: 'Écru', hex: '#E6E0D4' },
  { id: 'argent', name: 'Argent', hex: '#B9B9B9' },
  { id: 'or', name: 'Or pâle', hex: '#C9B37E' },
  { id: 'noir', name: 'Noir', hex: '#101010' },
  { id: 'bordeaux', name: 'Bordeaux', hex: '#5A1622' },
] as const;
export type ThreadId = (typeof THREADS)[number]['id'];

export const MONOGRAM_FONTS: readonly FontFamily[] = ['Bodoni Moda', 'Cormorant Garamond', 'Helvetica Neue'];

/** Colocaciones homologadas: X = centro (+ derecha mirando la prenda), top = borde superior bajo el HPS. */
export const PLACEMENTS: readonly {
  id: 'heart' | 'chest' | 'nape' | 'back';
  name: string;
  note: string;
  view: HoodieView;
  xCm: number;
  topCm: number;
  widthCm: number;
  heightCm: number;
  maxChars: number;
}[] = [
  { id: 'heart', name: 'Corazón', note: 'Pecho, lado izquierdo', view: 'front', xCm: 10, topCm: 17, widthCm: 7, heightCm: 3.2, maxChars: 5 },
  { id: 'chest', name: 'Pecho', note: 'Centrado bajo el cuello', view: 'front', xCm: 0, topCm: 19, widthCm: 17, heightCm: 4.5, maxChars: 12 },
  { id: 'nape', name: 'Nuca', note: 'Espalda, bajo el cuello', view: 'back', xCm: 0, topCm: 11, widthCm: 10, heightCm: 2.6, maxChars: 10 },
  { id: 'back', name: 'Espalda', note: 'Gran formato', view: 'back', xCm: 0, topCm: 16, widthCm: 30, heightCm: 8, maxChars: 14 },
];
export type PlacementId = (typeof PLACEMENTS)[number]['id'];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type Size = (typeof SIZES)[number];
export type SizeRun = Record<Size, number>;
export const DEFAULT_SIZE_RUN: SizeRun = { XS: 0, S: 0, M: 1, L: 0, XL: 0, XXL: 0 };
export const totalUnits = (run: SizeRun) => SIZES.reduce((n, s) => n + run[s], 0);

export interface Personalization {
  text: string;
  font: FontFamily;
  finish: FinishId;
  thread: ThreadId;
  placement: PlacementId;
}

export const DEFAULT_PERSONALIZATION: Personalization = {
  text: '',
  font: 'Bodoni Moda',
  finish: 'tonal',
  thread: 'blanc',
  placement: 'heart',
};

export const colorway = (id: ColorwayId) => COLORWAYS.find((c) => c.id === id)!;
export const finish = (id: FinishId) => FINISHES.find((f) => f.id === id)!;
export const thread = (id: ThreadId) => THREADS.find((t) => t.id === id)!;
export const placement = (id: PlacementId) => PLACEMENTS.find((p) => p.id === id)!;
export const techniqueCode = (id: FinishId) => TECHNIQUE_INFO[finish(id).technique].code;

/** Referencia de la variante: modelo + color (+ técnica y colocación si va personalizada). */
export function variantCode(color: ColorwayId, p: Personalization) {
  const parts = [ATELIER.model.slice(0, 3).toUpperCase(), color.toUpperCase()];
  if (p.text.trim()) parts.push(techniqueCode(p.finish), p.placement.toUpperCase());
  return parts.join('-');
}

/** Número de orden de taller: OT-AAMMDD-XXX. */
export function newOrderNumber(date = new Date()) {
  const stamp = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `OT-${stamp}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}
