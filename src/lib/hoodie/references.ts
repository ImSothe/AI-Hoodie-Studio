import { hexToCmyk, hexToRgb } from '../color';
import { TECHNIQUE_INFO, TONAL_TECHNIQUE, type Technique, type ThreadFinish } from './spec';

/**
 * Referencia interna de tinta / hilo: CÓDIGO TÉCNICA + HEX (+ acabado del hilo).
 * Ej.: SER-FFFFFF · BAR-5A1622 · BTT-0B0B0B-SAT. La equivalencia Pantone /
 * Madeira se casa en taller con muestra física (no se inventa aquí).
 */
export function colorReference(technique: Technique, hex: string | null, finish?: ThreadFinish | null) {
  if (!hex) return `${TECHNIQUE_INFO[technique].code}-ORIG`;
  const base = `${TECHNIQUE_INFO[technique].code}-${hex.replace('#', '').toUpperCase()}`;
  return technique === TONAL_TECHNIQUE ? `${base}-${finish === 'matte' ? 'MAT' : 'SAT'}` : base;
}

export function colorBreakdown(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const [c, m, y, k] = hexToCmyk(hex);
  return { rgb: `${r} · ${g} · ${b}`, cmyk: `${c} · ${m} · ${y} · ${k}` };
}
